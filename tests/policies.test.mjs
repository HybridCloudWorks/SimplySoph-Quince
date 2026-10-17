// Each policy shows the date it last changed (R-068), from one constant per
// policy in site/policies.mjs. A change to a policy's words must come with a
// new date: the published text (both languages, built by `npm test`'s pretest)
// is fingerprinted and compared with the fingerprint recorded next to the date.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { policyUpdated, updatedOn } from "../site/policies.mjs";

const page = (file) => readFile(new URL("../dist/" + file, import.meta.url), "utf8");
// The policy's words as published: every article on the page, tags removed.
// The "Updated" line itself sits outside the articles.
const words = (html) =>
  [...html.match(/<main[\s\S]*?<\/main>/)[0].matchAll(/<article[\s\S]*?<\/article>/g)]
    .map((m) => m[0])
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export async function fingerprint(route) {
  const text = (await Promise.all([`${route}/index.html`, `es/${route}/index.html`].map(page)))
    .map(words)
    .join("\n");
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

test("each policy shows its Updated date in both languages, from its one constant", async () => {
  assert.deepEqual(Object.keys(policyUpdated).sort(), ["privacy", "sms-terms", "terms"]);
  for (const route of Object.keys(policyUpdated)) {
    assert.match(policyUpdated[route].on, /^\d{4}-\d{2}-\d{2}$/, route);
    for (const [lang, file] of [
      ["en", `${route}/index.html`],
      ["es", `es/${route}/index.html`],
    ]) {
      const main = (await page(file)).match(/<main[\s\S]*?<\/main>/)[0];
      assert.ok(main.includes(`<p class="policy-updated">${updatedOn(route, lang)}</p>`), file);
    }
  }
  assert.equal(updatedOn("privacy", "en"), "Updated October 17, 2026");
  assert.equal(updatedOn("privacy", "es"), "Actualizado el 17 de octubre de 2026");
  assert.equal(updatedOn("terms", "en"), "Updated October 17, 2026");
});

test("a policy's words cannot change without its Updated date changing", async () => {
  for (const route of Object.keys(policyUpdated)) {
    const now = await fingerprint(route);
    assert.equal(
      policyUpdated[route].text,
      now,
      `The ${route} policy's text changed. Set policyUpdated["${route}"] in site/policies.mjs to { on: "<today>", text: "${now}" }.`,
    );
  }
  // The fingerprint reads the words, not the markup around them.
  assert.equal(words("<main><article><p>A  <b>b</b></p></article></main>"), "A b");
  assert.notEqual(words("<main><article>A b</article></main>"), words("<main><article>A c</article></main>"));
});
