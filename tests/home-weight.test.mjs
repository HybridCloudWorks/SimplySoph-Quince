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
async function weight(page) {
  const seen = new Map();
  async function add(file, how) {
    if (seen.has(file)) return;
    const text = await readFile(new URL(file, dist), "utf8");
    seen.set(file, { bytes: Buffer.byteLength(text), how });
    if (!/\.m?js$/.test(file)) return;
    for (const m of text.matchAll(/(?:import|export)\s[^;]*?from\s*["'](\.\/[^"']+)["']/g))
      await add(path.posix.join(path.posix.dirname(file), m[1]), how);
    for (const m of text.matchAll(/import\(\s*["'](\.\/[^"']+)["']\s*\)/g))
      await add(path.posix.join(path.posix.dirname(file), m[1]), "later");
  }
  const html = await readFile(new URL(page, dist), "utf8");
  seen.set(page, { bytes: Buffer.byteLength(html), how: "first" });
  for (const m of html.matchAll(/<script type="module" src="\/([^"]+)"/g)) await add(m[1], "first");
  for (const m of html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)) await add(m[1], "first");
  const total = { first: 0, later: 0 };
  for (const { bytes, how } of seen.values()) total[how] += bytes;
  return { total, how: (file) => seen.get(file)?.how };
}

test("the home page stays within its byte budget", async () => {
  const { total, how } = await weight("index.html");
  // Measured at 236,000 and 15,300 bytes; a small margin above.
  assert.ok(total.first <= 241_000, `home page, first load: ${total.first} bytes`);
  assert.ok(total.later <= 17_000, `home page, loaded after it draws: ${total.later} bytes`);
  // The phase-aware drawing (and its date formats) is imported only by the
  // home page, after it has drawn (site/experience.js), never with the page.
  assert.equal(how("home.mjs"), "later");
  assert.equal(how("datetime.mjs"), "later");
});
