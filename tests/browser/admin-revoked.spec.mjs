// Admin → Revoked invitations: every household whose link was revoked, each
// restorable with a new link that keeps its events and language. Synthetic
// data only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

test("Revoked invitations lists revoked households and restores one with a new link", async ({ page, context, harness }) => {
  const { morales } = households;
  await harness.issueInvitation(morales, { locale: "es" });
  await harness.admin("revoke", { id: morales.id });
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/revoked/"));
  const row = page.locator(`tr[data-name="${morales.name}"]`);
  await expect(row).toContainText("Español");
  page.once("dialog", (d) => d.accept());
  await row.getByRole("button", { name: "Restore with a new link" }).click();
  const notice = page.locator("#revoked-result .notice");
  await expect(notice).toContainText(`${morales.name} is restored`);
  await expect(notice.locator("textarea")).toHaveValue(/\/es\/rsvp\/#/);
  await expect(row).toHaveCount(0);
  await expect(page.getByText("No revoked invitations.")).toBeVisible();
});
