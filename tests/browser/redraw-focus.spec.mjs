// Parts of a page drawn again without a reload keep keyboard focus
// (P5-A11Y-02, WCAG 2.4.3): the home page at its phase boundaries, and the
// venue, Schedule and home schedule strip when the live event settings
// arrive after the guest has tabbed in. "Forget this reply on this device"
// says what it did (P5-A11Y-09). Synthetic households only.
import { test, expect } from "./fixtures.mjs";
import { households, DEADLINE } from "./harness.mjs";

const at = (iso) => Date.parse(iso);
const focusedText = (page) => page.evaluate(() => document.activeElement?.textContent.trim() ?? "");
async function homeAt(page, harness, time) {
  harness.setNow(time);
  await page.clock.install({ time });
  await page.clock.pauseAt(time);
  await page.goto(harness.url("/"));
  await expect(page.locator("[data-home]")).toHaveAttribute("data-phase", /./);
}

test("at 6:30 PM the focused directions link keeps focus while Share your photos takes the lead", async ({ page, harness }) => {
  const start = at("2027-01-15T18:30:00-06:00") - 2000;
  await homeAt(page, harness, start);
  const directions = page.locator("[data-home-actions] > a", { hasText: "Directions to the reception" });
  await directions.focus();
  harness.setNow(start + 3000);
  await page.clock.runFor(3000);
  await expect(page.locator("[data-home-actions] > a.button")).toHaveText("Share your photos");
  await expect(directions).toBeFocused();
});

test("at the RSVP deadline focus moves from the RSVP button that goes away to the action in its place, not to the page", async ({ page, harness }) => {
  const start = DEADLINE - 2000;
  await homeAt(page, harness, start);
  await page.locator("[data-home-actions] > a", { hasText: "RSVP" }).focus();
  harness.setNow(start + 3000);
  await page.clock.runFor(3000);
  await expect(page.locator("[data-countdown]")).toContainText("Until the celebration");
  await expect(page.locator("[data-home-actions] > a").first()).toBeFocused();
  expect(await focusedText(page)).toBe("See the schedule");
});

for (const [path, region] of [
  ["/ceremony/", "[data-venue]"],
  ["/details/", "[data-schedule]"],
  ["/", "[data-schedule-strip]"],
])
  test(`${path}: a guest who tabbed into ${region} before the live settings arrived keeps focus`, async ({ page, harness }) => {
    let release;
    const held = new Promise((resolve) => (release = resolve));
    await page.route("**/api/site", async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(harness.url(path));
    const link = page.locator(`${region} a`).first();
    await link.focus();
    const name = await focusedText(page);
    release();
    // The live settings have arrived (the calendar files come from the API now).
    if (region !== "[data-schedule-strip]")
      await expect(page.locator(`${region} a.calendar-link`).first()).toHaveAttribute("href", /^\/api\/calendar\//);
    else await page.waitForResponse((r) => r.url().endsWith("/api/site")).catch(() => {});
    await page.waitForTimeout(200);
    expect(await focusedText(page)).toBe(name);
    await expect(page.locator(`${region} a`).first()).toBeFocused();
  });

test("Forget this reply on this device says that it forgot, and focus lands on the first action", async ({ page, harness }) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await page.context().clearCookies();
  await page.goto(harness.url("/"));
  const forget = page.getByRole("button", { name: "Forget this reply on this device" });
  await forget.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#announce")).toHaveText("Forgotten on this device. This page no longer knows who replied.");
  await expect(page.locator("[data-home-actions] > a").first()).toBeFocused();
});
