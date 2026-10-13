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
        text: "Simply Soph Media: RSVP https://example.com/rsvp/ Reply STOP to opt out.",
        groups: ["Family"],
        state: "draft",
      },
    };
    if (options.keywordConsent !== false) {
      s.smsPreferences = {
        [hash(row.phone)]: {
          phone: row.phone,
          type: "START",
          at: Date.parse("2026-09-01"),
          syncState: "synced",
        },
      };
      s.smsConsentPhones = { [row.id]: row.phone };
    }
  });
  let sends = 0,
    projects = 0;
  const sms = createSms({
    ledger,
    webhook,
    now: () => Date.parse("2026-09-28"),
    notion: {
      projectSmsConsent: async () => {
        projects++;
        if (options.notionFails) throw Error();
        await options.projectConsent?.();
      },
      read: async () => {
        await options.beforeRead?.();
        return structuredClone(row);
      },
      list: async () => [row],
      projectSmsOptOut: async () => {
        projects++;
        if (options.notionFails) throw Error();
        await options.projectOptOut?.();
      },
    },
    transport: {
      inboundTime: async () => options.inboundAt ?? Date.parse("2026-09-27"),
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
test("SMS dispatch rechecks the fresh Notion row: opt-out, phone, groups, archived", async () => {
  for (const change of [
    (r) => (r.smsOptOut = true),
    (r) => (r.phone = "+14165552671"),
    (r) => (r.distributionGroups = []),
    (r) => (r.archived = true),
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

test("archiving during SMS eligibility lookup prevents the later send claim", async () => {
  let hold = false,
    entered,
    release;
  const began = new Promise((resolve) => {
    entered = resolve;
  });
  const pause = new Promise((resolve) => {
    release = resolve;
  });
  const f = await fixture({
    beforeRead: async () => {
      if (hold) {
        entered();
        await pause;
      }
    },
  });
  const preview = await f.sms.review("draft");
  hold = true;
  const send = f.sms.send("draft", preview.reviewToken, "admin");
  await began;
  await f.ledger.transaction((s) => {
    s.smsDrafts.draft.archived = true;
  });
  release();
  await assert.rejects(send, (e) => e.code === "SMS_ALREADY_ATTEMPTED");
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

test("a late START projection repairs a newer STOP that reached Notion first", async () => {
  let releaseStart,
    started,
    optedOut = false;
  const waiting = new Promise((resolve) => {
    releaseStart = resolve;
  });
  const startEntered = new Promise((resolve) => {
    started = resolve;
  });
  const f = await fixture({
    projectConsent: async () => {
      started();
      await waiting;
      optedOut = false;
    },
    projectOptOut: async () => {
      optedOut = true;
    },
  });
  const first = f.callback("inbound", { Body: "START", OptOutType: "START" });
  await startEntered;
  await f.callback("inbound", {
    Body: "STOP",
    OptOutType: "STOP",
    MessageSid: "SM" + "9".repeat(32),
  });
  assert.equal(optedOut, true);
  releaseStart();
  await first;
  assert.equal(optedOut, true);
  const state = await f.ledger.read();
  assert.equal(state.smsPreferences[hash(f.row.phone)].type, "STOP");
  assert.equal(state.smsPreferences[hash(f.row.phone)].syncState, "synced");
  assert.ok(state.smsSuppression[hash(f.row.phone)]);
});
test("verified START records phone consent, projects Notion and never replays across STOP", async () => {
  const f = await fixture();
  const start = { Body: "START", OptOutType: "START" };
  await f.callback("inbound", start);
  let state = await f.ledger.read();
  assert.equal(state.smsPreferences[hash(f.row.phone)].type, "START");
  assert.equal(state.smsPreferences[hash(f.row.phone)].syncState, "synced");
  assert.equal(state.smsSuppression[hash(f.row.phone)], undefined);
  await f.callback("inbound", {
    Body: "STOP",
    OptOutType: "STOP",
    MessageSid: "SM" + "6".repeat(32),
  });
  await f.callback("inbound", start);
  state = await f.ledger.read();
  assert.equal(state.smsPreferences[hash(f.row.phone)].type, "STOP");
  assert.ok(state.smsSuppression[hash(f.row.phone)]);
});

test("a failed repair of a late START stays suppressed and retryable", async () => {
  let releaseStart,
    started,
    stopWrites = 0,
    failRepair = true;
  const waiting = new Promise((resolve) => {
    releaseStart = resolve;
  });
  const startEntered = new Promise((resolve) => {
    started = resolve;
  });
  const f = await fixture({
    projectConsent: async () => {
      started();
      await waiting;
    },
    projectOptOut: async () => {
      if (++stopWrites > 1 && failRepair) throw Error();
    },
  });
  const first = f.callback("inbound", { Body: "START", OptOutType: "START" });
  await startEntered;
  await f.callback("inbound", {
    Body: "STOP",
    OptOutType: "STOP",
    MessageSid: "SM" + "9".repeat(32),
  });
  releaseStart();
  await first;
  const state = await f.ledger.read();
  assert.equal(state.smsPreferences[hash(f.row.phone)].syncState, "pending");
  assert.equal(state.smsSuppression[hash(f.row.phone)].syncState, "pending");
  await assert.rejects(
    () => f.sms.review("draft"),
    (e) => e.code === "SMS_OPTED_OUT",
  );
  failRepair = false;
  assert.equal((await f.sms.retrySync()).attempted, 1);
  assert.equal(
    (await f.ledger.read()).smsPreferences[hash(f.row.phone)].syncState,
    "synced",
  );
});
test("a delayed distinct START cannot undo newer STOP; HELP does not enroll", async () => {
  const f = await fixture();
  await f.callback("inbound", { Body: "STOP", OptOutType: "STOP" });
  await f.callback("inbound", {
    Body: "UNSTOP",
    OptOutType: "START",
    MessageSid: "SM" + "7".repeat(32),
  });
  await f.callback("inbound", {
    Body: "HELP",
    OptOutType: "HELP",
    MessageSid: "SM" + "8".repeat(32),
  });
  assert.equal(
    (await f.ledger.read()).smsPreferences[hash(f.row.phone)].type,
    "STOP",
  );
});
test("a START whose Notion mirror failed is still consent; the mirror is retried; future timestamps are refused", async () => {
  const f = await fixture({ notionFails: true, keywordConsent: false });
  await f.callback("inbound", { Body: "SOPHIA", OptOutType: "START" });
  const state = await f.ledger.read();
  assert.equal(state.smsSuppression[hash(f.row.phone)].syncState, "pending");
  assert.equal(state.smsConsentPhones[f.row.id], f.row.phone);
  // The guest texted the keyword: that is the consent record, Notion only mirrors it.
  assert.ok((await f.sms.review("draft")).reviewToken);
  assert.equal((await f.sms.retrySync()).attempted, 1);
  const future = await fixture({ inboundAt: Date.parse("2027-01-01") });
  await assert.rejects(
    () => future.callback("inbound", { Body: "START", OptOutType: "START" }),
    (e) => e.code === "SMS_CONSENT_UNVERIFIED",
  );
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

test("Notion consent without a verified keyword opt-in cannot be reviewed or sent", async () => {
  const f = await fixture({ keywordConsent: false });
  await assert.rejects(
    () => f.sms.review("draft"),
    (e) => e.code === "SMS_DRAFT_STALE",
  );
  assert.equal(f.sends(), 0);
});
test("the SOPHIA program keyword enrolls once Twilio classifies it as opt-in", async () => {
  const f = await fixture({ keywordConsent: false });
  await f.callback("inbound", { Body: "sophia", OptOutType: "START" });
  const state = await f.ledger.read();
  assert.equal(state.smsPreferences[hash(f.row.phone)].type, "START");
  assert.equal(state.smsConsentPhones[f.row.id], f.row.phone);
  assert.ok((await f.sms.review("draft")).reviewToken);
});
test("drafts missing the brand prefix or STOP language are rejected at review", async () => {
  const f = await fixture();
  await f.ledger.transaction((s) => {
    s.smsDrafts.draft.text = "RSVP https://example.com/rsvp/";
  });
  await assert.rejects(
    () => f.sms.review("draft"),
    (e) => e.code === "SMS_BRAND_OR_STOP_MISSING",
  );
});
test("keyword opt-in and opt-out are logged as consent events without the phone number", async () => {
  const f = await fixture({ keywordConsent: false });
  await f.callback("inbound", { Body: "sophia", OptOutType: "START" });
  await f.callback("inbound", { Body: "please stop texting me", OptOutType: "STOP", MessageSid: "SM" + "9".repeat(32) });
  const log = (await f.ledger.read()).eventLog;
  assert.deepEqual(
    log.filter((e) => e.type.startsWith("consent.")).map((e) => [e.type, e.data.keyword]),
    [["consent.granted", "SOPHIA"], ["consent.revoked", null]],
  );
  assert.equal(log[0].data.phoneHash, hash(f.row.phone));
  const text = JSON.stringify(log);
  assert.ok(!text.includes(f.row.phone) && !text.toLowerCase().includes("please"));
});

test("the website sends the registered welcome text on a first START; Twilio covers re-subscribes", async () => {
  const f = await fixture({ keywordConsent: false });
  const body = (r) => r.binary.toString();
  // First SOPHIA: Twilio stays silent, so the TwiML carries the confirmation.
  const first = await f.callback("inbound", { Body: "SOPHIA", OptOutType: "START" });
  assert.match(body(first), /<Message>Simply Soph Media: You&apos;re subscribed[^<]*Msg &amp; data rates[^<]*<\/Message>/);
  // Replayed webhook for the same message: no second welcome.
  assert.match(body(await f.callback("inbound", { Body: "SOPHIA", OptOutType: "START" })), /<Response\/>/);
  // After a STOP, Twilio's own opt-in reply answers START, so the website stays quiet.
  const again = await fixture({ keywordConsent: false });
  await again.ledger.transaction((s) => {
    s.smsPreferences = {
      [hash(f.row.phone)]: { phone: f.row.phone, type: "STOP", at: Date.parse("2026-09-01"), messageId: "SM" + "0".repeat(32) },
    };
  });
  assert.match(
    body(await again.callback("inbound", { Body: "START", OptOutType: "START", MessageSid: "SM" + "c".repeat(32) })),
    /<Response\/>/,
  );
  assert.equal((await again.ledger.read()).smsPreferences[hash(f.row.phone)].type, "START");
  // HELP and STOP never get a website reply (Twilio answers those).
  assert.match(body(await f.callback("inbound", { Body: "HELP", OptOutType: "HELP", MessageSid: "SM" + "d".repeat(32) })), /<Response\/>/);
  assert.match(body(await f.callback("inbound", { Body: "STOP", OptOutType: "STOP", MessageSid: "SM" + "b".repeat(32) })), /<Response\/>/);
});

test("a test text to the organizer's phone needs only the keyword receipt, no guest row", async () => {
  const f = await fixture({ keywordConsent: false });
  const phone = "+18175550123";
  const text = "Simply Soph Media: Test. Reply STOP to opt out.";
  await assert.rejects(() => f.sms.sendTest({ phone, text }, "admin"), (e) => e.code === "SMS_NOT_SUBSCRIBED");
  await assert.rejects(() => f.sms.sendTest({ phone: "+525512345678", text }, "admin"), (e) => e.code === "SMS_COUNTRY_NOT_ALLOWED");
  await f.ledger.transaction((s) => {
    s.smsPreferences = { [hash(phone)]: { phone, type: "START", at: 1, messageId: "SM" + "e".repeat(32), syncState: "pending" } };
  });
  await assert.rejects(() => f.sms.sendTest({ phone, text: "Test" }, "admin"), (e) => e.code === "SMS_BRAND_OR_STOP_MISSING");
  const r = await f.sms.sendTest({ phone: "+1 (817) 555-0123", text }, "admin");
  assert.equal(r.state, "accepted");
  assert.equal(f.sends(), 1);
  const draft = (await f.ledger.read()).smsDrafts[r.id];
  assert.equal(draft.test, true);
  assert.equal(draft.householdId, null);
  // STOP afterwards blocks the next test to that phone.
  await f.ledger.transaction((s) => {
    s.smsPreferences[hash(phone)] = { phone, type: "STOP", at: 2 };
  });
  await assert.rejects(() => f.sms.sendTest({ phone, text }, "admin"), (e) => e.code === "SMS_OPTED_OUT");
  assert.equal(f.sends(), 1);
});

test("a batch sends only after the typed count matches; stale drafts are set aside, not sent", async () => {
  const f = await fixture();
  const other = "+14155552672";
  await f.ledger.transaction((s) => {
    s.smsDrafts.second = { ...s.smsDrafts.draft, id: "second", householdId: "nobody", to: other };
    s.smsDrafts.other = { ...s.smsDrafts.draft, id: "other", campaignId: "elsewhere" };
  });
  await assert.rejects(() => f.sms.sendBatch("campaign", "admin"), (e) => e.code === "BATCH_NOT_CONFIRMED");
  await assert.rejects(() => f.sms.confirmBatch("campaign", 1, "admin"), (e) => e.code === "CONFIRM_COUNT_MISMATCH");
  await assert.rejects(() => f.sms.confirmBatch("missing", 1, "admin"), (e) => e.status === 404);
  const confirmed = await f.sms.confirmBatch("campaign", 2, "admin");
  assert.equal(confirmed.state, "confirmed");
  await assert.rejects(() => f.sms.confirmBatch("campaign", 2, "admin"), (e) => e.code === "BATCH_NOT_DRAFT");
  const r = await f.sms.sendBatch("campaign", "admin");
  // "second" has no consent binding: skipped and archived, never sent.
  assert.deepEqual([r.accepted, r.skipped, r.remaining, r.done], [1, 1, 0, true]);
  assert.equal(f.sends(), 1);
  const s = await f.ledger.read();
  assert.equal(s.smsDrafts.draft.state, "accepted");
  assert.equal(s.smsDrafts.second.archived, true);
  assert.equal(s.smsDrafts.other.state, "draft");
  const list = f.sms.batches(s);
  assert.deepEqual(
    list.map((b) => [b.id, b.state, b.total, b.remaining]),
    [["campaign", "done", 2, 0], ["elsewhere", "draft", 1, 1]],
  );
  // Nothing in a done batch can be sent twice.
  await assert.rejects(() => f.sms.sendBatch("campaign", "admin"), (e) => e.code === "BATCH_NOT_CONFIRMED");
  const cancelled = await f.sms.cancelBatch("elsewhere", "admin");
  assert.equal(cancelled.state, "cancelled");
  assert.equal((await f.ledger.read()).smsDrafts.other.archived, true);
});

test("a STOP that lands between review and send wins inside the send transaction", async () => {
  const f = await fixture();
  const p = await f.sms.review("draft");
  await f.ledger.transaction((s) => {
    s.smsPreferences[hash(f.row.phone)] = { phone: f.row.phone, type: "STOP", at: Date.parse("2026-09-27T01:00:00Z") };
  });
  await assert.rejects(() => f.sms.send("draft", p.reviewToken, "admin"), (e) => e.code === "SMS_OPTED_OUT");
  assert.equal(f.sends(), 0);
});
