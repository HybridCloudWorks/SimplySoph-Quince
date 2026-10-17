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
    .getByLabel("Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)")
    .fill("A song for Sophia");
  await markDocument(page);
  await useSkipLink(page);

  expect(await sameDocument(page)).toBe(true);
  await expect(
    page.getByRole("heading", { name: "Rivera Family" }),
  ).toBeVisible();
  await expect(ceremony.getByLabel("Adults / teens")).toHaveValue("2");
  await expect(
    page.getByLabel("Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)"),
  ).toHaveValue("A song for Sophia");
  await expect(page.getByText("This invitation link isn't working.")).toHaveCount(0);
});

// The anchor adds a history entry of its own; before the fix the RSVP read it
// as Back and swapped the review for the form.
test("the skip link on the RSVP review keeps the review, and Back still returns to the form", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  const review = page.getByRole("heading", { name: "Review your response" });
  await expect(review).toBeFocused();
  await markDocument(page);
  await useSkipLink(page);

  expect(await sameDocument(page)).toBe(true);
  await expect(review).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toHaveCount(0);
  // The next Tab goes on from the main content: the review's first button.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save my RSVP" })).toBeFocused();

  // Back undoes the jump, then returns to the form, filled in.
  await page.goBack();
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  await expect(review).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeFocused();
  await expect(
    page.getByRole("main").getByRole("group", { name: /^Ceremony · / }).getByLabel("Adults / teens"),
  ).toHaveValue("2");
});

// The jump made on the form is a step of the form: Back from the review
// after it returns to the form, not to nothing.
test("Back from a review reached after the skip link returns to the form", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
  await useSkipLink(page);
  await page.getByRole("button", { name: "We can’t make it" }).click();
  await expect(page.getByRole("heading", { name: "Review your response" })).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/rsvp\/#main$/);
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review your response" })).toHaveCount(0);
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
  // The RSVP speaks to the household (ustedes).
  await expect(
    page.getByRole("heading", { name: "Abran su invitación" }),
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
