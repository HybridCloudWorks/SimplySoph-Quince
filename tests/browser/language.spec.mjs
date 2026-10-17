// The Spanish screens site/guest.js draws at runtime (R-034, R-165): every
// state of the RSVP and its confirmation speaks to the household (ustedes),
// including the errors client.js words, and My account speaks to one person
// (tú). server/copy-check.mjs tells the two forms apart, by the words only
// one of them uses; the built pages and the emails are checked in
// tests/language.test.mjs. The WhatsApp card is one phone's own choice and
// keeps its tú; it shows only while WhatsApp is live (off here).
import { test, expect } from "./fixtures.mjs";
import { households, AFTER_DEADLINE } from "./harness.mjs";
import { chooseCounts } from "./rsvp-helpers.mjs";
import { addressWords } from "../../server/copy-check.mjs";

// What the page's main says now, one block per line, without what is hidden
// and without Sophia's own words.
const said = (page) =>
  page.locator("main").evaluate((main) => {
    const copy = main.cloneNode(true);
    copy.querySelectorAll("[hidden], [data-voice], #whatsapp-preferences, template").forEach((el) => el.remove());
    for (const el of copy.querySelectorAll("p, li, h1, h2, h3, label, button, a, summary, legend, option"))
      el.append("\n");
    return copy.textContent;
  });
async function speaksTo(page, form, where) {
  const text = await said(page),
    { tu, ustedes } = addressWords(text);
  if (form === "ustedes") expect(tu, `${where}: tú words on a page for the household\n${text}`).toEqual([]);
  else expect(ustedes, `${where}: ustedes words on a page for one person\n${text}`).toEqual([]);
}
const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/es\/account\/#[A-Za-z0-9_-]{43})"/;

test("the Spanish RSVP speaks to the household on every screen: the code entry, the form and its errors, the review, a failed save and the confirmation", async ({
  page,
  harness,
}) => {
  const household = households.morales;
  await page.goto(harness.url("/es/rsvp/"));
  await expect(page.getByRole("heading", { name: "Abran su invitación" })).toBeVisible();
  await speaksTo(page, "ustedes", "code entry");
  // A form error, worded by client.js for every form: neutral.
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.locator(".error-summary")).toBeVisible();
  await speaksTo(page, "ustedes", "code entry with an error");

  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Familia Morales" })).toBeVisible();
  await expect(page.locator("#portal .deadline")).toHaveText(
    "Por favor, confirmen su asistencia a más tardar el domingo 15 de noviembre.",
  );
  await speaksTo(page, "ustedes", "form");
  await page.getByRole("button", { name: "Revisar la respuesta" }).click();
  await expect(page.locator(".error-summary")).toBeVisible();
  await speaksTo(page, "ustedes", "form with errors");

  await chooseCounts(page, { Ceremonia: [2, 0], Cena: [2, 1], "Recepción y baile": [2, 1] }, ["Adultos / jóvenes", "Niños"]);
  await page.getByRole("button", { name: "Revisar la respuesta" }).click();
  await expect(page.getByRole("heading", { name: "Revisen su respuesta" })).toBeVisible();
  await speaksTo(page, "ustedes", "review");

  // The connection drops on Save: client.js's own words, to the household.
  await page.route("**/api/rsvp", (route) => route.abort());
  await page.getByRole("button", { name: "Guardar la respuesta" }).click();
  await expect(page.locator("#portal .error[role=alert]")).toHaveText(
    "No pudimos conectar con el sitio. Sus respuestas siguen aquí; revisen su conexión e inténtenlo de nuevo.",
  );
  await speaksTo(page, "ustedes", "failed save");
  await page.unroute("**/api/rsvp");

  await page.getByRole("button", { name: "Guardar la respuesta" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  await expect(page.getByRole("heading", { name: "¡Los esperamos con mucha ilusión!" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Entren con su correo para ver fotos y enviarnos mensajes" })).toBeVisible();
  await speaksTo(page, "ustedes", "confirmation");
});

test("a Spanish “no”, its confirmation and the closed RSVP speak to the household too", async ({ page, harness, setNow }) => {
  const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "No podremos asistir" }).click();
  await speaksTo(page, "ustedes", "review of a no");
  await page.getByRole("button", { name: "Guardar la respuesta" }).click();
  await expect(page.getByRole("heading", { name: "Gracias por avisarnos." })).toBeFocused();
  // Thanks once: the heading thanks them, the line under it sends love.
  await expect(page.getByText("Los vamos a extrañar y les mandamos todo nuestro cariño.")).toBeVisible();
  expect((await said(page)).match(/gracias/gi)).toHaveLength(1);
  await speaksTo(page, "ustedes", "confirmation of a no");

  await setNow(AFTER_DEADLINE);
  await page.goto(harness.url("/es/rsvp/"));
  await expect(page.getByRole("heading", { name: "Las respuestas están cerradas" })).toBeVisible();
  await expect(
    page.getByText("Las respuestas cerraron el domingo 15 de noviembre. Para confirmar su asistencia o cambiar su respuesta, escríbannos."),
  ).toBeVisible();
  await speaksTo(page, "ustedes", "closed");
});

test("My account in Spanish speaks to one person, and so does the note page reached from the invitation link", async ({ page, harness }) => {
  const household = households.morales;
  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Familia Morales" })).toBeVisible();
  // The note page (tú), in by the link: one note without signing in.
  await page.goto(harness.url("/es/guestbook/"));
  await expect(page.getByLabel("Tu mensaje")).toBeVisible();
  await speaksTo(page, "tu", "note page");

  // Signed out, My account is the email sign-in (tú).
  await page.context().clearCookies();
  await page.goto(harness.url("/es/account/"));
  await expect(page.getByRole("heading", { name: "Entra con tu correo" })).toBeVisible();
  await speaksTo(page, "tu", "sign-in");
  await page.getByRole("textbox", { name: "Correo electrónico" }).first().fill(household.email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu correo" })).toBeFocused();
  await speaksTo(page, "tu", "check your email");
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === household.email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === household.email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Familia Morales" })).toBeVisible();
  await expect(page.locator(".rsvp-status")).toContainText("Aún no recibimos tu respuesta.");
  await expect(page.locator(".rsvp-status .deadline")).toHaveText(
    "Por favor, confirma tu asistencia a más tardar el domingo 15 de noviembre.",
  );
  await expect(page.locator(".rsvp-status").getByRole("link", { name: "Confirmar asistencia", exact: true })).toHaveAttribute("href", "/es/rsvp/");
  await speaksTo(page, "tu", "My account");
});
