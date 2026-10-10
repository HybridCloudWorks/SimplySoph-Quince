import { smsProgram } from "../site/sms-program.mjs";
import { error, hash } from "./auth.mjs";
import { smsDestination, validTwilioWebhook } from "./twilio.mjs";
import { logEvent } from "./event-log.mjs";

// The registered campaign promises that the only opt-in is the guest texting a
// program keyword. A Notion checkbox alone must never make a phone sendable:
// require a provider-verified START receipt, synced, bound to this household.
export function smsKeywordConsent(state, householdId, phone) {
  const pref = state.smsPreferences?.[hash(phone)];
  return (
    pref?.type === "START" &&
    pref.syncState === "synced" &&
    state.smsConsentPhones?.[householdId] === phone &&
    !state.smsSuppression?.[hash(phone)]
  );
}

// Carrier-review requirement: every program message identifies the brand and opt-out.
export function smsCompliantText(text) {
  return (
    typeof text === "string" &&
    text.startsWith(smsProgram.name + ":") &&
    /\bSTOP\b/.test(text)
  );
}

// Conservative segment estimates (multipart payloads are 152/66).
export function smsPreview(text) {
  if (typeof text !== "string" || !text.trim() || text.length > 1600)
    throw error(422, "SMS_MESSAGE_INVALID");
  const basic = new Set(
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
  );
  const extended = new Set("\f^{}\\[~]|€");
  const gsm = [...text].every((c) => basic.has(c) || extended.has(c));
  const units = gsm
    ? [...text].reduce((n, c) => n + (extended.has(c) ? 2 : 1), 0)
    : text.length;
  return {
    encoding: gsm ? "GSM-7" : "Unicode",
    units,
    segments:
      units <= (gsm ? 160 : 70) ? 1 : Math.ceil(units / (gsm ? 152 : 66)),
    cost: null,
    costNote: "Estimate only. Carrier fees and your Twilio rates apply.",
  };
}

export function createSms({
  ledger,
  notion,
  transport,
  webhook = {},
  now = Date.now,
  // Fills a sealed per-household {link} only when the text leaves the server;
  // stored drafts and admin listings keep the placeholder.
  render = (draft) => draft.text,
}) {
  const enabled = transport?.enabled === true;
  const destination = (row) =>
    smsDestination(row.phone?.replace(/[ ()-]/g, ""));
  async function review(id) {
    const state = await ledger.read(),
      draft = state.smsDrafts?.[id];
    if (!draft || draft.archived) throw error(404, "NOT_FOUND");
    if (!draft.householdId || !Array.isArray(draft.groups))
      throw error(409, "SMS_DRAFT_STALE");
    if (!smsCompliantText(draft.text))
      throw error(422, "SMS_BRAND_OR_STOP_MISSING");
    if (state.smsSuppression?.[hash(draft.to)])
      throw error(409, "SMS_OPTED_OUT");
    const row = await notion.read(draft.householdId, { fresh: true });
    if (
      row.archived ||
      !row.smsConsent ||
      !row.smsConsentAt ||
      row.smsOptOut ||
      !Number.isFinite(Date.parse(row.smsConsentAt)) ||
      Date.parse(row.smsConsentAt) > now() ||
      destination(row) !== draft.to ||
      !smsKeywordConsent(state, row.id, draft.to) ||
      state.invitations[row.id]?.active === false ||
      (draft.link && state.invitations[row.id]?.generation !== draft.generation) ||
      (!draft.directlySelected &&
        !row.distributionGroups?.some((g) => draft.groups.includes(g)))
    )
      throw error(409, "SMS_DRAFT_STALE");
    if (state.smsSuppression?.[hash(draft.to)])
      throw error(409, "SMS_OPTED_OUT");
    return {
      id,
      to: draft.to,
      text: draft.text,
      ...smsPreview(render(draft)),
      reviewToken: hash(
        JSON.stringify([
          draft.id,
          draft.to,
          draft.text,
          row.lastEdited,
          row.smsConsentAt,
        ]),
      ),
      sendingEnabled: enabled,
      state: draft.state,
    };
  }
  async function send(id, reviewToken, actor) {
    if (!enabled) throw error(503, "SMS_NOT_ENABLED");
    const preview = await review(id);
    if (reviewToken !== preview.reviewToken)
      throw error(409, "SMS_REVIEW_REQUIRED");
    const job = await ledger.transaction((s) => {
      const d = s.smsDrafts?.[id];
      if (!d || d.archived || d.state !== "draft") throw error(409, "SMS_ALREADY_ATTEMPTED");
      if (
        d.text !== preview.text ||
        d.to !== preview.to ||
        s.invitations[d.householdId]?.active === false ||
        (d.link && s.invitations[d.householdId]?.generation !== d.generation)
      )
        throw error(409, "SMS_DRAFT_STALE");
      if (s.smsSuppression?.[hash(d.to)]) throw error(409, "SMS_OPTED_OUT");
      // Campaign-wide destination claim survives concurrent requests and uncertain delivery.
      s.smsClaims ??= {};
      const claim = hash(JSON.stringify([d.campaignId || d.id, d.to]));
      if (s.smsClaims[claim]) throw error(409, "SMS_ALREADY_ATTEMPTED");
      s.smsClaims[claim] = id;
      d.state = "sending";
      d.attemptedAt = now();
      d.actor = actor;
      logEvent(s, now(), "delivery.claimed", {
        actor,
        householdId: d.householdId,
        deliveryId: id,
        data: { channel: "sms" },
      });
      return structuredClone(d);
    });
    let result;
    try {
      result = await transport.send({ to: job.to, text: render(job) });
    } catch (e) {
      await ledger.transaction((s) => {
        s.smsDrafts[id].state =
          e.code === "SMS_REJECTED" ? "rejected" : "unknown";
        s.smsDrafts[id].error =
          e.code === "SMS_REJECTED" ? "SMS_REJECTED" : "SMS_DELIVERY_UNKNOWN";
        logEvent(s, now(), "delivery." + s.smsDrafts[id].state, {
          householdId: s.smsDrafts[id].householdId,
          deliveryId: id,
          data: { channel: "sms", error: s.smsDrafts[id].error },
        });
      });
      throw error(
        503,
        e.code === "SMS_REJECTED" ? "SMS_REJECTED" : "SMS_DELIVERY_UNKNOWN",
      );
    }
    await ledger.transaction((s) => {
      Object.assign(s.smsDrafts[id], result, { acceptedAt: now() });
      logEvent(s, now(), "delivery.accepted", {
        householdId: s.smsDrafts[id].householdId,
        deliveryId: id,
        data: { channel: "sms" },
      });
    });
    return result;
  }
  async function syncOptOut(phone, reconcile = true) {
    const key = hash(phone);
    const preference = (await ledger.read()).smsPreferences?.[key];
    try {
      const rows = await notion.list();
      let matched = 0;
      for (const row of rows) {
        if (row.archived || row.phone?.replace(/[ ()-]/g, "") !== phone)
          continue;
        matched++;
        if (preference?.type === "START") {
          await ledger.transaction((s) => {
            s.smsConsentPhones ??= {};
            s.smsConsentPhones[row.id] = phone;
          });
          await notion.projectSmsConsent(row.id, preference.at);
        } else await notion.projectSmsOptOut(row.id);
      }
      const superseded = await ledger.transaction((s) => {
        // Never let an older projection clear a newer STOP or pending opt-in.
        if (
          preference &&
          s.smsPreferences?.[key]?.messageId !== preference.messageId
        ) {
          // An old network write can finish after a newer STOP has already
          // projected. Mark the latest preference pending and repair it; never
          // claim Notion is synced based on the newer callback's earlier write.
          const latest = s.smsPreferences?.[key];
          if (latest) {
            latest.syncState = "pending";
            s.smsSuppression ??= {};
            s.smsSuppression[key] = {
              phone,
              at: latest.at,
              syncState: "pending",
            };
          }
          return true;
        }
        if (preference && matched) s.smsPreferences[key].syncState = "synced";
        if (preference?.type === "START" && matched)
          delete s.smsSuppression[key];
        else if (s.smsSuppression?.[key])
          s.smsSuppression[key].syncState = matched ? "synced" : "pending";
        return false;
      });
      if (superseded && reconcile) await syncOptOut(phone, false);
    } catch {
      // Pending START and STOP both block sending until projection succeeds.
    }
  }
  async function callback(kind, params, signature) {
    if (
      !validTwilioWebhook({
        ...webhook,
        url: webhook.origin + "/api/twilio/" + kind,
        params,
        signature,
      })
    )
      throw error(403, "TWILIO_SIGNATURE_INVALID");
    if (!/^SM[0-9a-f]{32}$/i.test(params.MessageSid || ""))
      throw error(422, "INVALID_MESSAGE");
    if (kind === "inbound") {
      const phone = smsDestination(params.From);
      const body = (params.Body || "").trim().toUpperCase();
      const stop =
        params.OptOutType === "STOP" || smsProgram.stopKeywords.includes(body);
      // Only provider-classified START events enroll; plain text alone is insufficient.
      const start =
        !stop &&
        params.OptOutType === "START" &&
        smsProgram.keywords.includes(body);
      const key = hash(phone);
      const existing = (await ledger.read()).smsInbound?.[params.MessageSid];
      let at = now();
      if (start && !existing) {
        if (!transport?.inboundTime) throw error(503, "SMS_CONSENT_UNVERIFIED");
        at = await transport.inboundTime(params);
        if (!Number.isFinite(at) || at > now())
          throw error(503, "SMS_CONSENT_UNVERIFIED");
      }
      await ledger.transaction((s) => {
        s.smsInbound ??= {};
        if (s.smsInbound[params.MessageSid]) return;
        const type = stop
          ? "STOP"
          : start
            ? "START"
            : params.OptOutType === "HELP"
              ? "HELP"
              : "OTHER";
        s.smsInbound[params.MessageSid] = { phoneHash: key, type, at };
        // Consent receipts are retained so replayed START cannot undo STOP.
        if (!start && !stop) return;
        s.smsPreferences ??= {};
        const old = s.smsPreferences[key];
        if (start && old && at <= old.at) return;
        s.smsPreferences[key] = {
          phone,
          type,
          at,
          messageId: params.MessageSid,
          syncState: "pending",
          source: "Twilio keyword " + body,
          version: smsProgram.version,
        };
        s.smsSuppression ??= {};
        s.smsSuppression[key] = { phone, at, syncState: "pending" };
        logEvent(s, at, start ? "consent.granted" : "consent.revoked", {
          actor: "guest",
          // Only a recognised keyword is recorded, never free-form message text.
          data: {
            channel: "sms",
            phoneHash: key,
            keyword: [...smsProgram.keywords, ...smsProgram.stopKeywords].includes(body)
              ? body
              : null,
          },
        });
      });
      if (start || stop) await syncOptOut(phone);
    } else {
      const ranks = {
        accepted: 0,
        scheduled: 0,
        queued: 1,
        sending: 2,
        sent: 3,
        delivered: 4,
        undelivered: 4,
        failed: 4,
        canceled: 4,
      };
      if (!(params.MessageStatus in ranks))
        throw error(422, "INVALID_MESSAGE_STATUS");
      const phone = smsDestination(params.To);
      await ledger.transaction((s) => {
        s.smsDelivery ??= {};
        const job = Object.values(s.smsDrafts || {}).find(
          (d) => d.providerId === params.MessageSid,
        );
        // Callbacks can beat the REST response, but must match a known send attempt.
        if (
          job
            ? job.to !== phone
            : !Object.values(s.smsDrafts || {}).some(
                (d) =>
                  d.to === phone && ["sending", "unknown"].includes(d.state),
              )
        )
          throw error(409, "SMS_CALLBACK_UNMATCHED");
        const old = s.smsDelivery[params.MessageSid];
        if (old && ranks[old.status] >= ranks[params.MessageStatus]) return;
        s.smsDelivery[params.MessageSid] = {
          status: params.MessageStatus,
          phoneHash: hash(phone),
          at: now(),
        };
        logEvent(s, now(), "delivery." + params.MessageStatus, {
          householdId: job?.householdId,
          deliveryId: job?.id,
          data: { channel: "sms", providerId: params.MessageSid },
        });
      });
    }
    return {
      binary: Buffer.from('<?xml version="1.0" encoding="UTF-8"?><Response/>'),
      contentType: "text/xml; charset=utf-8",
    };
  }
  async function retrySync() {
    const pending = Object.values(
      (await ledger.read()).smsSuppression || {},
    ).filter((x) => x.syncState === "pending");
    for (const row of pending.slice(0, 25)) await syncOptOut(row.phone);
    return { attempted: Math.min(25, pending.length) };
  }
  return { enabled, review, send, callback, retrySync };
}
