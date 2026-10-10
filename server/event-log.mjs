// Append-only record of state changes (plan item 13). Each entry is written in
// the same ledger transaction as the change it describes, so the two can never
// disagree, and is mirrored to Cloud Logging only after that transaction commits
// (Ledger onEvents), so a retried transaction never logs twice.
//
// Entries carry IDs, statuses and channel names only: never an email address,
// phone number or message text. Phones appear as their ledger hash.
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

// Entries appended after sequence number `seq`, oldest first.
export function eventsSince(s, seq) {
  const log = s.eventLog || [];
  let i = log.length;
  while (i > 0 && log[i - 1].seq > seq) i--;
  return log.slice(i);
}
