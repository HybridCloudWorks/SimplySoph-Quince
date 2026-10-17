// What time it is for the celebration, in the browser: one runtime shared by
// every guest page, so no page compares dates on its own (site/lifecycle.mjs
// answers every "which phase is it?").
//
//   - The server's clock. GET /api/config and GET /api/site carry `now`; the
//     device clock is corrected by the offset measured at the request's
//     midpoint (the sample with the shortest round trip wins). A phone that runs
//     two minutes fast still sees the RSVP open while the server would accept
//     it, and one set to the wrong day still sees the right day.
//   - The milestones, from the RSVP deadline (GET /api/config; the page's
//     misxv-deadline meta until it answers) and the event settings (GET
//     /api/site; the checked-in schedule until then, or during an outage).
//   - One timer for the page: it wakes at the next boundary (nextChange,
//     clamped by delayUntil, so a far-off date never fires at once) or sooner
//     when a watcher asks (a countdown's next minute), and redraws every watcher.
//     Coming back to the tab (visibility, Back, focus) redraws too.
//   - Whether this household replied: the server's answer on a signed-in visit
//     (site/home.mjs asks), otherwise this device's note (replyMarker), which
//     holds no identity and goes once the party is over or on sign-out.
//   - The header's RSVP pill, which stops asking once there is nothing to ask.
import {
  milestones,
  homeState,
  rsvpOpen,
  delayUntil,
  clockOffset,
  replyMarker,
  readReplyMarker,
} from "./lifecycle.mjs";
import { celebration } from "./celebration.mjs";

let deadline = document.querySelector('meta[name="misxv-deadline"]')?.content || null,
  site = celebration,
  m = null,
  offset = 0,
  uncertainty = Infinity,
  // "yes" or "no" (replied), false (signed in, not replied), null (not known).
  reply = null;
function rebuild() {
  try {
    m = milestones({ deadline, site });
  } catch {
    m = null; // settings the model refuses: the page keeps its built state
  }
}
rebuild();

// The server's time, as well as this device can tell.
export const clock = () => Date.now() + offset;
export const lifecycle = () => m;
export const rsvpDeadline = () => deadline;
// RSVPs are open on the server's clock. Only the deadline matters here (the
// one GET /api/invitation sent, or the site's), so the RSVP pages work even
// if the event settings are unusable. Without any deadline the server decides.
export function rsvpOpenNow(iso = deadline) {
  const at = Date.parse(iso);
  return !Number.isFinite(at) || rsvpOpen(clock(), { deadline: at });
}
export const answered = () => (reply === "yes" || reply === "no" ? true : reply === false ? false : null);
export const answer = () => (reply === "yes" || reply === "no" ? reply : null);
export function state(now = clock()) {
  return m && homeState(now, m, { answered: answered() });
}

// One server time sample: Date.now() just before and after the request, and
// the response's `now`.
export function sample(before, after, server) {
  const s = clockOffset({ before, after, server });
  if (s.uncertainty >= uncertainty) return;
  offset = s.offset;
  uncertainty = s.uncertainty;
  run();
}
// The live event settings (site/experience.js, from GET /api/site).
export function setSite(value) {
  site = value;
  rebuild();
  run();
}

// GET /api/config, once per page (a failure is retried on the next call).
let configured = null;
export function serverConfig() {
  return (configured ??= (async () => {
    const before = Date.now(),
      res = await fetch("/api/config", { credentials: "same-origin", cache: "no-store" }),
      after = Date.now(),
      data = await res.json();
    if (!res.ok) throw Object.assign(new Error("config"), { code: data?.error });
    if (typeof data.deadline === "string") {
      deadline = data.deadline;
      rebuild();
    }
    sample(before, after, data.now);
    run();
    return data;
  })().catch((e) => {
    configured = null;
    throw e;
  }));
}
// Settled once the server's clock and deadline are known, or could not be.
export const ready = serverConfig().then(
  () => {},
  () => {},
);
// Settled once site/experience.js has the live event settings (or gave up).
let siteKnown;
const siteReady = new Promise((resolve) => (siteKnown = resolve));
export const siteSettled = () => siteKnown();
// For code that needs both at once: { m, now } with the milestones from the
// server's deadline and the live event settings, and now() on the server's
// clock. Cached; a failed GET /api/config is asked again on the next call.
let clockOnce = null;
export function siteClock() {
  return (clockOnce ??= (async () => {
    await serverConfig();
    await siteReady;
    if (!m) throw new Error("The event settings give no usable dates");
    return { m, now: clock };
  })().catch((e) => {
    clockOnce = null;
    throw e;
  }));
}

// This device's note that the household replied (localStorage, one key).
const KEY = "misxv-replied";
function stored() {
  try {
    return JSON.parse(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}
function drop() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage is off: nothing was kept */
  }
}
function keep(value, savedAt) {
  if (!m) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(replyMarker(value, savedAt, m)));
  } catch {
    /* storage is off: the next visit just won't know */
  }
}
function fromDevice() {
  const raw = stored();
  if (raw === null) return null;
  const marker = readReplyMarker(raw, clock());
  if (!marker) drop();
  return marker?.answer ?? null;
}
reply = fromDevice();
// After a successful save (site/guest.js): "yes" when anyone is coming.
export function rememberReply(value, savedAt) {
  keep(value, savedAt);
  reply = value;
  run();
}
// Sign-out leaves nothing for the next person on this device.
export function forgetReply() {
  drop();
  reply = null;
  run();
}
// GET /api/session?poll=1, once per page: who is signed in, asked without
// keeping the session open (the home page's "You replied ✓" and the header's
// sign-in item). Null when it can't be told.
let sessionOnce = null;
export const sessionStatus = () =>
  (sessionOnce ??= fetch("/api/session?poll=1", { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null));
// What GET /api/session says about the signed-in household: it overrides the
// device. A note that disagrees is rewritten or deleted; no note is created
// here (only a save does that).
export function serverReply(household) {
  if (!household) return;
  const raw = stored();
  if (!household.answered) {
    drop();
    reply = false;
  } else {
    reply = household.answer;
    if (raw && (raw.answer !== household.answer || raw.savedAt !== household.answeredAt))
      keep(household.answer, household.answeredAt);
  }
  run();
}

// The page's one timer.
const watchers = new Set();
let timer = 0;
function run() {
  clearTimeout(timer);
  timer = 0;
  const now = clock(),
    s = state(now);
  let wake = s?.nextChange ?? null;
  for (const watcher of watchers) {
    const want = watcher(s, now);
    if (Number.isFinite(want) && want > now && (wake === null || want < wake)) wake = want;
  }
  if (wake !== null) timer = setTimeout(run, delayUntil(wake, now));
}
// fn(state, now) draws the page; it may return an instant to be woken at.
export function watch(fn) {
  watchers.add(fn);
  run();
  return () => watchers.delete(fn);
}
for (const [target, name] of [
  [document, "visibilitychange"],
  [window, "pageshow"],
  [window, "focus"],
])
  target.addEventListener(name, () => document.visibilityState !== "hidden" && run());

// The header's RSVP pill (every page): gone once this household has replied,
// and for everyone after the party (lifecycle homeState.rsvpPill).
watch((s) => {
  const pill = document.querySelector(".site-header .nav-rsvp");
  if (pill && s) pill.hidden = !s.rsvpPill;
});
