// Guest sign-in and My account: the emailed link in the guest's language that
// brings them back to the page they started from, sign-in errors shown next to
// the buttons, the household's RSVP on My account, and contact details saved
// in place.
import { test, expect, mockGoogleSignIn } from "./fixtures.mjs";
import { households } from "./harness.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;

// Requests a sign-in link from the page open now and follows it.
async function signIn(page, harness, email, { button = "Email my sign-in link", proceed = "Continue" } = {}) {
  await page.getByRole("textbox", { name: /Email|Correo/ }).first().fill(email);
  await page.getByRole("button", { name: button }).click();
  const mail = harness.sent.at(-1);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: proceed, exact: true }).click();
  return mail;
}

test("the emailed sign-in link is in the guest’s language and brings them back to the page they started from", async ({
  page,
  harness,
}) => {
  await harness.issueInvitation(households.morales, { locale: "es" });
  await page.goto(harness.url("/es/guestbook/"));
  await page.getByRole("textbox", { name: "Correo electrónico" }).fill(households.morales.email);
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeFocused();

  const mail = harness.sent.at(-1);
  expect(mail.subject).toBe("Tu enlace para entrar · Los XV de Sophia");
  expect(mail.html).toContain("Hola Familia Morales,");
  expect(mail.html).toContain("viernes 15 de enero de 2027");
  expect(mail.html).toContain("¿No lo pediste? Ignora este correo");
  const link = mail.html.match(accountLink)[1];
  expect(link).toMatch(/\/es\/account\/#/);

  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Confirmar acceso" })).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  // Back on the guestbook, signed in.
  await expect(page).toHaveURL(harness.url("/es/guestbook/"));
  await expect(page.getByLabel("Nombre para mostrar")).toBeVisible();
});

test("the sign-in form says which email to use, and a provider’s error shows next to its buttons", async ({
  page,
  harness,
}) => {
  await mockGoogleSignIn(page, {
    sub: "google-subject-stranger",
    email: "stranger@gmail.com",
    email_verified: true,
  });
  await page.goto(harness.url("/account/"));
  await expect(
    page.getByRole("textbox", { name: "Email", exact: true }),
  ).toHaveAccessibleDescription(
    "Use the email where you received your invitation. We’ll email you a one-time link — no password needed.",
  );
  await page.getByRole("button", { name: "Sign in with Google" }).click();
  // The harness has no guest Google sign-in configured: the refusal is shown
  // with the buttons, not in the page-wide note.
  await expect(page.locator(".sso-choices [role=alert]")).toHaveText(
    "This sign-in option is not available yet. Use the emailed sign-in link.",
  );
  await expect(page.locator("#status")).toBeEmpty();
});

test("My account puts the household’s RSVP first, labels contact fields for autofill, and saves in place", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household, {
    invited: { ceremony: true, dinner: true, dance: false },
  });
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/account/"));
  const status = page.locator(".rsvp-status");
  await expect(status).toContainText("You haven’t replied yet.");
  await expect(status.getByRole("link", { name: "RSVP now" })).toHaveAttribute("href", "/rsvp/");

  const email = page.getByRole("textbox", { name: "Contact email" });
  await expect(email).toHaveAttribute("autocomplete", "email");
  await expect(email).toHaveAccessibleDescription(
    `We use it to reach you about the celebration. You still sign in with ${household.email}.`,
  );
  await expect(page.getByText(/does not change your sign-in email/)).toHaveCount(0);
  const phone = page.getByRole("textbox", { name: "Phone", exact: true });
  await expect(phone).toHaveAttribute("type", "tel");
  await expect(phone).toHaveAttribute("inputmode", "tel");
  await expect(phone).toHaveAttribute("autocomplete", "tel");
  await expect(page.getByRole("textbox", { name: "Mailing address" })).toHaveAttribute(
    "autocomplete",
    "street-address",
  );
  // Signing out of every device comes after the page's content.
  expect(
    await page.evaluate(
      () =>
        !!(
          document.querySelector("#family-chat").compareDocumentPosition(
            document.querySelector("#guest-logout-all"),
          ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);

  await phone.fill("817 555 0100");
  const save = page.getByRole("button", { name: "Save contact details" });
  await save.click();
  const saved = page.getByText("Contact details saved.");
  await expect(saved).toBeFocused();
  await expect(saved).toHaveAttribute("role", "status");
  await expect(page.locator("#status")).toBeEmpty();
  await save.click();
  await expect(saved).toBeFocused();

  // After an RSVP, the account shows the answer and a way to change it.
  await page.getByRole("link", { name: "RSVP now" }).click();
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await page.goto(harness.url("/account/"));
  await expect(status).toContainText(
    "Ceremony 2 adults/teens, 1 child · Dinner 2 adults/teens, 1 child — saved Oct 1",
  );
  await expect(status.getByRole("link", { name: "Change your RSVP" })).toHaveAttribute(
    "href",
    "/rsvp/",
  );
});

test("WhatsApp takes a number written with spaces and dashes, and asks for the country code when it is missing", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const updates = page.locator("#whatsapp-preferences");
  const number = updates.getByRole("textbox", { name: "WhatsApp phone" });
  await expect(number).toHaveAccessibleDescription(
    "Include the country code: +1 for the US and Canada, +52 for Mexico. Spaces and dashes are fine.",
  );
  await updates.getByRole("checkbox").check();

  await number.fill("817 555 0199");
  await updates.getByRole("button", { name: "Save and verify in WhatsApp" }).click();
  await expect(updates.locator(".error")).toHaveText(
    "Add the country code at the start: +1 for the US and Canada, +52 for Mexico.",
  );
  expect((await harness.ledger.read()).whatsappPending ?? {}).toEqual({});

  await number.fill("+1 (817) 555-0199");
  await updates.getByRole("button", { name: "Save and verify in WhatsApp" }).click();
  await expect(updates.getByRole("link", { name: /Verify in WhatsApp/ })).toBeVisible();
  expect((await harness.ledger.read()).whatsappPending[household.id].phone).toBe("+18175550199");
});

