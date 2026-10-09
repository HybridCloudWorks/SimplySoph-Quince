import test from "node:test";
import assert from "node:assert/strict";
import {
  Ledger,
  memoryAdapter,
  initialState,
  Conflict,
} from "../server/store.mjs";

test("failed durable save never returns a committed result or changes stored state", async () => {
  const backend = memoryAdapter();
  const ledger = new Ledger({
    load: () => backend.load(),
    save: async () => {
      throw new Error("storage unavailable");
    },
  });
  await assert.rejects(
    () =>
      ledger.transaction((s) => {
        s.audit.push({ action: "test" });
        return { saved: true };
      }),
    /storage unavailable/,
  );
  assert.deepEqual((await backend.load()).state, initialState());
});
test("concurrent ledger transactions preserve both updates", async () => {
  const ledger = new Ledger(memoryAdapter());
  await Promise.all([
    ledger.transaction((s) => s.audit.push({ action: "one" })),
    ledger.transaction((s) => s.audit.push({ action: "two" })),
  ]);
  assert.deepEqual((await ledger.read()).audit.map((r) => r.action).sort(), [
    "one",
    "two",
  ]);
});
test("unresolved generation conflicts back off, then fail with a retryable error", async () => {
  const waits = [];
  const ledger = new Ledger(
    {
      load: async () => ({ state: initialState(), generation: 1 }),
      save: async () => {
        throw new Conflict();
      },
    },
    { sleep: async (ms) => waits.push(ms), random: () => 0.5 },
  );
  await assert.rejects(
    () => ledger.transaction(() => true),
    (e) => e.code === "BUSY",
  );
  assert.deepEqual(waits, [25, 50, 100, 200, 400, 400, 400]);
});
test("transactions on one instance are serialized and a failure does not block the next", async () => {
  const backend = memoryAdapter();
  let saves = 0,
    conflicts = 0;
  const ledger = new Ledger({
    load: () => backend.load(),
    save: async (state, generation) => {
      saves++;
      try {
        await backend.save(state, generation);
      } catch (e) {
        conflicts++;
        throw e;
      }
    },
  });
  await Promise.allSettled([
    ...Array.from({ length: 10 }, (_, i) =>
      ledger.transaction((s) => s.audit.push({ action: String(i) })),
    ),
    ledger.transaction(() => {
      throw new Error("mutator failed");
    }),
    ledger.transaction((s) => s.audit.push({ action: "after" })),
  ]);
  assert.equal(conflicts, 0);
  assert.equal(saves, 11);
  assert.equal((await ledger.read()).audit.length, 11);
});

const never = () => new Promise(() => {});

test("one slow ledger load is retried; a hung load fails fast instead of holding the queue", async () => {
  const backend = memoryAdapter();
  let loads = 0;
  const ledger = new Ledger(
    { load: () => (loads++ === 0 ? never() : backend.load()), save: (s, g) => backend.save(s, g) },
    { sleep: async () => {}, timeoutMs: 5 },
  );
  assert.equal(await ledger.transaction(() => "saved"), "saved");
  const stuck = new Ledger({ load: never, save: async () => {} }, { sleep: async () => {}, timeoutMs: 5 });
  await assert.rejects(() => stuck.transaction(() => true), /Ledger load timed out/);
  await assert.rejects(() => stuck.read(), /Ledger load timed out/);
});

test("a timed-out ledger save is never re-run and does not block the next transaction", async () => {
  const backend = memoryAdapter();
  let saves = 0,
    runs = 0;
  const ledger = new Ledger(
    {
      load: () => backend.load(),
      save: (s, g) => (saves++ === 0 ? never() : backend.save(s, g)),
    },
    { sleep: async () => {}, timeoutMs: 5 },
  );
  await assert.rejects(
    () => ledger.transaction((s) => (runs++, s.audit.push({ action: "uncertain" }))),
    /Ledger save timed out/,
  );
  assert.equal(runs, 1);
  await ledger.transaction((s) => s.audit.push({ action: "next" }));
  assert.deepEqual((await ledger.read()).audit.map((r) => r.action), ["next"]);
});

test("a ledger queue deeper than the limit sheds load with a retryable error", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const backend = memoryAdapter();
  const ledger = new Ledger(
    { load: async () => (await gate, backend.load()), save: (s, g) => backend.save(s, g) },
    { maxQueue: 2, timeoutMs: 1000 },
  );
  const queued = [ledger.transaction(() => 1), ledger.transaction(() => 2)];
  await assert.rejects(() => ledger.transaction(() => 3), (e) => e.code === "BUSY" && e.status === 503);
  release();
  assert.deepEqual(await Promise.all(queued), [1, 2]);
  assert.equal(await ledger.transaction(() => 4), 4);
});
