// Channels and sign-in providers follow the server's real switches: WhatsApp
// (and the SMS pointer) only while live, Microsoft for guests only while
// GUEST_MICROSOFT_SIGN_IN is on; the school/work Microsoft error worded for
// guests and administrators separately; and the receipt in the language of
// the page the RSVP was saved from.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
async function signIn(page, harness, email) {
  await page.getByRole("textbox", { name: /Email|Correo/ }).first().fill(email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: /Email my sign-in link|Enviar enlace de acceso/ }).click();
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();
}

// Before: every verified household was offered WhatsApp, live or not.
test("while the server reports WhatsApp off, nothing offers it: no card on My account or the confirmation, no sign-up on /whatsapp/", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/rsvp/"));
  await signIn(page, harness, household.email);
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await expect(page.getByRole("heading", { name: "We can’t wait to celebrate with you!" })).toBeVisible();
  // (The footer keeps its link to the program's description page.)
  await expect(page.locator("#whatsapp-preferences")).toHaveCount(0);
  await expect(page.getByRole("main").getByText(/WhatsApp/)).toHaveCount(0);

  await page.goto(harness.url("/account/"));
  await expect(page.getByRole("heading", { name: "Messages with us" })).toBeVisible();
  await expect(page.locator("#whatsapp-preferences")).toHaveCount(0);
  await expect(page.getByRole("main").getByText(/WhatsApp/)).toHaveCount(0);

  await page.goto(harness.url("/whatsapp/"));
  await expect(page.getByText("WhatsApp updates haven’t started yet. This page explains how they will work.")).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toBeHidden();
  // SMS is off here too: the page does not send US numbers to it.
  await expect(page.getByText(/you can get text messages instead/)).toBeHidden();
  await page.goto(harness.url("/es/whatsapp/"));
  await expect(page.getByText("Los avisos por WhatsApp aún no empiezan. Esta página explica cómo funcionarán.")).toBeVisible();
});

test.describe("while WhatsApp and SMS are live", () => {
  test.use({ harnessOptions: { whatsapp: true, sms: true } });
  test("/whatsapp/ offers the sign-up and points US and Canadian numbers to SMS", async ({ page, harness }) => {
    await page.goto(harness.url("/whatsapp/"));
    await expect(page.getByRole("main").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByText(/haven’t started yet/)).toBeHidden();
    await expect(page.getByText(/you can get text messages instead/)).toBeVisible();
    await expect(page.getByText("Sign in with the email where you received your invitation.", { exact: false })).toBeVisible();
    // R-094: the Spanish page says the same, in the guest's words, and neither
    // page keeps the old "the email we have for your family".
    await page.goto(harness.url("/es/whatsapp/"));
    await expect(page.getByText("Entra al sitio con el correo donde recibiste tu invitación.", { exact: false })).toBeVisible();
    await expect(page.getByText(/correo que tenemos de (tu|su) familia/)).toHaveCount(0);
    await page.goto(harness.url("/whatsapp/"));
    await expect(page.getByText(/email we have for your family/)).toHaveCount(0);
  });
});

test("guests are offered Microsoft by default (GUEST_MICROSOFT_SIGN_IN on)", async ({ page, harness }) => {
  await page.goto(harness.url("/account/"));
  await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible();
  await page.goto(harness.url("/guestbook/"));
  await expect(page.getByRole("link", { name: "Sign in with Microsoft or Google instead" })).toHaveAttribute(
    "href",
    "/account/?return=guestbook",
  );
});

test.describe("with GUEST_MICROSOFT_SIGN_IN off", () => {
  test.use({ harnessOptions: { guestMicrosoft: false } });
  test("guests see no Microsoft button or link, in English and Spanish; Google stays", async ({ page, harness }) => {
    await page.goto(harness.url("/account/"));
    await expect(page.getByRole("heading", { name: "Or sign in with" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toHaveCount(0);
    await expect(page.locator('[data-sso="google"]')).toHaveCount(1);
    await expect(page.locator(".sso-note")).toHaveText(
      "Use the Google account with the email where you received your invitation. No code or password needed.",
    );
    await page.goto(harness.url("/guestbook/"));
    await expect(page.getByRole("link", { name: "Sign in with Google instead" })).toBeVisible();
    await expect(page.getByText(/Microsoft/)).toHaveCount(0);
    // The RSVP page speaks to the household.
    await page.goto(harness.url("/es/rsvp/"));
    await expect(page.getByRole("link", { name: "O entren con Google" })).toBeVisible();
    // Administrators keep Microsoft.
    await page.goto(harness.url("/admin/login/"));
    await expect(page.getByRole("button", { name: "Sign in with Microsoft" })).toBeVisible();
  });
});

// Before: guests and administrators both read "…or a Simply Soph work account".
test("a school or work Microsoft account gets a guest's explanation on guest pages and an administrator's on admin pages", async ({
  page,
  harness,
}) => {
  await page.route("**/api/probe-sso-error", (route) =>
    route.fulfill({ status: 403, json: { error: "SSO_TENANT_NOT_ALLOWED" } }),
  );
  const message = () =>
    page.evaluate(async () => {
      const { api } = await import("/client.js");
      return api("probe-sso-error").catch((e) => e.message);
    });
  await page.goto(harness.url("/account/"));
  expect(await message()).toBe(
    "This Microsoft account belongs to a school or workplace, so it can’t sign in here. Use the emailed sign-in link (it works with any address) or a personal Outlook or Hotmail account.",
  );
  await page.goto(harness.url("/es/account/"));
  expect(await message()).toBe(
    "Esta cuenta de Microsoft es de una escuela o un trabajo y no puede entrar aquí. Usa el enlace de acceso por correo (funciona con cualquier dirección) o una cuenta personal de Outlook o Hotmail.",
  );
  await page.goto(harness.url("/admin/login/"));
  const admin = await message();
  expect(admin).toBe(
    "This school or work Microsoft account can’t sign in here. Use your simplysoph.com Microsoft 365 account, a personal Microsoft account (Outlook, Hotmail, Live), or the emailed sign-in link.",
  );
  expect(admin).not.toMatch(/Simply Soph work account/);
});

// Before: an English invitation answered from the Spanish page got an English receipt.
test("saving the RSVP from the Spanish page sends the receipt in Spanish, without changing the invitation's language or the guest list", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household, { locale: "en" });
  await page.goto(harness.forBrowser(link).replace("/rsvp/", "/es/rsvp/"));
  await page.getByRole("button", { name: "Vamos todos" }).click();
  const before = harness.sent.length;
  await page.getByRole("button", { name: /^Guardar/ }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  await expect.poll(() => harness.sent.length).toBeGreaterThan(before);
  const receipt = harness.sent.slice(before).find((m) => m.to === household.email);
  expect(receipt.subject).toBe("Recibimos su respuesta · Los XV de Sophia");
  const s = await harness.ledger.read();
  expect(s.invitations[household.id].locale).toBe("en");
  expect(Object.values(s.responses)[0].locale).toBe("es");
  // Nothing about language reaches the family's guest list in Notion.
  for (const patch of harness.notion.patches)
    expect(Object.keys(patch.properties).filter((k) => /language|idioma|locale/i.test(k))).toEqual([]);
});
