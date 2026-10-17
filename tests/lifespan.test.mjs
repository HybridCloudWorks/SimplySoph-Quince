// How long the site and the photos stay (R-171): the family's decision, kept
// in the runtime event settings as site.lifespan { siteUntil, photosUntil }
// (server/site-settings.mjs), null until decided. Once set, the gallery and
// the thank-you page say it (site/lifespan.mjs); until then nothing does. A
// photo date can never be earlier than the review date the Privacy policy and
// docs/cleanup.md promise (site/policies.mjs retentionReview).
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSettings, siteSettings } from "../server/site-settings.mjs";
import { celebration } from "../site/celebration.mjs";
import { policies, retentionReview } from "../site/policies.mjs";
import { date } from "../site/datetime.mjs";

const repo = new URL("../", import.meta.url);
const settings = (lifespan) => validateSettings({ ...celebration, lifespan });
const refused = (lifespan, why) =>
  assert.throws(() => settings(lifespan), (e) => e.code === "INVALID_SITE_SETTINGS", why);

test("the review date the photos may never end before is the one the retention sentence and the cleanup runbook give", async () => {
  assert.equal(retentionReview, "2027-02-01");
  const day = Date.parse(retentionReview + "T12:00:00Z");
  assert.ok(policies.retention.en.includes(date(day, "en", { weekday: false })), policies.retention.en);
  assert.ok(policies.retention.es.includes(date(day, "es", { weekday: false })), policies.retention.es);
  const cleanup = await readFile(new URL("docs/cleanup.md", repo), "utf8");
  assert.ok(cleanup.includes(`(${retentionReview})`), "docs/cleanup.md names the review date");
});

test("no lifespan is set by default, and blank or null keeps it unset", () => {
  assert.equal(siteSettings({}).lifespan, undefined);
  assert.equal(validateSettings(celebration).lifespan, undefined);
  assert.equal(settings(null).lifespan, null);
  assert.equal(settings({ siteUntil: "", photosUntil: "" }).lifespan, null);
  assert.equal(settings({ siteUntil: null, photosUntil: null }).lifespan, null);
});

test("a lifespan the family sets is kept as days, and either date may be set alone", () => {
  assert.deepEqual(settings({ siteUntil: "2027-06-30", photosUntil: "2027-03-31" }).lifespan, {
    siteUntil: "2027-06-30",
    photosUntil: "2027-03-31",
  });
  assert.deepEqual(settings({ siteUntil: "2027-01-16", photosUntil: "" }).lifespan, { siteUntil: "2027-01-16", photosUntil: null });
  assert.deepEqual(settings({ photosUntil: retentionReview }).lifespan, { siteUntil: null, photosUntil: retentionReview });
});

test("the photos date is never earlier than the promised review date, nor later than the site's", () => {
  refused({ photosUntil: "2027-01-31" }, "one day before the review date");
  refused({ photosUntil: "2027-01-16" }, "the day after the party");
  refused({ siteUntil: "2027-03-01", photosUntil: "2027-03-02" }, "photos past the site");
  // The site stays past the celebration (the reception ends on January 16).
  refused({ siteUntil: "2027-01-15" }, "the site gone on the day itself");
  for (const bad of ["2027-02-30", "02/01/2027", "2027-2-1", 20270201, "2027-02-01T00:00:00Z", {}])
    refused({ photosUntil: bad }, String(bad));
});

// The earliest last day for the site is the party's day (site/lifecycle.mjs
// partyDay): the reception's end, or its start until the end is confirmed.
test("the site may close on the party's own day, never before it, with or without a confirmed reception end", () => {
  const unconfirmed = { ...celebration, reception: { ...celebration.reception, end: null } };
  const check = (site, siteUntil) => validateSettings({ ...site, lifespan: { siteUntil } });
  assert.deepEqual(check(celebration, "2027-01-16").lifespan, { siteUntil: "2027-01-16", photosUntil: null });
  assert.throws(() => check(celebration, "2027-01-15"), (e) => e.details?.reason === "site-before-party");
  assert.deepEqual(check(unconfirmed, "2027-01-15").lifespan, { siteUntil: "2027-01-15", photosUntil: null });
  assert.throws(() => check(unconfirmed, "2027-01-14"), (e) => e.details?.reason === "site-before-party");
});

// P5-A11Y-07: Admin names the date and the rule instead of a generic refusal.
test("a refused lifespan says which rule it broke, and Admin's form uses the same review date", async () => {
  const reason = (lifespan) => {
    try {
      settings(lifespan);
    } catch (e) {
      return e.details?.reason;
    }
  };
  assert.equal(reason({ photosUntil: "2027-01-31" }), "photos-before-review");
  assert.equal(reason({ siteUntil: "2027-01-15" }), "site-before-party");
  assert.equal(reason({ siteUntil: "2027-03-01", photosUntil: "2027-03-02" }), "site-before-photos");
  const admin = await readFile(new URL("site/admin-experience.js", repo), "utf8");
  assert.ok(admin.includes(`const reviewDay = "${retentionReview}";`), "Admin's earliest photos date is the review date");
});

test("the gallery, the thank-you page and Privacy's retention item carry an empty, hidden slot for it, and only they load its script", async () => {
  const page = (file) => readFile(new URL("dist/" + file, repo), "utf8");
  for (const lang of ["", "es/"])
    for (const route of ["gallery", "thank-you"]) {
      const html = await page(`${lang}${route}/index.html`);
      assert.ok(html.includes('<p class="lifespan" data-lifespan hidden></p>'), `${lang}${route}`);
      assert.ok(html.includes('<script type="module" src="/lifespan.mjs"></script>'), `${lang}${route}`);
    }
  // Privacy (R-171): at the end of its summary item on how long we keep
  // information, after the review-date sentence it falls back to.
  for (const [file, lang] of [
    ["privacy/index.html", "en"],
    ["es/privacy/index.html", "es"],
  ]) {
    const html = await page(file);
    assert.ok(html.includes(`<li>${policies.retentionItem[lang].slice(2)} <span data-lifespan hidden></span></li>`), file);
    assert.equal(html.match(/data-lifespan/g).length, 1, file);
    assert.ok(html.includes('<script type="module" src="/lifespan.mjs"></script>'), file);
  }
  assert.ok(policies.retentionItem.en.includes(policies.retention.en.slice(1)) && policies.retentionItem.es.includes(policies.retention.es.slice(1)));
  for (const file of ["index.html", "es/index.html", "share/index.html", "details/index.html", "terms/index.html", "whatsapp/index.html"])
    assert.doesNotMatch(await page(file), /lifespan/, file);
  // It never states a date of its own: every date comes from the settings.
  const script = await readFile(new URL("site/lifespan.mjs", repo), "utf8");
  assert.doesNotMatch(script, /\b20\d\d\b|January|February|enero|febrero/);
});
