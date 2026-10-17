import { randomUUID } from "node:crypto";
import { smsProgram } from "../site/sms-program.mjs";
import { error, hash } from "./auth.mjs";
import { smsDestination, validTwilioWebhook } from "./twilio.mjs";
import { logEvent } from "./event-log.mjs";

// The registered campaign promises that the only opt-in is the guest texting a
// program keyword. The provider-verified START receipt is the consent record;
// the Notion SMS columns only mirror it for the family. A phone is textable
// when its newest keyword is START and it is bound to this household's row.
// An organizer-ticked Notion box never enrolls anyone (that was the 30909 cause).
export function smsKeywordConsent(state, householdId, phone) {
  return (
    state.smsPreferences?.[hash(phone)]?.type === "START" &&
    state.smsConsentPhones?.[householdId] === phone
  );
}

// Plain-words status for the admin page, one per household.
export function smsStatus(state, row) {
  const phone = row.phone?.replace(/[ ()-]/g, "");
  if (!phone) return "no-phone";
  try {
    smsDestination(phone);
  } catch {
    return "not-us-ca";
  }
  const pref = state.smsPreferences?.[hash(phone)];
  if (row.smsOptOut || pref?.type === "STOP") return "opted-out";
  if (smsKeywordConsent(state, row.id, phone)) return "subscribed";
  // Texted the keyword, but the receipt is not yet matched to this row
  // (the row or its phone was added afterwards); the next sync binds it.
  if (pref?.type === "START") return "syncing";
  return "waiting";
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

const xml = (s) =>
  s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
// One batch request sends this many texts; the admin tab asks again while open.
export const SMS_BATCH_CHUNK = 10;
const LEASE_MS = 120000;

export function createSms({
  ledger,
  notion,
  transport,
  webhook = {},
  now = Date.now,
  // Fills a sealed per-household {link} only when the text leaves the server;
  // stored drafts and admin listings keep the placeholder.
  render = (draft) => draft.text,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  // False once the RSVP deadline has passed (server/application.mjs). A text
  // with a private RSVP link asks for an RSVP, so it no longer goes out: a
  // batch holding one is refused before anything is sent, and kept for
  // cancelling, as invitation emails are.
  invitationsOpen = () => true,
}) {
  const enabled = transport?.enabled === true;
  const refuseLateLinks = (drafts) => {
    if (drafts.some((d) => d.link) && !invitationsOpen()) throw error(409, "INVITATIONS_CLOSED");
  };
  const destination = (row) =>
    smsDestination(row.phone?.replace(/[ ()-]/g, ""));
  const preview = (draft, token) => ({
    id: draft.id,
    to: draft.to,
    text: draft.text,
    ...smsPreview(render(draft)),
    reviewToken: token,
    sendingEnabled: enabled,
    state: draft.state,
  });
  async function review(id) {
    const state = await ledger.read(),
      draft = state.smsDrafts?.[id];
    if (!draft || draft.archived) throw error(404, "NOT_FOUND");
    if (!smsCompliantText(draft.text))
      throw error(422, "SMS_BRAND_OR_STOP_MISSING");
    const pref = state.smsPreferences?.[hash(draft.to)];
    if (pref?.type === "STOP") throw error(409, "SMS_OPTED_OUT");
    // A test to the organizer's own phone: the keyword receipt is the whole
    // check, no guest row involved.
    if (draft.test) {
      if (pref?.type !== "START") throw error(409, "SMS_NOT_SUBSCRIBED");
      return preview(draft, hash(JSON.stringify([draft.id, draft.to, draft.text, pref.messageId])));
    }
    if (!draft.householdId || !Array.isArray(draft.groups))
      throw error(409, "SMS_DRAFT_STALE");
    const row = await notion.read(draft.householdId, { fresh: true });
    // SMS Opt Out ticked by hand in Notion is honored as an opt-out.
    if (row.smsOptOut) throw error(409, "SMS_OPTED_OUT");
    if (
      row.archived ||
      destination(row) !== draft.to ||
      !smsKeywordConsent(state, row.id, draft.to) ||
      state.invitations[row.id]?.active === false ||
      (draft.link && state.invitations[row.id]?.generation !== draft.generation) ||
      (!draft.directlySelected &&
        !row.distributionGroups?.some((g) => draft.groups.includes(g)))
    )
      throw error(409, "SMS_DRAFT_STALE");
    return preview(
      draft,
      hash(JSON.stringify([draft.id, draft.to, draft.text, row.lastEdited, pref.messageId])),
    );
  }
  async function send(id, reviewToken, actor) {
    if (!enabled) throw error(503, "SMS_NOT_ENABLED");
    const draft = (await ledger.read()).smsDrafts?.[id];
    if (draft) refuseLateLinks([draft]);
    const p = await review(id);
    if (reviewToken !== p.reviewToken) throw error(409, "SMS_REVIEW_REQUIRED");
    const job = await ledger.transaction((s) => {
      const d = s.smsDrafts?.[id];
      if (!d || d.archived || d.state !== "draft") throw error(409, "SMS_ALREADY_ATTEMPTED");
      if (
        d.text !== p.text ||
        d.to !== p.to ||
        s.invitations[d.householdId]?.active === false ||
        (d.link && s.invitations[d.householdId]?.generation !== d.generation)
      )
        throw error(409, "SMS_DRAFT_STALE");
      // Consent is re-read inside the transaction: a STOP that landed since
      // the review wins.
      if (s.smsPreferences?.[hash(d.to)]?.type !== "START") throw error(409, "SMS_OPTED_OUT");
      if (!d.test && !smsKeywordConsent(s, d.householdId, d.to)) throw error(409, "SMS_DRAFT_STALE");
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
        const d = s.smsDrafts[id];
        d.state = e.code === "SMS_REJECTED" ? "rejected" : "unknown";
        d.error = e.code === "SMS_REJECTED" ? "SMS_REJECTED" : "SMS_DELIVERY_UNKNOWN";
        // Twilio's error code and HTTP status, so the page can say why.
        d.providerError = e.providerCode ?? e.providerStatus ?? null;
        logEvent(s, now(), "delivery." + d.state, {
          householdId: d.householdId,
          deliveryId: id,
          data: { channel: "sms", error: d.error, providerError: d.providerError },
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
  // The organizer texts themselves: the phone must have texted the keyword,
  // nothing else. Drafted and sent in one reviewed step.
  async function sendTest({ phone, text }, actor) {
    if (!enabled) throw error(503, "SMS_NOT_ENABLED");
    const to = smsDestination(typeof phone === "string" ? phone.replace(/[ ()-]/g, "") : phone);
    if (typeof text !== "string") throw error(422, "SMS_MESSAGE_INVALID");
    smsPreview(text);
    if (!smsCompliantText(text)) throw error(422, "SMS_BRAND_OR_STOP_MISSING");
    const id = randomUUID();
    await ledger.transaction((s) => {
      const type = s.smsPreferences?.[hash(to)]?.type;
      if (type === "STOP") throw error(409, "SMS_OPTED_OUT");
      if (type !== "START") throw error(409, "SMS_NOT_SUBSCRIBED");
      s.smsDrafts ??= {};
      s.smsDrafts[id] = {
        id,
        test: true,
        householdId: null,
        campaignId: id,
        groups: [],
        directlySelected: true,
        to,
        name: "Test to my phone",
        text,
        state: "draft",
        at: now(),
      };
    });
    return { id, ...(await send(id, (await review(id)).reviewToken, actor)) };
  }
  // Batches: the drafts created together from one composer submission.
  const inBatch = (s, campaignId) =>
    Object.values(s.smsDrafts || {}).filter((d) => d.campaignId === campaignId && !d.test);
  const pending = (s, campaignId) =>
    inBatch(s, campaignId).filter((d) => d.state === "draft" && !d.archived);
  function batchSummary(s, campaignId) {
    const drafts = inBatch(s, campaignId);
    if (!drafts.length) throw error(404, "NOT_FOUND");
    const counts = {};
    for (const d of drafts) {
      const st = d.archived ? "cancelled" : d.state;
      counts[st] = (counts[st] || 0) + 1;
    }
    const b = s.smsBatches?.[campaignId];
    const remaining = counts.draft || 0;
    return {
      id: campaignId,
      text: drafts[0].text,
      createdAt: Math.min(...drafts.map((d) => d.at || 0)),
      state: b?.state === "cancelled" ? "cancelled" : !remaining ? "done" : b?.state || "draft",
      confirmedAt: b?.confirmedAt || null,
      total: drafts.length,
      remaining,
      counts,
      recipients: drafts
        .map((d) => ({
          draftId: d.id,
          householdId: d.householdId,
          name: d.name,
          to: d.to,
          state: d.archived ? "cancelled" : d.state,
          delivery: s.smsDelivery?.[d.providerId]?.status || null,
          error: d.error || null,
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    };
  }
  async function confirmBatch(campaignId, count, actor) {
    return ledger.transaction((s) => {
      const b = batchSummary(s, campaignId);
      if (b.state !== "draft") throw error(409, "BATCH_NOT_DRAFT");
      refuseLateLinks(pending(s, campaignId));
      // The organizer types the number of texts; it must match what will send.
      if (!b.remaining || count !== b.remaining) throw error(422, "CONFIRM_COUNT_MISMATCH");
      s.smsBatches ??= {};
      s.smsBatches[campaignId] = {
        state: "confirmed",
        confirmedAt: now(),
        confirmedBy: actor,
        confirmedCount: count,
      };
      logEvent(s, now(), "delivery.batch-confirmed", {
        actor,
        data: { channel: "sms", batchId: campaignId, count },
      });
      return batchSummary(s, campaignId);
    });
  }
  // One chunk per request: the admin tab calls again while it stays open.
  async function sendBatch(campaignId, actor) {
    if (!enabled) throw error(503, "SMS_NOT_ENABLED");
    const owner = randomUUID();
    const work = await ledger.transaction((s) => {
      const b = s.smsBatches?.[campaignId];
      if (!["confirmed", "sending"].includes(b?.state)) throw error(409, "BATCH_NOT_CONFIRMED");
      refuseLateLinks(pending(s, campaignId));
      if (b.lease?.until > now()) throw error(409, "BATCH_ALREADY_SENDING");
      const next = pending(s, campaignId).slice(0, SMS_BATCH_CHUNK).map((d) => d.id);
      b.state = "sending";
      if (next.length) b.lease = { owner, until: now() + LEASE_MS };
      return next;
    });
    const result = { accepted: 0, failed: 0, unknown: 0, skipped: 0 };
    let outage = null;
    for (const [i, id] of work.entries()) {
      if (i) await sleep(250);
      try {
        await send(id, (await review(id)).reviewToken, actor);
        result.accepted++;
      } catch (e) {
        if (e.code === "SMS_REJECTED") result.failed++;
        else if (e.code === "SMS_DELIVERY_UNKNOWN") result.unknown++;
        else if ([404, 409, 422].includes(e.status)) {
          // Stale, opted out or changed since drafting: set aside, never sent.
          result.skipped++;
          await ledger.transaction((s) => {
            const d = s.smsDrafts[id];
            if (d?.state === "draft") {
              d.archived = true;
              d.error = e.code || "SMS_DRAFT_STALE";
            }
          });
        } else {
          outage = e;
          break;
        }
      }
    }
    const done = await ledger.transaction((s) => {
      const b = s.smsBatches[campaignId];
      if (b.lease?.owner === owner) delete b.lease;
      const remaining = pending(s, campaignId).length;
      if (!remaining) b.state = "done";
      return { ...result, remaining, done: !remaining, batch: batchSummary(s, campaignId) };
    });
    if (outage) throw outage;
    return done;
  }
  async function cancelBatch(campaignId, actor) {
    return ledger.transaction((s) => {
      const b = batchSummary(s, campaignId);
      if (s.smsBatches?.[campaignId]?.lease?.until > now()) throw error(409, "BATCH_ALREADY_SENDING");
      for (const d of pending(s, campaignId)) d.archived = true;
      s.smsBatches ??= {};
      s.smsBatches[campaignId] = { ...s.smsBatches[campaignId], state: "cancelled", cancelledBy: actor };
      logEvent(s, now(), "delivery.batch-cancelled", {
        actor,
        data: { channel: "sms", batchId: campaignId, count: b.remaining },
      });
      return batchSummary(s, campaignId);
    });
  }
  function batches(s) {
    const ids = [...new Set(Object.values(s.smsDrafts || {}).filter((d) => !d.test).map((d) => d.campaignId))];
    return ids
      .map((id) => batchSummary(s, id))
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);
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
      // The Notion mirror is retried by the drain; sending follows the receipt.
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
    let reply = "";
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
      const welcome = await ledger.transaction((s) => {
        s.smsInbound ??= {};
        if (s.smsInbound[params.MessageSid]) return false;
        const type = stop
          ? "STOP"
          : start
            ? "START"
            : params.OptOutType === "HELP"
              ? "HELP"
              : "OTHER";
        s.smsInbound[params.MessageSid] = { phoneHash: key, type, at };
        // Consent receipts are retained so replayed START cannot undo STOP.
        if (!start && !stop) return false;
        s.smsPreferences ??= {};
        const old = s.smsPreferences[key];
        if (start && old && at <= old.at) return false;
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
        // Twilio answers an opt-in keyword only after a STOP; a first-time
        // subscriber would hear nothing. The registered confirmation is the
        // website's reply in that case (owner decision, 2026-10-12).
        return start && old?.type !== "STOP";
      });
      if (welcome) reply = `<Message>${xml(smsProgram.confirmation)}</Message>`;
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
      binary: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8"?>` + (reply ? `<Response>${reply}</Response>` : "<Response/>"),
      ),
      contentType: "text/xml; charset=utf-8",
    };
  }
  // Longest since this instance last tried first, so a phone that keeps
  // failing (say, on no Notion row) cannot crowd out the rest; `until` is the
  // drain's time budget.
  const lastTry = new Map();
  async function retrySync({ until = Infinity } = {}) {
    const pending = Object.values((await ledger.read()).smsSuppression || {})
      .filter((x) => x.syncState === "pending")
      .sort((a, b) => (lastTry.get(a.phone) || 0) - (lastTry.get(b.phone) || 0))
      .slice(0, 25);
    let attempted = 0;
    for (const row of pending) {
      if (Date.now() > until) break;
      lastTry.set(row.phone, Date.now());
      attempted++;
      await syncOptOut(row.phone);
    }
    return { attempted };
  }
  return {
    enabled,
    review,
    send,
    sendTest,
    confirmBatch,
    sendBatch,
    cancelBatch,
    batches,
    callback,
    retrySync,
  };
}
