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
      enabled: true,
      inboundTime: async () => inboundAt,
      send: async () => {
        count++;
        if (options.unknown) throw Error();
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
