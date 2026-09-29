import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createAdminRecords } from "../server/admin-records.mjs";
import { unseal } from "../server/auth.mjs";
import { createNotifications } from "../server/notifications.mjs";
const key = Buffer.alloc(32, 1);
const owner = { actor: "owner" };
test("record archive and restore preserve delivery evidence and reject stale writes", async () => {
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.outbox.sent = {
      id: "sent",
      state: "accepted",
      providerId: "proof",
      content: "secret",
      createdAt: 1,
    };
  });
  const records = createAdminRecords({ ledger, key });
  const write = (body) =>
    records(
      { method: "POST", body: { kind: "email", id: "sent", ...body } },
      owner,
    );
  await assert.rejects(
    write({ action: "update", version: 0, values: { state: "draft" } }),
    { code: "IMMUTABLE_RECORD_FIELD" },
  );
  await write({ action: "archive", version: 0 });
  await assert.rejects(write({ action: "restore", version: 0 }), {
    code: "RECORD_CHANGED",
  });
  await write({ action: "restore", version: 1 });
  const { rows } = await records(
    { method: "GET", query: { kind: "email" } },
    owner,
  );
  assert.equal(rows[0].providerId, "proof");
  assert.equal(rows[0].state, "accepted");
  assert.equal(rows[0].archived, false);
  assert.equal(rows[0].content, undefined);
  assert.equal((await ledger.read()).audit.length, 2);
});
test("manual notices can be created and revised without sending, and draft email edits are escaped and sealed", async () => {
  const ledger = new Ledger(memoryAdapter());
  const records = createAdminRecords({ ledger, key });
  const { id } = await records(
    {
      method: "POST",
      body: {
        kind: "notifications",
        action: "create",
        values: { title: "Review", text: "Check seating" },
      },
    },
    owner,
  );
  await records(
    {
      method: "POST",
      body: {
        kind: "notifications",
        action: "update",
        id,
        version: 1,
        values: { read: true },
      },
    },
    owner,
  );
  await ledger.transaction((s) => {
    s.outbox.draft = { id: "draft", state: "draft", to: "guest@example.com" };
  });
  await records(
    {
      method: "POST",
      body: {
        kind: "email",
        action: "update",
        id: "draft",
        version: 0,
        values: { subject: "Update", text: "<script>bad</script>" },
      },
    },
    owner,
  );
  const s = await ledger.read();
  assert.equal(s.notifications[id].read, true);
  assert.equal(s.outbox.draft.to, "guest@example.com");
  assert.match(unseal(s.outbox.draft.content, key), /&lt;script&gt;/);
  assert.equal(s.outbox.draft.text, undefined);
});

test("record IDs cannot address inherited object properties", async () => {
  const ledger = new Ledger(memoryAdapter());
  const records = createAdminRecords({ ledger, key });
  for (const id of ["__proto__", "constructor", "toString"]) {
    await assert.rejects(
      () =>
        records(
          {
            method: "POST",
            body: { kind: "email", id, action: "archive", version: 0 },
          },
          owner,
        ),
      { code: "NOT_FOUND" },
    );
  }
  assert.equal(Object.prototype.archived, undefined);
});

test("SMS draft editing rejects unsendable message lengths and empty text", async () => {
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.smsDrafts = { draft: { id: "draft", state: "draft", text: "Original" } };
  });
  const records = createAdminRecords({ ledger, key });
  for (const text of ["", "x".repeat(1601)])
    await assert.rejects(
      () =>
        records(
          {
            method: "POST",
            body: {
              kind: "sms",
              id: "draft",
              action: "update",
              version: 0,
              values: { text },
            },
          },
          owner,
        ),
      { code: "SMS_MESSAGE_INVALID" },
    );
  assert.equal((await ledger.read()).smsDrafts.draft.text, "Original");
});

test("archived notifications never send and in-flight notification claims prevent archive", async () => {
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.notifications = {
      old: { id: "old", archived: true },
      fresh: { id: "fresh" },
    };
  });
  let entered,
    release,
    sends = 0;
  const began = new Promise((resolve) => {
    entered = resolve;
  });
  const pause = new Promise((resolve) => {
    release = resolve;
  });
  const notify = createNotifications({
    ledger,
    adminEmails: ["owner@example.com"],
    origin: "https://example.com",
    now: Date.now,
    mailer: {
      configured: true,
      send: async () => {
        sends++;
        entered();
        await pause;
      },
    },
  });
  const records = createAdminRecords({ ledger, key });
  await notify("old");
  assert.equal(sends, 0);
  const pending = notify("fresh");
  await began;
  await assert.rejects(
    () =>
      records(
        {
          method: "POST",
          body: {
            kind: "notifications",
            id: "fresh",
            action: "archive",
            version: 0,
          },
        },
        owner,
      ),
    { code: "DELIVERY_IN_PROGRESS" },
  );
  release();
  await pending;
  assert.equal(sends, 1);
  await records(
    {
      method: "POST",
      body: {
        kind: "notifications",
        id: "fresh",
        action: "archive",
        version: 0,
      },
    },
    owner,
  );
  assert.equal((await ledger.read()).notifications.fresh.archived, true);
});
