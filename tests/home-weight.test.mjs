// What a phone downloads for the home page (dist/, uncompressed): the HTML,
// the stylesheets and every script module it loads, followed through their
// imports. A budget, so growth is a decision rather than an accident.
//
// Before the lifecycle work (round 2): 205,951 bytes, all loaded at once.
// The phase-aware home page (site/home.mjs and the date formats it uses) is
// imported only on the home page and only after it has drawn, so it is
// counted apart from what every page loads.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const dist = new URL("../dist/", import.meta.url);
// Modules a page imports dynamically are not all fetched on the home page:
// home.mjs is (after the page has drawn), while the upload form and the
// WhatsApp choices load only on the pages that show them (site/guest.js).
const homeLater = new Set(["home.mjs"]);
async function weight(page) {
  const seen = new Map(),
    dynamic = [];
  // Everything a module pulls in statically arrives with it; its dynamic
  // imports are followed afterwards, so a module that also arrives with the
  // page is always counted as "first".
  async function add(file, how) {
    if (seen.has(file)) return;
    const text = await readFile(new URL(file, dist), "utf8");
    seen.set(file, { bytes: Buffer.byteLength(text), how });
    if (!/\.m?js$/.test(file)) return;
    for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s*["'](\.\/[^"']+)["']/g))
      await add(path.posix.join(path.posix.dirname(file), m[1]), how);
    for (const m of text.matchAll(/import\(\s*["'](\.\/[^"']+)["']\s*\)/g))
      dynamic.push(path.posix.join(path.posix.dirname(file), m[1]));
  }
  const html = await readFile(new URL(page, dist), "utf8");
  seen.set(page, { bytes: Buffer.byteLength(html), how: "first" });
  for (const m of html.matchAll(/<script type="module" src="\/([^"]+)"/g)) await add(m[1], "first");
  for (const m of html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)) await add(m[1], "first");
  const onDemand = [];
  for (const file of dynamic.splice(0)) {
    if (homeLater.has(file)) await add(file, "later");
    else onDemand.push(file);
  }
  dynamic.push(...onDemand);
  while (dynamic.length) await add(dynamic.shift(), "elsewhere");
  const total = { first: 0, later: 0, elsewhere: 0 };
  for (const { bytes, how } of seen.values()) total[how] += bytes;
  return { total, how: (file) => seen.get(file)?.how };
}

test("the home page stays within its byte budget", async () => {
  const { total, how } = await weight("index.html");
  // Measured at 232,475 and 10,261 bytes after the round 2 merges (the upload
  // form and the WhatsApp choices, 48,045 bytes, now load only where used).
  // Then the accessibility fixes (R-048 to R-065: hover and pressed states,
  // forced colours, focus tokens, one busy state) added 19,591 bytes of CSS
  // and script that every page needs, so the budget rose to 256,000 by
  // decision: measured 252,066.
  assert.ok(total.first <= 256_000, `home page, first load: ${total.first} bytes`);
  assert.ok(total.later <= 17_000, `home page, loaded after it draws: ${total.later} bytes`);
  // The phase-aware drawing (and its date formats) is imported only by the
  // home page, after it has drawn (site/experience.js), never with the page.
  assert.equal(how("home.mjs"), "later");
  // site/datetime.mjs is the one formatter for every date a guest page
  // writes (round 2 review, R-037), so it arrives with guest.js; the byte
  // budget above still holds the page to its weight.
  // The upload form and the WhatsApp choices never load with the home page.
  // Nor does My account, signed in (site/guest-account.js), nor Microsoft and
  // Google sign-in (site/sso.js, 5,900 bytes: only where their buttons are).
  for (const file of ["media-upload.js", "upload-batch.mjs", "guest-whatsapp.js", "gallery-download.js", "guest-account.js", "sso.js"])
    assert.equal(how(file), "elsewhere", `${file} loads with the home page`);
});
