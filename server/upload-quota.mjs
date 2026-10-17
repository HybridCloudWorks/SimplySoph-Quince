// How many photos and videos may be shared, as one setting the API enforces
// and reports (server/application.mjs). The page never states a number of its
// own: it shows what the API answers (GET /api/uploads/quota and the 429
// refusal), so the copy cannot drift from the rule.
//
// Every count is a rolling 24 hours from each upload's start, never a
// calendar day. Inside the party upload window (site/lifecycle.mjs
// inUploadWindow: ceremony start until the end of January 17 in Fort Worth)
// a family may share more. A phone that came in through the printed table
// card has its own count for the whole window, and the card a total.
import { inUploadWindow } from "../site/lifecycle.mjs";

export const DAY = 86400000;
export const uploadQuota = Object.freeze({
  // Per family (one household's guest-list row), per 24 hours.
  perDay: 20,
  perDayInUploadWindow: 60,
  // Per phone that opened the table card, for the whole window.
  perPartyDevice: 30,
  // For the table card in total, across every phone.
  perPartyCard: 1500,
});
// The checked copy of a setting passed to createApplication (tests inject
// small values); anything missing falls back to the defaults above.
export function quotaSetting(input = {}) {
  const q = { ...uploadQuota, ...input };
  for (const [k, v] of Object.entries(q))
    if (!Number.isSafeInteger(v) || v < 1) throw new Error(`uploadQuota.${k} must be a whole number above 0`);
  return Object.freeze(q);
}
// The family limit at instant `t`. `m` is the lifecycle milestones, or null
// when the event settings cannot be read (then the ordinary limit applies).
export const familyLimit = (q, m, t) =>
  m && inUploadWindow(t, m) ? q.perDayInUploadWindow : q.perDay;
// The starts still inside the 24 hours that end at `now`.
export const recent = (times, now) => (times || []).filter((at) => at > now - DAY);
// The first instant at or after `now` when one more upload fits: the moment
// enough starts have rolled out of the 24 hours, or the limit itself rises
// (the window opens). Exact across the window's edges, where the limit
// changes: each candidate is checked against the limit in force then.
export function nextRoom(times, now, limitAt, edges = []) {
  const within = recent(times, now).sort((a, b) => a - b);
  const candidates = [now, ...within.map((at) => at + DAY), ...edges.filter((t) => t > now)].sort(
    (a, b) => a - b,
  );
  for (const t of candidates)
    if (within.filter((at) => at > t - DAY).length < limitAt(t)) return t;
  return within.length ? within.at(-1) + DAY : now;
}
