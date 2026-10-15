// The header on phones and computers, the bilingual 404 and the home page's
// countdown, in a real browser against the built pages (scripts/build-pages.mjs,
// site/nav.js, site/not-found.js, site/experience.js).
import { test, expect } from "./fixtures.mjs";
import { AFTER_DEADLINE } from "./harness.mjs";

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the header is one 64px row whose Menu button opens and closes the links", async ({
    page,
    harness,
  }) => {
    await page.goto(harness.url("/"));
    const header = page.locator("body > header");
    expect((await header.boundingBox()).height).toBeLessThanOrEqual(64);
    const menu = page.getByRole("button", { name: "Menu" });
    const links = page.getByRole("navigation", { name: "Main navigation" });
    // RSVP, the language switch and the menu are each at least 44px tall.
    for (const target of [
      menu,
      header.getByRole("link", { name: "RSVP" }),
      header.getByRole("link", { name: "Español" }),
    ])
      expect((await target.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toHaveAttribute("aria-controls", "site-nav");
    await expect(links).toBeHidden();

    await menu.click();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(links.getByRole("link")).toHaveText([
      "Schedule",
      "Travel",
      "Photos",
      "Gifts",
      "Questions",
      "Contact",
      "Sign in",
    ]);
    await expect(links.getByRole("link", { name: "Schedule" })).toBeFocused();

    // Escape closes the menu and puts focus back on its button.
    await page.keyboard.press("Escape");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
    await expect(links).toBeHidden();
    await expect(menu).toBeFocused();

    // A tap outside the header closes it too.
    await menu.click();
    await expect(links).toBeVisible();
    await page.getByRole("heading", { name: "Schedule", level: 2 }).click();
    await expect(menu).toHaveAttribute("aria-expanded", "false");

    // Following a link leads to its page with the menu closed.
    await menu.click();
    await links.getByRole("link", { name: "Questions" }).click();
    await expect(page).toHaveURL(/\/faq\/$/);
    await expect(page.getByRole("button", { name: "Menu" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  test("tabbing past the last link closes the menu", async ({ page, harness }) => {
    await page.goto(harness.url("/details/"));
    const menu = page.getByRole("button", { name: "Menu" });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    // Through the seven links, the language switch and RSVP, then the button.
    for (let i = 0; i < 9; i++) await page.keyboard.press("Tab");
    await expect(menu).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(menu).toHaveAttribute("aria-expanded", "false");
  });

  test("the Spanish header fits one row at 320px without sideways scrolling", async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(harness.url("/es/"));
    expect((await page.locator("body > header").boundingBox()).height).toBeLessThanOrEqual(64);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBe(0);
    // The short label is what shows; the full name is what's announced.
    const english = page.getByRole("link", { name: "English", exact: true });
    await expect(english.getByText("EN", { exact: true })).toBeVisible();
    expect((await english.boundingBox()).width).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "Menú" }).click();
    await expect(
      page.getByRole("navigation", { name: "Navegación principal" }).getByRole("link"),
    ).toHaveText(["Programa", "Viaje", "Fotos", "Mesa de regalos", "Preguntas", "Contacto", "Iniciar sesión"]);
  });

  test("the RSVP button is on the first screen of the home page", async ({
    page,
    harness,
  }) => {
    await page.goto(harness.url("/"));
    const rsvp = page.getByRole("main").getByRole("link", { name: "RSVP", exact: true });
    const box = await rsvp.boundingBox();
    expect(box.y + box.height).toBeLessThan(844);
    await expect(page.getByText("Please reply by Sunday, November 15")).toBeVisible();
  });
});

test("on a computer the links are always shown and there is no Menu button", async ({
  page,
  harness,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(harness.url("/ceremony/"));
  await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
  const links = page.getByRole("navigation", { name: "Main navigation" });
  await expect(links).toBeVisible();
  // The ceremony belongs to the Schedule section.
  await expect(links.getByRole("link", { name: "Schedule" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(
    page.getByRole("navigation", { name: "Schedule" }).getByRole("link", { name: "Religious ceremony" }),
  ).toHaveAttribute("aria-current", "page");
});

test("a missing page under /es/ answers 404 in Spanish, with ways back", async ({
  page,
  harness,
}) => {
  const response = await page.goto(harness.url("/es/no-existe/"));
  expect(response.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Página no encontrada");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page).toHaveTitle("Página no encontrada · Los XV de Sophia");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Confirmar asistencia" })).toHaveAttribute("href", "/es/rsvp/");
  await expect(main.getByRole("link", { name: "Programa" })).toHaveAttribute("href", "/es/details/");
  // The address the guest typed stays in the address bar.
  await expect(page).toHaveURL(/\/es\/no-existe\/$/);

  const english = await page.goto(harness.url("/no-such-page/"));
  expect(english.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page not found");
  await expect(page.getByRole("main").getByRole("link", { name: "Schedule" })).toHaveAttribute("href", "/details/");
});

test.describe("the home page countdown", () => {
  const countdown = (page) => page.locator("[data-countdown]");

  test("counts the time left to reply, by the minute", async ({ page, harness }) => {
    // October 1, 18:00 UTC; the deadline is November 15, 11:59 PM Central.
    await page.goto(harness.url("/"));
    await expect(countdown(page)).toHaveText("Left to reply 45 days 11 hours 59 minutes");
    await expect(page.getByText("Please reply by Sunday, November 15")).toBeVisible();
    await page.goto(harness.url("/es/"));
    await expect(countdown(page)).toHaveText("Tiempo para confirmar 45 días 11 horas 59 minutos");
    await expect(page.getByText("Por favor, confirma a más tardar el domingo 15 de noviembre")).toBeVisible();
  });

  test("then counts to the celebration, and disappears once it is over", async ({
    page,
    harness,
    setNow,
  }) => {
    await setNow(AFTER_DEADLINE);
    await page.goto(harness.url("/"));
    await expect(countdown(page)).toHaveText("Until the celebration 60 days 16 hours 0 minutes");
    // No "Please reply by" a date that has passed; the RSVP button stays and
    // opens the closed note with the household's saved answer.
    await expect(page.getByText("Please reply by")).toBeHidden();
    await expect(page.getByRole("main").getByRole("link", { name: "RSVP", exact: true })).toBeVisible();
    await page.goto(harness.url("/es/"));
    await expect(page.getByText("Por favor, confirma a más tardar")).toBeHidden();
    await setNow(Date.parse("2027-01-15T23:00:00Z"));
    await page.goto(harness.url("/"));
    await expect(countdown(page)).toHaveText("Today is the day!");
    await setNow(Date.parse("2027-01-16T07:00:00Z"));
    await page.goto(harness.url("/"));
    await expect(countdown(page)).toBeHidden();
  });
});
