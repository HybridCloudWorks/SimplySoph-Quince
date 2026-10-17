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

// R-161, R-160, R-040: Privacy says what the code does. The table card is
// off until we turn it on, and then works from the ceremony until the end of
// the upload window's last day (site/lifecycle.mjs); its per-phone counts go
// a week after that window closes (server/application.mjs
// forgetPartyPhonesIfDue), not "a week after the celebration". This device's
// "you replied" note holds only yes or no and when. A note kept off the page
// is read by the few people helping us too, not only by "Sophia and her family".
import { milestones } from "../site/lifecycle.mjs";
import { celebration } from "../site/celebration.mjs";
import { event } from "../site/content.mjs";
import { date } from "../site/datetime.mjs";
import { noteWords } from "../site/notes.mjs";
test("Privacy describes the table card, its counts, this device's note and who reads a private note as the code works", async () => {
  const m = milestones({ deadline: event.deadline, site: celebration });
  for (const [lang, file, card, window, counts, device, wrong] of [
    [
      "en",
      "privacy/index.html",
      "the card on the tables is off unless we turn it on",
      `from the start of the ceremony until the end of ${date(m.uploadsUntil - 1, "en", { weekday: false, year: false })} (Fort Worth time)`,
      "we delete those counts a week after sharing from the card closes",
      /On this device: after you RSVP, the site remembers whether your family replied \(yes or no\) and when[^<]*It keeps no name or other detail, and it is deleted the first time you open the site after the party, when you sign out/,
      /during the celebration, anyone at the party|a week after the celebration|only Sophia and her family/,
    ],
    [
      "es",
      "es/privacy/index.html",
      "la tarjeta de las mesas está apagada salvo que la activemos",
      `desde el inicio de la ceremonia hasta el final del ${date(m.uploadsUntil - 1, "es", { weekday: false, year: false })} (hora de Fort Worth)`,
      "borramos esos conteos una semana después de que se cierra el envío desde la tarjeta",
      /En este dispositivo: cuando confirmas tu asistencia, el sitio recuerda si tu familia respondió \(sí o no\) y cuándo[^<]*No guarda ningún nombre ni otro dato, y se borra la primera vez que abres el sitio después de la fiesta, cuando cierras sesión/,
      /durante la celebración, cualquier persona en la fiesta|una semana después de la celebración|solo Sophia y su familia/,
    ],
  ]) {
    const html = (await page(file)).match(/<main[\s\S]*?<\/main>/)[0];
    for (const words of [card, window, counts]) assert.ok(html.includes(words), `${lang}: ${words}`);
    assert.match(html, device, lang);
    assert.doesNotMatch(html, wrong, lang);
    assert.match(noteWords.consentHint[lang], lang === "en" ? /Sophia’s family and the few people helping us/ : /la familia de Sophia y las pocas personas que nos ayudan/);
    for (const v of ["guests", "public"]) assert.doesNotMatch(noteWords.privacy[v][lang], /only Sophia and her family|solo Sophia y su familia/);
  }
  assert.equal(new Date(m.uploadsUntil).toISOString(), "2027-01-18T06:00:00.000Z", "the window ends at midnight after January 17, Fort Worth time");
  // The photo policy says the same of the card.
  assert.match((await page("terms/index.html")).match(/<main[\s\S]*?<\/main>/)[0], /While the table card is on, you can share from it without signing in\./);
});
