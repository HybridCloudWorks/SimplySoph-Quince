// The court of honor from the runtime event settings (#108): the built page
// waits, then draws the family's court in place of its waiting text, and the
// header gains "Sophia". Made-up names only.
import { test, expect } from "./fixtures.mjs";
import { pathOf } from "./a11y-helpers.mjs";

test("the court page draws the court from the event settings, never from the build", async ({ page, harness }) => {
  const slot = page.locator("[data-court]"),
    waiting = page.locator("[data-court-waiting]");
  await page.goto(harness.url("/court/"));
  await expect(waiting).toBeVisible();
  await expect(slot).toBeHidden();
  const { site } = await harness.admin("site");
  await harness.admin("site", {
    ...site,
    court: [
      { name: "Example Dama", role: "dama", pair: 1, line: { en: "Her cousin", es: "Su prima" } },
      { name: "Example Chambelán", role: "chambelan", pair: 1 },
    ],
  });
  for (const [lang, line] of [
    ["en", "Her cousin"],
    ["es", "Su prima"],
  ]) {
    await page.goto(harness.url(pathOf("court", lang)));
    await expect(slot).toBeVisible();
    await expect(waiting).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Example Dama" })).toBeVisible();
    await expect(slot.getByText(line)).toBeVisible();
    await expect(page.locator(".site-nav").getByRole("link", { name: "Sophia", exact: true })).toHaveAttribute("href", pathOf("court", lang));
  }
});
