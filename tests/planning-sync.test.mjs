import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createPlanning, accountingSummary } from "../server/planning.mjs";
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

test("accounting totals balance in integer cents and retain subsequent payments", () => {
  const rows = [
    { finalCost: 10.1, deposit: 0.1, additionalPaid: 0.2 },
    { finalCost: 20.2, deposit: 1.01, additionalPaid: 2.02 },
    { finalCost: 100, deposit: 50, additionalPaid: 1, deleted: true },
  ];
  const totals = accountingSummary(rows);
  assert.equal(totals.finalCents, 3030);
  assert.equal(totals.paidCents, 333);
  assert.equal(totals.owedCents + totals.paidCents, totals.finalCents);
  assert.equal(
    accountingSummary([{ finalCost: null, deposit: 10 }]).owedCents,
    null,
  );
  assert.equal(
    accountingSummary([{ finalCost: 5, deposit: 10 }]).owedCents,
    -500,
  );
});

for (const kind of ["costs", "padrinos"])
  test(`${kind} delete and restore preserve data and linked Notion record`, async () => {
    const ledger = new Ledger(memoryAdapter()),
      id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    await ledger.transaction((s) => {
      s.planning = {
        [kind]: {
          [id]: {
            id,
            notionId: "linked-page",
            version: 1,
            item: "Venue",
            name: "Sponsor",
            deposit: 50,
            additionalPaid: 25,
          },
        },
      };
      s.documents = { doc: { rowId: id, deleted: false } };
    });
    let fail = true;
    const writes = [];
    const handle = createPlanning({
      ledger,
      now: Date.now,
      notion: {
        setPlanningArchived: async (table, source, row) => {
          writes.push({
            table,
            source,
            deleted: row.deleted,
            notionId: row.notionId,
          });
          if (fail) throw Error("timeout");
          return row.notionId;
        },
      },
    });
    const deleted = await handle(
      req("/state", { kind, id, version: 1, deleted: true }),
      actor,
    );
    assert.equal(deleted.row.deleted, true);
    assert.equal(deleted.row.sync.status, "pending");
    await assert.rejects(
      () =>
        handle(req("/state", { kind, id, version: 2, deleted: false }), actor),
      (e) => e.code === "PLANNING_SYNC_PENDING",
    );
    fail = false;
    await handle(req("/sync", { kind, id }), actor);
    await assert.rejects(
      () =>
        handle(req("/state", { kind, id, version: 1, deleted: false }), actor),
      (e) => e.code === "SETTINGS_CHANGED",
    );
    const restored = await handle(
      req("/state", { kind, id, version: 2, deleted: false }),
      actor,
    );
    assert.equal(restored.row.deleted, false);
    assert.equal(restored.row.notionId, "linked-page");
    assert.equal(restored.row.additionalPaid, 25);
    assert.equal((await ledger.read()).documents.doc.deleted, false);
    assert.deepEqual(
      writes.map((w) => w.deleted),
      [true, true, false],
    );
    assert.ok(writes.every((w) => w.source === planningSources[kind]));
  });

test("Notion archive and restore update only archive state of the exact scoped page", async () => {
  const writes = [];
  let pageSource = sourceId;
  const client = planningNotion(async (path, method, body) => {
    if (method === "PATCH") {
      writes.push({ path, body });
      return {};
    }
    return { parent: { data_source_id: pageSource }, archived: true };
  });
  const row = { notionId: "linked", deleted: true };
  await client.setPlanningArchived("costs", sourceId, row);
  await client.setPlanningArchived("costs", sourceId, {
    ...row,
    deleted: false,
  });
  assert.deepEqual(writes, [
    { path: "pages/linked", body: { archived: true } },
    { path: "pages/linked", body: { archived: false } },
  ]);
  pageSource = "foreign";
  await assert.rejects(
    () => client.setPlanningArchived("costs", sourceId, row),
    (e) => e.code === "NOTION_RECORD_UNAVAILABLE",
  );
  assert.equal(writes.length, 2);
});

test("the scheduled drain retries planning rows still waiting to reach Notion (NOTION-8)", async () => {
  const ledger = new Ledger(memoryAdapter());
  let down = true,
    writes = 0;
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async () => {
        writes++;
        if (down) throw Object.assign(new Error(), { code: "NOTION_UNAVAILABLE" });
        return "notion-page";
      },
    },
  });
  const saved = await handle(
    req("", { createId: "33333333-3333-4333-8333-333333333333", row: { item: "Flowers", estimated: 300 } }),
    actor,
  );
  assert.equal(saved.row.sync.status, "pending");
  down = false;
  assert.deepEqual(await handle.retryPending(), { attempted: 1 });
  const row = (await ledger.read()).planning.costs["33333333-3333-4333-8333-333333333333"];
  assert.equal(row.sync.status, "synced");
  assert.deepEqual(await handle.retryPending(), { attempted: 0 }, "nothing left to do");
  assert.equal(writes, 2);
});

test("the drain leaves planning errors that need a person to the admin's Retry Sync (NOTION-8)", async () => {
  const ledger = new Ledger(memoryAdapter());
  let writes = 0;
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async () => {
        writes++;
        throw Object.assign(new Error(), { code: "PLANNING_SCHEMA_CONFLICT" });
      },
    },
  });
  await handle(
    req("", { createId: "44444444-4444-4444-8444-444444444444", row: { item: "Cake", estimated: 200 } }),
    actor,
  );
  const row = (await ledger.read()).planning.costs["44444444-4444-4444-8444-444444444444"];
  assert.equal(row.sync.error, "PLANNING_SCHEMA_CONFLICT");
  assert.deepEqual(await handle.retryPending(), { attempted: 0 }, "not retried every 10 minutes");
  assert.equal(writes, 1);
});
test("a change Notion refuses is marked failed, reported once, left out of the drain, and corrected by editing (re-audit N3)", async () => {
  const ledger = new Ledger(memoryAdapter());
  let refuse = true;
  const writes = [];
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      writePlanning: async (k, source, row, keys) => {
        writes.push(keys);
        if (refuse) throw Object.assign(new Error(), { code: "NOTION_400" });
        return "page";
      },
    },
  });
  const notes = async () =>
    Object.values((await ledger.read()).notifications || {}).filter((n) => n.kind === "sync");
  const a = await handle(req("", { row: { item: "Cake", estimated: 50 } }), actor);
  assert.equal(a.row.sync.status, "failed");
  assert.equal(a.row.sync.error, "NOTION_400");
  assert.equal((await notes()).length, 1);
  assert.match((await notes())[0].title, /Cake: Notion refused the change/);
  assert.deepEqual(await handle.retryPending(), { attempted: 0 }, "the drain leaves it alone");
  await handle(req("/sync", { id: a.row.id }), actor);
  assert.equal((await notes()).length, 1, "the same refusal is reported once");
  // Editing the record corrects it; the new write carries the refused fields.
  refuse = false;
  const row = (await ledger.read()).planning.costs[a.row.id];
  const b = await handle(req("", { id: row.id, version: row.version, row: { item: "Cake", estimated: 60 } }), actor);
  assert.equal(b.row.sync.status, "synced");
  assert.ok(writes.at(-1).includes("item") && writes.at(-1).includes("estimated"));
});
test("a create Notion refused can be corrected by editing; lost access stays pending, not refused (re-audit M3, L3)", async () => {
  const ledger = new Ledger(memoryAdapter());
  let answer = "NOTION_400";
  const handle = createPlanning({
    ledger,
    now: Date.now,
    notion: {
      // Like planning-notion.mjs: an earlier create attempt with no page found
      // is uncertain; a refused create is marked as not created.
      writePlanning: async (k, source, row, keys, beforeCreate) => {
        if (!row.notionId && row.sync.createAttempted)
          throw Object.assign(new Error(), { code: "NOTION_CREATE_UNCERTAIN" });
        await beforeCreate();
        if (answer) throw Object.assign(new Error(), { code: answer, notCreated: answer === "NOTION_400" });
        return "page";
      },
    },
  });
  const a = await handle(req("", { row: { item: "Flowers", estimated: 80 } }), actor);
  assert.equal(a.row.sync.status, "failed");
  answer = null;
  const row = (await ledger.read()).planning.costs[a.row.id];
  const b = await handle(req("", { id: row.id, version: row.version, row: { item: "Flowers", estimated: 90 } }), actor);
  assert.equal(b.row.sync.status, "synced", "the corrected record is created");
  // A revoked token (403) is not the record's fault: pending, retried later.
  answer = "NOTION_403";
  const c = await handle(req("", { row: { item: "Cake", estimated: 50 } }), actor);
  assert.equal(c.row.sync.status, "pending");
});
