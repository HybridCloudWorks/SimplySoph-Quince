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
