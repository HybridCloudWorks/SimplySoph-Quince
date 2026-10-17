// The family's content slots once filled, built with test content
// (scripts/build-pages.mjs --fixture, tests/fixtures/) into .cache/builds/, so
// the dist/ other tests read keeps the family's real, mostly empty content
// (its empty state is checked in tests/site-pages.test.mjs):
//   - "family-dated": every promise has a date, none of the content exists
//     yet; two traditions, a children's age, a drive time, Spanish art;
//   - "family-filled": the dress code, parking and a hotel exist.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import sharp from "sharp";

const run = promisify(execFile);
const repo = new URL("../", import.meta.url);
// The test's own artwork folder: the real pictures, plus a Spanish invitation
// (a plain card: no artwork is made for the site here).
const assets = new URL(".cache/fixture-assets/", repo);
await mkdir(assets, { recursive: true });
for (const name of ["invitation", "church", "reception"])
  await stat(new URL(name + ".png", assets)).catch(() =>
    copyFile(new URL(`site/assets/${name}.png`, repo), new URL(name + ".png", assets)),
  );
await sharp({ create: { width: 1024, height: 1434, channels: 3, background: "#f4ead8" } })
  .png()
  .toFile(new URL("invitation-es.png", assets).pathname);

async function build(name, fixture, now = "2026-10-01T18:00:00Z") {
  await run(
    process.execPath,
    ["scripts/build-pages.mjs", `--now=${now}`, `--out=${name}`, `--fixture=tests/fixtures/${fixture}.mjs`],
    { cwd: repo.pathname },
  );
  const dist = new URL(`.cache/builds/${name}/dist/`, repo);
  return (file) => readFile(new URL(file, dist), "utf8");
}
// One after another: the builds share the encoded-image cache.
const dated = await build("family-dated", "family-dated"),
  filled = await build("family-filled", "family-filled"),
  // The day after the party, with the family's own thank-you sentence.
  thanked = await build("family-thanks", "family-thanks", "2027-01-16T18:00:00Z");
const main = (html) => html.match(/<main[\s\S]*?<\/main>/)[0];
const header = (html) => html.match(/<header[\s\S]*?<\/header>/)[0];
const portal = (html) => html.match(/<div class="portal" id="portal"[^>]*>/)[0];
const goodToKnow = (html) => html.match(/<aside class="good-to-know"[\s\S]*?<\/aside>/)[0];

test("a date set once shows in all five places, the same in English and Spanish", async () => {
  for (const [lang, by] of [
    ["", "by Tuesday, December 1, 2026."],
    ["es/", "a más tardar el martes 1 de diciembre de 2026."],
  ]) {
    const en = !lang;
    for (const [route, sentence] of Object.entries({
      details: en ? "We’ll post the dress code here " : "Publicaremos aquí el código de vestimenta ",
      faq: en ? "We’ll post the dress code here " : "Publicaremos aquí el código de vestimenta ",
      travel: en ? "We’ll post hotel and airport suggestions here " : "Publicaremos aquí sugerencias de hoteles y de cómo llegar desde el aeropuerto ",
      ceremony: en ? "We’ll post parking and arrival details here " : "Publicaremos aquí los detalles de llegada y estacionamiento ",
      reception: en
        ? "We’ll post entrance, parking and accessibility details here "
        : "Publicaremos aquí los detalles de entrada, estacionamiento y accesibilidad ",
    }))
      assert.ok(main(await dated(`${lang}${route}/index.html`)).includes(sentence + by), `${lang}${route}`);
    // The confirmation and My account get the same dates.
    for (const file of ["rsvp/confirmed/index.html", "account/index.html"])
      assert.ok(
        portal(await dated(lang + file)).includes(
          'data-coming="{&quot;dressCode&quot;:&quot;2026-12-01&quot;,&quot;hotels&quot;:&quot;2026-12-01&quot;,&quot;parking&quot;:&quot;2026-12-01&quot;}"',
        ),
        lang + file,
      );
  }
});

test("once the content exists it shows instead of the promise, and the labels that depend on it follow", async () => {
  for (const [lang, attire, parking] of [
    ["", "Fixture attire.", "Fixture parking."],
    ["es/", "Vestimenta de ensayo.", "Estacionamiento de ensayo."],
  ]) {
    const details = main(await filled(`${lang}details/index.html`));
    assert.ok(goodToKnow(details).includes(`<dd>${attire}</dd>`), lang);
    assert.ok(goodToKnow(details).includes(`<dd>${parking}</dd>`), lang);
    assert.ok(main(await filled(`${lang}faq/index.html`)).includes(`<p>${attire}</p>`), lang);
    for (const route of ["ceremony", "reception"])
      assert.ok(main(await filled(`${lang}${route}/index.html`)).includes(`<p class="venue-parking">${parking}</p>`), lang + route);
    assert.match(main(await filled(`${lang}travel/index.html`)), /<h2>Fixture Hotel<\/h2>/);
    for (const route of ["details", "faq", "travel", "ceremony", "reception"])
      assert.doesNotMatch(main(await filled(`${lang}${route}/index.html`)), /We’ll post|Publicaremos aquí|will be shared here|Compartiremos/, lang + route);
    // Nothing is still to come; parking may be named on the confirmation.
    const confirmed = portal(await filled(`${lang}rsvp/confirmed/index.html`));
    assert.ok(confirmed.includes('data-coming="{}"'), lang);
    assert.match(confirmed, / data-parking-posted[ >]/);
  }
  assert.doesNotMatch(portal(await dated("rsvp/confirmed/index.html")), /data-parking-posted/);
});

test("Travel rejoins the header in its own slot, and the Schedule links it, once it has hotels", async () => {
  for (const [lang, names, link] of [
    ["", ["Schedule", "Travel", "Photos &amp; notes"], 'href="/travel/">Coming from out of town? See Travel'],
    ["es/", ["Programa", "Viaje", "Fotos y mensajes"], 'href="/es/travel/">¿Vienes de fuera? Consulta Viaje'],
  ]) {
    const labels = [...header(await filled(`${lang}index.html`)).matchAll(/<li[^>]*><a [^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1]);
    assert.deepEqual(labels.slice(0, 3), names, lang);
    assert.ok(goodToKnow(await filled(`${lang}details/index.html`)).includes(link), lang);
    // Dates alone are not content: Travel stays unlinked.
    assert.doesNotMatch(await dated(`${lang}index.html`), /href="(\/es)?\/travel\/"/);
    assert.doesNotMatch(goodToKnow(await dated(`${lang}details/index.html`)), /travel/);
  }
});

test("the drive time appears only once the family gives it", async () => {
  assert.ok(goodToKnow(await dated("details/index.html")).includes("The ceremony and the reception are in different places, about 15 minutes apart by car, so allow time to drive from one to the other."));
  assert.ok(goodToKnow(await dated("es/details/index.html")).includes("La ceremonia y la recepción son en lugares distintos, a unos 15 minutos en auto, así que calcula tiempo para manejar de uno a otro."));
  assert.doesNotMatch(goodToKnow(await filled("details/index.html")), /minut/);
});

test("“What to expect” shows only the traditions the family chose, with their approved meanings, and names no service", async () => {
  for (const [lang, title, rows] of [
    ["", "What to expect", [['<h3 class="schedule-time" lang="es">Corona</h3>', "Tiara", "A sign that she is a princess before God and her family."], ['<h3 class="schedule-time" lang="es">Zapatos</h3>', "Shoes", "Flats become heels at the reception: the step into young womanhood."]]],
    ["es/", "Qué esperar", [['<h3 class="schedule-time">Corona</h3>', "", "Señal de que es una princesa ante Dios y su familia."], ['<h3 class="schedule-time">Zapatos</h3>', "", "En la recepción, sus zapatos de piso se cambian por sus primeras zapatillas: el paso de niña a señorita."]]],
  ]) {
    const section = main(await dated(`${lang}details/index.html`)).match(/<section class="what-to-expect"[\s\S]*?<\/section>/)[0];
    assert.ok(section.includes(`<h2 id="what-to-expect">${title}</h2>`), lang);
    const items = section.match(/<li class="schedule-item">[\s\S]*?<\/li>/g);
    assert.equal(items.length, 2, lang);
    rows.forEach(([name, en, meaning], i) => {
      assert.ok(items[i].includes(name), name);
      assert.ok(items[i].includes(`<p>${meaning}</p>`), meaning);
      if (en) assert.ok(items[i].includes(`<p class="schedule-venue">${en}</p>`), en);
    });
    // Whether the service is a Mass is the family's to say.
    assert.doesNotMatch(section.match(/<h2[\s\S]*?<\/p>/)[0], /\bMass\b|\bMisa\b/);
    // The Schedule's own three rows are unchanged.
    assert.equal(main(await dated(`${lang}details/index.html`)).match(/<ol class="schedule-list">[\s\S]*?<\/ol>/)[0].match(/<li class="schedule-item">/g).length, 3);
  }
  assert.doesNotMatch(await filled("details/index.html"), /what-to-expect/);
});

test("a children's age is said on Questions and carried to the RSVP's labels", async () => {
  assert.ok(main(await dated("faq/index.html")).includes("<summary>Who counts as a child?</summary><p>Guests under 12 count as children on your RSVP. Guests 12 and older count as adults/teens.</p>"));
  assert.ok(main(await dated("es/faq/index.html")).includes("<summary>¿Quién cuenta como niño?</summary><p>En tu respuesta, los invitados menores de 12 años cuentan como niños. Los de 12 años o más cuentan como adultos/jóvenes.</p>"));
  for (const file of ["rsvp/index.html", "es/rsvp/index.html"]) assert.match(portal(await dated(file)), / data-child-age="12"/);
  assert.doesNotMatch(portal(await filled("rsvp/index.html")), /data-child-age/);
});

test("the Spanish invitation art, once it exists, is the Spanish pages' artwork and link preview", async () => {
  const og = async (get, file) => (await get(file)).match(/<meta property="og:image" content="([^"]+)"/)[1];
  const art = async (get, file) => main(await get(file)).match(/<figure class="invitation"[\s\S]*?<\/figure>/)[0];
  assert.match(await og(dated, "es/index.html"), /\/assets\/img\/og-invitation-es\.[0-9a-f]{10}\.jpg$/);
  assert.match(await og(dated, "index.html"), /\/assets\/img\/og-invitation\.[0-9a-f]{10}\.jpg$/);
  assert.match(await og(dated, "es/faq/index.html"), /og-invitation-es\./);
  assert.match(await art(dated, "es/index.html"), /src="\/assets\/img\/invitation-es-730\.[0-9a-f]{10}\.jpg"[\s\S]*href="\/assets\/img\/invitation-es-1024\./);
  assert.doesNotMatch(await art(dated, "index.html"), /invitation-es/);
  // Without it (the filled build has no Spanish art) both use the English art.
  assert.equal(await og(filled, "es/index.html"), await og(filled, "index.html"));
});

// R-005 / DESIGN decision 13: on January 15 the home page shows parking once
// the family adds it (the same content and helper as the venue pages,
// site/promises.mjs); the page carries it for site/home.mjs.
test("parking reaches the home page for the day itself once it exists, and nothing before", async () => {
  const hero = (html) => html.match(/<section class="hero" data-home[^>]*>/)[0];
  assert.match(hero(await filled("index.html")), / data-parking="Fixture parking\."/);
  assert.match(hero(await filled("es/index.html")), / data-parking="Estacionamiento de ensayo\."/);
  // A date to post it by is not parking.
  for (const file of ["index.html", "es/index.html"]) assert.doesNotMatch(hero(await dated(file)), /data-parking/, file);
});

// R-006: the family's own sentence after the party, on the home page and in
// the link previews built then; without one, the reviewer's default.
test("the family's thank-you sentence is the home page's line and preview after the party", async () => {
  const hero = (html) => html.match(/<section class="hero" data-home[^>]*>/)[0],
    meta = (html, key) => html.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`))[1];
  for (const [lang, sentence] of [
    ["", "Fixture thanks for coming."],
    ["es/", "Gracias de ensayo por venir."],
  ]) {
    const home = await thanked(`${lang}index.html`);
    assert.ok(hero(home).includes(` data-thanks="${sentence}"`), lang);
    assert.equal(meta(home, "misxv-phase"), "after");
    assert.equal(meta(home, "description"), sentence, lang);
    assert.equal(meta(home, "og:description"), sentence, lang);
    assert.equal(meta(await thanked(`${lang}rsvp/index.html`), "description"), sentence, lang);
    assert.doesNotMatch(hero(await filled(`${lang}index.html`)), /data-thanks/, lang);
  }
});

// R-166 / R-155: court and padrinos would hold people's names, and this
// repository is public. They stay empty here; names belong in the runtime
// event settings (server/site-settings.mjs, GET /api/site), never in a commit.
test("no court or padrino names are committed to the public content", async () => {
  const { family } = await import("../site/content.mjs");
  for (const slot of ["court", "padrinos"])
    assert.deepEqual(
      family[slot],
      [],
      `site/content.mjs family.${slot} must stay empty: names never go in this public repository. Keep them in the runtime event settings (server/site-settings.mjs, GET /api/site; docs/publishing.md, "Names stay out of this repository").`,
    );
});

test("a value that is not a sensible number or date, or prose in one language only, stops the build instead of reaching a page", async () => {
  const bad = new URL(".cache/fixture-bad.mjs", repo);
  const { writeFile } = await import("node:fs/promises");
  for (const [field, value, message] of [
    ["childAgeCutoff", "12", /childAgeCutoff must be a whole number/],
    ["driveMinutes", 0, /driveMinutes must be a whole number/],
    ["promises", { dressCode: { by: "soon" } }, /promises\.dressCode\.by must be YYYY-MM-DD/],
    ["traditions", ["fireworks"], /Unknown tradition/],
    ["thankYou", { en: "Thanks!" }, /family\.thankYou must be \{ en, es \}/],
    // P5-A11Y-13: English alone would show unmarked on the Spanish pages.
    ["parking", { en: "Park in the north lot after 3 PM." }, /family\.parking must be written in English and Spanish/],
    ["dressCode", "Formal", /family\.dressCode must be written in English and Spanish/],
    ["hotels", [{ name: "Fixture Inn", notes: { en: "Near the church." }, url: "https://example.com/" }], /family\.hotels\[0\]\.notes must be written in English and Spanish/],
  ]) {
    await writeFile(bad, `export const family = ${JSON.stringify({ [field]: value })};\n`);
    await assert.rejects(
      run(process.execPath, ["scripts/build-pages.mjs", "--now=2026-10-01T18:00:00Z", "--out=family-bad", `--fixture=${bad.pathname}`], { cwd: repo.pathname }),
      (e) => message.test(e.stderr),
      field,
    );
  }
  // And a fixture can never build the published dist/.
  await assert.rejects(
    run(process.execPath, ["scripts/build-pages.mjs", "--fixture=tests/fixtures/family-filled.mjs"], { cwd: repo.pathname }),
    (e) => /--fixture needs --out/.test(e.stderr),
  );
});
