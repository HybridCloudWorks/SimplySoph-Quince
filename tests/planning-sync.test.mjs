import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createPlanning } from "../server/planning.mjs";
import {
  planningNotion,
  planningProperties,
  planningSources,
} from "../server/planning-notion.mjs";
const actor = { email: "owner@example.com" },
  sourceId = planningSources.costs;
const req = (path, body) => ({
  path: "/api/admin/planning" + path,
  method: "POST",
  body: { kind: "costs", ...body },
});
test("website edits write changed fields and preserve unrelated Notion fields", async () => {
  const ledger = new Ledger(memoryAdapter());
  let sent;
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async (k, source, row, keys) => {
        sent = { source, row, keys };
        return "notion-page";
      },
    },
  });
  const a = await handle(
    req("", {
      createId: "11111111-1111-1111-1111-111111111111",
      row: { item: "Venue", estimated: 2500 },
    }),
    actor,
  );
  assert.equal(a.row.sync.status, "synced");
  assert.equal(a.row.notionId, "notion-page");
  const b = await handle(
    req("", {
      id: a.row.id,
      version: a.row.version,
      row: { ...a.row, finalCost: 2400 },
    }),
    actor,
  );
  assert.deepEqual(sent.keys, ["finalCost"]);
  assert.equal(b.row.sync.status, "synced");
  assert.equal(sent.source, sourceId);
  const duplicate = await handle(
    req("", { createId: a.row.id, row: { item: "Venue" } }),
    actor,
  );
  assert.equal(duplicate.row.id, a.row.id);
  assert.equal(Object.keys((await ledger.read()).planning.costs).length, 1);
});
test("failed Notion write remains durable, blocks subsequent edits, and retries same row", async () => {
  const ledger = new Ledger(memoryAdapter());
  let fail = true,
    writes = 0;
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async () => {
        writes++;
        if (fail) throw Error("provider detail");
        return "same-page";
      },
    },
  });
  const a = await handle(req("", { row: { item: "Cake" } }), actor);
  assert.equal(a.row.sync.status, "pending");
  assert.equal(a.row.sync.error, "NOTION_SYNC_PENDING");
  await assert.rejects(
    () =>
      handle(
        req("", {
          id: a.row.id,
          version: a.row.version,
          row: { item: "Updated cake" },
        }),
        actor,
      ),
    (e) => e.code === "PLANNING_SYNC_PENDING",
  );
  fail = false;
  const b = await handle(req("/sync", { id: a.row.id }), actor);
  assert.equal(b.row.sync.status, "synced");
  assert.equal(b.row.version, 1);
  assert.equal(writes, 2);
  await handle(req("/sync", { id: a.row.id }), actor);
  assert.equal(writes, 2);
});
test("concurrent Notion writes for one row are serialized and locks survive service restart", async () => {
  const ledger = new Ledger(memoryAdapter());
  let release, entered;
  const began = new Promise((r) => (entered = r)),
    pause = new Promise((r) => (release = r));
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async () => {
        entered();
        await pause;
        return "page";
      },
    },
  });
  const id = "22222222-2222-2222-2222-222222222222";
  const pending = handle(
    req("", { createId: id, row: { item: "Photo" } }),
    actor,
  );
  await began;
  const second = createPlanning({
    ledger,
    now: Date.now,
    notion: { writePlanning: async () => assert.fail("must not write") },
  });
  await assert.rejects(
    () => second(req("/sync", { id }), actor),
    (e) => e.code === "PLANNING_SYNC_BUSY",
  );
  release();
  await pending;
});
test("payment projection writes total paid separately and chunks long notes", () => {
  const props = planningProperties(
    "costs",
    {
      id: "x",
      version: 2,
      deposit: 300,
      additionalPaid: 500,
      notes: "a".repeat(4000),
    },
    ["deposit", "notes"],
  );
  assert.equal(props["Amount paid"].number, 800);
  assert.equal(props.Deposit.number, 300);
  assert.equal(props["Additional Paid"].number, 500);
  assert.equal(props.Notes.rich_text.length, 2);
  assert.equal(props.Vendor, undefined);
});
function mockedClient({
  found = [],
  pageSource = sourceId,
  uncertain = false,
} = {}) {
  let creates = 0,
    patches = 0,
    hook = false;
  const call = async (path, method, body) => {
    if (path === "data_sources/" + sourceId) return { properties: {} };
    if (path.endsWith("/query")) return { results: found };
    if (path === "pages" && method === "POST") {
      assert.ok(hook);
      creates++;
      if (uncertain) throw Error("timeout");
      return { id: "created" };
    }
    if (path.startsWith("pages/")) {
      if (method === "PATCH") {
        patches++;
        return {};
      }
      return { parent: { data_source_id: pageSource } };
    }
    throw Error("unexpected");
  };
  return {
    client: planningNotion(call),
    stats: () => ({ creates, patches }),
    before: async () => {
      hook = true;
    },
  };
}
test("new Notion records use stable website ID and an acknowledged create is recoverable", async () => {
  const f = mockedClient();
  const row = { id: "row-id", version: 1, item: "Venue", sync: {} };
  assert.equal(
    await f.client.writePlanning("costs", sourceId, row, ["item"], f.before),
    "created",
  );
  assert.equal(f.stats().creates, 1);
  const recovery = mockedClient({ found: [{ id: "created" }] });
  assert.equal(
    await recovery.client.writePlanning(
      "costs",
      sourceId,
      { ...row, sync: { createAttempted: true } },
      ["item"],
      recovery.before,
    ),
    "created",
  );
  assert.equal(recovery.stats().creates, 0);
});
test("ambiguous Notion creation never blindly creates a second record", async () => {
  const f = mockedClient();
  await assert.rejects(
    () =>
      f.client.writePlanning(
        "costs",
        sourceId,
        { id: "row", version: 1, sync: { createAttempted: true } },
        [],
        f.before,
      ),
    (e) => e.code === "NOTION_CREATE_UNCERTAIN",
  );
  assert.equal(f.stats().creates, 0);
});
test("Notion writes reject a page outside the assigned data source", async () => {
  const f = mockedClient({ pageSource: "other" });
  await assert.rejects(
    () =>
      f.client.writePlanning(
        "costs",
        sourceId,
        { id: "x", notionId: "foreign", sync: {} },
        [],
        f.before,
      ),
    (e) => e.code === "NOTION_RECORD_UNAVAILABLE",
  );
  assert.equal(f.stats().patches, 0);
});
