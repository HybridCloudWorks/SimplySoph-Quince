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
test("unresolved generation conflicts fail with a retryable error", async () => {
  const ledger = new Ledger({
    load: async () => ({ state: initialState(), generation: 1 }),
    save: async () => {
      throw new Conflict();
    },
  });
  await assert.rejects(
    () => ledger.transaction(() => true),
    (e) => e.code === "BUSY",
  );
});
