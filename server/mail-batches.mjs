import { logEvent } from "./event-log.mjs";
import { randomUUID } from "node:crypto";
import { error, hash, token } from "./auth.mjs";
import { validEmail } from "./audience.mjs";

// Invitation and reminder emails for many households, with one human gate:
// draft -> organizer reviews recipients, skips and samples -> organizer types
// the count to confirm -> the organizer's open admin tab sends small chunks.
// Nothing here runs on a timer, so nothing ever sends without a person present.
export const BATCH_CHUNK = 10;
// Exchange Online allows 30 messages per minute per mailbox; stay under it.
export const SEND_SPACING_MS = 2100;
const REMINDER_GAP_MS = 72 * 3600000;
const MAX_REMINDERS = 3;
const LEASE_MS = 120000;

export function createMailBatches({
  ledger,
  notion,
  queue,
  dispatchMail,
  audit,
  mailer,
  origin,
  now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const accepted = (j) => ["accepted", "unknown", "sending"].includes(j.state);
  function skipReason(s, row, type) {
    const invite = s.invitations[row.id];
    if (row.archived) return "archived";
    if (!row.validCapacity) return "capacity-needs-review";
    if (!invite) return "no-invitation-link";
    if (!invite.active) return "invitation-revoked";
    if (!validEmail(row.email)) return "no-email";
    const mail = Object.values(s.outbox).filter(
      (j) =>
        j.householdId === row.id &&
        j.generation === invite.generation &&
        ["invitation", "reminder"].includes(j.type),
    );
    if (mail.some((j) => j.type === type && j.state === "draft" && !j.archived))
      return "draft-already-exists";
    if (invite.latestSubmissionId) return "already-responded";
    if (type === "invitation" && mail.some((j) => j.type === "invitation" && accepted(j)))
      return "already-invited";
    if (type === "reminder") {
      const sent = mail.filter(accepted);
      if (sent.some((j) => now() - (j.attemptAt || j.createdAt) < REMINDER_GAP_MS))
        return "contacted-in-last-72-hours";
      if (sent.filter((j) => j.type === "reminder").length >= MAX_REMINDERS)
        return "reminder-limit-reached";
    }
    return null;
  }
  function summary(s, b) {
    const counts = {};
    for (const id of b.draftIds) {
      const st = s.outbox[id]?.archived ? "cancelled" : s.outbox[id]?.state || "missing";
      counts[st] = (counts[st] || 0) + 1;
    }
    return {
      id: b.id,
      type: b.type,
      state: b.state,
      createdAt: b.createdAt,
      createdBy: b.createdBy,
      confirmedAt: b.confirmedAt || null,
      total: b.draftIds.length,
      remaining: counts.draft || 0,
      counts,
      skipped: b.skipped.length,
    };
  }
  const pending = (s, b) =>
    b.draftIds.filter((id) => s.outbox[id]?.state === "draft" && !s.outbox[id].archived);

  return {
    async create(body, actor) {
      if (!["invitation", "reminder"].includes(body.type))
        throw error(422, "INVALID_MAIL_TYPE");
      // The request ID becomes the batch ID, so it must be a UUID like every admin ID.
      if (
        typeof body.requestId !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(body.requestId)
      )
        throw error(422, "IDEMPOTENCY_REQUIRED");
      const ids = body.ids;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 2000 ||
        ids.some((x) => typeof x !== "string" || x.length > 64) ||
        new Set(ids).size !== ids.length
      )
        throw error(422, "INVALID_AUDIENCE");
      const fingerprint = hash(JSON.stringify([body.type, [...ids].sort()]));
      const rows = new Map((await notion.list()).map((r) => [r.id, r]));
      const minted = new Map(ids.map((id) => [id, token()]));
      return ledger.transaction((s) => {
        s.mailBatches ??= {};
        const prior = s.mailBatches[body.requestId];
        if (prior) {
          if (prior.fingerprint !== fingerprint) throw error(409, "SETTINGS_CHANGED");
          return summary(s, prior);
        }
        const b = {
          id: body.requestId,
          type: body.type,
          fingerprint,
          state: "draft",
          createdAt: now(),
          createdBy: actor,
          draftIds: [],
          skipped: [],
        };
        for (const id of ids) {
          const row = rows.get(id);
          const reason = row ? skipReason(s, row, body.type) : "not-in-guest-list";
          if (reason) {
            b.skipped.push({ householdId: id, name: row?.name || "", reason });
            continue;
          }
          const invite = s.invitations[id],
            value = minted.get(id);
          const draftId = queue(s, {
            type: body.type,
            household: row,
            recipient: row.email,
            locale: invite.locale,
            url: origin + (invite.locale === "es" ? "/es" : "") + "/rsvp/#" + value,
          });
          s.outbox[draftId].batchId = b.id;
          s.invitationLinks ??= {};
          // The link opens only once this exact email has been sent (see application.mjs).
          s.invitationLinks[hash(value)] = {
            householdId: id,
            generation: invite.generation,
            channel: "email",
            draftId,
          };
          b.draftIds.push(draftId);
        }
        if (!b.draftIds.length) b.state = "empty";
        s.mailBatches[b.id] = b;
        audit(s, actor, "mail-batch-drafted", b.id, now());
        return summary(s, b);
      });
    },
    list(s) {
      return Object.values(s.mailBatches || {})
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20)
        .map((b) => summary(s, b));
    },
    detail(s, id, unsealHtml) {
      const b = s.mailBatches?.[id];
      if (!b) throw error(404, "NOT_FOUND");
      const samples = {};
      const recipients = b.draftIds.map((draftId) => {
        const j = s.outbox[draftId] || {};
        const locale = s.invitations[j.householdId]?.locale || "en";
        if (!samples[locale] && j.content)
          samples[locale] = { subject: j.subject, to: j.to, html: unsealHtml(j.content) };
        return {
          draftId,
          householdId: j.householdId,
          to: j.to,
          locale,
          state: j.archived ? "cancelled" : j.state,
          error: j.error || null,
        };
      });
      return { ...summary(s, b), recipients, skippedList: b.skipped, samples };
    },
    async confirm(body, actor) {
      return ledger.transaction((s) => {
        const b = s.mailBatches?.[body.id];
        if (!b) throw error(404, "NOT_FOUND");
        if (b.state !== "draft") throw error(409, "BATCH_NOT_DRAFT");
        const count = pending(s, b).length;
        // The organizer types the number of emails; it must match what will send.
        if (!count || body.count !== count) throw error(422, "CONFIRM_COUNT_MISMATCH");
        b.state = "confirmed";
        b.confirmedAt = now();
        b.confirmedBy = actor;
        b.confirmedCount = count;
        audit(s, actor, "mail-batch-confirmed", b.id, now());
        return summary(s, b);
      });
    },
    // One chunk per request: the admin tab calls again while it stays open.
    async send(body, actor) {
      if (!mailer.configured) throw error(503, "MAIL_NOT_CONFIGURED");
      const owner = token();
      const work = await ledger.transaction((s) => {
        const b = s.mailBatches?.[body.id];
        if (!b) throw error(404, "NOT_FOUND");
        if (!["confirmed", "sending"].includes(b.state))
          throw error(409, "BATCH_NOT_CONFIRMED");
        if (b.lease?.until > now()) throw error(409, "BATCH_ALREADY_SENDING");
        const next = pending(s, b).slice(0, BATCH_CHUNK);
        b.state = next.length ? "sending" : "done";
        if (next.length) b.lease = { owner, until: now() + LEASE_MS };
        audit(s, actor, "mail-batch-send", b.id, now());
        return next;
      });
      const result = { accepted: 0, failed: 0, unknown: 0, skipped: 0 };
      let outage = null;
      for (const [i, draftId] of work.entries()) {
        if (i) await sleep(SEND_SPACING_MS);
        try {
          const r = await dispatchMail(draftId);
          result[r.state === "accepted" ? "accepted" : r.state === "unknown" ? "unknown" : "failed"]++;
        } catch (e) {
          // A temporary outage (Notion, storage) stops the group and keeps the
          // email ready to retry; it is never mistaken for a stale draft.
          if (!(e.status === 404 || e.status === 409)) {
            outage = e;
            break;
          }
          // Stale or revoked drafts (new link, changed email) are set aside.
          result.skipped++;
          await ledger.transaction((s) => {
            if (s.outbox[draftId]?.state === "draft") {
              s.outbox[draftId].archived = true;
              s.outbox[draftId].error = e.code || "MAIL_DRAFT_STALE";
            }
          });
        }
      }
      const done = await ledger.transaction((s) => {
        const b = s.mailBatches[body.id];
        if (b.lease?.owner === owner) delete b.lease;
        const remaining = pending(s, b).length;
        if (!remaining && b.state === "sending") b.state = "done";
        return { ...result, remaining, done: !remaining, batch: summary(s, b) };
      });
      if (outage) throw outage;
      return done;
    },
    async cancel(body, actor) {
      return ledger.transaction((s) => {
        const b = s.mailBatches?.[body.id];
        if (!b) throw error(404, "NOT_FOUND");
        if (b.lease?.until > now()) throw error(409, "BATCH_ALREADY_SENDING");
        for (const id of pending(s, b)) s.outbox[id].archived = true;
        b.state = "cancelled";
        audit(s, actor, "mail-batch-cancelled", b.id, now());
        return summary(s, b);
      });
    },
    // Creating links sends nothing; only households without any link yet, so an
    // existing link that a guest may already hold is never revoked here.
    async issue(body, actor, events) {
      const ids = body.ids;
      if (
        !Array.isArray(ids) ||
        !ids.length ||
        ids.length > 2000 ||
        ids.some((x) => typeof x !== "string" || x.length > 64)
      )
        throw error(422, "INVALID_AUDIENCE");
      if (events.some((e) => typeof body.invited?.[e] !== "boolean") || !events.some((e) => body.invited[e]))
        throw error(422, "EVENTS_REQUIRED");
      const rows = new Map((await notion.list({ fresh: true })).map((r) => [r.id, r]));
      return ledger.transaction((s) => {
        const issued = [],
          skipped = [];
        for (const id of new Set(ids)) {
          const row = rows.get(id);
          const reason = !row
            ? "not-in-guest-list"
            : row.archived
              ? "archived"
              : !row.validCapacity
                ? "capacity-needs-review"
                : s.invitations[id]
                  ? "link-already-exists"
                  : null;
          if (reason) {
            skipped.push({ householdId: id, name: row?.name || "", reason });
            continue;
          }
          // No link token is returned: email drafts mint their own links.
          s.invitations[id] = {
            id,
            name: row.name,
            active: true,
            invited: Object.fromEntries(events.map((e) => [e, body.invited[e]])),
            locale: body.locale === "es" ? "es" : "en",
            generation: 1,
            tokenHash: hash(token()),
            codeHash: hash(randomUUID()),
            openedAt: null,
          };
          issued.push(id);
          audit(s, actor, "invitation-issued", id, now());
          logEvent(s, now(), "invitation.issued", {
            actor,
            householdId: id,
            data: { generation: 1, bulk: true },
          });
        }
        return { issued: issued.length, skipped };
      });
    },
  };
}
