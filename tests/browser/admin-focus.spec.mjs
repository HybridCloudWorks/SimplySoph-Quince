// Admin pages that draw themselves again keep the family's place
// (P5-A11Y-06), and a lifespan date the server refuses is named, marked and
// tied to its rule (P5-A11Y-07). Synthetic data only.
import { test, expect } from "./fixtures.mjs";

const PARTY_NIGHT = Date.parse("2027-01-15T21:15:00-06:00");

test("Admin → Photos: after each table card action, focus goes to what comes next, and a new code says so", async ({ page, context, harness, setNow }) => {
  await setNow(PARTY_NIGHT);
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/photos/"));
  const card = page.locator("[data-party-card]");
  await card.getByRole("button", { name: "Create the table card" }).focus();
  await page.keyboard.press("Enter");
  const download = card.getByRole("link", { name: "Download the card to print" });
  await expect(download).toBeFocused();
  await expect(page.locator("#status")).toContainText("The table card is on. Download the card below and print it.");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Make a new code" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#status")).toContainText("New code made: cards printed before no longer work.");
  await expect(download).toBeFocused();
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Turn off the table card" }).focus();
  await page.keyboard.press("Enter");
  await expect(card.getByRole("button", { name: "Turn it on with a new code" })).toBeFocused();
});

test("Admin → Website: lifespan dates carry their rule and limits, a refused date is named and marked, and adding an album or saving keeps focus", async ({ page, context, harness }) => {
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/site/"));
  const form = page.locator("#site-settings");
  const site = form.getByRole("textbox", { name: "The site stays up through" }).or(form.getByLabel("The site stays up through"));
  const photos = form.getByLabel("Download your photos by");
  // The rule is read with each date, and the form knows the earliest days.
  for (const input of [site, photos]) await expect(input).toHaveAttribute("aria-describedby", /lifespan-rule/);
  await expect(photos).toHaveAttribute("min", "2027-02-01");
  await expect(site).toHaveAttribute("min", "2027-01-16");
  await expect(page.locator("#lifespan-rule")).toContainText("can’t be before February 1, 2027");
  // Too early: the form says which date and why, on the field itself.
  await photos.fill("2026-12-01");
  await form.getByRole("button", { name: "Save website & calendars" }).click();
  await expect(page.locator(".error-summary")).toContainText("Download your photos by");
  await expect(photos).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(`#${await photos.getAttribute("id")}-error`)).toHaveText("Use February 1, 2027 or later, the review date in the Privacy policy.");
  // Each fine alone, but the photos outlast the site: the server's refusal names the field.
  await photos.fill("2027-03-02");
  await site.fill("2027-03-01");
  await form.getByRole("button", { name: "Save website & calendars" }).click();
  await expect(form.locator(".error[role=alert]")).toHaveText("The site stays up through: use the same day as “Download your photos by” or later.");
  await expect(site).toHaveAttribute("aria-invalid", "true");
  await expect(site).toBeFocused();
  await expect(page.locator(`#${await site.getAttribute("id")}-error`)).toHaveText("The site stays up through: use the same day as “Download your photos by” or later.");
  // Add album: focus lands in the new album, not on the page.
  await site.fill("2027-03-02");
  await form.getByRole("button", { name: "Add album" }).focus();
  await page.keyboard.press("Enter");
  const albums = form.getByLabel("Album ID");
  await expect(albums.last()).toBeFocused();
  // Saved: focus returns to Save, which says it saved.
  await form.getByRole("button", { name: "Save website & calendars" }).click();
  await expect(page.locator("#status")).toContainText("Website settings saved.");
  await expect(page.locator("#site-settings").getByRole("button", { name: "Save website & calendars" })).toBeFocused();
  expect((await harness.admin("site")).site.lifespan).toEqual({ siteUntil: "2027-03-02", photosUntil: "2027-03-02" });
});

test("Admin → Communications: Spanish wording flagged on an announcement takes focus and is counted in the note", async ({ page, context, harness }) => {
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/updates/"));
  const form = page.locator("#announcement");
  await form.getByLabel("English title").fill("Parking");
  await form.getByLabel("English message").fill("Use the north lot.");
  await form.getByLabel("Spanish title").fill("Estacionamiento");
  // tú and ustedes mixed: a warning, never a refusal.
  await form.getByLabel("Spanish message").fill("Puedes usar el estacionamiento norte. Los esperamos.");
  await form.getByRole("button", { name: "Publish on website" }).click();
  const heading = page.getByRole("heading", { name: "Check the Spanish wording" });
  await expect(heading).toBeFocused();
  await expect(page.locator(".copy-warnings")).not.toHaveAttribute("role", /.*/);
  await expect(page.locator("#status")).toContainText("Announcement published. No email sent. Check the Spanish wording: 1 note at the top.");
});
