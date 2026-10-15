// In-page anchors (the "Skip to content" link's #main) must never be read as
// an invitation or sign-in link, and must not reload the page: before the fix
// the skip link wiped an RSVP in progress and showed "This invitation link
// isn't working", and on /account/ and /admin/login/ it showed a confirm step
// for the token "main". A real link opened in the same tab must still work.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

// Marks the current document so a reload (which starts a new one) shows up.
const markDocument = (page) => page.evaluate(() => (window.__sameDocument = true));
const sameDocument = (page) => page.evaluate(() => window.__sameDocument === true);

// Follows the skip link the way a keyboard user does: focus it, press Enter.
async function useSkipLink(page, name = "Skip to content") {
  const skip = page.getByRole("link", { name });
  await skip.focus();
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
}

test("the skip link keeps an RSVP in progress instead of reloading it", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  const ceremony = page
    .getByRole("main")
    .getByRole("group", { name: /^Ceremony · / });
  await ceremony.getByLabel("Adults / teens").selectOption("2");
  await page
    .getByLabel("Dietary/accessibility needs or song request (optional)")
    .fill("A song for Sophia");
  await markDocument(page);
  await useSkipLink(page);

  expect(await sameDocument(page)).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  await expect(ceremony.getByLabel("Adults / teens")).toHaveValue("2");
  await expect(
    page.getByLabel("Dietary/accessibility needs or song request (optional)"),
  ).toHaveValue("A song for Sophia");
  await expect(page.getByText("This invitation link isn't working.")).toHaveCount(0);
});

test("opening /rsvp/#main shows the invitation form without a broken-link error", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/rsvp/#main"));
  await expect(
    page.getByRole("heading", { name: "Open your invitation" }),
  ).toBeVisible();
  await expect(page.getByText("This invitation link isn't working.")).toHaveCount(0);
  await expect(page.getByLabel("Invitation link or code")).toHaveValue("");
});

test("the skip link on My account does not start a sign-in confirmation", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/account/"));
  await expect(
    page.getByRole("heading", { name: "Sign in with your email" }),
  ).toBeVisible();
  await markDocument(page);
  await useSkipLink(page);

  expect(await sameDocument(page)).toBe(true);
  await expect(page.getByRole("heading", { name: "Confirm sign-in" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sign in with your email" }),
  ).toBeVisible();
});

test("the Spanish skip link on /es/rsvp/ keeps the page as it is", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/es/rsvp/"));
  await expect(
    page.getByRole("heading", { name: "Abre tu invitación" }),
  ).toBeVisible();
  await markDocument(page);
  await useSkipLink(page, "Ir al contenido");

  expect(await sameDocument(page)).toBe(true);
  await expect(page.getByText("Este enlace de invitación no funciona.")).toHaveCount(0);
});

test("the skip link on administrator sign-in does not ask to confirm an email", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/admin/login/"));
  await expect(
    page.getByRole("heading", { name: "Sign in by email" }),
  ).toBeVisible();
  await markDocument(page);
  await useSkipLink(page);

  expect(await sameDocument(page)).toBe(true);
  await expect(page.getByRole("button", { name: "Confirm email" })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sign in by email" }),
  ).toBeVisible();
});

test("an invitation link opened in a tab already on /rsvp/ still opens the RSVP", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.url("/rsvp/"));
  await expect(
    page.getByRole("heading", { name: "Open your invitation" }),
  ).toBeVisible();

  // Same path, new fragment: only the hash changes, so the page must reload
  // itself to read the link.
  await page.goto(harness.forBrowser(link));
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  await expect(page).toHaveURL(harness.url("/rsvp/"));
});
