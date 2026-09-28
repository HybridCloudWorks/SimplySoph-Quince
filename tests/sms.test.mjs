import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { createSms, smsPreview } from "../server/sms.mjs";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { hash } from "../server/auth.mjs";
const sid = "SM" + "4".repeat(32);
const webhook = {
  origin: "https://example.com",
  accountSid: "AC" + "1".repeat(32),
  serviceSid: "MG" + "2".repeat(32),
  authToken: "test-token",
};
async function fixture(options = {}) {
  const ledger = new Ledger(memoryAdapter());
  const row = {
    id: "household",
    phone: "+14155552671",
    smsConsent: true,
    smsConsentAt: "2026-09-01",
    distributionGroups: ["Family"],
  };
  await ledger.transaction((s) => {
    s.smsDrafts = {
      draft: {
        id: "draft",
        householdId: row.id,
        campaignId: "campaign",
        to: row.phone,
        text: "SimplySoph RSVP: https://example.com/rsvp/ Reply STOP to opt out.",
        groups: ["Family"],
        state: "draft",
      },
    };
  });
  let sends = 0,
    projects = 0;
  const sms = createSms({
    ledger,
    webhook,
    now: () => Date.parse("2026-09-28"),
    notion: {
      read: async () => structuredClone(row),
      list: async () => [row],
      projectSmsOptOut: async () => {
        projects++;
        if (options.notionFails) throw Error();
      },
    },
    transport: {
      enabled: options.enabled !== false,
      send: async () => {
        sends++;
        if (options.sendFails) throw Error("secret");
        return { state: "accepted", providerId: sid, provider: "twilio" };
      },
    },
  });
  const callback = (kind, extra = {}) => {
    const params = {
      AccountSid: webhook.accountSid,
      MessagingServiceSid: webhook.serviceSid,
      MessageSid: sid,
      From: row.phone,
      To: row.phone,
      ...extra,
    };
    return sms.callback(
      kind,
      params,
      twilio.getExpectedTwilioSignature(
        webhook.authToken,
        webhook.origin + "/api/twilio/" + kind,
        params,
      ),
    );
  };
  return {
    ledger,
    row,
    sms,
    callback,
    sends: () => sends,
    projects: () => projects,
  };
}
test("SMS preview accounts for GSM extensions, Unicode, and toll-free multipart limits", () => {
  assert.equal(smsPreview("a".repeat(160)).segments, 1);
  assert.equal(smsPreview("^".repeat(81)).segments, 2);
  assert.equal(smsPreview("😀".repeat(36)).segments, 2);
  assert.equal(smsPreview("a".repeat(305)).segments, 3);
  assert.equal(smsPreview("hello").cost, null);
  assert.throws(() => smsPreview("a".repeat(1601)));
});
test("concurrent SMS sends persist one attempt and never double-send", async () => {
  const f = await fixture(),
    p = await f.sms.review("draft");
  const results = await Promise.allSettled([
    f.sms.send("draft", p.reviewToken, "admin"),
    f.sms.send("draft", p.reviewToken, "admin"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.sends(), 1);
  assert.equal((await f.ledger.read()).smsDrafts.draft.state, "accepted");
});
test("SMS dispatch rechecks fresh Notion consent and destination", async () => {
  for (const change of [
    (r) => (r.smsOptOut = true),
    (r) => (r.phone = "+14165552671"),
    (r) => (r.distributionGroups = []),
    (r) => (r.smsConsentAt = "2027-01-01"),
  ]) {
    const f = await fixture(),
      p = await f.sms.review("draft");
    change(f.row);
    await assert.rejects(() => f.sms.send("draft", p.reviewToken, "admin"));
    assert.equal(f.sends(), 0);
  }
});
test("SMS unknown delivery cannot be retried", async () => {
  const f = await fixture({ sendFails: true }),
    p = await f.sms.review("draft");
  await assert.rejects(
    () => f.sms.send("draft", p.reviewToken, "admin"),
    (e) => e.code === "SMS_DELIVERY_UNKNOWN",
  );
  await assert.rejects(
    () => f.sms.send("draft", p.reviewToken, "admin"),
    (e) => e.code === "SMS_ALREADY_ATTEMPTED",
  );
  assert.equal(f.sends(), 1);
});
test("SMS remains disabled even when drafts and consent are valid", async () => {
  const f = await fixture({ enabled: false }),
    p = await f.sms.review("draft");
  await assert.rejects(
    () => f.sms.send("draft", p.reviewToken, "admin"),
    (e) => e.code === "SMS_NOT_ENABLED",
  );
  assert.equal(f.sends(), 0);
});
test("STOP survives Notion outage, repeated callbacks, and START", async () => {
  const f = await fixture({ notionFails: true });
  await f.callback("inbound", { OptOutType: "STOP" });
  await f.callback("inbound", { OptOutType: "STOP" });
  await f.callback("inbound", {
    MessageSid: "SM" + "5".repeat(32),
    OptOutType: "START",
  });
  const state = await f.ledger.read();
  assert.equal(state.smsSuppression[hash(f.row.phone)].syncState, "pending");
  assert.equal(Object.keys(state.smsInbound).length, 2);
  await assert.rejects(
    () => f.sms.review("draft"),
    (e) => e.code === "SMS_OPTED_OUT",
  );
  assert.equal((await f.sms.retrySync()).attempted, 1);
});
test("forged callbacks cannot change state", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.sms.callback("inbound", {}, "invalid"),
    (e) => e.code === "TWILIO_SIGNATURE_INVALID",
  );
  assert.equal((await f.ledger.read()).smsSuppression, undefined);
});
test("delivery callbacks match attempts and do not regress from terminal status", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.callback("status", { MessageStatus: "delivered" }),
    (e) => e.code === "SMS_CALLBACK_UNMATCHED",
  );
  const p = await f.sms.review("draft");
  await f.sms.send("draft", p.reviewToken, "admin");
  await f.callback("status", { MessageStatus: "delivered" });
  await f.callback("status", { MessageStatus: "sent" });
  assert.equal((await f.ledger.read()).smsDelivery[sid].status, "delivered");
});
