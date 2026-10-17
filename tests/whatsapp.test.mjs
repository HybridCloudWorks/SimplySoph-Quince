import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { createWhatsapp } from "../server/whatsapp.mjs";
import {
  whatsappTransport,
  whatsappDestination,
} from "../server/whatsapp-transport.mjs";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { hash } from "../server/auth.mjs";
const webhook = {
  accountSid: "AC" + "1".repeat(32),
  from: "+16827868002",
  authToken: "fixture",
  origin: "https://example.com",
};
async function fixture(options = {}) {
  let clock = Date.parse("2026-09-28"),
    count = 0,
    inboundAt = clock - 100;
  const row = {
    id: "household",
    name: "Test Guest",
    validCapacity: true,
    whatsappPhone: options.phone || "+442079460123",
    whatsappLanguage: "en",
    whatsappConsent: true,
    whatsappConsentAt: new Date(clock - 1000).toISOString(),
    whatsappConsentSource: "Recorded explicit consent",
    whatsappConsentVersion: "2026-09-28",
  };
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.invitations[row.id] = { id: row.id, active: true, generation: 1 };
  });
  const notion = {
    read: async () => {
      await options.beforeRead?.();
      return structuredClone(row);
    },
    list: async () => [structuredClone(row)],
    projectWhatsappConsent: async (id, p) => {
      if (options.syncFail) throw Error();
      if (options.beforeConsent) await options.beforeConsent();
      Object.assign(row, {
        whatsappPhone: p.phone,
        whatsappLanguage: p.language,
        whatsappConsent: true,
        whatsappOptOut: false,
        whatsappConsentAt: new Date(p.at).toISOString(),
      });
    },
    projectWhatsappOptOut: async () => {
      if (options.syncFail) throw Error();
      row.whatsappOptOut = true;
    },
  };
  const template = {
    key: "invitation_en",
    language: "en",
    contentSid: "HX" + "2".repeat(32),
    body: "Invitation {{1}}",
    variables: ["1"],
    category: "MARKETING",
    status: options.status || "approved",
  };
  const app = createWhatsapp({
    ledger,
    notion,
    webhook,
    key: Buffer.alloc(32, 1),
    origin: webhook.origin,
    templates: [template],
    now: () => clock,
    transport: {
      enabled: options.enabled ?? true,
      inboundTime: async () => inboundAt,
      send: async () => {
        count++;
        if (options.unknown) throw Error();
        if (options.rejected)
          throw Object.assign(Error(), { code: "WHATSAPP_REJECTED" });
        return { state: "accepted", providerId: "SM" + "3".repeat(32) };
      },
    },
  });
  const callback = async (body, id = "4", extra = {}) => {
    const p = {
      AccountSid: webhook.accountSid,
      MessageSid: "SM" + id.repeat(32),
      From: "whatsapp:" + row.whatsappPhone,
      To: "whatsapp:" + webhook.from,
      Body: body,
      ...extra,
    };
    return app.callback(
      "inbound",
      p,
      twilio.getExpectedTwilioSignature(
        webhook.authToken,
        webhook.origin + "/api/whatsapp/inbound",
        p,
      ),
    );
  };
  const draft = () =>
    app.draft({
      requestId: "campaign-0001",
      ids: [row.id],
      groups: [],
      templateKey: template.key,
    });
  return {
    app,
    row,
    ledger,
    callback,
    draft,
    sends: () => count,
    advance: () => {
      clock += 1000;
      inboundAt = clock - 100;
    },
  };
}
test("WhatsApp validates international numbers independently of SMS", () => {
  assert.equal(whatsappDestination("+442079460123"), "+442079460123");
  assert.throws(() => whatsappDestination("2079460123"));
});

test("archiving during WhatsApp eligibility lookup prevents the later send claim", async () => {
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
  await f.callback("START");
  const { ids } = await f.draft();
  const preview = await f.app.review(ids[0]);
  hold = true;
  const send = f.app.send(ids[0], preview.reviewToken, "admin");
  await began;
  await f.ledger.transaction((s) => {
    s.whatsappDrafts[ids[0]].archived = true;
  });
  release();
  await assert.rejects(send, (e) => e.code === "WHATSAPP_ALREADY_ATTEMPTED");
  assert.equal(f.sends(), 0);
});
test("explicit consent plus verified START enables phone-only invitations; STOP and replay stay blocked", async () => {
  const f = await fixture();
  await assert.rejects(f.draft, (e) => e.code === "NO_ELIGIBLE_RECIPIENTS");
  await f.callback("START");
  const d = await f.draft();
  assert.deepEqual(await f.draft(), d);
  const preview = await f.app.review(d.ids[0]);
  assert.match(preview.text, /https:\/\/example.com\/rsvp\/#/);
  const s = await f.ledger.read();
  assert.equal(Object.keys(s.invitationLinks).length, 1);
  assert.ok(!JSON.stringify(s.whatsappDrafts).includes("https://example.com"));
  await f.callback("STOP", "5");
  await f.callback("START");
  await assert.rejects(
    () => f.app.send(d.ids[0], preview.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_DRAFT_STALE",
  );
  assert.equal(f.sends(), 0);
});
test("US marketing, unapproved templates, changed number and revoked generations cannot send", async () => {
  const us = await fixture({ phone: "+14155552671" });
  await us.callback("START");
  await assert.rejects(us.draft, (e) => e.code === "NO_ELIGIBLE_RECIPIENTS");
  const pending = await fixture({ status: "pending" });
  await pending.callback("START");
  const d = await pending.draft(),
    p = await pending.app.review(d.ids[0]);
  assert.equal(p.sendingEnabled, false);
  await assert.rejects(
    () => pending.app.send(d.ids[0], p.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_TEMPLATE_NOT_APPROVED",
  );
  const f = await fixture();
  await f.callback("START");
  const a = await f.draft(),
    b = await f.app.review(a.ids[0]);
  await f.app.consent(f.row.id, {
    phone: "+33142345678",
    language: "en",
    consent: true,
  });
  await assert.rejects(
    () => f.app.send(a.ids[0], b.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_DRAFT_STALE",
  );
});
test("uncertain delivery remains claimed and cannot retry; Notion failure blocks enrollment", async () => {
  const f = await fixture({ unknown: true });
  await f.callback("START");
  const d = await f.draft(),
    p = await f.app.review(d.ids[0]);
  await assert.rejects(
    () => f.app.send(d.ids[0], p.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_DELIVERY_UNKNOWN",
  );
  const again = await f.app.review(d.ids[0]);
  await assert.rejects(
    () => f.app.send(d.ids[0], again.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_ALREADY_ATTEMPTED",
  );
  assert.equal(f.sends(), 1);
  const outage = await fixture({ syncFail: true });
  await outage.callback("START");
  await assert.rejects(
    outage.draft,
    (e) => e.code === "NO_ELIGIBLE_RECIPIENTS",
  );
});
test("transport uses template ContentSid and direct WhatsApp sender; disabled means no request", async () => {
  let call;
  const config = {
    ...webhook,
    apiKeySid: "SK" + "5".repeat(32),
    apiKeySecret: "fixture",
    statusCallback: webhook.origin + "/api/whatsapp/status",
    fetchImpl: async (url, opt) => {
      call = opt;
      return {
        status: 201,
        json: async () => ({
          sid: "SM" + "6".repeat(32),
          account_sid: webhook.accountSid,
        }),
      };
    },
  };
  await assert.rejects(
    () => whatsappTransport(config).send({ to: "+442079460123" }),
    (e) => e.code === "WHATSAPP_NOT_ENABLED",
  );
  assert.equal(call, undefined);
  await whatsappTransport({ ...config, enabled: true }).send({
    to: "+442079460123",
    contentSid: "HX" + "2".repeat(32),
    variables: { 1: "https://example.com" },
  });
  assert.equal(call.body.get("To"), "whatsapp:+442079460123");
  assert.equal(call.body.get("From"), "whatsapp:+16827868002");
  assert.equal(call.body.has("Body"), false);
  assert.equal(call.body.has("MessagingServiceSid"), false);
});

test("a delayed START projection cannot overwrite a newer STOP", async () => {
  let release, entered;
  const blocked = new Promise((r) => {
    release = r;
  });
  const started = new Promise((r) => {
    entered = r;
  });
  const f = await fixture({
    beforeConsent: async () => {
      entered();
      await blocked;
    },
  });
  const oldStart = f.callback("START");
  await started;
  f.advance();
  await f.callback("STOP", "5");
  release();
  await oldStart;
  assert.equal(f.row.whatsappOptOut, true);
  const s = await f.ledger.read();
  assert.equal(s.whatsappPreferences[hash(f.row.whatsappPhone)].type, "STOP");
  assert.equal(
    s.whatsappPreferences[hash(f.row.whatsappPhone)].syncState,
    "synced",
  );
  await assert.rejects(f.draft, (e) => e.code === "NO_ELIGIBLE_RECIPIENTS");
});

test("WhatsApp answers only the STOP, START and HELP keywords on its own; other text gets no reply (owner's rule)", async () => {
  const f = await fixture();
  const reply = async (text, id) => (await f.callback(text, id)).binary.toString();
  assert.match(await reply("HELP", "6"), /<Message>Simply Soph Media event support/);
  assert.match(await reply("ayuda", "7"), /<Message>/);
  const other = await reply("Can we bring a plus one?", "8");
  assert.ok(!other.includes("<Message>"), "a person answers other messages");
  assert.match(await reply("STOP", "9"), /<Message>.*unsubscribed/);
});

// Before: every keyword reply was English, even to BAJA, ALTA or AYUDA (R-032).
test("Spanish keywords get Spanish replies; English keywords follow the language this phone chose", async () => {
  const f = await fixture();
  const reply = async (text, id) =>
    (await f.callback(text, id)).binary.toString().match(/<Message>([\s\S]*)<\/Message>/)?.[1];
  // The phone's saved language is English (the guest list).
  assert.equal(
    await reply("AYUDA", "a"),
    "Simply Soph Media, ayuda con los avisos de los XV de Sophia: misxv@simplysoph.com. Responde BAJA para cancelar. Para confirmar tu asistencia, usa el enlace privado de tu invitación: https://example.com/es/rsvp/",
  );
  assert.equal(
    await reply("HELP", "b"),
    "Simply Soph Media event support: misxv@simplysoph.com. Reply STOP to unsubscribe. To RSVP, use the private link in your invitation: https://example.com/rsvp/",
  );
  assert.equal(
    await reply("ALTA", "c"),
    "Simply Soph Media: Tu suscripción a los avisos por WhatsApp de los XV de Sophia está activa. La frecuencia varía. Responde BAJA para cancelar o AYUDA para recibir ayuda.",
  );
  f.advance();
  assert.equal(
    await reply("baja", "d"),
    "Simply Soph Media: Ya no recibirás avisos por WhatsApp de los XV de Sophia. Responde ALTA o START para volver a suscribirte.",
  );
  // After a stop, ALTA alone does not subscribe again: the not-ready reply.
  f.advance();
  assert.match(await reply("INICIAR", "9"), /^Simply Soph Media: Primero pide los avisos por WhatsApp/);
  // The guest list says this phone chose Spanish: English keywords get Spanish too.
  f.row.whatsappLanguage = "es";
  assert.match(await reply("HELP", "e"), /^Simply Soph Media, ayuda con los avisos/);
  assert.match(await reply("STOP", "f"), /^Simply Soph Media: Ya no recibirás avisos/);
  // A sign-up on the website in Spanish counts before the guest list.
  f.row.whatsappLanguage = "en";
  await f.app.consent(f.row.id, { phone: "+442079460999", language: "es", consent: true });
  const other = await f.callback("HELP", "1", { From: "whatsapp:+442079460999" });
  assert.match(other.binary.toString(), /<Message>Simply Soph Media, ayuda/);
  // Unknown phones get English, and other text still gets no reply.
  const stranger = await f.callback("HELP", "2", { From: "whatsapp:+33142345678" });
  assert.match(stranger.binary.toString(), /<Message>Simply Soph Media event support/);
  assert.equal(await reply("Hola, ¿a qué hora?", "3"), undefined);
});

// Before: the website took a +1 number, and took new sign-ups while WhatsApp
// was off, then sent the guest to WhatsApp to "send START" (R-031).
test("WhatsApp sign-up refuses US and Canadian (+1) numbers and new sign-ups while WhatsApp is off; unsubscribing always works", async () => {
  const f = await fixture();
  for (const phone of ["+18175550199", "+14165550123"])
    await assert.rejects(
      () => f.app.consent(f.row.id, { phone, language: "en", consent: true }),
      (e) => e.code === "WHATSAPP_US_NUMBER" && e.status === 422,
    );
  assert.deepEqual((await f.ledger.read()).whatsappPending ?? {}, {});
  await f.app.consent(f.row.id, { phone: "+525512345678", language: "es", consent: true });
  assert.equal((await f.ledger.read()).whatsappPending[f.row.id].phone, "+525512345678");
  assert.equal((await f.ledger.read()).whatsappPending[f.row.id].version, "2026-10-17");

  const off = await fixture({ enabled: false });
  await assert.rejects(
    () => off.app.consent(off.row.id, { phone: "+525512345678", language: "es", consent: true }),
    (e) => e.code === "WHATSAPP_NOT_AVAILABLE" && e.status === 503,
  );
  assert.deepEqual((await off.ledger.read()).whatsappPending ?? {}, {});
  // Stopping is never refused, even while off or for a number already saved.
  await off.app.consent(off.row.id, { phone: off.row.whatsappPhone, language: "en", consent: false });
  assert.equal((await off.ledger.read()).whatsappPreferences[hash(off.row.whatsappPhone)].type, "STOP");
});

test("WhatsApp cannot be switched on while an approved template shows another RSVP deadline (re-audit N5)", () => {
  const deadline = "2026-11-15T23:59:00-06:00";
  const template = (key, language, body) => ({
    key, language, body, status: "approved", category: "MARKETING",
    contentSid: "HX" + "5".repeat(32), variables: ["1"],
  });
  const old = [
    template("invitation_en", "en", "Simply Soph Media: Please RSVP by October 31, 2026 using your private link: {{1}}"),
    template("invitation_es", "es", "Simply Soph Media: Confirma antes del 15 de noviembre de 2026: {{1}}"),
  ];
  const build = (templates, enabled) =>
    createWhatsapp({ ledger: null, notion: null, transport: { enabled }, templates, deadline });
  assert.throws(() => build(old, true), /another RSVP deadline: invitation_en$/);
  assert.doesNotThrow(() => build(old, false), "switched off, the catalog may still be updated");
  const current = [old[1], template("invitation_en", "en", "Simply Soph Media: Please RSVP by November 15, 2026 using your private link: {{1}}")];
  assert.doesNotThrow(() => build(current, true));
});

// ---- Delivery status callbacks and the preference retry loop (#74) ----
const accepted = "SM" + "3".repeat(32);
// A Twilio status callback for a message to `to`, signed like Twilio signs it.
function status(f, MessageStatus, { sid = accepted, to = f.row.whatsappPhone, signature } = {}) {
  const p = {
    AccountSid: webhook.accountSid,
    MessageSid: sid,
    From: "whatsapp:" + webhook.from,
    To: "whatsapp:" + to,
    MessageStatus,
  };
  return f.app.callback(
    "status",
    p,
    signature ??
      twilio.getExpectedTwilioSignature(webhook.authToken, webhook.origin + "/api/whatsapp/status", p),
  );
}
async function sentDraft(options) {
  const f = await fixture(options);
  await f.callback("START");
  const { ids } = await f.draft();
  const preview = await f.app.review(ids[0]);
  return { ...f, id: ids[0], preview };
}
const deliveryEvents = (s, sid) =>
  s.eventLog.filter((e) => e.data?.providerId === sid).map((e) => e.type);

test("delivery statuses are recorded against the accepted message and never move backwards (#74)", async () => {
  const f = await sentDraft();
  const result = await f.app.send(f.id, f.preview.reviewToken, "admin");
  assert.equal(result.providerId, accepted);
  let s = await f.ledger.read();
  assert.equal(s.whatsappDrafts[f.id].state, "accepted");
  assert.equal(typeof s.whatsappDrafts[f.id].acceptedAt, "number");
  for (const step of ["queued", "sent", "delivered"]) await status(f, step);
  // Late or repeated callbacks are acknowledged but change nothing.
  await status(f, "sent");
  await status(f, "delivered");
  s = await f.ledger.read();
  assert.equal(s.whatsappDelivery[accepted].status, "delivered");
  assert.deepEqual(deliveryEvents(s, accepted), ["delivery.queued", "delivery.sent", "delivery.delivered"]);
  // read, failed and undelivered are final: the first one recorded stays.
  await status(f, "read");
  await status(f, "failed");
  s = await f.ledger.read();
  assert.equal(s.whatsappDelivery[accepted].status, "read");
  const read = s.eventLog.find((e) => e.type === "delivery.read");
  assert.equal(read.householdId, f.row.id);
  assert.equal(read.deliveryId, f.id);
  assert.ok(!JSON.stringify(read).includes(f.row.whatsappPhone), "events carry ids, never the phone number");
  // The admin list shows the delivery status but never the sealed invitation link.
  const list = await f.app.list();
  assert.equal(list.drafts[0].delivery, "read");
  assert.ok(!("variables" in list.drafts[0]));
  assert.ok(!JSON.stringify(list).includes("/rsvp/#"));
  assert.deepEqual(
    list.recipients.map(({ id, phone, language }) => ({ id, phone, language })),
    [{ id: f.row.id, phone: f.row.whatsappPhone, language: "en" }],
  );
  assert.equal(f.sends(), 1, "status callbacks never send");
});

test("status callbacks that are unsigned, malformed or for someone else's message are refused and record nothing (#74)", async () => {
  const f = await sentDraft();
  await f.app.send(f.id, f.preview.reviewToken, "admin");
  await assert.rejects(status(f, "delivered", { signature: "forged" }), (e) => e.status === 403 && e.code === "TWILIO_SIGNATURE_INVALID");
  await assert.rejects(status(f, "delivered", { sid: "SM-not-a-sid" }), (e) => e.status === 422 && e.code === "INVALID_MESSAGE");
  await assert.rejects(status(f, "opened"), (e) => e.status === 422 && e.code === "INVALID_MESSAGE_STATUS");
  // The accepted message's id, reported for another phone.
  await assert.rejects(
    status(f, "delivered", { to: "+442079460999" }),
    (e) => e.status === 409 && e.code === "WHATSAPP_CALLBACK_UNMATCHED",
  );
  // An unknown message id for this phone, with no send in doubt.
  await assert.rejects(
    status(f, "delivered", { sid: "SM" + "8".repeat(32) }),
    (e) => e.status === 409 && e.code === "WHATSAPP_CALLBACK_UNMATCHED",
  );
  const s = await f.ledger.read();
  assert.deepEqual(s.whatsappDelivery ?? {}, {});
  assert.equal(s.eventLog.filter((e) => e.data?.providerId).length, 0);
});

test("a delivery report for an uncertain or rejected send is kept, but the draft is never sent again (#74)", async () => {
  const f = await sentDraft({ unknown: true });
  await assert.rejects(
    () => f.app.send(f.id, f.preview.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_DELIVERY_UNKNOWN",
  );
  // Twilio may still report on the message whose acceptance was lost.
  const lost = "SM" + "7".repeat(32);
  await status(f, "failed", { sid: lost });
  await status(f, "undelivered", { sid: lost });
  let s = await f.ledger.read();
  assert.equal(s.whatsappDelivery[lost].status, "failed");
  assert.equal(s.whatsappDrafts[f.id].state, "unknown");
  assert.equal(s.whatsappDrafts[f.id].error, "WHATSAPP_DELIVERY_UNKNOWN");
  // Not even a failure report reopens the send, and repeating the draft
  // request returns the same draft rather than a new one.
  const again = await f.app.review(f.id);
  await assert.rejects(
    () => f.app.send(f.id, again.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_ALREADY_ATTEMPTED",
  );
  assert.deepEqual(await f.draft(), { ids: [f.id], count: 1, channel: "whatsapp" });
  assert.equal(f.sends(), 1);
  // A refusal by Twilio is final too.
  const r = await sentDraft({ rejected: true });
  await assert.rejects(
    () => r.app.send(r.id, r.preview.reviewToken, "admin"),
    (e) => e.status === 503 && e.code === "WHATSAPP_REJECTED",
  );
  s = await r.ledger.read();
  assert.equal(s.whatsappDrafts[r.id].state, "rejected");
  assert.ok(s.eventLog.some((e) => e.type === "delivery.rejected" && e.deliveryId === r.id));
  const reviewed = await r.app.review(r.id);
  await assert.rejects(
    () => r.app.send(r.id, reviewed.reviewToken, "admin"),
    (e) => e.code === "WHATSAPP_ALREADY_ATTEMPTED",
  );
  assert.equal(r.sends(), 1);
});

test("the retry loop projects START and STOP to Notion after an outage and never sends (#74)", async () => {
  const options = { syncFail: true };
  const f = await fixture(options);
  const h = hash(f.row.whatsappPhone);
  await f.callback("START");
  let s = await f.ledger.read();
  assert.equal(s.whatsappPreferences[h].syncState, "pending");
  assert.deepEqual((await f.app.list()).recipients, [], "unconfirmed in Notion: not eligible");
  // Still down: the attempt leaves it pending.
  assert.deepEqual(await f.app.retrySync(), { attempted: 1 });
  assert.equal((await f.ledger.read()).whatsappPreferences[h].syncState, "pending");
  options.syncFail = false;
  // A spent time budget attempts nothing.
  assert.deepEqual(await f.app.retrySync({ until: 0 }), { attempted: 0 });
  assert.deepEqual(await f.app.retrySync(), { attempted: 1 });
  s = await f.ledger.read();
  assert.equal(s.whatsappPreferences[h].syncState, "synced");
  assert.equal(s.whatsappConsentPhones[f.row.id], f.row.whatsappPhone);
  assert.equal(s.whatsappSuppression[h], undefined);
  assert.deepEqual(await f.app.retrySync(), { attempted: 0 }, "nothing left to retry");
  assert.equal((await f.app.list()).recipients.length, 1);
  // A STOP during an outage blocks sending at once and reaches Notion later.
  options.syncFail = true;
  f.advance();
  await f.callback("STOP", "5");
  s = await f.ledger.read();
  assert.equal(s.whatsappPreferences[h].syncState, "pending");
  assert.ok(s.whatsappSuppression[h]);
  assert.deepEqual((await f.app.list()).recipients, []);
  options.syncFail = false;
  assert.deepEqual(await f.app.retrySync(), { attempted: 1 });
  s = await f.ledger.read();
  assert.equal(f.row.whatsappOptOut, true);
  assert.equal(s.whatsappPreferences[h].syncState, "synced");
  assert.ok(s.whatsappSuppression[h], "a STOP stays suppressed after it is synced");
  assert.equal(f.sends(), 0);
});

test("the retry loop tries at most 25 preferences per run, least recently tried first (#74)", async () => {
  const phones = Array.from({ length: 30 }, (_, i) => "+1555555" + String(i).padStart(4, "0"));
  const ledger = new Ledger(memoryAdapter());
  await ledger.transaction((s) => {
    s.whatsappPreferences = {};
    for (const [i, phone] of phones.entries())
      s.whatsappPreferences[hash(phone)] = { phone, type: "STOP", at: i, messageId: "stop-" + i, syncState: "pending" };
  });
  const tried = [];
  const app = createWhatsapp({
    ledger,
    templates: [],
    notion: {
      list: async () => phones.map((phone, i) => ({ id: "household-" + i, whatsappPhone: phone })),
      // Notion keeps failing, so every preference stays pending.
      projectWhatsappOptOut: async (id) => {
        tried.push(id);
        throw Error("Notion unavailable");
      },
    },
    transport: {
      enabled: false,
      send: async () => assert.fail("retrying a preference never sends a message"),
    },
  });
  assert.deepEqual(await app.retrySync(), { attempted: 25 });
  const first = new Set(tried);
  assert.equal(first.size, 25);
  tried.length = 0;
  assert.deepEqual(await app.retrySync(), { attempted: 25 });
  // The five that waited go first, so one failing row cannot starve the rest.
  const waited = phones.map((_, i) => "household-" + i).filter((x) => !first.has(x));
  assert.deepEqual(tried.slice(0, 5).sort(), waited.sort());
  assert.ok(
    Object.values((await ledger.read()).whatsappPreferences).every((p) => p.syncState === "pending"),
  );
});
