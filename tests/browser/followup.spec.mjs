// After the RSVP (adversarial QA, round 5): a household that declines still
// hears how news and the photos reach it (QA-05); a bookmarked RSVP page
// opened after the session ended says the household replied, from the
// same device note the home page uses (QA-07); the WhatsApp card on the
// Spanish confirmation speaks to the household (QA-08); opening a link while
// the API is down says nothing about answers (QA-09); one file "llegó"
// (QA-10). Synthetic households and made-up photos only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn, tableCard, jpeg } from "./media-helpers.mjs";
import { addressWords } from "../../server/copy-check.mjs";

const next = (page) => page.locator("[data-whats-next]");
const DAY = 86_400_000;

test.describe("with WhatsApp and SMS live", () => {
  test.use({ harnessOptions: { whatsapp: true, sms: true } });

  test("ES: a family that declines by its link still hears how news and the photos reach it, and nothing about what to wear", async ({ page, harness }) => {
    const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: "No podremos asistir" }).click();
    await page.getByRole("button", { name: "Guardar la respuesta" }).click();
    await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
    await expect(page.getByRole("heading", { name: "Gracias por avisarnos." })).toBeVisible();
    await expect(next(page).getByRole("heading", { name: "Lo que sigue" })).toBeVisible();
    await expect(next(page).locator("p")).toHaveText([
      "Envíen SOPHIA al +1 682-786-8002 para recibir nuestros mensajes del evento, como cambios de horario o lugar.",
      "Los mensajes de texto llegan a números móviles de Estados Unidos y Canadá.",
      "¿Fuera de Estados Unidos y Canadá? Entren con su correo para recibir avisos por WhatsApp.",
      "Después de la celebración, compartiremos las fotos de nuestros invitados en la página Fotos; entren con su correo para verlas.",
      "Las novedades de la celebración también se publican en la página de inicio.",
    ]);
    await expect(next(page).getByRole("link", { name: "Fotos" })).toHaveAttribute("href", "/es/gallery/");
    await expect(page.getByRole("main")).not.toContainText(/vestimenta|estacionamiento|hoteles/);
  });

  test("EN: signed in, a family that declines gets What's next with the WhatsApp card; the Spanish card speaks to the household", async ({ page, harness }) => {
    const household = households.rivera;
    await harness.issueInvitation(household);
    await page.goto(harness.url("/rsvp/"));
    await signIn(page, harness, household.email);
    await page.getByRole("button", { name: "We can’t make it" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
    await expect(next(page)).toContainText("Outside the US and Canada? You can sign up for WhatsApp updates below.");
    await expect(next(page)).toContainText("After the celebration, we’ll share our guests’ photos on the Photos page.");
    await expect(next(page)).not.toContainText(/dress code|parking|hotel/);
    const card = page.locator("details.card").filter({ hasText: "Optional: WhatsApp updates" });
    await expect(card).toBeVisible();

    // QA-08: the same page in Spanish (ustedes) keeps one form of address,
    // the WhatsApp card included (its consent is the guest's own words).
    await page.goto(harness.url("/es/rsvp/confirmed/"));
    const spanish = page.locator("details.card").filter({ hasText: "Opcional: avisos por WhatsApp" });
    await spanish.locator("summary").click();
    await expect(spanish.getByText("Idioma de los mensajes")).toBeVisible();
    const text = (await page.locator("#portal").innerText()).replace(/Acepto recibir[^\n]*/, "");
    expect(addressWords(text).tu).toEqual([]);
    await expect(spanish).toContainText("sobre su invitación, su respuesta y los XV de Sophia");
    await expect(spanish).toContainText("No es necesario suscribirse para confirmar asistencia.");
  });
});

test("ES: two days later, a bookmarked RSVP page says the family replied (from this device) instead of asking for an RSVP", async ({ page, harness, setNow }) => {
  const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Vamos todos" }).click();
  await page.getByRole("button", { name: "Guardar la respuesta" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  // The link's session is long gone two days later.
  await setNow(harness.now() + 2 * DAY);
  await page.context().clearCookies();
  for (const path of ["/es/rsvp/confirmed/", "/es/rsvp/"]) {
    await page.goto(harness.url(path));
    const replied = page.locator("#portal .home-replied");
    await expect(replied).toHaveText("Ya respondieron ✓");
    await expect(page.locator("#portal")).toContainText(
      "Este dispositivo recuerda que su familia ya respondió. Para ver o cambiar su respuesta, abran de nuevo su enlace de invitación, del correo o mensaje que les enviamos, o péguenlo aquí abajo.",
    );
    await expect(page.locator("#portal")).not.toContainText("Por favor, confirmen su asistencia");
    // No counts: the device's note has none.
    await expect(page.locator("#portal")).not.toContainText(/adultos|niños/);
    // The way back in is still there.
    await expect(page.getByRole("textbox", { name: "Enlace o código de invitación" })).toBeVisible();
  }
  // The note page says the link can still send the household's note.
  await page.goto(harness.url("/es/guestbook/"));
  await expect(page.locator("#portal")).toContainText("¿Respondiste con tu enlace de invitación? Ábrelo de nuevo y podrás enviarle a Sophia un mensaje desde él sin entrar con tu correo.");
  // Without the device note, the page asks as before.
  await page.evaluate(() => localStorage.clear());
  await page.goto(harness.url("/es/rsvp/"));
  await expect(page.locator("#portal")).toContainText("Por favor, confirmen su asistencia a más tardar el domingo 15 de noviembre.");
  await expect(page.locator("#portal .home-replied")).toHaveCount(0);
});

test("opening an invitation link while the site can't be reached says nothing about answers", async ({ page, harness }) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.route("**/api/invitation-session", (route) => route.abort("connectionreset"));
  await page.goto(harness.forBrowser(link));
  await expect(page.locator("#portal [role=alert]").first()).toHaveText("We couldn't reach the website. Check your connection and try again.");
  await expect(page.locator("#portal")).not.toContainText("answers are still here");
});

test("ES: one file that arrives says “Llegó 1 de 1.”", async ({ page, harness, setNow }) => {
  await setNow(Date.parse("2027-01-15T21:15:00-06:00"));
  const card = await tableCard(harness);
  await page.goto(harness.url("/es/share/#party=" + card.code));
  await page.getByLabel("Elige fotos y videos").setInputFiles([{ name: "IMG_4101.JPG", mimeType: "image/jpeg", buffer: await jpeg(400, 300) }]);
  await page.getByLabel(/Tengo permiso/).check();
  await page.getByRole("button", { name: "Enviar mis fotos y videos" }).click();
  await expect(page.locator("#upload-summary")).toContainText("Llegó 1 de 1. ¡Gracias!");
});
