// Admin → Invitations works from the Notion Status column (server/status.mjs):
// each household shows it, the page filters by it together with the link
// status and the typed text, "select all" covers only the households in view,
// and "Share by text" opens a text on the family's own phone without the
// website sending or recording anything. Synthetic data only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

test("Invitations: Notion Status badges, filters, select-all in view, Share by text", async ({ page, context, harness }) => {
  const { rivera, morales, planner } = households;
  harness.notion.setStatus(rivera.id, "Waiting");
  harness.notion.setStatus(morales.id, "Invited");
  // Garcia has the column but no value; Morales has a Spanish link.
  harness.notion.setStatus(planner.id, null);
  await harness.issueInvitation(morales, { locale: "es" });
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/guests/"));
  const row = (h) => page.locator(`tr[data-guest-row][data-name="${h.name}"]`);
  await expect(row(rivera)).toContainText("Notion: Waiting");
  await expect(row(morales)).toContainText("Notion: Invited");
  await expect(row(planner)).not.toContainText("Notion:");
  const notionFilter = page.getByLabel("Notion status"),
    linkFilter = page.locator("select[name=status]"),
    text = page.getByLabel("Filter guests"),
    selectAll = page.getByRole("checkbox", { name: "Select all shown households" }),
    selected = page.locator("[data-selected-count]"),
    // By row, not by role: a hidden row's box is out of the accessibility tree.
    box = (h) => row(h).locator("[data-select]");

  // Notion status alone.
  await expect(notionFilter.locator("option", { hasText: "Waiting (1)" })).toHaveCount(1);
  await expect(notionFilter.locator("option", { hasText: "No status (1)" })).toHaveCount(1);
  await notionFilter.selectOption("Waiting");
  await expect(row(rivera)).toBeVisible();
  await expect(row(morales)).toBeHidden();
  await expect(row(planner)).toBeHidden();
  await notionFilter.selectOption("none");
  await expect(row(planner)).toBeVisible();
  await expect(row(rivera)).toBeHidden();

  // AND with the link status and the text.
  await notionFilter.selectOption("");
  await linkFilter.selectOption("issued");
  await expect(row(morales)).toBeVisible();
  await expect(row(rivera)).toBeHidden();
  await notionFilter.selectOption("Waiting");
  await expect(row(morales)).toBeHidden();
  await notionFilter.selectOption("Invited");
  await expect(row(morales)).toBeVisible();
  await text.fill("rivera");
  await expect(row(morales)).toBeHidden();
  await text.fill("");
  await linkFilter.selectOption("");
  await notionFilter.selectOption("");

  // Select all covers the rows in view only; a row that drops out of view
  // drops out of the selection.
  await notionFilter.selectOption("Waiting");
  await selectAll.check();
  await expect(selected).toHaveText("1 selected");
  await expect(box(rivera)).toBeChecked();
  await expect(box(morales)).not.toBeChecked();
  await expect(box(planner)).not.toBeChecked();
  await notionFilter.selectOption("");
  await expect(selected).toHaveText("1 selected");
  await selectAll.uncheck();
  await expect(selected).toHaveText("Select households to act on them together");
  await selectAll.check();
  await expect(selected).toHaveText("3 selected");
  await notionFilter.selectOption("Invited");
  await expect(selected).toHaveText("1 selected");
  await expect(box(morales)).toBeChecked();
  await expect(box(rivera)).not.toBeChecked();
  await notionFilter.selectOption("");
  await expect(page.getByRole("button", { name: "Create links" })).toBeEnabled();

  // Share by text: an sms: link in the household's language, from the
  // family's own phone; the website sends nothing and the status stays.
  const share = (h) => row(h).getByRole("link", { name: "Share by text" });
  await expect(share(rivera)).toHaveAttribute("href", /^sms:\+18175550101\?&body=You%27re%20invited/);
  await expect(share(morales)).toHaveAttribute("href", /^sms:\+18175550102\?&body=%C2%A1Est%C3%A1s%20invitado/);
  await expect(share(morales)).toHaveAttribute("href", /SOPHIA%20al%20682-786-8002/);
  await row(morales).getByText("The text").click();
  await expect(row(morales).locator("[data-share-words]")).toHaveText(
    "¡Estás invitado a los XV de Sophia el 15 de enero! Manda SOPHIA al 682-786-8002 para recibir tu enlace de invitación y avisos por texto.",
  );
  await expect(row(rivera)).toContainText("Sent from your own phone; the website records nothing.");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await row(rivera).getByRole("button", { name: "Copy text" }).click();
  await expect(page.locator("#status")).toContainText("Text copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "You're invited to Sophia's quinceañera on January 15! Text SOPHIA to 682-786-8002 to get your invitation link and updates by text.",
  );
  expect(harness.sent).toEqual([]);
  expect(harness.notion.patches.map((p) => p.properties.Status).filter(Boolean)).toEqual([]);
  expect(harness.notion.page(rivera.id).Status.select.name).toBe("Waiting");
});
