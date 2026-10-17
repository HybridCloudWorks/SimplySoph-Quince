// What the website has promised to post (site/promises.mjs): one helper for
// the five places that promise the dress code, hotels and parking, and the
// "What's next" lines on the RSVP confirmation and My account. Dates and
// content here are test fixtures; the family's real ones live in
// site/content.mjs (all empty today).
import test from "node:test";
import assert from "node:assert/strict";
import { promised, coming, places, posted, holds, whatsNext } from "../site/promises.mjs";
import { family, ready } from "../site/content.mjs";

// The wording each place had before dates existed; with no date it must not change.
const before = {
  details: ["We’ll share the dress code here soon.", "Pronto compartiremos aquí el código de vestimenta."],
  faq: ["We’ll share this here soon.", "Lo compartiremos aquí pronto."],
  travel: [
    "We’ll share hotel and airport suggestions here soon.",
    "Pronto compartiremos aquí sugerencias de hoteles y de cómo llegar desde el aeropuerto.",
  ],
  ceremony: ["Parking and arrival details will be shared here.", "Compartiremos aquí los detalles de llegada y estacionamiento."],
  reception: [
    "Entrance, parking and accessibility details will be shared here.",
    "Compartiremos aquí los detalles de entrada, estacionamiento y accesibilidad.",
  ],
};
const empty = structuredClone(family);
// 11:59 PM and midnight in Fort Worth, at the end of the fixture date.
const lastMinute = Date.parse("2026-12-01T23:59:59-06:00"),
  nextDay = Date.parse("2026-12-02T00:00:00-06:00");

test("with no date a promise reads exactly as it does today, in both languages, in all five places", () => {
  assert.deepEqual(Object.keys(places).sort(), Object.keys(before).sort());
  for (const [place, [en, es]] of Object.entries(before)) {
    assert.equal(promised(place, "en"), en, place);
    assert.equal(promised(place, "es"), es, place);
    assert.equal(promised(place, "en", { by: null, now: lastMinute }), en, place);
  }
  // The family's data has no dates and no content: nothing is invented.
  for (const kind of Object.keys(posted)) assert.equal(family.promises[kind].by, null, kind);
  assert.deepEqual(coming(family), { dressCode: null, hotels: null, parking: null });
});

test("with a date every place says the same date, in the standard format, in both languages", () => {
  const by = "2026-12-01";
  for (const place of Object.keys(places)) {
    const what = places[place].what;
    assert.equal(promised(place, "en", { by }), `We’ll post ${what.en} here by Tuesday, December 1, 2026.`, place);
    assert.equal(
      promised(place, "es", { by }),
      `Publicaremos aquí ${what.es} a más tardar el martes 1 de diciembre de 2026.`,
      place,
    );
  }
  // The date names the same calendar day in Fort Worth (not the UTC midnight before it).
  assert.match(promised("details", "en", { by: "2027-01-01" }), /Friday, January 1, 2027\.$/);
});

test("a date is kept through its last minute in Fort Worth, then the place goes back to its own wording", () => {
  const by = "2026-12-01";
  assert.equal(holds(by, lastMinute), true);
  assert.match(promised("ceremony", "en", { by, now: lastMinute }), /by Tuesday, December 1, 2026\.$/);
  assert.equal(holds(by, nextDay), false);
  assert.equal(promised("ceremony", "en", { by, now: nextDay }), before.ceremony[0]);
  assert.equal(promised("ceremony", "es", { by, now: nextDay }), before.ceremony[1]);
  // Anything but YYYY-MM-DD is no date at all.
  for (const bad of ["2026-12-1", "December 1", "2026-12-01T12:00:00Z", 20261201])
    assert.equal(holds(bad), false, String(bad));
});

test("once the content exists the promise is gone and the content shows", () => {
  const dressCode = { en: "Test attire", es: "Ropa de prueba" };
  for (const lang of ["en", "es"]) {
    for (const place of ["details", "faq"])
      assert.equal(promised(place, lang, { content: dressCode, by: "2026-12-01" }), dressCode[lang]);
    assert.equal(promised("ceremony", lang, { content: "Test lot" }), "Test lot");
  }
  const filled = { ...empty, dressCode, parking: { en: "Lot", es: "Lote" }, hotels: [{ name: "Test" }] };
  assert.deepEqual(coming(filled), {});
  assert.deepEqual(coming({ ...empty, promises: { parking: { by: "2026-12-15" } } }), {
    dressCode: null,
    hotels: null,
    parking: "2026-12-15",
  });
  assert.throws(() => coming({ ...empty, promises: { dressCode: { by: "Dec 1" } } }), /YYYY-MM-DD/);
});

test("Travel waits for hotels or an airport note, the same test the hotels promise uses", () => {
  assert.equal(ready("travel", empty), false);
  assert.equal(ready("travel", { ...empty, hotels: [{ name: "Test" }] }), true);
  assert.equal(ready("travel", { ...empty, airport: { name: "Test airport" } }), true);
  assert.equal(posted.hotels({ ...empty, airport: { name: "Test airport" } }), true);
});

// ---- "What's next" (R-029) ----
const text = (html) => html.replace(/<[^>]+>/g, "");
const live = { sms: true, smsKeyword: "SOPHIA", smsNumber: "+1 682-786-8002" };
test("what's next: what is still to come and by when, with a dateless fallback", () => {
  const html = whatsNext({ coming: { dressCode: null, hotels: null, parking: null } });
  assert.match(html, /<h3>What’s next<\/h3>/);
  assert.match(text(html), /We’ll post the dress code, parking details and hotel suggestions on this website soon\./);
  // Kinds with the same date share a sentence, dated ones first; a date that
  // has passed falls back to "soon".
  const dated = text(
    whatsNext({ coming: { dressCode: "2026-12-01", parking: "2026-12-01", hotels: "2026-11-01" }, now: Date.parse("2026-11-20T12:00:00Z") }),
  );
  assert.match(dated, /We’ll post the dress code and parking details on this website by Tuesday, December 1, 2026\.We’ll post hotel suggestions on this website soon\./);
  const es = text(whatsNext({ coming: { dressCode: "2026-12-01" }, lang: "es", register: "ustedes" }));
  assert.match(es, /Lo que sigue/);
  assert.match(es, /Publicaremos en este sitio el código de vestimenta a más tardar el martes 1 de diciembre de 2026\./);
  // Nothing still to come: no promise line at all.
  assert.doesNotMatch(text(whatsNext({ coming: {} })), /We’ll post/);
});

test("what's next offers SMS only while the server reports it live, and never WhatsApp unless live", () => {
  const off = whatsNext({ coming: { dressCode: null }, channels: { sms: false, whatsapp: false, smsKeyword: "SOPHIA", smsNumber: "+1 682-786-8002" } });
  assert.doesNotMatch(off, /Text|SOPHIA|WhatsApp/);
  // The website itself is always how news reaches a household.
  assert.match(off, /href="\/">home page<\/a>/);
  const sms = whatsNext({ coming: { dressCode: null }, channels: live });
  // R-029: what the registered program sends (schedule and venue updates,
  // docs/sms-campaign-registration.md), the same line whatever is still to
  // come: no text goes out when something is posted, so none is promised.
  assert.match(sms, /Text <strong>SOPHIA<\/strong> to <a class="nowrap" href="sms:\+16827868002\?body=SOPHIA">\+1 682-786-8002<\/a> to get our event texts, such as schedule or venue updates\./);
  assert.match(text(sms), /Texts go to US and Canadian mobile numbers\./);
  assert.doesNotMatch(sms, /WhatsApp/);
  assert.equal(text(whatsNext({ channels: live })).match(/Text SOPHIA[^.]*\./)[0], text(sms).match(/Text SOPHIA[^.]*\./)[0]);
  for (const coming of [{ dressCode: null }, { hotels: "2026-12-01" }, {}])
    for (const lang of ["en", "es"]) {
      const line = text(whatsNext({ coming, channels: live, lang })).match(/(?:Text|Envía) SOPHIA[^.]*\./)[0];
      assert.doesNotMatch(line, /posted|publicad|dress|vestimenta|hotel|Oct 31/, line);
    }
  // Spanish, to the household (the confirmation) and to one person (My account).
  assert.match(text(whatsNext({ coming: { parking: null }, channels: live, lang: "es", register: "ustedes" })), /Envíen SOPHIA al \+1 682-786-8002 para recibir nuestros mensajes del evento, como cambios de horario o lugar\./);
  assert.match(text(whatsNext({ coming: { parking: null }, channels: live, lang: "es", register: "tu" })), /Envía SOPHIA al \+1 682-786-8002 para recibir nuestros mensajes del evento, como cambios de horario o lugar\./);
  // An API from before channels, or one that is down: nothing offered.
  assert.doesNotMatch(whatsNext({ channels: undefined }), /Text|WhatsApp/);
  assert.doesNotMatch(whatsNext({ channels: { sms: true } }), /Text/);
});

test("what's next points an invitation-link session to the email sign-in for WhatsApp, and a signed-in one to the card below", () => {
  const link = whatsNext({ channels: { whatsapp: true }, linkSession: true });
  assert.match(link, /Outside the US and Canada\? <a href="\/account\/">Sign in with your email<\/a> to get WhatsApp updates\./);
  assert.doesNotMatch(link, /<form|<input/);
  assert.match(
    whatsNext({ channels: { whatsapp: true }, linkSession: true, lang: "es", register: "ustedes" }),
    /<a href="\/es\/account\/">Entren con su correo<\/a> para recibir avisos por WhatsApp\./,
  );
  assert.match(text(whatsNext({ channels: { whatsapp: true } })), /Outside the US and Canada\? You can sign up for WhatsApp updates below\./);
  assert.match(text(whatsNext({ channels: { whatsapp: true }, lang: "es" })), /Puedes suscribirte a los avisos por WhatsApp aquí abajo\./);
});
