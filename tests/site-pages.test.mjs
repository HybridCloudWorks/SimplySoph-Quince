// The built guest pages (dist/, made by `npm test`'s pretest build): what the
// header links to, the home page order, the Schedule, the 404, link previews,
// images and calendars. Family content is the approved (mostly empty) content,
// so pages waiting for it must not be linked anywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import sharp from "sharp";
import { routes, family, ready, waitsFor, sections } from "../site/content.mjs";

const dist = new URL("../dist/", import.meta.url),
  preview = new URL("../dist-preview/", import.meta.url);
const page = (path) => readFile(new URL(path, dist), "utf8");
const header = (html) => html.match(/<header[\s\S]*?<\/header>/)[0];
const main = (html) => html.match(/<main[\s\S]*?<\/main>/)[0];
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
async function guestPages() {
  const files = [];
  for (const lang of ["", "es/"])
    for (const [route] of routes)
      files.push([route, lang + (route ? route + "/" : "") + "index.html"]);
  files.push(["404", "404.html"]);
  return files;
}

test("a page waits to be linked until the family's content exists", () => {
  const empty = structuredClone(family);
  for (const route of Object.keys(waitsFor)) assert.equal(ready(route, empty), false, route);
  assert.equal(ready("details", empty), true);
  assert.equal(ready("sophia", { ...empty, bio: { en: "Example", es: "Ejemplo" } }), true);
  assert.equal(ready("court", { ...empty, court: [{ name: "Example", role: "dama" }] }), true);
  assert.equal(ready("padrinos", { ...empty, padrinos: [{ gift: "misa", names: "Example" }] }), true);
  assert.equal(ready("thank-you", { ...empty, highlightVideo: "https://example.com/" }), true);
  // R-012: Travel waits for hotels or an airport note (it is in waitsFor, so
  // the loop above and the link scan below cover it while empty).
  assert.ok("travel" in waitsFor);
  assert.equal(ready("travel", { ...empty, hotels: [{ name: "Example" }] }), true);
  assert.equal(ready("travel", { ...empty, airport: { name: "Example" } }), true);
  // Every guest page with a header link belongs to exactly one section.
  const listed = sections.flatMap((s) => s.pages);
  assert.equal(new Set(listed).size, listed.length);
  for (const route of listed) assert.ok(routes.some(([r]) => r === route), route);
});

test("nothing links to a page whose family content is still empty", async () => {
  const waiting = Object.keys(waitsFor).filter((r) => !ready(r, family));
  assert.ok(waiting.length, "the approved content still has empty pages");
  for (const [route, file] of await guestPages()) {
    const links = hrefs(await page(file));
    for (const empty of waiting) {
      // An empty page may switch to its own other-language version, no more.
      if (route === empty) continue;
      assert.ok(
        !links.some((h) => h === `/${empty}/` || h === `/es/${empty}/`),
        `${file} links to the empty /${empty}/ page`,
      );
    }
  }
  // Built directly, an empty page ends with the guest's next step.
  const sophia = main(await page("sophia/index.html"));
  assert.match(sophia, /href="\/rsvp\/"/);
  assert.match(sophia, /href="\/details\/"/);
  assert.doesNotMatch(sophia, /href="\/contact\/"/);
});

test("filled-in pages are linked automatically (the admin preview's example content)", async () => {
  const court = await readFile(new URL("en/court.html", preview), "utf8");
  const nav = header(court);
  assert.match(nav, /<a href="\/sophia\/"[^>]*>Sophia<\/a>/);
  assert.match(nav, /<a href="\/thank-you\/"[^>]*>Thank you<\/a>/);
  // Sophia's section lists its pages with content under the title.
  const sectionNav = court.match(/<nav class="section-nav"[\s\S]*?<\/nav>/)[0];
  for (const route of ["sophia", "court", "padrinos"])
    assert.match(sectionNav, new RegExp(`href="/${route}/"`));
  assert.match(sectionNav, /href="\/court\/" aria-current="page"/);
});

test("the family's portraits open the gallery, one album at a time, in both languages", async () => {
  // The admin preview is /gallery/ and /es/gallery/ built with the idea-book
  // portraits; the family's own fill the same chapters.
  for (const [lang, album, caption] of [
    ["en", "Childhood memories", "Age 3, first trip to the beach"],
    ["es", "Recuerdos de la infancia", "A los 3 años, su primer viaje a la playa"],
  ]) {
    const html = main(await readFile(new URL(lang + "/gallery.html", preview), "utf8"));
    const chapters = html.match(/<section class="chapter">[\s\S]*?<\/section>/g) || [];
    assert.equal(chapters.length, 2, lang);
    assert.ok(chapters[0].includes(`<h2>${album}</h2>`), lang);
    assert.ok(chapters[0].includes(`<figcaption>${caption}</figcaption>`), lang);
    // Above the guests' gallery, which waits for a sign-in.
    assert.ok(html.indexOf('class="chapter"') < html.indexOf("data-gallery-state"), lang);
  }
});

test("every hook the live event settings fill is on a built page", async () => {
  // site/experience.js redraws these from the admin's settings, and
  // site/home.mjs the home page by phase; a hook that no page has any more is
  // dead code.
  let source = "";
  for (const file of ["experience.js", "home.mjs"])
    source += await readFile(new URL("../site/" + file, import.meta.url), "utf8");
  const hooks = [...source.matchAll(/(?:querySelector(?:All)?\(|\$\()"\[(data-[a-z-]+)\]"\)/g)].map((m) => m[1]);
  for (const hook of ["data-countdown", "data-home", "data-reply-by", "data-home-status", "data-latest-update"])
    assert.ok(hooks.includes(hook), hook);
  let html = "";
  for (const [, file] of await guestPages()) html += await page(file);
  for (const hook of hooks) assert.ok(new RegExp(`\\s${hook}[\\s=>]`).test(html), hook);
});

test("the header is a flat list: sections, sign in, language pill, RSVP and a menu button", async () => {
  // Travel waits for hotels or the airport note (R-012), so it is not here yet.
  for (const [lang, file, names, signIn] of [
    ["en", "index.html", ["Schedule", "Photos &amp; notes", "Gifts", "Questions", "Contact"], "Sign in"],
    // One Spanish verb for signing in (R-042): "Entrar", as in the emails.
    ["es", "es/index.html", ["Programa", "Fotos y mensajes", "Mesa de regalos", "Preguntas", "Contacto"], "Entrar"],
  ]) {
    const nav = header(await page(file));
    assert.doesNotMatch(nav, /<details|<summary/);
    const labels = [...nav.matchAll(/<li[^>]*><a [^>]*>([^<]+)<\/a><\/li>/g)].map((m) => m[1]);
    assert.deepEqual(labels, [...names, signIn], lang);
    // The menu button controls the list it opens.
    assert.match(nav, /<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav">/);
    assert.match(nav, /<nav class="site-nav" id="site-nav"/);
    assert.match(nav, lang === "en" ? /class="lang-switch" href="\/es\/" lang="es"/ : /class="lang-switch" href="\/" lang="en"/);
    assert.ok(nav.indexOf("lang-switch") < nav.indexOf("nav-rsvp"), "language switch before RSVP");
  }
  // Each page names its own section once, and the page itself.
  const ceremony = header(await page("ceremony/index.html"));
  assert.match(ceremony, /href="\/details\/" aria-current="true">Schedule/);
  // Administrators sign in at /admin/login/; guests never see that link.
  assert.doesNotMatch(main(await page("account/index.html")), /admin\/login/);
});

test("the wordmark is named as the way home, the Menu button can say Close, and every page has one announcement region", async () => {
  for (const [lang, file, home, menu, close] of [
    ["en", "index.html", "home", "Menu", "Close"],
    ["es", "es/details/index.html", "inicio", "Menú", "Cerrar"],
  ]) {
    const html = await page(file),
      nav = header(html);
    // R-062: read as "S MIS XV, home"; the visible mark is unchanged.
    assert.match(nav, new RegExp(`<a class="wordmark" [^>]*>S<span class="wordmark-tag">.*?MIS XV</span><span class="visually-hidden">, ${home}</span></a>`), lang);
    // R-063: both labels are in the button; the stylesheet shows the one that
    // matches aria-expanded, so the name follows what is shown.
    assert.match(nav, new RegExp(`<span class="when-closed">${menu}</span><span class="when-open">${close}</span>`), lang);
    // R-050: one polite region outside every form, for "Saving…" and replies.
    assert.equal(html.match(/id="announce"/g).length, 1);
    assert.match(html, /<\/footer><div id="status" role="status" aria-live="polite"><\/div><div id="announce" class="visually-hidden" role="status"><\/div><\/body>/);
  }
  // R-060: standalone links in the page text use the 44px target.
  assert.match(main(await page("contact/index.html")), /<p><a class="target" href="mailto:/);
  assert.match(main(await page("sms/index.html")), /<a class="target" href="\/sms-terms\/">SMS Terms<\/a> · <a class="target" href="\/privacy\/">/);
});

test("the home page puts the name, date and RSVP before the schedule, words and artwork", async () => {
  // Built in its RSVP-open state; site/home.mjs follows the phase. The Spanish
  // home page speaks to the household (ustedes), and the deadline sentence is
  // "Please RSVP by" (site/lexicon.mjs).
  for (const [file, deadline, note] of [
    ["index.html", "Please RSVP by Sunday, November 15", 'href="/guestbook/">Leave Sophia a note'],
    ["es/index.html", "Por favor, confirmen su asistencia a más tardar el domingo 15 de noviembre", 'href="/es/guestbook/">Déjenle un mensaje a Sophia'],
  ]) {
    const html = main(await page(file));
    const at = (needle) => {
      const i = html.indexOf(needle);
      assert.ok(i >= 0, `${file}: ${needle}`);
      return i;
    };
    const order = [
      at("<h1>Sophia</h1>"),
      at("data-event-date"),
      at('class="button burgundy" href="' + (file.startsWith("es") ? "/es" : "") + '/rsvp/"'),
      at(deadline),
      at("data-countdown"),
      // The newest announcement, under the status line (R-030).
      at("data-latest-update"),
      at('class="schedule-strip"'),
      at("data-home-quote"),
      // "Leave Sophia a note →" under her words (R-028).
      at(note),
      at('class="invitation"'),
    ];
    assert.deepEqual(order, [...order].sort((a, b) => a - b), file);
    // The schedule strip links each venue; the old empty cards are gone.
    assert.match(html, /<ul class="schedule-strip"><li><a href="(\/es)?\/ceremony\/">/);
    assert.match(html, /href="(\/es)?\/reception\/"/);
    assert.doesNotMatch(html, /home-cards|Meet Sophia|Conoce a Sophia/);
    assert.match(html, /data-announcements/);
  }
  // The artwork's alt text carries the schedule it shows.
  const alt = (await page("index.html")).match(/<img [^>]*alt="([^"]+)"/)[1];
  for (const fact of ["Our Lady of Guadalupe Church", "4:00 PM", "6:30 PM", "7:30 PM", "The AMZ Event Center"])
    assert.ok(alt.includes(fact), fact);
});

test("the Schedule gives each part of the day its place, map and own calendar file", async () => {
  for (const [file, cal] of [["details/index.html", "/calendar/"], ["es/details/index.html", "/calendar/es/"]]) {
    const html = main(await page(file));
    const rows = html.match(/<li class="schedule-item">[\s\S]*?<\/li>/g);
    assert.equal(rows.length, 3);
    for (const [row, venue, kind] of [
      [rows[0], "Our Lady of Guadalupe Church", "ceremony"],
      [rows[1], "The AMZ Event Center", "dinner"],
      [rows[2], "The AMZ Event Center", "reception"],
    ]) {
      assert.match(row, /class="schedule-time"/);
      assert.ok(row.includes(venue), venue);
      assert.match(row, /<address>[^<]+Fort Worth, TX/);
      // Its maps, as the venue pages offer them (R-172): Google, Apple and Waze.
      const address = encodeURIComponent(venue === "Our Lady of Guadalupe Church" ? "4100 Blue Mound Rd, Fort Worth, TX 76106" : "5103 Azle Ave, Unit 200, Fort Worth, TX 76114");
      for (const map of [`https://www.google.com/maps/search/?api=1&amp;query=${address}`, `https://maps.apple.com/?q=${address}`, `https://waze.com/ul?q=${address}&amp;navigate=yes`])
        assert.ok(row.includes(`href="${map}" target="_blank" rel="noopener noreferrer"`), map);
      assert.ok(row.includes(`href="${cal}${kind}.ics" download`), `${file} ${kind}`);
    }
    // Dress code is a small note, never a claim about the website's colors.
    assert.doesNotMatch(html, /site theme|colores del sitio/);
    assert.match(html, /class="good-to-know"/);
  }
  assert.match(main(await page("details/index.html")), /We’ll share the dress code here soon\./);
  // The RSVP shows its own deadline (site/guest.js); the page adds none.
  for (const file of ["rsvp/index.html", "rsvp/confirmed/index.html", "es/rsvp/index.html"])
    assert.doesNotMatch(await page(file), /class="deadline"/);
});

test("↗ marks only links that open another site in a new tab", async () => {
  for (const [, file] of await guestPages()) {
    const html = await page(file);
    const marked = [...html.matchAll(/<a ([^>]*)>(?:(?!<\/a>)[\s\S])*?↗/g)];
    assert.equal(marked.length, (html.match(/↗/g) || []).length, `${file}: a ↗ outside a link`);
    for (const [, attributes] of marked)
      assert.match(attributes, /target="_blank"/, `${file}: ↗ on a link that stays here`);
    assert.doesNotMatch(html, /class="calendar-link"[^>]*>[^<]*↗/);
  }
});

test("one 404 file answers in English or Spanish and offers RSVP and the Schedule", async () => {
  const html = await readFile(new URL("404.html", dist), "utf8");
  assert.match(html, /<script type="module" src="\/not-found.js"><\/script>/);
  assert.ok(html.indexOf("/not-found.js") < html.indexOf("/guest.js"), "runs before the page scripts");
  const spanish = html.match(/<template data-lang="es" data-title="([^"]+)">([\s\S]*)<\/template>/);
  assert.equal(spanish[1], "Página no encontrada · Los XV de Sophia");
  assert.match(spanish[2], /<h1>Página no encontrada<\/h1>/);
  assert.match(spanish[2], /href="\/es\/rsvp\/"/);
  for (const link of ['href="/rsvp/"', 'href="/details/"', 'href="/"'])
    assert.ok(main(html).includes(link), link);
});

test("every page has a title, link preview and icons, and stays out of search", async () => {
  const og = (html, property) => html.match(new RegExp(`<meta property="${property}" content="([^"]+)"`))?.[1];
  for (const [route, file] of await guestPages()) {
    const html = await page(file),
      es = file.startsWith("es/");
    const site = es ? "Los XV de Sophia" : "Sophia’s Quinceañera";
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    if (route === "") assert.equal(title, site);
    else assert.ok(title.endsWith(" · " + site), `${file}: ${title}`);
    // The test build is pinned before the deadline (package.json --now): home
    // and RSVP invite; pages about photos and notes never mention a date
    // (tests/previews.test.mjs builds the other phases).
    assert.equal(html.match(/<meta name="misxv-phase" content="([^"]+)">/)?.[1], "rsvp-open", file);
    const dateFree = ["share", "gallery", "guestbook", "thank-you"].includes(route);
    if (dateFree) {
      assert.equal(og(html, "og:title"), `${html.match(/<h1>([^<]+)<\/h1>/)?.[1] || og(html, "og:title").split(" · ")[0]} · ${site}`, file);
      assert.doesNotMatch(og(html, "og:description"), /2026|2027|RSVP|confirm/i, file);
    } else {
      assert.equal(og(html, "og:title"), es ? "Los XV de Sophia · 15 de enero de 2027" : "Sophia’s Quinceañera · January 15, 2027");
      if (route === "" || route === "rsvp")
        assert.match(og(html, "og:description"), es ? /confirmen su asistencia a más tardar el domingo 15 de noviembre de 2026/ : /Please RSVP by Sunday, November 15, 2026/);
      else assert.doesNotMatch(og(html, "og:description"), /RSVP|confirm/i, file);
    }
    assert.equal(html.match(/<meta name="description" content="([^"]+)">/)[1], og(html, "og:description"));
    assert.equal(og(html, "og:locale"), es ? "es_US" : "en_US");
    assert.match(og(html, "og:image"), /^https:\/\/misxv\.simplysoph\.com\/assets\/img\/og-invitation\.[0-9a-f]{10}\.jpg$/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(html, /<meta name="theme-color" content="#360d16" media="\(prefers-color-scheme: light\)">/);
    assert.match(html, /<meta name="theme-color" content="#070c15" media="\(prefers-color-scheme: dark\)">/);
    assert.match(html, /<meta name="robots" content="noindex,nofollow">/);
    assert.match(html, /<link rel="apple-touch-icon" href="\/assets\/img\/apple-touch-icon\.[0-9a-f]{10}\.png">/);
    assert.match(html, /<link rel="icon" type="image\/svg\+xml"/);
    // Fonts load beside the stylesheets, not from an @import inside them.
    assert.match(html, /<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/);
    assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?[^"]*display=swap">/);
  }
  for (const css of ["styles.css", "pages.css"])
    assert.doesNotMatch(await readFile(new URL(css, dist), "utf8"), /@import/);
  const home = await page("index.html");
  const image = (rel) => new URL(home.match(new RegExp(`rel="${rel}"[^>]* href="/([^"]+)"`))[1], dist);
  assert.deepEqual(await dimensions(image("apple-touch-icon")), [180, 180]);
  const card = new URL(og(home, "og:image").replace("https://misxv.simplysoph.com/", ""), dist);
  assert.deepEqual(await dimensions(card), [1200, 630]);
  assert.ok((await stat(new URL("favicon.ico", dist))).size > 100);
});
const dimensions = async (file) => {
  const { width, height } = await sharp(await readFile(file)).metadata();
  return [width, height];
};

test("images are served small, in modern formats, with hashed names", async () => {
  const files = await readdir(new URL("assets/img/", dist));
  for (const file of files) assert.match(file, /^[a-z0-9-]+\.[0-9a-f]{10}\.(avif|webp|jpg|png)$/);
  const home = main(await page("index.html"));
  const pictureTag = home.match(/<picture>[\s\S]*?<\/picture>/)[0];
  assert.match(pictureTag, /<source type="image\/avif" srcset="[^"]+400w[^"]+730w[^"]+1024w"/);
  assert.match(pictureTag, /<source type="image\/webp"/);
  assert.match(pictureTag, /width="1024" height="1536"/);
  assert.match(pictureTag, /fetchpriority="high"/);
  // The full invitation opens as a JPEG, not the 3 MB original PNG.
  assert.doesNotMatch(await page("index.html"), /invitation\.png/);
  assert.match(home, /<a href="\/assets\/img\/invitation-1024\.[0-9a-f]{10}\.jpg" target="_blank"/);
  for (const [name, limit] of [["invitation-400", 60_000], ["invitation-730", 160_000], ["church-480", 40_000], ["reception-490", 40_000]]) {
    const avif = files.find((f) => f.startsWith(name + ".") && f.endsWith(".avif"));
    assert.ok((await stat(new URL("assets/img/" + avif, dist))).size < limit, avif);
  }
  // Venue photos load lazily, below the facts on phones.
  assert.match(main(await page("ceremony/index.html")), /<img [^>]*loading="lazy"/);
  await assert.rejects(stat(new URL("assets/invitation.png", dist)));
});

test("calendar files exist in both languages for the same events", async () => {
  for (const kind of ["ceremony", "dinner", "reception"]) {
    const en = await readFile(new URL(`calendar/${kind}.ics`, dist), "utf8"),
      es = await readFile(new URL(`calendar/es/${kind}.ics`, dist), "utf8");
    const uid = (ics) => ics.match(/^UID:.*$/m)[0];
    assert.equal(uid(en), uid(es));
    for (const ics of [en, es]) assert.doesNotMatch(ics.replace(/\r\n /g, ""), /will be shared|Compartiremos/);
    assert.match(es.replace(/\r\n /g, ""), /URL:https:\/\/misxv\.simplysoph\.com\/es\//);
  }
});

test("the footer is a list and policy bullets are real lists", async () => {
  for (const file of ["index.html", "es/terms/index.html"]) {
    const footer = (await page(file)).match(/<footer[\s\S]*?<\/footer>/)[0];
    assert.match(footer, /<nav class="footer-nav"[^>]*><ul><li>/);
    assert.doesNotMatch(footer, /<\/a> · <a/);
    assert.match(footer, /<p class="copyright">/);
  }
  const terms = main(await page("terms/index.html"));
  assert.match(terms, /<ul><li>[^<]+<\/li>/);
  assert.doesNotMatch(terms, /<p>• /);
});

test("guests hear the hosts as “we”, never “the family” as someone else", async () => {
  // What guests read or receive: the built pages, the guest scripts, guest
  // emails and the SMS/WhatsApp auto-replies. Admin screens may name the family.
  const sources = [
    ...(await guestPages()).map(([, file]) => new URL(file, dist)),
    ...(await readdir(new URL("../site/", import.meta.url)))
      .filter((f) => /\.m?js$/.test(f) && !f.startsWith("admin") && f !== "preview-content.mjs")
      .map((f) => new URL(`../site/${f}`, import.meta.url)),
    ...["emails/templates.mjs", "server/whatsapp.mjs", "server/sms.mjs"].map(
      (f) => new URL(`../${f}`, import.meta.url),
    ),
  ];
  // R-137: also what the family knows or does, asking it, and a reply "from
  // the family" ("So the family knows who took them", "Ask the family for
  // the card", "New reply from the family"): the hosts say "we".
  const thirdPerson =
    /\bthe family (?:may|needs?|will|can|must|should|reviews?|decides?|knows?|reads?|sees?|has|gets?|approves?)\b|\b(?:ask|tell|from|by) the family\b|\bla familia (?:puede|debe|necesita|va a|revisa|decide|no les?|sepa|sabe|lee|lea|vea|ve|tiene|aprueba)\b|\b(?:pide|pídele|pregunta|pregúntale|avisa|avísale) a la familia\b|\b(?:respuesta|mensaje|aviso) de la familia\b(?! de Sophia)/i;
  for (const url of sources) {
    const lines = (await readFile(url, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (/^\s*(?:\/\/|\*)/.test(line)) return; // code comments
      assert.doesNotMatch(line, thirdPerson, `${url.pathname.split("/").slice(-2).join("/")}:${i + 1}`);
    });
  }
});

// ---- Family content that does not exist yet (R-011, R-164, R-013, R-017,
// R-053, R-087, R-086, R-066, R-019): the built pages say only what is true
// today. The same slots filled with test content: tests/family-slots.test.mjs.
const both = (en, es) => [
  ["", en],
  ["es/", es],
];
test("each “soon” promise is said once, in today's words, and the venue notes keep only venue facts", async () => {
  for (const [lang, words] of both(
    {
      details: "We’ll share the dress code here soon.",
      faq: "We’ll share this here soon.",
      travel: "We’ll share hotel and airport suggestions here soon.",
      ceremony: "Parking and arrival details will be shared here.",
      reception: "Entrance, parking and accessibility details will be shared here.",
    },
    {
      details: "Pronto compartiremos aquí el código de vestimenta.",
      faq: "Lo compartiremos aquí pronto.",
      travel: "Pronto compartiremos aquí sugerencias de hoteles y de cómo llegar desde el aeropuerto.",
      ceremony: "Compartiremos aquí los detalles de llegada y estacionamiento.",
      // L10N-34: "aquí", as the English and the ceremony say.
      reception: "Compartiremos aquí los detalles de entrada, estacionamiento y accesibilidad.",
    },
  ))
    for (const [route, sentence] of Object.entries(words)) {
      const html = main(await page(`${lang}${route}/index.html`));
      // Once on the page (the venue pages also carry it for the live redraw).
      assert.equal(html.split(sentence).length - 1, ["ceremony", "reception"].includes(route) ? 2 : 1, `${lang}${route}`);
      assert.doesNotMatch(html, /a más tardar el (?!domingo 15 de noviembre)|here by /, `${lang}${route}: no date invented`);
    }
  // The parking promise is its own line now, not part of the venue notes,
  // and marked as a promise, which ends with the party (L10N-10).
  const ceremony = main(await page("ceremony/index.html"));
  assert.match(ceremony, /<p>Please silence your phone and follow the church’s guidance during the ceremony\.<\/p><p class="venue-parking" data-promise>Parking and arrival details will be shared here\.<\/p>/);
  assert.match(ceremony, /<div data-venue="ceremony" data-parking="Parking and arrival details will be shared here\." data-parking-promise>/);
  assert.match(main(await page("es/reception/index.html")), /<p>La cena y la recepción serán en el mismo lugar\.<\/p><p class="venue-parking" data-promise>Compartiremos aquí los detalles de entrada, estacionamiento y accesibilidad\.<\/p>/);
});

test("the Schedule says the two places are a drive apart, without a drive time, and does not link Travel yet", async () => {
  for (const [lang, line] of both(
    "<dt>Between the two places</dt><dd>The ceremony and the reception are in different places, so allow time to drive from one to the other.</dd>",
    "<dt>Entre un lugar y otro</dt><dd>La ceremonia y la recepción son en lugares distintos, así que calcula tiempo para manejar de uno a otro.</dd>",
  )) {
    const box = main(await page(`${lang}details/index.html`)).match(/<aside class="good-to-know"[\s\S]*?<\/aside>/)[0];
    assert.ok(box.includes(line), lang);
    assert.doesNotMatch(box, /minut|short drive|corta distancia/i, lang);
    assert.doesNotMatch(box, /travel\//, lang);
  }
  // No traditions chosen: no "What to expect".
  for (const file of ["details/index.html", "es/details/index.html"])
    assert.doesNotMatch(await page(file), /what-to-expect|What to expect|Qué esperar/);
  // Travel still builds for someone who has its address.
  assert.match(main(await page("travel/index.html")), /<h1>Travel<\/h1>/);
});

test("Questions links the RSVP while it is open and has the closed answer ready for the deadline", async () => {
  for (const [lang, open, closed] of [
    ["", /<p data-rsvp-while="open">By Sunday, November 15, 2026\. Open the invitation link we sent your family, or go to <a href="\/rsvp\/">RSVP<\/a>\.<\/p>/, /<p data-rsvp-while="closed" hidden>RSVPs closed on Sunday, November 15, 2026\. To reply or change your RSVP now, please <a href="\/contact\/">contact us<\/a>\.<\/p>/],
    ["es/", /<p data-rsvp-while="open">A más tardar el domingo 15 de noviembre de 2026\. Abre el enlace de invitación que le enviamos a tu familia, o ve a <a href="\/es\/rsvp\/">Confirmar asistencia<\/a>\.<\/p>/, /<p data-rsvp-while="closed" hidden>El plazo para confirmar terminó el domingo 15 de noviembre de 2026\. Para confirmar tu asistencia o cambiar tu respuesta, <a href="\/es\/contact\/">escríbenos<\/a>\.<\/p>/],
  ]) {
    const html = main(await page(`${lang}faq/index.html`));
    assert.match(html, open, lang);
    assert.match(html, closed, lang);
    // No age cut-off yet: no question about it.
    assert.doesNotMatch(html, /Who counts as a child|Quién cuenta como niño/);
  }
});

test("the RSVP pages carry what is still to come and nothing the family has not decided", async () => {
  for (const file of ["rsvp/index.html", "es/rsvp/confirmed/index.html", "account/index.html"]) {
    const portal = (await page(file)).match(/<div class="portal" id="portal"[^>]*>/)[0];
    assert.ok(portal.includes('data-coming="{&quot;dressCode&quot;:null,&quot;hotels&quot;:null,&quot;parking&quot;:null}"'), file);
    assert.doesNotMatch(portal, /data-parking-posted|data-child-age/, file);
  }
  // Pages without the RSVP carry none of it.
  assert.doesNotMatch(await page("contact/index.html"), /data-coming/);
});

test("Gifts says the Target list is called “Sophia’s Birthday Wish List”, in both languages", async () => {
  assert.ok(main(await page("registry/index.html")).includes("On Target’s site the list is called “Sophia’s Birthday Wish List.”"));
  assert.ok(main(await page("es/registry/index.html")).includes("En Target, la lista aparece como “Sophia’s Birthday Wish List” (página en inglés)."));
});

test("each calendar file has Google Calendar beside it, with the same event in the page's language", async () => {
  for (const [lang, file, title] of [
    ["en", "details/index.html", "Sophia’s quinceañera — Religious ceremony"],
    ["es", "es/details/index.html", "XV de Sophia — Ceremonia religiosa"],
  ]) {
    const html = main(await page(file));
    const google = [...html.matchAll(/<a class="target" href="(https:\/\/calendar\.google\.com\/calendar\/render\?[^"]+)" target="_blank" rel="noopener noreferrer">Google Calendar<span class="visually-hidden">: ([^<]+)<\/span>/g)];
    assert.deepEqual(google.map((m) => m[2]), lang === "en" ? ["Ceremony", "Dinner", "Reception &amp; dance"] : ["Ceremonia", "Cena", "Recepción y baile"]);
    const url = new URL(google[0][1].replaceAll("&amp;", "&"));
    assert.equal(url.searchParams.get("text"), title);
    // The same UTC times as the calendar file.
    const ics = await readFile(new URL(`calendar/${lang === "es" ? "es/" : ""}ceremony.ics`, dist), "utf8");
    const at = (field) => ics.match(new RegExp(`^${field}:(\\S+)`, "m"))[1];
    assert.equal(url.searchParams.get("dates"), `${at("DTSTART")}/${at("DTEND")}`);
    assert.equal(url.searchParams.get("location"), "Our Lady of Guadalupe Church, 4100 Blue Mound Rd, Fort Worth, TX 76106");
  }
  // The venue pages too (the reception page has dinner and the reception).
  assert.equal((main(await page("reception/index.html")).match(/calendar\.google\.com/g) || []).length, 2);
});

test("the Spanish pages use the English invitation art until the Spanish art exists", async () => {
  const og = async (file) => (await page(file)).match(/<meta property="og:image" content="([^"]+)"/)[1];
  assert.equal(await og("es/index.html"), await og("index.html"));
  assert.match(await og("index.html"), /\/assets\/img\/og-invitation\.[0-9a-f]{10}\.jpg$/);
  const art = async (file) => main(await page(file)).match(/<figure class="invitation"[\s\S]*?<\/figure>/)[0].match(/src="([^"]+)"/)[1];
  assert.equal(await art("es/index.html"), await art("index.html"));
});
