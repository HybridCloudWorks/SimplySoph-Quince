import test from "node:test";
import assert from "node:assert/strict";
import { logEvent, eventsSince, EVENT_LOG_CAP } from "../server/event-log.mjs";
import { Ledger, memoryAdapter, Conflict } from "../server/store.mjs";

test("event log numbers entries, compacts past the cap and finds new entries by sequence", () => {
  const s = {};
  for (let i = 0; i < EVENT_LOG_CAP + 5; i++) logEvent(s, 0, "t", { data: { i } });
  assert.equal(s.eventLog.length, EVENT_LOG_CAP);
  assert.equal(s.eventLog[0].seq, 6);
  assert.equal(s.eventSeq, EVENT_LOG_CAP + 5);
  assert.deepEqual(eventsSince(s, EVENT_LOG_CAP + 3).map((e) => e.seq), [EVENT_LOG_CAP + 4, EVENT_LOG_CAP + 5]);
  assert.deepEqual(eventsSince(s, s.eventSeq), []);
  assert.deepEqual(eventsSince({}, 0), []);
});

test("committed events are mirrored exactly once, even when the transaction is retried", async () => {
  const backend = memoryAdapter();
  let saves = 0;
  const mirrored = [];
  const ledger = new Ledger(
    {
      load: () => backend.load(),
      // The first save loses a generation race, so the mutator runs twice.
      save: (s, g) => (saves++ === 0 ? Promise.reject(new Conflict()) : backend.save(s, g)),
    },
    { sleep: async () => {}, onEvents: (entries) => mirrored.push(...entries) },
  );
  await ledger.transaction((s) => logEvent(s, 0, "rsvp.submitted", { householdId: "h1" }));
  assert.deepEqual(mirrored.map((e) => [e.seq, e.type]), [[1, "rsvp.submitted"]]);
  await ledger.transaction((s) => s.audit.push({}));
  assert.equal(mirrored.length, 1, "no events, no mirror call");
  await ledger.transaction((s) => {
    logEvent(s, 0, "a");
    logEvent(s, 0, "b");
  });
  assert.deepEqual(mirrored.map((e) => e.type), ["rsvp.submitted", "a", "b"]);
});

test("a failing log mirror never turns a committed write into an error", async () => {
  const ledger = new Ledger(memoryAdapter(), {
    onEvents: () => {
      throw new Error("stdout closed");
    },
  });
  assert.equal(await ledger.transaction((s) => (logEvent(s, 0, "x"), "saved")), "saved");
  assert.equal((await ledger.read()).eventLog.length, 1);
});

test("a failed save mirrors nothing", async () => {
  const mirrored = [];
  const backend = memoryAdapter();
  const ledger = new Ledger(
    { load: () => backend.load(), save: async () => Promise.reject(new Error("storage down")) },
    { onEvents: (e) => mirrored.push(...e) },
  );
  await assert.rejects(() => ledger.transaction((s) => logEvent(s, 0, "x")), /storage down/);
  assert.deepEqual(mirrored, []);
});
