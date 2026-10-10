import { createHmac } from "node:crypto";
// Append-only record of state changes (plan item 13). Each entry is written in
// the same ledger transaction as the change it describes, so the two can never
// disagree, and is mirrored to Cloud Logging only after that transaction commits
// (Ledger onEvents), so a retried transaction never logs twice.
//
// Entries carry IDs, statuses and channel names, never a phone number or message
// text. Inside the private ledger, admin actors and role changes name an email
// and phones appear as their ledger hash; the Cloud Logging copy replaces both
// with keyed tags (redactForLog), so log readers can correlate entries but not
// read addresses or reverse phone hashes (SEC-12).
//
// Types: invitation.issued|opened|revoked, rsvp.submitted|updated,
// delivery.claimed|accepted|failed|rejected|unknown|<provider status>,
// consent.granted|revoked, role.<change>, notion.synced|sync_pending.

// About 3 MB at the cap. Older entries are compacted away in the ledger; the
// mirrored log lines keep them for the Cloud Logging retention period.
export const EVENT_LOG_CAP = 20000;

export function logEvent(s, at, type, fields = {}) {
  s.eventLog ??= [];
  s.eventSeq = (s.eventSeq || 0) + 1;
  s.eventLog.push({
    seq: s.eventSeq,
    at: new Date(at).toISOString(),
    type,
    ...fields,
  });
  if (s.eventLog.length > EVENT_LOG_CAP)
    s.eventLog.splice(0, s.eventLog.length - EVENT_LOG_CAP);
}

// A copy of an entry for Cloud Logging: every email address (also inside ids
// such as "admin:<email>") becomes "email:<tag>" and every phone hash becomes
// "phone:<tag>", where a tag is an HMAC under the app key.
const emailPattern = /[^\s@:"<>(),;]+@[^\s@:"<>(),;]+\.[a-z]{2,}/gi;
export function redactForLog(entry, key) {
  const tag = (kind, value) =>
    kind + ":" + createHmac("sha256", key).update(kind + ":" + value).digest("hex").slice(0, 16);
  const walk = (value, name) => {
    if (typeof value === "string")
      return name === "phoneHash"
        ? tag("phone", value)
        : value.replace(emailPattern, (email) => tag("email", email.toLowerCase()));
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v, k)]));
    return value;
  };
  return walk(entry);
}

// Entries appended after sequence number `seq`, oldest first.
export function eventsSince(s, seq) {
  const log = s.eventLog || [];
  let i = log.length;
  while (i > 0 && log[i - 1].seq > seq) i--;
  return log.slice(i);
}
