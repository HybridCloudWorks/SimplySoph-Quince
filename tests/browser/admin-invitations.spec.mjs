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

  // Share by text: an sms: link from the family's own phone, in each
  // household's Language (the column on its row); the website sends nothing
  // and the status stays. The panel above has its own language for a one-off
  // text to copy, and never changes the rows.
  const share = (h) => row(h).getByRole("link", { name: "Share by text" });
  const panel = page.locator("#share-panel"),
    panelWords = panel.locator("[data-share-words]"),
    language = panel.getByLabel("Language"),
    rowLanguage = (h) => row(h).getByLabel(`Language for ${h.name}`);
  await expect(panel).toContainText("Sent from your own phone; the website records nothing.");
  await expect(row(rivera).locator("[data-share-words]")).toHaveCount(0);
  await expect(language).toHaveValue("en");
  await expect(panel.getByRole("button", { name: "Copy text" })).toBeEnabled();
  await expect(panelWords).toHaveText(
    "You're invited to Sophia's quinceañera on January 15! Text SOPHIA to 682-786-8002 to join her event texts. Your invitation link will follow by text.",
  );
  // Morales has a Spanish link, so its row starts in Spanish; Rivera in English.
  await expect(rowLanguage(morales)).toHaveValue("es");
  await expect(rowLanguage(rivera)).toHaveValue("en");
  await expect(share(rivera)).toHaveAttribute("href", /^sms:\+18175550101\?&body=You%27re%20invited/);
  await expect(share(morales)).toHaveAttribute("href", /^sms:\+18175550102\?&body=%C2%A1Est%C3%A1s%20invitado/);
  await expect(share(morales)).toHaveAttribute("lang", "es");
  // The panel's language changes its words only.
  await language.selectOption("es");
  await expect(panelWords).toHaveText(
    "¡Estás invitado a los XV de Sophia el 15 de enero! Manda SOPHIA al 682-786-8002 para unirte a los avisos por texto. Tu enlace de invitación te llegará después por texto.",
  );
  await expect(panelWords).toHaveAttribute("lang", "es");
  await expect(share(rivera)).toHaveAttribute("href", /body=You%27re%20invited/);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await panel.getByRole("button", { name: "Copy text" }).click();
  await expect(page.locator("#status")).toContainText("Text copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "¡Estás invitado a los XV de Sophia el 15 de enero! Manda SOPHIA al 682-786-8002 para unirte a los avisos por texto. Tu enlace de invitación te llegará después por texto.",
  );
  // A row's Language is saved and its Share by text follows at once, and
  // after a reload.
  await rowLanguage(rivera).selectOption("es");
  await expect(page.locator("#status")).toContainText("Spanish");
  await expect(share(rivera)).toHaveAttribute("href", /^sms:\+18175550101\?&body=%C2%A1Est%C3%A1s%20invitado/);
  await page.reload();
  await expect(rowLanguage(rivera)).toHaveValue("es");
  await expect(share(rivera)).toHaveAttribute("lang", "es");
  expect(harness.sent).toEqual([]);
  expect(harness.notion.patches.map((p) => p.properties.Status).filter(Boolean)).toEqual([]);
  expect(harness.notion.page(rivera.id).Status.select.name).toBe("Waiting");
});
