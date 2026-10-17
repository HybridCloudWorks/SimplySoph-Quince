import test from "node:test";
import assert from "node:assert/strict";
import {
  celebration,
  calendar,
  maps,
  calendarLink,
  scheduleStrip,
  scheduleList,
  invitationAlt,
  registryCards,
  venueSection,
} from "../site/celebration.mjs";
import { validateSettings } from "../server/site-settings.mjs";
test("separate calendars preserve Central-time instants, addresses and unique event identity", () => {
  const c = structuredClone(celebration);
  assert.equal(c.ceremony.end, "2027-01-15T17:00:00-06:00");
  assert.equal(c.reception.end, "2027-01-16T00:30:00-06:00");
  for (const kind of ["ceremony", "dinner", "reception"]) {
    const data = calendar(kind, c);
    assert.match(data, /SUMMARY:Sophia Isabel/);
    assert.match(data, new RegExp("UID:misxv-" + kind + "@simplysoph.com"));
    assert.match(data, /DTSTART:/);
    assert.match(data, /DTEND:/);
    assert.match(data, /URL:https:\/\/misxv.simplysoph.com\//);
    assert.match(
      data.replace(/\r\n /g, ""),
      kind === "ceremony" ? /4100 Blue Mound Rd/ : /5103 Azle Ave/,
    );
    for (const line of data.split("\r\n"))
      assert.ok(Buffer.byteLength(line) <= 75);
  }
  assert.match(calendar("dinner", c), /DTSTART:20270116T003000Z/);
  assert.match(calendar("reception", c), /DTEND:20270116T063000Z/);
  c.ceremony.end = null;
  assert.throws(() => calendar("ceremony", c), /Confirmed end/);
  assert.ok(!calendarLink("ceremony", c).includes("href="));
});
test("Spanish calendars share each event's identity and hold only confirmed facts", () => {
  const c = structuredClone(celebration);
  const unfold = (ics) => ics.replace(/\r\n /g, "");
  const line = (ics, field) => ics.match(new RegExp(`^${field}:.*$`, "m"))[0];
  for (const kind of ["ceremony", "dinner", "reception"]) {
    const place = kind === "ceremony" ? "ceremony" : "reception",
      en = unfold(calendar(kind, c)),
      es = unfold(calendar(kind, c, "es"));
    for (const field of ["UID", "SEQUENCE", "DTSTART", "DTEND", "LOCATION"])
      assert.equal(line(es, field), line(en, field), field);
    // Venue notes can say "will be shared here"; a saved event keeps that forever.
    for (const ics of [en, es]) {
      assert.ok(!ics.includes(c[place].notes.en.slice(0, 30)));
      assert.ok(!ics.includes(c[place].notes.es.slice(0, 30)));
      assert.doesNotMatch(ics, /will be shared|Compartiremos/);
    }
    assert.match(en, new RegExp(`URL:https://misxv.simplysoph.com/${place}/`));
    assert.match(es, new RegExp(`URL:https://misxv.simplysoph.com/es/${place}/`));
  }
  assert.match(unfold(calendar("ceremony", c, "es")), /SUMMARY:Sophia Isabel — Ceremonia religiosa/);
  assert.match(unfold(calendar("ceremony", c, "es")), /DESCRIPTION:Quinceañera de Sophia Isabel/);
  // A content change bumps SEQUENCE in both languages.
  c.version = 7;
  assert.match(calendar("dinner", c, "es"), /SEQUENCE:7/);
});
test("calendar and map links say what they do in the page's language", () => {
  const es = calendarLink("ceremony", celebration, "es"),
    live = calendarLink("dinner", celebration, "es", true);
  assert.match(es, /href="\/calendar\/es\/ceremony\.ics" download/);
  assert.match(live, /href="\/api\/calendar\/es\/dinner\.ics" download/);
  assert.match(calendarLink("ceremony"), /href="\/calendar\/ceremony\.ics" download/);
  assert.match(es, /Agregar al calendario/);
  // A download is not a new tab: no ↗, a calendar mark instead.
  for (const html of [es, live]) {
    assert.doesNotMatch(html, /↗/);
    assert.match(html, /<svg class="icon" aria-hidden="true"/);
  }
  // Links to other sites say they open a new tab.
  assert.match(
    maps(celebration.ceremony.address, "es"),
    /↗<\/span><span class="visually-hidden"> \(se abre en otra pestaña\)/,
  );
  assert.match(
    registryCards([{ name: "Store", description: { en: "Wishes", es: "Deseos" }, url: "https://example.com/" }]),
    /target="_blank"[^>]*>See the registry<span class="ext" aria-hidden="true">↗/,
  );
});
test("the schedule strip, Schedule rows and invitation text come from the event data", () => {
  const c = structuredClone(celebration);
  c.ceremony.name = "Example Chapel";
  c.dinner.start = "2027-01-15T18:00:00-06:00";
  const strip = scheduleStrip(c, "es");
  assert.match(strip, /<a href="\/es\/ceremony\/">[\s\S]*Example Chapel/);
  assert.match(strip, /<a href="\/es\/reception\/">[\s\S]*6:00 p\.m\.[\s\S]*The AMZ Event Center/);
  assert.equal(scheduleList(c, "en").match(/<li class="schedule-item">/g).length, 3);
  assert.match(scheduleList(c, "en"), /Example Chapel[\s\S]*4100 Blue Mound Rd/);
  assert.match(invitationAlt(c, "en"), /Example Chapel; dinner 6:00 PM to 7:30 PM; reception and dance from 7:30 PM/);
  assert.match(invitationAlt(c, "es"), /el viernes 15 de enero de 2027 a las 4:00 p\.m\. en Example Chapel/);
});
test("calendar injection is escaped and maps use the full encoded address", () => {
  const c = structuredClone(celebration);
  c.name = "Sophia\nBEGIN:VEVENT";
  assert.equal(
    (calendar("dinner", c).match(/^BEGIN:VEVENT$/gm) || []).length,
    1,
  );
  const html = maps(celebration.ceremony.address);
  assert.ok(
    html.includes("query=" + encodeURIComponent(celebration.ceremony.address)),
  );
  assert.ok(
    html.includes(
      "https://maps.apple.com/?q=" +
        encodeURIComponent(celebration.ceremony.address),
    ),
  );
});
test("settings reject dangerous links, invalid event ordering and ambiguous dates", () => {
  const valid = validateSettings(celebration);
  assert.equal(valid.name, "Sophia Isabel");
  for (const alter of [
    (c) => (c.registries[0].url = "javascript:alert(1)"),
    (c) => (c.registries[0].url = "https://user:pass@example.com/"),
    (c) => (c.dinner.end = c.dinner.start),
    (c) => (c.countdownAt = "2027-01-15T16:00:00"),
    (c) => c.albums.push(c.albums[0]),
  ]) {
    const c = structuredClone(celebration);
    alter(c);
    assert.throws(
      () => validateSettings(c),
      (e) => e.code === "INVALID_SITE_SETTINGS",
    );
  }
});
// R-052: the reception's range never splits "(Jan 16)" / "(16 de enero)" or a
// time from its AM/PM: only the space after the en dash may break.
test("the Schedule and the reception page keep each time and the next-day date unbroken", () => {
  const NB = " ";
  for (const [lang, range] of [
    ["en", `7:30${NB}PM – 12:30${NB}AM${NB}(Jan${NB}16)`],
    ["es", `7:30${NB}p.${NB}m. – 12:30${NB}a.${NB}m.${NB}(16${NB}de${NB}enero)`],
  ]) {
    const schedule = scheduleList(celebration, lang),
      reception = venueSection("reception", celebration, lang);
    assert.ok(schedule.includes(`<p class="schedule-time">${range}</p>`), `${lang} schedule`);
    assert.ok(reception.includes(`<dd>${range}</dd>`), `${lang} reception page`);
    // Breaks only around the dash, never inside a time or the date.
    for (const html of [schedule, reception])
      for (const [, text] of html.matchAll(/<(?:p class="schedule-time"|dd)>([^<]*)<\/(?:p|dd)>/g))
        assert.deepEqual(text.split(" – ").map((part) => part.includes(" ")), [false, false], text);
  }
});
// R-062: every calendar and map link names its event for screen readers, after
// the visible words, so a page's links never share a name.
test("calendar and map links carry their event's name, visually hidden", () => {
  const hidden = (name) => `<span class="visually-hidden">: ${name}</span>`;
  assert.ok(calendarLink("ceremony").includes(`Add to calendar${hidden("Ceremony")}`));
  assert.ok(calendarLink("dinner", celebration, "es").includes(`Agregar al calendario${hidden("Cena")}`));
  assert.ok(calendarLink("reception").includes(hidden("Reception &amp; dance")));
  const schedule = scheduleList(celebration, "en");
  for (const name of ["Religious ceremony", "Dinner", "Reception &amp; dance"])
    assert.ok(schedule.includes(`Map${hidden(name)}`), name);
  assert.ok(scheduleList(celebration, "es").includes(`Mapa${hidden("Cena")}`));
  const ceremony = venueSection("ceremony", celebration, "en");
  assert.ok(ceremony.includes(`Open in Google Maps${hidden("Religious ceremony")}`));
  assert.ok(ceremony.includes(`Open in Apple Maps${hidden("Religious ceremony")}`));
  assert.ok(venueSection("reception", celebration, "es").includes(`Abrir en Google Maps${hidden("Cena y recepción")}`));
  // Without a name, maps() reads as before.
  assert.doesNotMatch(maps(celebration.ceremony.address), /visually-hidden">:/);
});
