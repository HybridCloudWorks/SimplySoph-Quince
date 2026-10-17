// After the party nothing asks for an RSVP or a change of RSVP, nothing is
// promised "soon", and pages speak of the party in the past (L10N-02,
// L10N-03, L10N-05, L10N-10, L10N-48), also on pages built before the party
// (the browser suite's build is): the runtime swap follows the server's
// clock. Synthetic households only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn } from "./media-helpers.mjs";

const AFTER = Date.parse("2027-01-20T12:00:00-06:00");

for (const lang of ["en", "es"]) {
  const es = lang === "es",
    p = (path) => (es ? "/es" : "") + path;
  test(`${lang.toUpperCase()}: pages built before the party stop promising and asking once it is over`, async ({ page, harness, setNow }) => {
    await setNow(AFTER);
    // Questions: the closed answer without "contact us", no "Can I change my RSVP?", no dress code promise.
    await page.goto(harness.url(p("/faq/")));
    const when = page.locator("details", { has: page.locator("summary", { hasText: es ? "¿Hasta cuándo puedo confirmar?" : "When do I need to RSVP?" }) });
    await expect(when.locator("p:not([hidden])")).toHaveText(es ? "El plazo para confirmar terminó el domingo 15 de noviembre de 2026." : "RSVPs closed on Sunday, November 15, 2026.");
    await expect(page.locator("summary", { hasText: es ? "¿Puedo cambiar mi respuesta?" : "Can I change my RSVP?" })).toBeHidden();
    await expect(when.locator("summary")).toBeVisible();
    await expect(page.locator("summary", { hasText: es ? "¿Cómo debo vestirme?" : "What should I wear?" })).toBeHidden();
    // The Schedule and a venue: no dress code or parking promise.
    await page.goto(harness.url(p("/details/")));
    await expect(page.locator(".good-to-know dt", { hasText: es ? "Código de vestimenta" : "Dress code" })).toBeHidden();
    await page.goto(harness.url(p("/ceremony/")));
    // (after the live event settings have redrawn the venue)
    await expect(page.locator("[data-venue] a.calendar-link").first()).toHaveAttribute("href", /^\/api\/calendar\//);
    await expect(page.locator(".venue-parking")).toHaveCount(0);
    // Thank-you, before the family writes its own: thanks in the past.
    await page.goto(harness.url(p("/thank-you/")));
    await expect(page.locator(".editorial p.lead:visible")).toHaveText(es ? "Gracias por celebrar con nosotros." : "Thank you for celebrating with us.");
    await expect(page.getByText(es ? "Esperamos celebrar juntos." : "We look forward to celebrating together.")).toBeHidden();
    // /rsvp/ signed out: closed, and nothing to ask.
    await page.goto(harness.url(p("/rsvp/")));
    const closed = page.locator("#portal .notice").first();
    await expect(closed.getByRole("heading")).toHaveText(es ? "Ya no se reciben respuestas" : "RSVPs are closed");
    await expect(closed).toContainText(es ? "El plazo para confirmar terminó el domingo 15 de noviembre." : "RSVPs closed on Sunday, November 15.");
    await expect(closed).not.toContainText(es ? /escríbannos|cambiar su respuesta/ : /contact us|change your RSVP/i);
    await expect(closed.getByRole("link", { name: es ? "Escríbannos" : "Contact us" })).toHaveCount(0);
  });
}

test("before the party the same pages still promise and ask (the swap is the clock's)", async ({ page, harness }) => {
  await page.goto(harness.url("/faq/"));
  await expect(page.locator("summary", { hasText: "What should I wear?" })).toBeVisible();
  await expect(page.locator("summary", { hasText: "Can I change my RSVP?" })).toBeVisible();
  await page.goto(harness.url("/ceremony/"));
  await expect(page.locator(".venue-parking")).toHaveText("Parking and arrival details will be shared here.");
});

test("My account after the party: the saved answer, no What's next, no deadline or change of RSVP", async ({ page, harness, setNow }) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await setNow(AFTER);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const status = page.locator(".rsvp-status");
  await expect(status).toContainText("Ceremony: 2 adults/teens, 1 child");
  await expect(status).not.toContainText(/deadline|contact us|Change your RSVP/i);
  await expect(page.locator("[data-whats-next]")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Directions" })).toHaveAttribute("href", "/details/");
});
