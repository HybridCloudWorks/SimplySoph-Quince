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
test("START fails closed during Notion outage and rejects future provider timestamps", async () => {
  const f = await fixture({ notionFails: true });
  await f.callback("inbound", { Body: "START", OptOutType: "START" });
  assert.ok((await f.ledger.read()).smsSuppression[hash(f.row.phone)]);
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
