import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { randomUUID } from "node:crypto";
import { error, hash, seal, unseal, token } from "./auth.mjs";
import {
  whatsappDestination,
  validWhatsappWebhook,
} from "./whatsapp-transport.mjs";
import { recipientName } from "./audience.mjs";
const version = "2026-09-28";
const xml = (text = "") => ({
  binary: Buffer.from(
    '<?xml version="1.0" encoding="UTF-8"?><Response>' +
      (text
        ? "<Message>" +
          text.replaceAll("&", "&amp;").replaceAll("<", "&lt;") +
          "</Message>"
        : "") +
      "</Response>",
  ),
  contentType: "text/xml; charset=utf-8",
});
export function createWhatsapp({
  ledger,
  notion,
  transport,
  webhook = {},
  templates = [],
  key,
  origin,
  now = Date.now,
}) {
  if (
    !Array.isArray(templates) ||
    templates.some(
      (t) =>
        !/^HX[0-9a-f]{32}$/i.test(t.contentSid || "") ||
        !/^(invitation|reminder)_(en|es)$/.test(t.key || "") ||
        !["en", "es"].includes(t.language) ||
        typeof t.body !== "string" ||
        ![
          "approved",
          "pending",
          "received",
          "rejected",
          "paused",
          "disabled",
        ].includes(t.status) ||
        !["MARKETING", "UTILITY"].includes(t.category) ||
        JSON.stringify(t.variables) !== '["1"]',
    ) ||
    new Set(templates.map((t) => t.key)).size !== templates.length
  )
    throw Error("Invalid WhatsApp template catalog");
  const enabled = transport?.enabled === true;
  const eligible = (row, s) => {
    try {
      const phone = whatsappDestination(row.whatsappPhone),
        pref = s.whatsappPreferences?.[hash(phone)];
      return (
        !row.archived &&
        row.validCapacity &&
        s.invitations[row.id]?.active &&
        row.whatsappConsent &&
        !row.whatsappOptOut &&
        Number.isFinite(Date.parse(row.whatsappConsentAt)) &&
        Date.parse(row.whatsappConsentAt) <= now() &&
        s.whatsappConsentPhones?.[row.id] === phone &&
        pref?.type === "START" &&
        pref.syncState === "synced" &&
        !s.whatsappSuppression?.[hash(phone)]
      );
    } catch {
      return false;
    }
  };
  async function sync(phone, repair = 0) {
    const h = hash(phone),
      pref = (await ledger.read()).whatsappPreferences?.[h];
    if (!pref) return;
    try {
      const rows = await notion.list();
      let matched = 0;
      const state = await ledger.read();
      for (const row of rows) {
        const pending = state.whatsappPending?.[row.id];
        // An operator-recorded WhatsApp consent is also accepted, but the phone
        // owner still has to send START after that consent was recorded.
        const request =
          pending ||
          (row.whatsappConsent &&
          !row.whatsappOptOut &&
          row.whatsappConsentSource &&
          row.whatsappConsentVersion &&
          Number.isFinite(Date.parse(row.whatsappConsentAt))
            ? {
                phone: row.whatsappPhone,
                language: row.whatsappLanguage || "en",
                at: Date.parse(row.whatsappConsentAt),
              }
            : null);
        if (
          row.archived ||
          (pref.type === "START"
            ? request?.phone !== phone || request.at > pref.at
            : row.whatsappPhone !== phone && pending?.phone !== phone)
        )
          continue;
        if (pref.type === "START") {
          const current = await ledger.read();
          if (
            current.whatsappPreferences?.[h]?.messageId !== pref.messageId ||
            JSON.stringify(current.whatsappPending?.[row.id]) !==
              JSON.stringify(pending)
          )
            continue;
          await notion.projectWhatsappConsent(row.id, {
            phone,
            at: pref.at,
            language: request.language,
            source: "Verified WhatsApp START",
            version,
          });
          const bound = await ledger.transaction((s) => {
            if (
              s.whatsappPreferences?.[h]?.messageId !== pref.messageId ||
              JSON.stringify(s.whatsappPending?.[row.id]) !==
                JSON.stringify(pending)
            ) {
              if (s.whatsappPreferences?.[h])
                s.whatsappPreferences[h].syncState = "pending";
              s.whatsappSuppression ??= {};
              s.whatsappSuppression[h] = { phone };
              return false;
            }
            s.whatsappConsentPhones ??= {};
            s.whatsappConsentPhones[row.id] = phone;
            return true;
          });
          if (!bound) {
            if (repair < 1) await sync(phone, repair + 1);
            continue;
          }
          matched++;
        } else {
          await notion.projectWhatsappOptOut(row.id);
          const stale = await ledger.transaction((s) => {
            if (s.whatsappPreferences?.[h]?.messageId === pref.messageId)
              return false;
            s.whatsappPreferences[h].syncState = "pending";
            s.whatsappSuppression ??= {};
            s.whatsappSuppression[h] = { phone };
            return true;
          });
          if (stale) {
            if (repair < 1) await sync(phone, repair + 1);
            continue;
          }
          matched++;
        }
      }
      await ledger.transaction((s) => {
        if (s.whatsappPreferences?.[h]?.messageId !== pref.messageId) return;
        if (matched) s.whatsappPreferences[h].syncState = "synced";
        if (pref.type === "START" && matched) delete s.whatsappSuppression[h];
      });
    } catch {
      /* Persist pending preference and block dispatch until projection succeeds. */
    }
  }
  async function consent(id, input) {
    if (input === undefined) {
      const s = await ledger.read(),
        row = await notion.read(id),
        p = s.whatsappPending?.[id];
      return {
        phone: p?.phone || row.whatsappPhone || "",
        language: p?.language || row.whatsappLanguage || "en",
        consent: !!eligible(row, s),
        syncState:
          s.whatsappPreferences?.[hash(p?.phone || row.whatsappPhone || "")]
            ?.syncState || "unverified",
        verificationUrl: `https://wa.me/${(webhook.from || "").replace("+", "")}?text=START`,
      };
    }
    if (
      typeof input.consent !== "boolean" ||
      !["en", "es"].includes(input.language)
    )
      throw error(422, "WHATSAPP_CONSENT_INVALID");
    const phone = whatsappDestination(input.phone),
      row = await notion.read(id);
    await ledger.transaction((s) => {
      s.whatsappPending ??= {};
      s.whatsappPreferences ??= {};
      s.whatsappSuppression ??= {};
      if (input.consent) {
        s.whatsappPending[id] = {
          phone,
          language: input.language,
          at: now(),
          version,
        };
        if (s.whatsappConsentPhones) delete s.whatsappConsentPhones[id];
      } else {
        if (
          phone !== s.whatsappPending[id]?.phone &&
          phone !== row.whatsappPhone
        )
          throw error(422, "WHATSAPP_PHONE_INVALID");
        s.whatsappPreferences[hash(phone)] = {
          phone,
          type: "STOP",
          at: now(),
          messageId: randomUUID(),
          syncState: "pending",
        };
        s.whatsappSuppression[hash(phone)] = { phone };
      }
    });
    if (!input.consent) await sync(phone);
    return consent(id);
  }
  async function draft(input) {
    if (
      !/^[a-zA-Z0-9_-]{8,128}$/.test(input.requestId || "") ||
      !Array.isArray(input.ids) ||
      !Array.isArray(input.groups) ||
      input.ids.length > 2000 ||
      input.groups.length > 100 ||
      input.ids.some((x) => typeof x !== "string") ||
      input.groups.some((x) => typeof x !== "string" || x.length > 100)
    )
      throw error(422, "INVALID_AUDIENCE");
    const template = templates.find((t) => t.key === input.templateKey);
    if (!template) throw error(422, "WHATSAPP_TEMPLATE_UNAVAILABLE");
    const s = await ledger.read(),
      rows = await notion.list(),
      seen = new Set();
    const selected = rows
      .filter(
        (r) =>
          eligible(r, s) &&
          !(
            template.category === "MARKETING" &&
            parsePhoneNumberFromString(r.whatsappPhone)?.country === "US"
          ) &&
          r.whatsappLanguage === template.language &&
          (input.ids.includes(r.id) ||
            (r.distributionGroups || []).some((g) => input.groups.includes(g))),
      )
      .filter((r) => {
        if (seen.has(r.whatsappPhone)) return false;
        seen.add(r.whatsappPhone);
        return true;
      });
    if (!selected.length) throw error(422, "NO_ELIGIBLE_RECIPIENTS");
    const fingerprint = hash(
      JSON.stringify([input.ids, input.groups, input.templateKey]),
    );
    return ledger.transaction((state) => {
      state.whatsappCampaigns ??= {};
      state.whatsappDrafts ??= {};
      state.invitationLinks ??= {};
      if (state.whatsappCampaigns[input.requestId]) {
        if (
          state.whatsappCampaigns[input.requestId].fingerprint !== fingerprint
        )
          throw error(409, "SETTINGS_CHANGED");
        return state.whatsappCampaigns[input.requestId].result;
      }
      const ids = [];
      for (const row of selected) {
        if (!eligible(row, state)) throw error(409, "WHATSAPP_DRAFT_STALE");
        const id = randomUUID(),
          value = token(),
          invite = state.invitations[row.id];
        state.invitationLinks[hash(value)] = {
          householdId: row.id,
          generation: invite.generation,
        };
        const variables = {
          1:
            origin +
            (template.language === "es" ? "/es" : "") +
            "/rsvp/#" +
            value,
        };
        state.whatsappDrafts[id] = {
          id,
          householdId: row.id,
          generation: invite.generation,
          campaignId: input.requestId,
          groups: input.groups,
          directlySelected: input.ids.includes(row.id),
          to: row.whatsappPhone,
          name: recipientName(row),
          templateKey: template.key,
          contentSid: template.contentSid,
          variables: seal(JSON.stringify(variables), key),
          state: "draft",
          at: now(),
        };
        ids.push(id);
      }
      const result = { ids, count: ids.length, channel: "whatsapp" };
      state.whatsappCampaigns[input.requestId] = { fingerprint, result };
      return result;
    });
  }
  async function review(id) {
    const s = await ledger.read(),
      d = s.whatsappDrafts?.[id];
    if (!d || d.archived) throw error(404, "NOT_FOUND");
    const row = await notion.read(d.householdId),
      t = templates.find(
        (t) => t.key === d.templateKey && t.contentSid === d.contentSid,
      );
    if (
      !eligible(row, s) ||
      row.whatsappPhone !== d.to ||
      s.invitations[row.id].generation !== d.generation ||
      !t ||
      row.whatsappLanguage !== t.language ||
      (!d.directlySelected &&
        !row.distributionGroups?.some((g) => d.groups.includes(g)))
    )
      throw error(409, "WHATSAPP_DRAFT_STALE");
    const variables = JSON.parse(unseal(d.variables, key));
    return {
      id,
      to: d.to,
      text: t.body.replaceAll("{{1}}", variables["1"]),
      templateKey: t.key,
      language: t.language,
      state: d.state,
      sendingEnabled:
        enabled &&
        t.status === "approved" &&
        !(
          t.category === "MARKETING" &&
          parsePhoneNumberFromString(d.to)?.country === "US"
        ),
      reviewToken: hash(
        JSON.stringify([d, row.lastEdited, row.whatsappConsentAt, t]),
      ),
    };
  }
  async function send(id, reviewToken, actor) {
    if (!enabled) throw error(503, "WHATSAPP_NOT_ENABLED");
    const p = await review(id);
    if (!p.sendingEnabled) throw error(503, "WHATSAPP_TEMPLATE_NOT_APPROVED");
    if (p.reviewToken !== reviewToken)
      throw error(409, "WHATSAPP_REVIEW_REQUIRED");
    const job = await ledger.transaction((s) => {
      const d = s.whatsappDrafts?.[id];
      if (!d || d.archived || d.state !== "draft")
        throw error(409, "WHATSAPP_ALREADY_ATTEMPTED");
      if (
        s.whatsappConsentPhones?.[d.householdId] !== d.to ||
        s.whatsappPreferences?.[hash(d.to)]?.type !== "START" ||
        s.whatsappPreferences?.[hash(d.to)]?.syncState !== "synced" ||
        s.whatsappSuppression?.[hash(d.to)] ||
        !s.invitations[d.householdId]?.active ||
        s.invitations[d.householdId].generation !== d.generation
      )
        throw error(409, "WHATSAPP_DRAFT_STALE");
      s.whatsappClaims ??= {};
      const claim = hash(JSON.stringify([d.campaignId, d.to]));
      if (s.whatsappClaims[claim])
        throw error(409, "WHATSAPP_ALREADY_ATTEMPTED");
      s.whatsappClaims[claim] = id;
      d.state = "sending";
      d.actor = actor;
      d.attemptedAt = now();
      return structuredClone(d);
    });
    try {
      const result = await transport.send({
        to: job.to,
        contentSid: job.contentSid,
        variables: JSON.parse(unseal(job.variables, key)),
      });
      await ledger.transaction((s) =>
        Object.assign(s.whatsappDrafts[id], result, { acceptedAt: now() }),
      );
      return result;
    } catch (e) {
      const code =
        e.code === "WHATSAPP_REJECTED"
          ? "WHATSAPP_REJECTED"
          : "WHATSAPP_DELIVERY_UNKNOWN";
      await ledger.transaction((s) => {
        s.whatsappDrafts[id].state =
          code === "WHATSAPP_REJECTED" ? "rejected" : "unknown";
        s.whatsappDrafts[id].error = code;
      });
      throw error(503, code);
    }
  }
  async function callback(kind, params, signature) {
    if (!validWhatsappWebhook(webhook, kind, params, signature))
      throw error(403, "TWILIO_SIGNATURE_INVALID");
    if (!/^SM[0-9a-f]{32}$/i.test(params.MessageSid || ""))
      throw error(422, "INVALID_MESSAGE");
    const wire = kind === "inbound" ? params.From : params.To;
    if (!wire?.startsWith("whatsapp:"))
      throw error(422, "WHATSAPP_PHONE_INVALID");
    const phone = whatsappDestination(wire.slice(9)),
      h = hash(phone);
    if (kind === "inbound") {
      const body = (params.Body || "").trim().toUpperCase(),
        stop = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|BAJA|PARAR)$/.test(
          body,
        ),
        start = /^(START|UNSTOP|INICIAR|ALTA)$/.test(body);
      const prior = (await ledger.read()).whatsappInbound?.[params.MessageSid];
      if (prior) return xml();
      let at = now();
      if (start) {
        at = await transport?.inboundTime(params);
        if (!Number.isFinite(at) || at > now())
          throw error(503, "WHATSAPP_CONSENT_UNVERIFIED");
      }
      await ledger.transaction((s) => {
        s.whatsappInbound ??= {};
        if (s.whatsappInbound[params.MessageSid]) return;
        s.whatsappInbound[params.MessageSid] = {
          phoneHash: h,
          at,
          type: stop ? "STOP" : start ? "START" : "OTHER",
        };
        if (!stop && !start) return;
        s.whatsappPreferences ??= {};
        s.whatsappSuppression ??= {};
        if (start && s.whatsappPreferences[h]?.at >= at) return;
        s.whatsappPreferences[h] = {
          phone,
          type: stop ? "STOP" : "START",
          at,
          messageId: params.MessageSid,
          syncState: "pending",
        };
        s.whatsappSuppression[h] = { phone };
      });
      if (stop || start) await sync(phone);
      if (stop)
        return xml(
          "Simply Soph Media: You have unsubscribed from WhatsApp event updates. Reply START to subscribe again.",
        );
      if (start) {
        const p = (await ledger.read()).whatsappPreferences?.[h];
        return xml(
          p?.type === "START" && p.syncState === "synced"
            ? "Simply Soph Media: You are subscribed to Sophia's WhatsApp event updates. Frequency varies. Reply STOP to unsubscribe or HELP for help."
            : "Simply Soph Media: First request WhatsApp updates in your website account or ask the family to record your consent, then send START again. HELP: misxv@simplysoph.com.",
        );
      }
      return xml(
        "Simply Soph Media event support: misxv@simplysoph.com. Reply STOP to unsubscribe. RSVP at https://misxv.simplysoph.com/rsvp/ using your private invitation.",
      );
    }
    const ranks = {
      accepted: 0,
      queued: 1,
      sending: 2,
      sent: 3,
      delivered: 4,
      read: 5,
      failed: 5,
      undelivered: 5,
    };
    if (!(params.MessageStatus in ranks))
      throw error(422, "INVALID_MESSAGE_STATUS");
    await ledger.transaction((s) => {
      const d = Object.values(s.whatsappDrafts || {}).find(
        (d) => d.providerId === params.MessageSid,
      );
      if (
        d
          ? d.to !== phone
          : !Object.values(s.whatsappDrafts || {}).some(
              (d) => d.to === phone && ["sending", "unknown"].includes(d.state),
            )
      )
        throw error(409, "WHATSAPP_CALLBACK_UNMATCHED");
      s.whatsappDelivery ??= {};
      const old = s.whatsappDelivery[params.MessageSid];
      if (old && ranks[old.status] >= ranks[params.MessageStatus]) return;
      s.whatsappDelivery[params.MessageSid] = {
        status: params.MessageStatus,
        at: now(),
      };
    });
    return xml();
  }
  async function retrySync() {
    const pending = Object.values(
      (await ledger.read()).whatsappPreferences || {},
    )
      .filter((p) => p.syncState === "pending")
      .slice(0, 25);
    for (const p of pending) await sync(p.phone);
    return { attempted: pending.length };
  }
  async function list() {
    const s = await ledger.read(),
      rows = (await notion.list()).filter((r) => eligible(r, s));
    return {
      drafts: Object.values(s.whatsappDrafts || {}).map(
        ({ variables, ...d }) => ({
          ...d,
          delivery: s.whatsappDelivery?.[d.providerId]?.status || null,
        }),
      ),
      templates,
      sendingEnabled: enabled,
      recipients: rows
        .map((r) => ({
          id: r.id,
          name: recipientName(r),
          phone: r.whatsappPhone,
          language: r.whatsappLanguage,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      groups: [
        ...new Set(rows.flatMap((r) => r.distributionGroups || [])),
      ].sort(),
    };
  }
  return { enabled, consent, draft, review, send, callback, retrySync, list };
}
