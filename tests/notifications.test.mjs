import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createNotifications } from "../server/notifications.mjs";

test("organizer notifications reach each approved address once without leaking guest content", async () => {
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.notifications = {
      item: { kind: "contact", text: "Private guest details" },
    };
  });
  const sent = [];
  const notify = createNotifications({
    ledger,
    mailer: { configured: true, send: async (message) => sent.push(message) },
    adminEmails: ["owner@gmail.com", "owner@hotmail.com", "OWNER@gmail.com"],
    origin: "https://misxv.simplysoph.com",
    now: () => 1_000_000,
  });
  await Promise.all([notify("item"), notify("item")]);
  assert.deepEqual(
    sent.map((m) => m.to),
    ["owner@gmail.com", "owner@hotmail.com"],
  );
  assert.equal(new Set(sent.map((m) => m.id)).size, 2);
  assert.ok(sent.every((m) => !m.html.includes("Private guest details")));
  assert.equal((await ledger.read()).notifications.item.emailState, "accepted");
});

test("an uncertain organizer send does not block the second address or cause duplicate retries", async () => {
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.notifications = { item: { kind: "photo" } };
  });
  const sent = [];
  const notify = createNotifications({
    ledger,
    mailer: {
      configured: true,
      send: async (message) => {
        sent.push(message);
        if (message.to === "owner@gmail.com")
          throw { code: "MAIL_DELIVERY_UNKNOWN" };
      },
    },
    adminEmails: ["owner@gmail.com", "owner@hotmail.com"],
    origin: "https://misxv.simplysoph.com",
    now: () => 1_000_000,
  });
  await notify("item");
  await notify("item");
  assert.equal(sent.length, 2);
  const row = (await ledger.read()).notifications.item;
  assert.equal(row.emailState, "unknown");
  assert.deepEqual(
    row.emailDeliveries.map((d) => d.state),
    ["unknown", "accepted"],
  );
});
