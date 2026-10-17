// Automated WCAG 2.2 A/AA checks (axe-core) on every guest page and on the
// states the pages change into: the RSVP's error summary, review and
// confirmation, My account signed in, the open menu and a busy save, in
// English and Spanish, light and dark. axe-core is not a dependency of this
// repository: these run where it is installed (npm i --no-save axe-core) or
// where AXE_CORE names its axe.min.js, and are skipped otherwise. The focused
// checks in accessibility.spec.mjs run everywhere.
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { guestPages, pathOf, drawn, signIn, hold } from "./a11y-helpers.mjs";

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
test.skip(!source, "axe-core is not installed: npm i --no-save axe-core, or set AXE_CORE to its axe.min.js");

// The page's violations, as "rule: target" lines (empty when clean).
async function violations(page) {
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
