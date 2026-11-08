// Admin layout and the household language: the menu folds away and stays
// folded on this device; a link created in Spanish makes the row's Share by
// text Spanish at once, without a reload. Synthetic data only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

test("the admin menu folds to a strip and stays folded after a reload", async ({ page, context, harness }) => {
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/guests/"));
  const menu = page.locator(".admin-shell aside"),
    hide = page.getByRole("button", { name: "Hide the admin menu" });
  await expect(menu.getByRole("link", { name: "Invitations", exact: true })).toBeVisible();
  await expect(hide).toHaveAttribute("aria-expanded", "true");
  const before = await page.locator("#admin-app").evaluate((el) => el.getBoundingClientRect().width);
  await hide.click();
  const show = page.getByRole("button", { name: "Show the admin menu" });
  await expect(show).toHaveAttribute("aria-expanded", "false");
  await expect(menu.getByRole("link", { name: "Invitations", exact: true })).toBeHidden();
  const after = await page.locator("#admin-app").evaluate((el) => el.getBoundingClientRect().width);
  expect(after).toBeGreaterThan(before + 150);
  await page.reload();
  await expect(page.getByRole("button", { name: "Show the admin menu" })).toBeVisible();
  await page.getByRole("button", { name: "Show the admin menu" }).click();
  await expect(menu.getByRole("link", { name: "Invitations", exact: true })).toBeVisible();
});

test("a link created in Spanish makes the row's Share by text Spanish at once", async ({ page, context, harness }) => {
  const { rivera } = households;
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/guests/"));
  const row = page.locator(`tr[data-guest-row][data-name="${rivera.name}"]`),
    share = row.getByRole("link", { name: "Share by text" });
  await expect(share).toHaveAttribute("lang", "en");
  await row.getByText("More", { exact: true }).click();
  await row.getByRole("button", { name: "Review / create link" }).click();
  const form = page.locator("#invitation");
  await form.getByLabel("Language").selectOption("es");
  await form.getByRole("button", { name: "Create private invitation link" }).click();
  await expect(page.locator("#private-link")).toHaveValue(/\/es\/rsvp\/#/);
  await expect(row.getByLabel(`Language for ${rivera.name}`)).toHaveValue("es");
  await expect(share).toHaveAttribute("lang", "es");
  await expect(share).toHaveAttribute("href", /body=%C2%A1Est%C3%A1s%20invitado/);
});

test("opening Share by text marks the household Texted; the filter shows who is left; the mark can be cleared", async ({ page, context, harness }) => {
  const { rivera, morales } = households;
  await context.addCookies([harness.ownerCookie()]);
  // The sms: link must not leave the page in the test browser.
  await page.route(/^sms:/, (route) => route.abort());
  await page.goto(harness.url("/admin/guests/"));
  const row = (h) => page.locator(`tr[data-guest-row][data-name="${h.name}"]`),
    filter = page.locator("select[name=texted]");
  await expect(row(rivera)).not.toContainText("Texted");
  await row(rivera).getByRole("link", { name: "Share by text" }).evaluate((a) => {
    a.addEventListener("click", (e) => e.preventDefault(), { once: true });
    a.click();
  });
  await expect(row(rivera).locator("[data-texted-badge]")).toContainText("Texted");
  // The counts follow the mark at once.
  await expect(filter.locator("option[value=texted]")).toHaveText("Texted (1)");
  await filter.selectOption("not-texted");
  await expect(row(rivera)).toBeHidden();
  await expect(row(morales)).toBeVisible();
  await filter.selectOption("texted");
  await expect(row(rivera)).toBeVisible();
  await expect(row(morales)).toBeHidden();
  // Still marked after a reload: it is saved.
  await page.reload();
  await expect(row(rivera).locator("[data-texted-badge]")).toBeVisible();
  await row(rivera).getByText("More", { exact: true }).click();
  await row(rivera).getByRole("button", { name: "Clear texted mark" }).click();
  await expect(row(rivera).locator("[data-texted-badge]")).toHaveCount(0);
  expect(harness.sent).toEqual([]);
});
