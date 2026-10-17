// Messages that take focus are not live regions too, so they are read once
// (P5-A11Y-10); the error summary's links are 44 px targets (P5-A11Y-11);
// the "Check your email" address breaks inside the screen at 320 px with a
// 24 px default font (P5-A11Y-14). Synthetic households only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn } from "./media-helpers.mjs";
import { serveFonts, defaultFontSize } from "./a11y-helpers.mjs";

test("the RSVP's error summary takes focus without being an alert too, and each of its links is a 44 px target", async ({ page, harness }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Review your RSVP" }).click();
  const summary = page.locator(".error-summary");
  await expect(summary).toBeFocused();
  await expect(summary).not.toHaveAttribute("role", /.*/);
  const links = summary.getByRole("link");
  await expect(links).toHaveText(["Ceremony", "Dinner", "Reception & dance"]);
  for (const box of await links.evaluateAll((all) => all.map((a) => a.getBoundingClientRect().height)))
    expect(box).toBeGreaterThanOrEqual(44);
});

test("My account's saved note takes focus without being a live region too", async ({ page, harness }) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const form = page.locator("#profile-form");
  await form.getByRole("textbox", { name: "Phone" }).fill("+1 817 555 0199");
  await form.getByRole("button", { name: "Save contact details" }).click();
  const note = form.locator(".saved-note");
  await expect(note).toHaveText("Contact details saved.");
  await expect(note).toBeFocused();
  await expect(note).not.toHaveAttribute("role", /.*/);
});

test("“Check your email” fits a 320 px screen with a 24 px default font", async ({ page, context, harness }) => {
  // With the site's own fonts when a local copy is given (MISXV_FONT_CACHE):
  // the address overflowed by 3 px in Manrope.
  if (!(await serveFonts(context))) test.info().annotations.push({ type: "fonts", description: "MISXV_FONT_CACHE not set: fallback fonts" });
  await page.setViewportSize({ width: 320, height: 700 });
  await defaultFontSize(page, 24);
  await page.goto(harness.url("/account/"));
  await page.getByRole("textbox", { name: "Email" }).first().fill("rivera.family@example.com");
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});
