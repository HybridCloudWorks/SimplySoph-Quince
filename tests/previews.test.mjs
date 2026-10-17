// Link previews by phase. A crawler reads only the built <meta> tags, so the
// build picks their text for the phase at build time (scripts/build-pages.mjs
// --now, site/lifecycle.mjs previewKey) and marks it with misxv-phase for the
// release check. Each phase is built into its own .cache/builds/ folder, so
// the dist/ that other tests read is never touched.
import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";

const run = promisify(execFile);
const script = new URL("../scripts/build-pages.mjs", import.meta.url).pathname;
async function build(name, now) {
  const { stdout } = await run(process.execPath, [script, `--now=${now}`, `--out=${name}`], {
    cwd: new URL("../", import.meta.url).pathname,
  });
  const dist = new URL(`../.cache/builds/${name}/dist/`, import.meta.url);
  return {
    stdout,
    meta: async (file) => {
      const html = await readFile(new URL(file, dist), "utf8"),
        get = (attr, key) => html.match(new RegExp(`<meta ${attr}="${key}" content="([^"]*)">`))?.[1];
      return {
        phase: get("name", "misxv-phase"),
        description: get("name", "description"),
        og: get("property", "og:description"),
        title: get("property", "og:title"),
      };
    },
  };
}
const phases = [
  // One second before the deadline (11:59 PM Central, November 15).
  ["before-deadline", "2026-11-16T05:58:59Z", "rsvp-open"],
  ["after-deadline", "2026-11-16T05:59:00Z", "rsvp-closed"],
  // The reception ends at 12:30 AM on January 16.
  ["party-night", "2027-01-16T06:29:59Z", "live"],
  ["after-party", "2027-01-16T06:30:00Z", "after"],
];
// One after another: the builds share the encoded-image cache.
const built = {};
for (const [name, now] of phases) built[name] = await build("previews-" + name, now);

test("the build names its phase on every page", async () => {
  for (const [name, , phase] of phases)
    for (const file of ["index.html", "es/index.html", "share/index.html", "es/rsvp/index.html", "404.html", "admin/index.html"])
      assert.equal((await built[name].meta(file)).phase, phase, `${name} ${file}`);
  assert.match(built["after-party"].stdout, /with after link previews in \.cache\/builds\/previews-after-party\//);
});

test("before the deadline home and RSVP invite, with the deadline, in both languages", async () => {
  const b = built["before-deadline"];
  for (const file of ["index.html", "rsvp/index.html"])
    assert.equal(
      (await b.meta(file)).description,
      "Friday, January 15, 2027 in Fort Worth, Texas. Please RSVP by Sunday, November 15, 2026.",
    );
  // Spanish speaks to the household (ustedes: "confirmen").
  assert.equal(
    (await b.meta("es/index.html")).description,
    "Viernes 15 de enero de 2027 en Fort Worth, Texas. Por favor, confirmen su asistencia a más tardar el domingo 15 de noviembre de 2026.",
  );
  // Other pages carry the event, not the deadline.
  assert.equal((await b.meta("details/index.html")).description, "Friday, January 15, 2027 in Fort Worth, Texas.");
});

test("from the deadline no preview asks for an RSVP", async () => {
  for (const name of ["after-deadline", "party-night"]) {
    const b = built[name];
    for (const file of ["index.html", "rsvp/index.html", "es/index.html", "es/rsvp/index.html", "share/index.html", "faq/index.html"]) {
      const { description, og } = await b.meta(file);
      assert.equal(og, description, file);
      assert.doesNotMatch(description, /RSVP|confirm|November|noviembre/i, `${name} ${file}`);
    }
    assert.equal((await b.meta("index.html")).description, "Friday, January 15, 2027 in Fort Worth, Texas.");
    assert.equal((await b.meta("es/index.html")).description, "Viernes 15 de enero de 2027 en Fort Worth, Texas.");
  }
});

test("after the party the previews thank the guests", async () => {
  const b = built["after-party"];
  assert.equal((await b.meta("index.html")).description, "Thank you for celebrating with us on Friday, January 15, 2027.");
  assert.equal((await b.meta("es/index.html")).description, "Gracias por celebrar con nosotros el viernes 15 de enero de 2027.");
  assert.equal((await b.meta("rsvp/index.html")).description, "Thank you for celebrating with us on Friday, January 15, 2027.");
});

test("pages about photos and notes say the same, date-free thing in every phase", async () => {
  const expected = {
    "share/index.html": ["Share your photos · Sophia’s Quinceañera", "Share the photos and videos you took at Sophia’s quinceañera."],
    "es/share/index.html": ["Comparte tus fotos · Los XV de Sophia", "Comparte las fotos y los videos que tomaste en los XV de Sophia."],
    "gallery/index.html": [null, "Photos and videos from Sophia’s quinceañera, for our guests."],
    "guestbook/index.html": [null, "Leave Sophia a note."],
    "es/guestbook/index.html": [null, "Déjale un mensaje a Sophia."],
    "thank-you/index.html": [null, "A thank-you from Sophia and her family."],
  };
  for (const [name] of phases)
    for (const [file, [title, description]] of Object.entries(expected)) {
      const meta = await built[name].meta(file);
      assert.equal(meta.description, description, `${name} ${file}`);
      assert.equal(meta.og, description, `${name} ${file}`);
      if (title) assert.equal(meta.title, title, `${name} ${file}`);
      assert.doesNotMatch(meta.title, /2027|2026/, `${name} ${file}`);
    }
});
