// The event lifecycle (site/lifecycle.mjs): one model of where the celebration
// is in time, used by the home page, the RSVP and photo pages, link previews
// and the API's upload limits. Boundaries are tested one millisecond either
// side, in several process time zones (see test:lifecycle-tz in package.json).
import test from "node:test";
import assert from "node:assert/strict";
import {
  milestones,
  phaseAt,
  homeState,
  nowNext,
  nextChange,
  startOfLocalDay,
  localMidnightAfter,
  delayUntil,
  MAX_TIMER,
  clockOffset,
  previewKey,
  inUploadWindow,
  galleryOpen,
  rsvpOpen,
  PHASES,
  replyMarker,
  readReplyMarker,
  partyDay,
} from "../site/lifecycle.mjs";
import { celebration } from "../site/celebration.mjs";
import { event } from "../site/content.mjs";
import { readFile } from "node:fs/promises";

const m = milestones({ deadline: event.deadline, site: celebration });
const at = (iso) => Date.parse(iso);

test("boundary instants come from the inputs, in Fort Worth time", () => {
  assert.equal(m.deadline, at("2026-11-15T23:59:00-06:00"));
  assert.equal(m.dayStart, at("2027-01-15T00:00:00-06:00"));
  assert.equal(m.ceremonyStart, at("2027-01-15T16:00:00-06:00"));
  assert.equal(m.ceremonyEnd, at("2027-01-15T17:00:00-06:00"));
  assert.equal(m.dinnerStart, at("2027-01-15T18:30:00-06:00"));
  assert.equal(m.shareFrom, at("2027-01-15T18:30:00-06:00"));
  assert.equal(m.receptionStart, at("2027-01-15T19:30:00-06:00"));
  assert.equal(m.eventEnd, at("2027-01-16T00:30:00-06:00"));
  assert.equal(m.uploadsFrom, at("2027-01-15T16:00:00-06:00"));
  assert.equal(m.uploadsUntil, at("2027-01-18T00:00:00-06:00"));
  assert.equal(m.archiveFrom, null);
});

test("the countdown target and the ceremony start agree (one source of truth)", () => {
  assert.equal(at(celebration.countdownAt), m.ceremonyStart);
  assert.equal(at(event.startsAt), m.ceremonyStart);
});

const edges = [
  ["deadline", "rsvp-open", "rsvp-closed"],
  ["dayStart", "rsvp-closed", "day-of"],
  ["ceremonyStart", "day-of", "live"],
  ["eventEnd", "live", "after"],
];
for (const [key, before, after] of edges)
  test(`${key}: ${before} until the instant, ${after} at it`, () => {
    for (const d of [1000, 1]) assert.equal(phaseAt(m[key] - d, m), before);
    assert.equal(phaseAt(m[key], m), after);
    for (const d of [1, 1000]) assert.equal(phaseAt(m[key] + d, m), after);
  });

test("RSVP is open until the deadline instant, exactly like the server's rule", () => {
  assert.equal(rsvpOpen(m.deadline - 1, m), true);
  assert.equal(rsvpOpen(m.deadline, m), false);
});

test("the party upload window: from the ceremony to the end of January 17", () => {
  assert.equal(inUploadWindow(m.uploadsFrom - 1, m), false);
  assert.equal(inUploadWindow(m.uploadsFrom, m), true);
  assert.equal(inUploadWindow(at("2027-01-17T23:59:59.999-06:00"), m), true);
  assert.equal(inUploadWindow(m.uploadsUntil, m), false);
  assert.equal(galleryOpen(m.ceremonyStart - 1, m), false);
  assert.equal(galleryOpen(m.ceremonyStart, m), true);
});

test("the clock walk from the review, phase by phase", () => {
  const walk = {
    "2026-10-17T10:00:00-05:00": "rsvp-open",
    "2026-11-08T12:00:00-06:00": "rsvp-open",
    "2027-01-08T12:00:00-06:00": "rsvp-closed",
    "2027-01-15T09:00:00-06:00": "day-of",
    "2027-01-15T16:30:00-06:00": "live",
    "2027-01-15T21:15:00-06:00": "live",
    "2027-01-16T00:29:59-06:00": "live",
    "2027-01-16T12:00:00-06:00": "after",
    "2027-02-15T12:00:00-06:00": "after",
    "2028-01-15T12:00:00-06:00": "after",
  };
  for (const [iso, phase] of Object.entries(walk)) assert.equal(phaseAt(at(iso), m), phase, iso);
});

test("a family that has answered is not asked again before the deadline", () => {
  const t = at("2026-10-17T10:00:00-05:00");
  assert.deepEqual(homeState(t, m, { answered: null }).actions, ["rsvp", "schedule"]);
  assert.deepEqual(homeState(t, m, { answered: false }).actions, ["rsvp", "schedule"]);
  const replied = homeState(t, m, { answered: true });
  assert.equal(replied.status.kind, "replied");
  assert.equal(replied.status.until, m.deadline);
  assert.equal(replied.showReplyBy, false);
  assert.deepEqual(replied.actions, ["schedule", "change-rsvp"]);
  assert.equal(homeState(m.deadline, m, { answered: true }).status.kind, "event-countdown");
  assert.equal(homeState(m.deadline, m, { answered: true }).showReplyBy, false);
});

test("the evening: directions while people travel, then Share your photos from dinner", () => {
  const primary = (iso) => homeState(at(iso), m).primary;
  assert.equal(primary("2027-01-15T09:00:00-06:00"), "directions:ceremony");
  assert.equal(primary("2027-01-15T16:30:00-06:00"), "directions:ceremony");
  assert.equal(primary("2027-01-15T17:45:00-06:00"), "directions:reception");
  assert.equal(homeState(m.shareFrom - 1, m).primary, "directions:reception");
  assert.equal(homeState(m.shareFrom, m).primary, "share");
  assert.equal(primary("2027-01-15T21:15:00-06:00"), "share");
  assert.equal(homeState(m.eventEnd - 1, m).primary, "share");
});

test("after the party: thank you, the photos first, and no RSVP anywhere", () => {
  const s = homeState(m.eventEnd, m);
  assert.equal(s.status.kind, "thanks");
  assert.deepEqual(s.actions, ["gallery", "share", "note"]);
  assert.equal(s.rsvpPill, false);
  assert.equal(s.showSchedule, false);
  assert.equal(homeState(m.eventEnd - 1, m).rsvpPill, true);
});

test("now / next on the day", () => {
  const nn = (iso) => nowNext(at(iso), m);
  assert.deepEqual([nn("2027-01-15T09:00:00-06:00").now, nn("2027-01-15T09:00:00-06:00").next.part], [null, "ceremony"]);
  assert.deepEqual([nn("2027-01-15T16:30:00-06:00").now.part, nn("2027-01-15T16:30:00-06:00").next.part], ["ceremony", "dinner"]);
  assert.deepEqual([nn("2027-01-15T17:45:00-06:00").now.part, nn("2027-01-15T17:45:00-06:00").next.part], ["between", "dinner"]);
  assert.deepEqual([nn("2027-01-15T21:15:00-06:00").now.part, nn("2027-01-15T21:15:00-06:00").next], ["reception", null]);
  assert.deepEqual(nowNext(m.eventEnd, m), { now: null, next: null });
  assert.deepEqual(nowNext(m.dayStart - 1, m), { now: null, next: null });
});

test("phases never go backwards, and nextChange is the next real change", () => {
  let last = 0;
  for (let t = at("2026-10-01T00:00:00Z"); t < at("2027-02-01T00:00:00Z"); t += 15 * 60000) {
    const i = PHASES.indexOf(phaseAt(t, m));
    assert.ok(i >= last, new Date(t).toISOString());
    last = i;
    const n = nextChange(t, m);
    if (n !== null) {
      assert.ok(n > t);
      const view = (x) => {
        const { phase, actions, status } = homeState(x, m);
        return { phase, actions, status, upload: inUploadWindow(x, m) };
      };
      assert.deepEqual(view(n - 1), view(t), new Date(t).toISOString());
    }
  }
  assert.equal(nextChange(m.uploadsUntil, m), null);
});

test("local midnight is DST-safe and independent of the device's time zone", () => {
  // Nov 1 2026: clocks fall back at 2 AM; midnight is still CDT (-05:00).
  assert.equal(startOfLocalDay(at("2026-11-01T16:00:00-06:00")), at("2026-11-01T00:00:00-05:00"));
  // Mar 14 2027: clocks spring forward at 2 AM; midnight is CST (-06:00).
  assert.equal(startOfLocalDay(at("2027-03-14T16:00:00-05:00")), at("2027-03-14T00:00:00-06:00"));
  assert.equal(startOfLocalDay(at("2027-01-15T23:59:59-06:00")), at("2027-01-15T00:00:00-06:00"));
  assert.equal(localMidnightAfter(at("2026-10-31T12:00:00-05:00"), 2), at("2026-11-02T00:00:00-06:00"));
});

test("a long wait is clamped so setTimeout cannot fire at once", () => {
  const t = at("2026-10-17T10:00:00-05:00");
  assert.equal(delayUntil(m.dayStart, t), MAX_TIMER);
  assert.equal(delayUntil(t - 5, t), 0);
});

test("the server's clock wins, measured at the request midpoint", () => {
  const server = at("2026-11-15T23:58:00-06:00");
  // A device 2 minutes fast, with a 200 ms round trip.
  const r = clockOffset({ before: server + 120000 - 100, after: server + 120000 + 100, server: new Date(server).toISOString() });
  assert.equal(r.offset, -120000);
  assert.equal(r.uncertainty, 100);
  assert.equal(phaseAt(server + 120000 + r.offset, m), "rsvp-open");
  assert.deepEqual(clockOffset({ before: 1, after: 0, server: "x" }), { offset: 0, uncertainty: Infinity });
});

test("without a confirmed reception end, the evening ends at the next local midnight", () => {
  const site = structuredClone(celebration);
  site.reception.end = null;
  assert.equal(milestones({ deadline: event.deadline, site }).eventEnd, at("2027-01-16T00:00:00-06:00"));
});

test("settings out of order or without an offset fail loudly instead of showing the wrong state", () => {
  assert.throws(() => milestones({ deadline: "2027-01-20T00:00:00-06:00", site: celebration }), /out of order/);
  assert.throws(() => milestones({ deadline: "2026-11-15T23:59:00", site: celebration }), /explicit offset/);
  assert.throws(() => milestones({ deadline: event.deadline, site: celebration }, { shareFrom: "noon" }), /shareFrom/);
  assert.throws(() => milestones({ deadline: event.deadline, site: celebration }, { uploadDays: 0 }), /uploadDays/);
  assert.throws(
    () => milestones({ deadline: event.deadline, site: celebration }, { archiveFrom: "2027-01-15T20:00:00-06:00" }),
    /archiveFrom/,
  );
});

test("an archive date, once the family sets one, ends the after phase", () => {
  const a = milestones({ deadline: event.deadline, site: celebration }, { archiveFrom: "2027-07-01T00:00:00-05:00" });
  assert.equal(phaseAt(a.archiveFrom - 1, a), "after");
  assert.equal(phaseAt(a.archiveFrom, a), "archived");
  assert.deepEqual(homeState(a.archiveFrom, a).actions, ["gallery"]);
});

test("link previews: pages about photos and notes never carry the deadline", () => {
  for (const phase of PHASES) {
    for (const route of ["share", "gallery", "guestbook", "thank-you"]) assert.equal(previewKey(route, phase), route);
    assert.equal(previewKey("privacy", phase), phase === "after" || phase === "archived" ? "thanks" : "event");
  }
  assert.equal(previewKey("", "rsvp-open"), "invite");
  assert.equal(previewKey("rsvp", "rsvp-open"), "invite");
  assert.equal(previewKey("details", "rsvp-open"), "event");
  assert.equal(previewKey("", "rsvp-closed"), "event");
  assert.equal(previewKey("", "after"), "thanks");
});

test("'Today is the day!' ends at local midnight, while the evening goes on to 12:30 AM", () => {
  assert.equal(m.dayEnd, at("2027-01-16T00:00:00-06:00"));
  assert.equal(homeState(m.dayEnd - 1, m).status.today, true);
  assert.equal(homeState(m.dayEnd, m).status.today, false);
  assert.equal(homeState(m.dayEnd, m).phase, "live");
  assert.equal(homeState(m.dayEnd, m).primary, "share");
  // A page left open over midnight is woken there.
  assert.equal(nextChange(at("2027-01-15T23:00:00-06:00"), m), m.dayEnd);
});

test("a household that replied is not asked again by the header either", () => {
  const t = at("2026-10-17T10:00:00-05:00");
  assert.equal(homeState(t, m, { answered: null }).rsvpPill, true);
  assert.equal(homeState(t, m, { answered: false }).rsvpPill, true);
  assert.equal(homeState(t, m, { answered: true }).rsvpPill, false);
  // After the deadline an unanswered household can still open the closed note.
  assert.equal(homeState(m.deadline, m, { answered: null }).rsvpPill, true);
  assert.equal(homeState(m.eventEnd, m, { answered: null }).rsvpPill, false);
});

test("the device's reply note: yes or no, no identity, gone once the party is over", () => {
  const note = replyMarker("no", "2026-10-17T15:00:00.000Z", m);
  assert.deepEqual(note, { v: 1, answer: "no", savedAt: "2026-10-17T15:00:00.000Z", until: "2027-01-16T06:30:00.000Z" });
  assert.deepEqual(Object.keys(note).sort(), ["answer", "savedAt", "until", "v"]);
  assert.equal(readReplyMarker(note, m.eventEnd - 1), note);
  assert.equal(readReplyMarker(note, m.eventEnd), null);
  for (const bad of [null, "yes", { ...note, v: 2 }, { ...note, answer: "maybe" }, { ...note, until: "soon" }, { ...note, until: undefined }])
    assert.equal(readReplyMarker(bad, m.deadline - 1), null);
});

// The calendar day the party ends on, for the site's earliest last day
// (site.lifespan): one function, asked by the API's check and by Admin's form.
test("the party's day: the reception's end, or its start until the end is confirmed, in Fort Worth", async () => {
  assert.equal(partyDay(celebration), "2027-01-16", "the reception ends at 12:30 AM on January 16");
  const reception = (start, end = null) => ({ ...celebration, reception: { ...celebration.reception, start, end } });
  assert.equal(partyDay(reception("2027-01-15T19:30:00-06:00")), "2027-01-15", "no end yet: the day it starts");
  assert.equal(partyDay(reception("2027-01-15T19:30:00-06:00", "2027-01-15T23:59:59-06:00")), "2027-01-15");
  assert.equal(partyDay(reception("2027-01-15T19:30:00-06:00", "2027-01-16T00:00:00-06:00")), "2027-01-16");
  // Fort Worth's calendar, not UTC's: 11:30 PM Central is already the 16th in UTC.
  assert.equal(partyDay(reception("2027-01-16T01:30:00Z", "2027-01-16T05:30:00Z")), "2027-01-15");
  // Both places that need it ask here, and neither works it out itself.
  for (const file of ["server/site-settings.mjs", "site/admin-experience.js"]) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /import \{[^}]*\bpartyDay\b[^}]*\} from "[./]+(?:site\/)?lifecycle\.mjs"/, file);
    assert.doesNotMatch(source, /reception\??\.end\s*\|\||localDay\(/, `${file} works out the party's day itself`);
  }
});
