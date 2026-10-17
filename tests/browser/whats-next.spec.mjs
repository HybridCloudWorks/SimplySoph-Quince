// Family content that is on its way, and how a household hears about it
// (round 2, WS-S2): "What's next" on the RSVP confirmation and My account
// with only the channels the server reports live; "Getting there" labels that
// promise nothing missing and name only the events the household comes to;
// the review that names the household and says when it replaces an answer;
// Questions before and after the deadline; Travel hidden until it has
// content; Google Calendar beside every calendar file. All through the real
// API and the built pages (harness.mjs); the family's content is today's
// (mostly empty), and its filled states are simulated only by
// test-only data on the page (the last test).
import { test, expect } from "./fixtures.mjs";
import { households, AFTER_DEADLINE, DEADLINE } from "./harness.mjs";
import { chooseCounts } from "./rsvp-helpers.mjs";
import { celebration } from "../../site/celebration.mjs";
import { registryDefaults } from "../../server/registry-settings.mjs";

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
const next = (page) => page.locator("[data-whats-next]");
const places = (page) => page.locator("#portal .row-actions a");

// Before: an invitation-link confirmation offered no channel at all, said
// "Ceremony location & parking" with no parking posted, and "Dinner &
// reception location" to a household not coming to dinner.
test("a link-session confirmation says what is coming and how news reaches the household, and promises nothing missing", async ({
  page,
  harness,
}) => {
  const { link } = await harness.issueInvitation(households.rivera, {
    invited: { ceremony: true, dinner: false, dance: true },
  });
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await expect(next(page).getByRole("heading", { name: "What’s next" })).toBeVisible();
  await expect(next(page).locator("p")).toHaveText([
    "We’ll post the dress code, parking details and hotel suggestions on this website soon.",
    "News about the celebration is also posted on the home page.",
  ]);
  await expect(next(page).getByRole("link", { name: "home page" })).toHaveAttribute("href", "/");
  // SMS and WhatsApp are off on this server: neither is offered anywhere.
  await expect(page.getByRole("main").getByText(/Text SOPHIA|WhatsApp/)).toHaveCount(0);
  // Getting there: no parking yet, and no dinner for this household.
  await expect(places(page)).toHaveText(["Ceremony location", "Reception location"]);
  // Calendars for the events they come to, each with Google Calendar beside it.
  for (const name of ["Ceremony", "Reception & dance"])
    await expect(page.getByRole("link", { name: new RegExp(`^Google Calendar ?: ${name.replace("&", "&")} `) })).toHaveCount(1);
  await expect(page.getByRole("link", { name: /^Google Calendar ?: Dinner/ })).toHaveCount(0);
  const google = new URL(await page.getByRole("link", { name: /^Google Calendar ?: Ceremony/ }).getAttribute("href"));
  expect(google.searchParams.get("text")).toBe("Sophia’s quinceañera — Religious ceremony");
  expect(google.searchParams.get("dates")).toBe("20270115T220000Z/20270115T230000Z");
});

test("a household coming only to dinner is pointed to the dinner, in Spanish", async ({ page, harness }) => {
  const { link } = await harness.issueInvitation(households.morales, {
    locale: "es",
    invited: { ceremony: false, dinner: true, dance: true },
  });
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, { Cena: [2, 0], "Recepción y baile": [0, 0] }, ["Adultos / jóvenes", "Niños"]);
  await page.getByRole("button", { name: "Revisar respuesta" }).click();
  await page.getByRole("button", { name: "Guardar mi respuesta" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  await expect(places(page)).toHaveText(["Ubicación de la cena"]);
  await expect(next(page).locator("p").first()).toHaveText(
    "Pronto publicaremos en este sitio el código de vestimenta, los detalles de estacionamiento y las sugerencias de hoteles.",
  );
});

test.describe("while SMS and WhatsApp are live", () => {
  test.use({ harnessOptions: { whatsapp: true, sms: true } });

  test("a link-session confirmation offers the text line and points to the email sign-in for WhatsApp, in English and Spanish", async ({
    page,
    harness,
  }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(next(page)).toContainText("Text SOPHIA to +1 682-786-8002 to hear when they’re posted.");
    await expect(next(page)).toContainText("Texts go to US and Canadian mobile numbers.");
    await expect(next(page).getByRole("link", { name: "+1 682-786-8002" })).toHaveAttribute("href", "sms:+16827868002?body=SOPHIA");
    await expect(next(page)).toContainText("Outside the US and Canada? Sign in with your email to get WhatsApp updates.");
    await expect(next(page).getByRole("link", { name: "Sign in with your email" })).toHaveAttribute("href", "/account/");
    // A pointer, not the WhatsApp form: that needs the email sign-in.
    await expect(page.locator("#whatsapp-preferences")).toHaveCount(0);

    const spanish = await harness.issueInvitation(households.morales, { locale: "es" });
    await page.goto(harness.forBrowser(spanish.link));
    await page.getByRole("button", { name: "Vamos todos" }).click();
    await page.getByRole("button", { name: "Guardar mi respuesta" }).click();
    await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
    await expect(next(page).getByRole("heading", { name: "Lo que sigue" })).toBeVisible();
    await expect(next(page)).toContainText("Envíen SOPHIA al +1 682-786-8002 para enterarse cuando estén publicados.");
    await expect(next(page).getByRole("link", { name: "Entren con su correo" })).toHaveAttribute("href", "/es/account/");
  });

  test("signed in, the confirmation and My account give the same line, with the WhatsApp card below", async ({ page, harness }) => {
    const household = households.rivera;
    await harness.issueInvitation(household);
    await page.goto(harness.url("/rsvp/"));
    await signIn(page, harness, household.email);
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
    await expect(next(page)).toContainText("Text SOPHIA to +1 682-786-8002 to hear when they’re posted.");
    await expect(next(page)).toContainText("Outside the US and Canada? You can sign up for WhatsApp updates below.");
    await expect(page.getByText("Optional: WhatsApp updates")).toBeVisible();

    await page.goto(harness.url("/account/"));
    await expect(page.getByRole("heading", { name: "Messages with us" })).toBeVisible();
    await expect(next(page).getByRole("heading", { name: "What’s next" })).toBeVisible();
    await expect(next(page)).toContainText("Text SOPHIA to +1 682-786-8002 to hear when they’re posted.");
    await expect(next(page)).toContainText("You can sign up for WhatsApp updates below.");
    // The card follows the line.
    expect(
      await page.evaluate(() =>
        Boolean(document.querySelector("[data-whats-next]").compareDocumentPosition(document.querySelector("#whatsapp-preferences")) & Node.DOCUMENT_POSITION_FOLLOWING),
      ),
    ).toBe(true);
    // My account speaks to one person in Spanish.
    await page.goto(harness.url("/es/account/"));
    await expect(next(page)).toContainText("Envía SOPHIA al +1 682-786-8002 para enterarte cuando estén publicados.");
    await expect(next(page)).toContainText("Puedes suscribirte a los avisos por WhatsApp aquí abajo.");
  });
});

test("signed in while SMS and WhatsApp are off, My account says what is coming and offers neither", async ({ page, harness }) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  await expect(page.getByRole("heading", { name: "Messages with us" })).toBeVisible();
  await expect(next(page).locator("p").first()).toHaveText(
    "We’ll post the dress code, parking details and hotel suggestions on this website soon.",
  );
  await expect(next(page).getByText(/Text|WhatsApp/)).toHaveCount(0);
});

// Before: the review never named the household (a quick-answer link opens
// straight on it) and never said that saving replaces the answer on file.
test("the review names the household, and says it replaces the saved answer only when there is one", async ({ page, harness }) => {
  const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
  // A first answer from the email's quick "yes".
  await page.goto(harness.forBrowser(link + ".yes"));
  await expect(page.getByRole("heading", { name: "Revisen su respuesta" })).toBeVisible();
  await expect(page.locator("#portal")).toContainText("Familia Morales");
  await expect(page.getByText("Esto reemplaza su respuesta guardada.")).toHaveCount(0);
  await page.getByRole("button", { name: "Guardar mi respuesta" }).click();
  await expect(page).toHaveURL(harness.url("/es/rsvp/confirmed/"));
  // The quick "no" after a saved yes says it replaces it, before Save.
  await page.goto(harness.forBrowser(link + ".no"));
  await expect(page.getByRole("heading", { name: "Revisen su respuesta" })).toBeVisible();
  await expect(page.locator("#portal")).toContainText("Familia Morales");
  const replaces = page.getByText("Esto reemplaza su respuesta guardada.");
  await expect(replaces).toBeVisible();
  expect(
    await replaces.evaluate((el) => Boolean(el.compareDocumentPosition(document.querySelector("#confirm")) & Node.DOCUMENT_POSITION_FOLLOWING)),
  ).toBe(true);
});

test("editing a saved answer in English says it replaces it; the first answer does not", async ({ page, harness }) => {
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  await expect(page.locator("#portal")).toContainText("Rivera Family");
  await expect(page.getByText("This replaces your saved answer.")).toHaveCount(0);
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await page.getByRole("link", { name: "Edit response" }).click();
  await chooseCounts(page, { Ceremony: [1, 0], Dinner: [1, 0], "Reception & dance": [1, 0] });
  await page.getByRole("button", { name: "Review response" }).click();
  await expect(page.getByText("This replaces your saved answer.")).toBeVisible();
  await expect(page.locator("#portal")).toContainText("Rivera Family");
});

test("Questions links the RSVP until the deadline, then says RSVPs are closed, in English and Spanish", async ({ page, harness, setNow }) => {
  for (const [path, open, rsvp, closed] of [
    ["/faq/", "By Sunday, November 15, 2026.", "/rsvp/", "RSVPs closed on Sunday, November 15, 2026."],
    ["/es/faq/", "A más tardar el domingo 15 de noviembre de 2026.", "/es/rsvp/", "Las respuestas cerraron el domingo 15 de noviembre de 2026."],
  ]) {
    await setNow(DEADLINE - 60_000);
    await page.goto(harness.url(path));
    await page.locator("summary").first().click();
    const answer = page.locator("details").first();
    await expect(answer.getByText(open)).toBeVisible();
    await expect(answer.locator('a[href="' + rsvp + '"]')).toBeVisible();
    await expect(answer.getByText(closed)).toBeHidden();
    // The deadline passes while the page is open: back on the page, it has changed.
    await setNow(AFTER_DEADLINE);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(answer.getByText(closed)).toBeVisible();
    await expect(answer.getByText(open)).toBeHidden();
    await expect(answer.getByRole("link", { name: /contact us|escríbenos/ })).toHaveAttribute("href", path.replace("faq", "contact"));
    // And on a fresh visit.
    await page.reload();
    await page.locator("summary").first().click();
    await expect(page.locator("details").first().getByText(closed)).toBeVisible();
  }
});

test("Travel is linked from nowhere until it has content, yet still opens; the Schedule says the places are a drive apart", async ({ page, harness }) => {
  for (const lang of ["", "/es"]) {
    for (const route of ["/", "/details/", "/ceremony/", "/reception/", "/faq/", "/registry/"]) {
      await page.goto(harness.url(lang + route));
      await expect(page.locator('a[href="/travel/"], a[href="/es/travel/"]')).toHaveCount(0);
    }
    const travel = await page.goto(harness.url(lang + "/travel/"));
    expect(travel.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(lang ? "Viaje" : "Travel");
  }
  await page.goto(harness.url("/details/"));
  const box = page.locator(".good-to-know");
  await expect(box).toContainText("The ceremony and the reception are in different places, so allow time to drive from one to the other.");
  await expect(box).not.toContainText(/minutes|short drive/);
  const dinner = new URL(await page.getByRole("link", { name: /^Google Calendar ?: Dinner/ }).getAttribute("href"));
  expect(dinner.searchParams.get("dates")).toBe("20270116T003000Z/20270116T013000Z");
  expect(dinner.searchParams.get("text")).toBe("Sophia’s quinceañera — Dinner");
  await page.goto(harness.url("/es/details/"));
  await expect(page.locator(".good-to-know")).toContainText("La ceremonia y la recepción son en lugares distintos, así que calcula tiempo para manejar de uno a otro.");
  const cena = new URL(await page.getByRole("link", { name: /^Google Calendar ?: Cena/ }).getAttribute("href"));
  expect(cena.searchParams.get("text")).toBe("XV de Sophia — Cena");
  // The venue pages keep the parking promise on its own line after the live redraw.
  await page.goto(harness.url("/ceremony/"));
  await expect(page.locator(".venue-parking")).toHaveText("Parking and arrival details will be shared here.");
  await expect(page.locator(".venue-details")).toContainText("Please silence your phone and follow the church’s guidance during the ceremony.");
  expect(await page.getByText("Parking and arrival details will be shared here.").count()).toBe(1);
});

// The live event settings were saved with the promise at the end of each
// venue's notes. Until the owner saves them again, the server drops exactly
// that sentence, so the page (which now says it from the family's content)
// never says it twice.
test("event settings saved with the old parking sentence still show the promise once, on its own line", async ({ page, harness }) => {
  await harness.ledger.transaction((s) => {
    s.site = structuredClone({ ...celebration, registries: registryDefaults });
    s.site.ceremony.notes = {
      en: "Please silence your phone and follow the church’s guidance during the ceremony. Parking and arrival details will be shared here.",
      es: "Silencia tu teléfono y sigue las indicaciones de la iglesia durante la ceremonia. Compartiremos aquí los detalles de llegada y estacionamiento.",
    };
    s.site.reception.notes = {
      en: "Dinner and the reception take place at the same venue. Entrance, parking and accessibility details will be shared here.",
      es: "La cena y la recepción serán en el mismo lugar. Compartiremos los detalles de entrada, estacionamiento y accesibilidad.",
    };
  });
  for (const [path, notes, promise] of [
    ["/ceremony/", "Please silence your phone and follow the church’s guidance during the ceremony.", "Parking and arrival details will be shared here."],
    ["/es/reception/", "La cena y la recepción serán en el mismo lugar.", "Compartiremos los detalles de entrada, estacionamiento y accesibilidad."],
  ]) {
    await page.goto(harness.url(path));
    // Redrawn from the live settings (the calendar links move to /api/).
    await expect(page.locator('.venue-details a[href^="/api/calendar/"]').first()).toBeAttached();
    await expect(page.locator(".venue-details > p:not([class])")).toHaveText([notes]);
    await expect(page.locator(".venue-parking")).toHaveText(promise);
    expect(await page.locator(".venue-details").evaluate((el, p) => el.textContent.split(p).length - 1, promise)).toBe(1);
  }
});

// The family's content, once added, reaches the RSVP pages through the data
// the build puts on them (tests/family-slots.test.mjs checks the build). Here
// that data is set on the served page by the test, to show the page uses it.
test("filled-in family content reaches the RSVP: the children's age, parking and a dated what's next", async ({ page, harness }) => {
  await page.route(/\/rsvp\/(confirmed\/)?$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /data-coming="[^"]*"/,
      'data-coming="{&quot;dressCode&quot;:&quot;2026-12-01&quot;}" data-parking-posted data-child-age="12"',
    );
    await route.fulfill({ response, body });
  });
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await chooseCounts(page, { Ceremony: [2, 1], Dinner: [2, 1], "Reception & dance": [2, 1] }, ["Adults / teens (12 and older)", "Children (under 12)"]);
  await page.getByRole("button", { name: "Review response" }).click();
  await page.getByRole("button", { name: "Save my RSVP" }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
  await expect(places(page)).toHaveText(["Ceremony location & parking", "Dinner & reception location"]);
  await expect(next(page).locator("p").first()).toHaveText("We’ll post the dress code on this website by Tuesday, December 1, 2026.");
});
