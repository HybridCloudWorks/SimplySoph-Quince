import { error, hash } from "./auth.mjs";
import { smsDestination, validTwilioWebhook } from "./twilio.mjs";

// Conservative toll-free estimates (multipart payloads are 152/66).
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
}) {
  const enabled = transport?.enabled === true;
  const destination = (row) =>
    smsDestination(row.phone?.replace(/[ ()-]/g, ""));
  async function review(id) {
    const state = await ledger.read(),
      draft = state.smsDrafts?.[id];
    if (!draft) throw error(404, "NOT_FOUND");
    if (!draft.householdId || !Array.isArray(draft.groups))
      throw error(409, "SMS_DRAFT_STALE");
    const row = await notion.read(draft.householdId);
    if (
      row.archived ||
      !row.smsConsent ||
      !row.smsConsentAt ||
      row.smsOptOut ||
      !Number.isFinite(Date.parse(row.smsConsentAt)) ||
      Date.parse(row.smsConsentAt) > now() ||
      destination(row) !== draft.to ||
      state.invitations[row.id]?.active === false ||
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
      ...smsPreview(draft.text),
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
      if (!d || d.state !== "draft") throw error(409, "SMS_ALREADY_ATTEMPTED");
      if (
        d.text !== preview.text ||
        d.to !== preview.to ||
        s.invitations[d.householdId]?.active === false
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
      return structuredClone(d);
    });
    let result;
    try {
      result = await transport.send({ to: job.to, text: job.text });
    } catch (e) {
      await ledger.transaction((s) => {
        s.smsDrafts[id].state =
          e.code === "SMS_REJECTED" ? "rejected" : "unknown";
        s.smsDrafts[id].error =
          e.code === "SMS_REJECTED" ? "SMS_REJECTED" : "SMS_DELIVERY_UNKNOWN";
      });
      throw error(
        503,
        e.code === "SMS_REJECTED" ? "SMS_REJECTED" : "SMS_DELIVERY_UNKNOWN",
      );
    }
    await ledger.transaction((s) =>
      Object.assign(s.smsDrafts[id], result, { acceptedAt: now() }),
    );
    return result;
  }
  async function syncOptOut(phone) {
    const key = hash(phone);
    try {
      const rows = await notion.list();
      for (const row of rows) {
        if (row.archived || row.phone?.replace(/[ ()-]/g, "") !== phone)
          continue;
        await notion.projectSmsOptOut(row.id);
      }
      await ledger.transaction((s) => {
        if (s.smsSuppression?.[key]) s.smsSuppression[key].syncState = "synced";
      });
    } catch {
      // The local suppression remains effective even when Notion is unavailable.
      await ledger.transaction((s) => {
        if (s.smsSuppression?.[key])
          s.smsSuppression[key].syncState = "pending";
      });
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
      // START is recorded but never clears a suppression automatically.
      const stop =
        params.OptOutType === "STOP" ||
        /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|REVOKE|OPTOUT)$/i.test(
          (params.Body || "").trim(),
        );
      await ledger.transaction((s) => {
        s.smsInbound ??= {};
        if (s.smsInbound[params.MessageSid]) return;
        s.smsInbound[params.MessageSid] = {
          phoneHash: hash(phone),
          type: stop
            ? "STOP"
            : ["START", "HELP"].includes(params.OptOutType)
              ? params.OptOutType
              : "OTHER",
          at: now(),
        };
        const ids = Object.keys(s.smsInbound);
        for (const id of ids.slice(0, Math.max(0, ids.length - 5000)))
          delete s.smsInbound[id];
        if (stop) {
          s.smsSuppression ??= {};
          s.smsSuppression[hash(phone)] = {
            phone,
            at: now(),
            syncState: "pending",
          };
        }
      });
      if (stop) await syncOptOut(phone);
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
