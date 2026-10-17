// Where the celebration is in time, as one model. Every date-aware surface
// (the home page, the RSVP page, the photo pages, link previews, the API's
// upload limits) asks this module instead of comparing dates itself.
//
// Pure: every function takes `now` (ms since the epoch) and plain inputs, and
// nothing here reads a clock, the DOM, storage or the network. The browser,
// the API and the build therefore get the same answer for the same instant,
// and a test can pin any instant exactly. The browser corrects its own clock
// with the server's (clockOffset), because a phone that runs fast must not see
// "RSVPs are closed" while the server would still accept the answer.
//
// Intervals are half-open: a phase starts AT its boundary instant, matching
// the server's RSVP rule (now >= deadline is closed).
export const TIME_ZONE = "America/Chicago";
export const DAY = 86400000;
export const PHASES = Object.freeze([
  "rsvp-open", // now < deadline
  "rsvp-closed", // deadline <= now < local midnight that starts the day
  "day-of", // that midnight <= now < ceremony start
  "live", // ceremony start <= now < end of the reception
  "after", // the reception has ended (until archiveFrom, if the family sets one)
  "archived", // archiveFrom <= now: only once a lifespan for the site is set
]);

// Offset of `tz` from UTC at instant `ms`, in ms (for example -21600000 in CST).
function offsetAt(ms, tz = TIME_ZONE) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return wall - Math.floor(ms / 1000) * 1000;
}
// The calendar day of `ms` in the event's time zone, as "YYYY-MM-DD".
export function localDay(ms, tz = TIME_ZONE) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(ms));
}
// The instant local midnight begins the day that contains `ms`. DST-safe: the
// offset is read at midnight itself, not at `ms`.
export function startOfLocalDay(ms, tz = TIME_ZONE) {
  const [y, m, d] = localDay(ms, tz).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let at = guess - offsetAt(guess, tz);
  at = guess - offsetAt(at, tz);
  return at;
}
// The same local midnight `days` calendar days later (DST-safe: lands at noon
// first, then snaps to that day's midnight).
export const localMidnightAfter = (ms, days, tz = TIME_ZONE) =>
  startOfLocalDay(startOfLocalDay(ms, tz) + days * DAY + DAY / 2, tz);

const instant = (iso, name) => {
  // Same rule as server/site-settings.mjs: an ISO time with an explicit offset.
  if (
    typeof iso !== "string" ||
    !/(?:Z|[+-]\d{2}:\d{2})$/.test(iso) ||
    !Number.isFinite(Date.parse(iso))
  )
    throw new Error(`${name} must be an ISO time with an explicit offset`);
  return Date.parse(iso);
};

// Every boundary, from the live inputs: the RSVP deadline (site/content.mjs
// event.deadline, also served by GET /api/config) and the event settings
// (GET /api/site; site/celebration.mjs holds the defaults). The options are
// family decisions with neutral defaults:
//   shareFrom   when "Share your photos" becomes the main button on the night
//   uploadDays  calendar days (from the event day) the party upload card works
//   archiveFrom when the site stops being about the celebration (null: never)
export function milestones(
  { deadline, site },
  { shareFrom = "dinner", uploadDays = 3, archiveFrom = null, tz = TIME_ZONE } = {},
) {
  const m = {
    deadline: instant(deadline, "deadline"),
    ceremonyStart: instant(site.ceremony.start, "ceremony.start"),
    ceremonyEnd: site.ceremony.end ? instant(site.ceremony.end, "ceremony.end") : null,
    dinnerStart: instant(site.dinner.start, "dinner.start"),
    dinnerEnd: instant(site.dinner.end, "dinner.end"),
    receptionStart: instant(site.reception.start, "reception.start"),
  };
  m.dayStart = startOfLocalDay(m.ceremonyStart, tz);
  // No confirmed end: the evening ends at the next local midnight.
  m.eventEnd = site.reception.end
    ? instant(site.reception.end, "reception.end")
    : localMidnightAfter(m.receptionStart, 1, tz);
  m.ceremonyEnd ??= m.dinnerStart;
  m.shareFrom = {
    ceremony: m.ceremonyStart,
    "ceremony-end": m.ceremonyEnd,
    dinner: m.dinnerStart,
    reception: m.receptionStart,
  }[shareFrom];
  if (m.shareFrom === undefined)
    throw new Error("shareFrom must be ceremony, ceremony-end, dinner or reception");
  if (!Number.isInteger(uploadDays) || uploadDays < 1 || uploadDays > 14)
    throw new Error("uploadDays must be a whole number of days from 1 to 14");
  // The party upload window: from the ceremony until the end of the last day.
  m.uploadsFrom = m.ceremonyStart;
  m.uploadsUntil = localMidnightAfter(m.dayStart, uploadDays, tz);
  m.archiveFrom = archiveFrom === null ? null : instant(archiveFrom, "archiveFrom");
  const order = [
    m.deadline,
    m.dayStart,
    m.ceremonyStart,
    m.ceremonyEnd,
    m.dinnerStart,
    m.receptionStart,
    m.eventEnd,
  ];
  if (order.some((v, i) => i && v < order[i - 1]))
    throw new Error("Lifecycle instants are out of order");
  if (m.uploadsUntil < m.eventEnd) throw new Error("The upload window ends before the party");
  if (m.archiveFrom !== null && m.archiveFrom < m.eventEnd)
    throw new Error("archiveFrom is before the event ends");
  return Object.freeze(m);
}

export function phaseAt(now, m) {
  if (now < m.deadline) return "rsvp-open";
  if (now < m.dayStart) return "rsvp-closed";
  if (now < m.ceremonyStart) return "day-of";
  if (now < m.eventEnd) return "live";
  if (m.archiveFrom !== null && now >= m.archiveFrom) return "archived";
  return "after";
}
export const rsvpOpen = (now, m) => now < m.deadline;
// Party-night uploads (the printed table card) and the higher per-family
// limit apply only inside this window.
export const inUploadWindow = (now, m) => now >= m.uploadsFrom && now < m.uploadsUntil;
// Before the celebration, the gallery is about to open rather than empty.
export const galleryOpen = (now, m) => now >= m.ceremonyStart;

// What is happening now and next on the day (for "Now / Next").
export function nowNext(now, m) {
  const parts = [
    ["ceremony", m.ceremonyStart, m.ceremonyEnd],
    ["between", m.ceremonyEnd, m.dinnerStart],
    ["dinner", m.dinnerStart, m.dinnerEnd],
    ["reception", Math.max(m.receptionStart, m.dinnerEnd), m.eventEnd],
  ].filter(([, a, b]) => b > a);
  if (now < m.dayStart || now >= m.eventEnd) return { now: null, next: null };
  const i = parts.findIndex(([, a, b]) => now >= a && now < b);
  const nextOf = (from) => parts.slice(from).find(([k]) => k !== "between") || null;
  const pack = (p) => p && { part: p[0], start: p[1], end: p[2] };
  return i < 0
    ? { now: null, next: pack(nextOf(0)) }
    : { now: pack(parts[i]), next: pack(nextOf(i + 1)) };
}

// The next instant at which anything this model says can change.
export function nextChange(now, m) {
  const all = [
    m.deadline,
    m.dayStart,
    m.ceremonyStart,
    m.ceremonyEnd,
    m.dinnerStart,
    m.dinnerEnd,
    m.receptionStart,
    m.shareFrom,
    m.eventEnd,
    m.uploadsUntil,
    m.archiveFrom,
  ];
  const later = all.filter((v) => v !== null && v > now);
  return later.length ? Math.min(...later) : null;
}
// setTimeout cannot wait longer than 2^31-1 ms (about 24.8 days): a longer
// delay fires at once. Never schedule beyond it; wake up and recompute.
export const MAX_TIMER = 2 ** 31 - 1;
export const delayUntil = (target, now) => Math.max(0, Math.min(target - now, MAX_TIMER));

// The home page's state. `answered` is true, false or null (not known: the
// visitor is not signed in and this browser has no record of a reply).
export function homeState(now, m, { answered = null } = {}) {
  const phase = phaseAt(now, m),
    nn = nowNext(now, m);
  let status, actions;
  switch (phase) {
    case "rsvp-open":
      status = answered
        ? { kind: "replied", until: m.deadline }
        : { kind: "reply-countdown", target: m.deadline };
      actions = answered ? ["schedule", "change-rsvp"] : ["rsvp", "schedule"];
      break;
    case "rsvp-closed":
      status = { kind: "event-countdown", target: m.ceremonyStart, replied: answered === true };
      actions = ["schedule"];
      break;
    case "day-of":
      status = { kind: "today", next: nn.next };
      actions = ["directions:ceremony", "schedule"];
      break;
    case "live": {
      status = { kind: "now-next", now: nn.now, next: nn.next };
      actions =
        now < m.ceremonyEnd
          ? ["directions:ceremony", "schedule"]
          : now >= m.shareFrom
            ? ["share", "directions:reception", "schedule"]
            : ["directions:reception", "share", "schedule"];
      break;
    }
    case "after":
      status = { kind: "thanks" };
      actions = ["gallery", "share", "note"];
      break;
    default:
      status = { kind: "archived" };
      actions = ["gallery"];
  }
  return {
    phase,
    rsvpOpen: rsvpOpen(now, m),
    answered,
    status,
    actions,
    primary: actions[0],
    showReplyBy: phase === "rsvp-open" && !answered,
    showSchedule: phase !== "after" && phase !== "archived",
    // The header's RSVP pill is about replying: it goes once the party is over.
    rsvpPill: phase !== "after" && phase !== "archived",
    nextChange: nextChange(now, m),
  };
}

// Device clock vs server clock. `before`/`after` are Date.now() around the
// request; `server` is the response's `now` (ISO). Positive offset = the
// device is slow. Add the offset to Date.now() to get the server's time.
export function clockOffset({ before, after, server }) {
  const s = typeof server === "string" ? Date.parse(server) : server;
  if (!Number.isFinite(s) || !(after >= before)) return { offset: 0, uncertainty: Infinity };
  return { offset: s - Math.round((before + after) / 2), uncertainty: Math.ceil((after - before) / 2) };
}

// Link-preview text: what a crawler (no JavaScript) reads in <meta>. It is
// chosen at build time for the phase of the build, and pages that are not
// about replying never mention the deadline, so their preview stays true in
// every phase.
export function previewKey(route, phase) {
  if (["share", "gallery", "guestbook", "thank-you"].includes(route)) return route;
  if (phase === "rsvp-open" && (route === "" || route === "rsvp")) return "invite";
  if (phase === "after" || phase === "archived") return "thanks";
  return "event";
}
