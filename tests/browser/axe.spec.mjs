// Automated WCAG 2.2 A/AA checks (axe-core) on every guest page and on the
// states the pages change into: the RSVP's error summary, review and
// confirmation, My account signed in, the open menu and a busy save; the home
// page answered, on the day, in the evening and after the party, with a dated
// announcement; the gallery before the party and with photos; the table card's
// page at its limit; the notes list; What's next; a save refused as too late;
// in English and Spanish, light and dark. axe-core is a pinned dev dependency
// (package.json), so `npm ci` installs it and these run in CI from
// node_modules; AXE_CORE, naming an axe.min.js, overrides it. The focused
// checks in accessibility.spec.mjs need no axe.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";
import { households, AFTER_DEADLINE, DEADLINE } from "./harness.mjs";
import { guestPages, pathOf, drawn, signIn, hold } from "./a11y-helpers.mjs";
import { approvedMedia, tableCard, jpeg } from "./media-helpers.mjs";

function axeSource() {
  let installed = null;
  try {
    installed = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
  } catch {
    /* not installed */
  }
  for (const file of [process.env.AXE_CORE, installed])
    if (file && existsSync(file)) return readFileSync(file, "utf8");
  return null;
}
const source = axeSource();
// In CI it is always installed (npm ci), so a missing copy fails there
// instead of skipping every check quietly.
test.skip(!source && !process.env.CI, "axe-core is not installed: run npm ci (it is a dev dependency), or set AXE_CORE to its axe.min.js");

// The page's violations, as "rule: target" lines (empty when clean).
async function violations(page) {
  if (!source) throw new Error("axe-core is not installed: npm ci installs it");
  // Evaluated through the browser's debugger, so the site's CSP still holds.
  if (!(await page.evaluate(() => "axe" in window))) await page.evaluate(source);
  return page.evaluate(async () => {
    const result = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      // Not re-fetching stylesheets: the CSP (rightly) refuses those requests.
      preload: false,
    });
    return result.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(" ")}`));
  });
}
async function bothSchemes(page, where, found) {
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const line of await violations(page)) found.push(`${where} (${scheme}) ${line}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
}

for (const lang of ["en", "es"])
  test(`every ${lang === "es" ? "Spanish" : "English"} page passes axe, light and dark`, async ({ page, harness }) => {
    test.setTimeout(120_000);
    const found = [];
    for (const route of guestPages) {
      await page.goto(harness.url(pathOf(route, lang)));
      await drawn(page);
      await bothSchemes(page, `${lang} /${route}`, found);
    }
    expect(found).toEqual([]);
  });

// The sign-in and Contact states (round 2, wave 2): signed-out My account with
// the code box open, "Check your email", a used link's offer of a new one,
// and Contact signed in.
for (const lang of ["en", "es"])
  test(`sign-in, recovery and Contact states pass axe (${lang})`, async ({ page, harness }) => {
    test.setTimeout(120_000);
    const household = households.rivera;
    await harness.issueInvitation(household);
    const found = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(harness.url(pathOf("account", lang)));
    await drawn(page);
    await page.locator("[data-invitation-way] summary").click();
    await bothSchemes(page, "account, code open", found);
    for (const route of ["rsvp", "contact"]) {
      await page.goto(harness.url(pathOf(route, lang)));
      await page.getByRole("textbox", { name: /^(Email|Correo electrónico)$/ }).fill("not.on.the.list@example.com");
      await page.getByRole("button", { name: /^(Email my sign-in link|Enviar enlace de acceso)$/ }).click();
      await expect(page.locator(".nothing-yet")).toBeVisible();
      await bothSchemes(page, `${route}, check your email`, found);
    }
    // A link opened twice: the second time offers a new one.
    await page.goto(harness.url(pathOf("account", lang)));
    await signIn(page, harness, household.email);
    await expect(page.locator("#family-chat form")).toBeVisible();
    const used = harness.sent.at(-1).html.match(/href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/)[1];
    await page.goto(harness.url(pathOf("contact", lang)));
    await expect(page.locator("#portal .button")).toBeVisible();
    await bothSchemes(page, "contact, signed in", found);
    await page.goto(harness.url(pathOf("account", lang)));
    await page.locator("#guest-logout").click();
    await expect(page.locator("#email-login")).toBeVisible();
    await page.goto(harness.forBrowser(used));
    await page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();
    await expect(page.locator("#portal [role=alert]").first()).not.toBeEmpty();
    await bothSchemes(page, "used link", found);
    expect(found).toEqual([]);
  });

for (const lang of ["en", "es"])
  test(`the RSVP's steps, My account, the open menu and a busy save pass axe (${lang})`, async ({ page, harness }) => {
    test.setTimeout(120_000);
    const household = households.rivera;
    const { link } = await harness.issueInvitation(household, { locale: lang });
    const found = [];
    // The form with its error summary, then the review and a busy save.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(harness.forBrowser(link));
    await page.locator("#response [type=submit]").click();
    await expect(page.locator(".error-summary")).toBeFocused();
    await bothSchemes(page, "RSVP errors", found);
    await page.locator("[data-quick=yes]").click();
    await expect(page.locator("#confirm")).toBeVisible();
    await bothSchemes(page, "RSVP review", found);
    const request = await hold(page, "rsvp");
    await page.locator("#confirm").click();
    await expect(page.locator("#portal")).toHaveAttribute("aria-busy", "true");
    await bothSchemes(page, "RSVP saving", found);
    request.release();
    await expect(page).toHaveURL(/\/rsvp\/confirmed\/$/);
    await bothSchemes(page, "RSVP confirmation", found);
    // The open menu.
    await page.locator(".menu-toggle").click();
    await expect(page.locator(".menu-toggle")).toHaveAttribute("aria-expanded", "true");
    await bothSchemes(page, "menu open", found);
    // My account, signed in.
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(harness.url(pathOf("account", lang)));
    await signIn(page, harness, household.email);
    await expect(page.locator("#family-chat form")).toBeVisible();
    await bothSchemes(page, "My account", found);
    expect(found).toEqual([]);
  });

// R-126: the home page through the celebration (site/lifecycle.mjs, on the
// harness clock): a dated announcement, a household that replied (with the
// device note's "Not your family?"), the morning of January 15 (with parking
// once the family posts it), the evening and after the party.
for (const lang of ["en", "es"])
  test(`the home page's states through the celebration pass axe (${lang})`, async ({ page, context, harness, setNow }) => {
    test.setTimeout(120_000);
    const es = lang === "es",
      home = harness.url(pathOf("", lang)),
      found = [];
    await page.setViewportSize({ width: 390, height: 844 });
    await harness.announce({ title: "Parking", text: "Use the north lot.", titleEs: "Estacionamiento", textEs: "Usen el lote norte." });
    await page.goto(home);
    await expect(page.locator("[data-latest-update] time")).toBeVisible();
    await bothSchemes(page, "dated announcement", found);
    const { link } = await harness.issueInvitation(households.rivera, { locale: lang });
    await page.goto(harness.forBrowser(link));
    await page.locator("[data-quick=yes]").click();
    await page.locator("#confirm").click();
    await expect(page).toHaveURL(/\/rsvp\/confirmed\/$/);
    // The link's session over: the device's note, and the way to forget it.
    await context.clearCookies();
    await page.goto(home);
    await expect(page.locator(".home-forget button")).toBeVisible();
    await bothSchemes(page, "answered", found);
    // The family's parking line, as the build carries it once posted.
    await page.route((url) => ["/", "/es/"].includes(url.pathname), async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace("data-home", `data-home data-parking="${es ? "Estacionamiento de ensayo." : "Fixture parking."}"`) });
    });
    for (const [where, iso] of [
      ["day-of", "2027-01-15T09:00:00-06:00"],
      ["live", "2027-01-15T21:15:00-06:00"],
      ["after", "2027-01-16T12:00:00-06:00"],
    ]) {
      await setNow(Date.parse(iso));
      await page.goto(home);
      await expect(page.locator("[data-home]")).toHaveAttribute("data-phase", where);
      await bothSchemes(page, where, found);
    }
    expect(found).toEqual([]);
  });

// R-126: the photo, note and RSVP states added this round, and a sign-in
// link that has expired (a used one is checked above).
for (const lang of ["en", "es"])
  test(`the gallery, notes, What's next, a refused late save and the table card pass axe (${lang})`, async ({ page, harness, setNow, browser }) => {
    test.setTimeout(120_000);
    const es = lang === "es",
      household = es ? households.morales : households.rivera,
      at = (route) => harness.url(pathOf(route, lang)),
      found = [];
    await page.setViewportSize({ width: 390, height: 844 });
    // Before the party, an empty gallery "opens after the celebration".
    await page.goto(at("gallery"));
    await expect(page.locator(".gallery-panel")).toBeVisible();
    await bothSchemes(page, "gallery, opens after", found);
    // A sign-in link past its 15 minutes offers a new one.
    await page.goto(at("account"));
    await page.getByRole("textbox", { name: /^(Email|Correo electrónico)$/ }).fill(household.email);
    const sent = harness.sent.length;
    await page.getByRole("button", { name: /^(Email my sign-in link|Enviar enlace de acceso)$/ }).click();
    await expect.poll(() => harness.sent.length).toBe(sent + 1);
    await setNow(harness.now() + 16 * 60_000);
    await page.goto(harness.forBrowser(harness.sent.at(-1).html.match(/href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/)[1]));
    await page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();
    await expect(page.getByRole("button", { name: es ? "Envíame un enlace nuevo" : "Send me a new link" })).toBeVisible();
    await bothSchemes(page, "expired sign-in link", found);
    // What's next on the confirmation; then a save refused as too late.
    const { link } = await harness.issueInvitation(household, { locale: lang });
    await page.goto(harness.forBrowser(link));
    await page.locator("[data-quick=yes]").click();
    await page.locator("#confirm").click();
    await expect(page.locator("[data-whats-next]")).toBeVisible();
    await bothSchemes(page, "What's next", found);
    await setNow(DEADLINE - 60_000);
    await page.goto(harness.forBrowser(link));
    await page.locator("[data-quick=no]").click();
    await setNow(AFTER_DEADLINE);
    await page.locator("#confirm").click();
    await expect(page.locator("#portal [role=alert]")).not.toBeEmpty();
    await bothSchemes(page, "refused late save", found);
    // Signed in: the notes list, the gallery with photos, and how long they stay.
    await harness.ledger.transaction((s) => {
      s.messages["note-axe"] = { id: "note-axe", email: "", topic: "", householdId: household.id, accountId: null, name: "Tía Lupe", text: "Feliz cumpleaños.", kind: "guestbook", display: "guests", state: "approved", at: harness.now() - 1000 };
    });
    await page.goto(at("account"));
    await signIn(page, harness, household.email);
    await expect(page.locator("#family-chat")).toBeAttached();
    await page.goto(at("guestbook"));
    await expect(page.locator("[data-notes] article")).toHaveCount(1);
    await bothSchemes(page, "notes list", found);
    await approvedMedia(harness, [
      { id: "55555555-5555-4555-8555-000000000001", album: "event", caption: "First dance" },
      { id: "55555555-5555-4555-8555-000000000002", album: "family" },
      { id: "55555555-5555-4555-8555-000000000003", kind: "video", album: "event" },
    ]);
    const { site } = await harness.admin("site");
    await harness.admin("site", { ...site, lifespan: { siteUntil: "2027-06-30", photosUntil: "2027-03-31" } });
    await page.goto(at("gallery"));
    await expect(page.locator(".download-all a").first()).toBeVisible();
    await expect(page.locator("[data-lifespan]")).toBeVisible();
    await bothSchemes(page, "gallery with photos", found);
    // The table card's page on party night, then at its limit.
    await setNow(Date.parse("2027-01-15T21:15:00-06:00"));
    const card = await tableCard(harness);
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Chicago" });
    await phone.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort("blockedbyclient"));
    const guest = await phone.newPage();
    await guest.clock.setFixedTime(harness.now());
    await guest.goto(card.url.replace("/share/", es ? "/es/share/" : "/share/"));
    await expect(guest.locator(".party-note")).toBeVisible();
    for (const line of await violations(guest)) found.push(`table card ${line}`);
    await harness.ledger.transaction((s) => (s.partyCard.received = 1_000_000));
    await guest.locator("input[type=file]").setInputFiles([{ name: "IMG_4101.JPG", mimeType: "image/jpeg", buffer: await jpeg() }]);
    await guest.locator(".upload-consent input").check();
    await guest.locator("#photo [type=submit]").click();
    await expect(guest.locator("#upload-summary")).not.toBeEmpty();
    await bothSchemes(guest, "table card, at its limit", found);
    await phone.close();
    expect(found).toEqual([]);
  });
