import test from "node:test";
import assert from "node:assert/strict";
import {
  celebration,
  maps,
  mapLinks,
  calendarLink,
  calendarActions,
  googleCalendarUrl,
  scheduleStrip,
  scheduleList,
  invitationAlt,
  registryCards,
  venueSection,
} from "../site/celebration.mjs";
import { calendar } from "../site/calendar-file.mjs";
import { validateSettings, siteSettings } from "../server/site-settings.mjs";
import { registryDefaults } from "../server/registry-settings.mjs";
test("separate calendars preserve Central-time instants, addresses and unique event identity", () => {
  const c = structuredClone(celebration);
  assert.equal(c.ceremony.end, "2027-01-15T17:00:00-06:00");
  assert.equal(c.reception.end, "2027-01-16T00:30:00-06:00");
  const titles = { ceremony: "Religious ceremony", dinner: "Dinner", reception: "Reception & dance" };
  for (const kind of ["ceremony", "dinner", "reception"]) {
    const data = calendar(kind, c);
    // R-091: what the event is part of, then the event (was "Sophia Isabel — …").
    assert.ok(data.includes(`\r\nSUMMARY:Sophia’s quinceañera — ${titles[kind]}\r\n`), kind);
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
  assert.match(unfold(calendar("ceremony", c, "es")), /\r\nSUMMARY:XV de Sophia — Ceremonia religiosa\r\n/);
  assert.match(unfold(calendar("dinner", c, "es")), /\r\nSUMMARY:XV de Sophia — Cena\r\n/);
  assert.match(unfold(calendar("reception", c, "es")), /\r\nSUMMARY:XV de Sophia — Recepción y baile\r\n/);
  // The celebration and its time zone in the site's own words (R-037, the
  // calendar text): "los XV de Sophia", never "quinceañera de…" or "hora del centro".
  // L10N-20: the event is stored in UTC, so a calendar elsewhere shows its own
  // time zone: the description no longer says every time is Fort Worth time.
  assert.match(unfold(calendar("ceremony", c, "es")), /DESCRIPTION:Los XV de Sophia\. Our Lady of Guadalupe Church\\, .*TX 76106\. Detalles actualizados: /);
  assert.match(unfold(calendar("ceremony", c)), /DESCRIPTION:Sophia’s quinceañera\. .*TX 76106\. Latest details: /);
  for (const lang of ["en", "es"]) assert.doesNotMatch(unfold(calendar("ceremony", c, lang)), /Texas time|horarios son de Fort Worth/);
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
    /target="_blank"[^>]*>See the gift registry<span class="ext" aria-hidden="true">↗/,
  );
});
test("the schedule strip, Schedule rows and invitation text come from the event data", () => {
  const c = structuredClone(celebration);
  c.ceremony.name = "Example Chapel";
  c.dinner.start = "2027-01-15T18:00:00-06:00";
  const strip = scheduleStrip(c, "es");
  assert.match(strip, /<a href="\/es\/ceremony\/">[\s\S]*Example Chapel/);
  // One time format (site/datetime.mjs): "6:00 p. m.", unbreakable on a page.
  assert.match(strip, /<a href="\/es\/reception\/">[\s\S]*6:00 p\. m\.[\s\S]*The AMZ Event Center/);
  assert.equal(scheduleList(c, "en").match(/<li class="schedule-item">/g).length, 3);
  assert.match(scheduleList(c, "en"), /Example Chapel[\s\S]*4100 Blue Mound Rd/);
  assert.match(invitationAlt(c, "en"), /Example Chapel; dinner from 6:00 PM to 7:30 PM; reception and dance from 7:30 PM/);
  assert.match(invitationAlt(c, "es"), /el viernes 15 de enero de 2027 a las 4:00 p\. m\. en Example Chapel; cena de 6:00 p\. m\. a 7:30 p\. m\.; recepción y baile desde las 7:30 p\. m\./);
});
test("calendar injection is escaped and maps use the full encoded address", () => {
  const c = structuredClone(celebration);
  c.name = "Sophia\nBEGIN:VEVENT";
  c.reception.name = "Hall\nBEGIN:VEVENT";
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

test("each venue opens in Google Maps, Apple Maps and Waze, each saying it opens a new tab", () => {
  const address = celebration.reception.address,
    q = encodeURIComponent(address);
  assert.deepEqual(mapLinks(address), {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  });
  for (const [lang, label, note] of [
    ["en", "Open in Waze", "(opens in a new tab)"],
    ["es", "Abrir en Waze", "(se abre en otra pestaña)"],
  ]) {
    const html = maps(address, lang);
    assert.ok(
      html.includes(
        `<a class="button outline" target="_blank" rel="noopener noreferrer" href="https://waze.com/ul?q=${q}&amp;navigate=yes">${label}<span class="ext" aria-hidden="true">↗</span><span class="visually-hidden"> ${note}</span></a>`,
      ),
      lang,
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
  // The Schedule's "Map: Google · Apple · Waze" (R-172): each app's link is
  // named for the app's maps and the part of the day.
  const schedule = scheduleList(celebration, "en"),
    apps = (name) => [`Google<span class="visually-hidden"> Maps</span>${hidden(name)}`, `Apple<span class="visually-hidden"> Maps</span>${hidden(name)}`, `Waze${hidden(name)}`];
  for (const name of ["Religious ceremony", "Dinner", "Reception &amp; dance"])
    for (const named of apps(name)) assert.ok(schedule.includes(named), named);
  assert.equal(schedule.match(/>Map: </g).length, 3);
  for (const named of apps("Cena")) assert.ok(scheduleList(celebration, "es").includes(named), named);
  assert.equal(scheduleList(celebration, "es").match(/>Mapa: </g).length, 3);
  const ceremony = venueSection("ceremony", celebration, "en");
  assert.ok(ceremony.includes(`Open in Google Maps${hidden("Religious ceremony")}`));
  assert.ok(ceremony.includes(`Open in Apple Maps${hidden("Religious ceremony")}`));
  assert.ok(venueSection("reception", celebration, "es").includes(`Abrir en Google Maps${hidden("Cena y recepción")}`));
  // Without a name, maps() reads as before.
  assert.doesNotMatch(maps(celebration.ceremony.address), /visually-hidden">:/);
});

// R-066: Google Calendar beside every calendar file, with the file's facts.
test("Google Calendar links carry the calendar file's facts, in the page's language, beside the file", () => {
  const unfold = (ics) => ics.replace(/\r\n /g, "");
  for (const kind of ["ceremony", "dinner", "reception"])
    for (const lang of ["en", "es"]) {
      const url = new URL(googleCalendarUrl(kind, celebration, lang)),
        ics = unfold(calendar(kind, celebration, lang)),
        field = (name) => ics.match(new RegExp(`^${name}:(.*)$`, "m"))[1].replace(/\\([,;\\])/g, "$1");
      assert.equal(url.origin + url.pathname, "https://calendar.google.com/calendar/render");
      assert.equal(url.searchParams.get("action"), "TEMPLATE");
      // UTC, exactly the file's start and end.
      assert.equal(url.searchParams.get("dates"), `${field("DTSTART")}/${field("DTEND")}`, `${kind} ${lang}`);
      assert.match(url.searchParams.get("dates"), /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
      for (const [param, name] of [["text", "SUMMARY"], ["location", "LOCATION"], ["details", "DESCRIPTION"]])
        assert.equal(url.searchParams.get(param), field(name), `${kind} ${lang} ${param}`);
    }
  assert.equal(new URL(googleCalendarUrl("reception", celebration, "es")).searchParams.get("text"), "XV de Sophia — Recepción y baile");
  const html = calendarActions("dinner", celebration, "es", true);
  assert.match(html, /^<span class="calendar-choices"><a class="calendar-link" href="\/api\/calendar\/es\/dinner\.ics" download>/);
  assert.match(html, /<a class="target" href="https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+" target="_blank" rel="noopener noreferrer">Google Calendar<span class="visually-hidden">: Cena<\/span><span class="ext" aria-hidden="true">↗<\/span><span class="visually-hidden"> \(se abre en otra pestaña\)<\/span><\/a><\/span>$/);
  // The file link itself is still a download, not a new tab.
  assert.doesNotMatch(calendarLink("dinner", celebration, "es", true), /↗/);
  // No confirmed end time: neither the file nor Google Calendar.
  const c = structuredClone(celebration);
  c.ceremony.end = null;
  assert.doesNotMatch(calendarActions("ceremony", c), /href=/);
  assert.throws(() => googleCalendarUrl("ceremony", c), /Confirmed end/);
});

// R-011 / R-164: the venue notes keep venue facts; parking (or the promise to
// post it) is its own line from the family's content.
test("venue pages show the parking line after the notes, and saved notes lose the old promise sentence only", () => {
  const ceremony = venueSection("ceremony", celebration, "en", false, "Parking and arrival details will be shared here.");
  assert.match(ceremony, /<p>Please silence your phone and follow the church’s guidance during the ceremony\.<\/p><p class="venue-parking">Parking and arrival details will be shared here\.<\/p><div class="calendar-actions">/);
  assert.doesNotMatch(venueSection("ceremony", celebration, "en"), /venue-parking/);
  for (const kind of ["ceremony", "reception"])
    for (const lang of ["en", "es"]) assert.doesNotMatch(celebration[kind].notes[lang], /parking|estacionamiento|shared here|Compartiremos/i);
  // Settings saved before the change (the live ones match these old defaults).
  const saved = structuredClone(celebration);
  saved.ceremony.notes = {
    en: "Please silence your phone and follow the church’s guidance during the ceremony. Parking and arrival details will be shared here.",
    es: "Silencia tu teléfono y sigue las indicaciones de la iglesia durante la ceremonia. Compartiremos aquí los detalles de llegada y estacionamiento.",
  };
  saved.reception.notes = {
    en: "Dinner and the reception take place at the same venue. Entrance, parking and accessibility details will be shared here.",
    es: "La cena y la recepción serán en el mismo lugar. Compartiremos los detalles de entrada, estacionamiento y accesibilidad.",
  };
  const site = siteSettings({ site: saved });
  assert.deepEqual(site.ceremony.notes, celebration.ceremony.notes);
  assert.deepEqual(site.reception.notes, celebration.reception.notes);
  assert.match(saved.reception.notes.en, /will be shared here/, "what is stored is not rewritten here");
  // The family's own words stay exactly as typed.
  saved.ceremony.notes.en = "Doors open at 3:30.  Arrive early.";
  assert.equal(siteSettings({ site: saved }).ceremony.notes.en, "Doors open at 3:30.  Arrive early.");
  // Before anything is saved: the defaults, venue facts only.
  assert.deepEqual(siteSettings({}).reception.notes, celebration.reception.notes);
  // The registry default names Target's list (R-086); its link stays as it was.
  assert.match(siteSettings({}).registries[0].description.en, /On Target’s site the list is called “Sophia’s Birthday Wish List\.”$/);
  assert.equal(registryDefaults[0].url, "https://www.target.com/gift-registry/gift/quincenera");
  assert.equal(celebration.registries[0].description, registryDefaults[0].description);
});
