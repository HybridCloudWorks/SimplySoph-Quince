// Shared steps for the accessibility journeys (accessibility.spec.mjs,
// axe.spec.mjs). Synthetic households only (harness.mjs).
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect } from "./fixtures.mjs";
import { routes } from "../../site/content.mjs";
import { pageHref } from "../../site/celebration.mjs";

// Every guest page, in both languages.
export const guestPages = routes
  .map(([route]) => route)
  .filter((route) => !["404", "rsvp/confirmed"].includes(route));
export const pathOf = (route, lang) => pageHref(route, lang);

// The browser's own default font size (Settings > Appearance > Font size:
// 16 Medium, 20 Large, 24 Very large), set before the page loads. Setting the
// root font-size in CSS is not the same thing: media-query em would stay 16px.
export async function defaultFontSize(page, size) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: size, fixed: 13 } });
}

// Google Fonts, served from a local copy when one is given
// (MISXV_FONT_CACHE: a folder of responses named by the SHA-1 of their URL).
// Without it the outside network stays blocked and pages draw the fallback
// fonts; checks that need Cormorant itself then say so and skip that part.
export async function serveFonts(context) {
  const dir = process.env.MISXV_FONT_CACHE;
  if (!dir || !existsSync(dir)) return false;
  await context.route(
    (url) => url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com",
    (route) => {
      const url = route.request().url(),
        file = dir + "/" + createHash("sha1").update(url).digest("hex");
      if (!existsSync(file)) return route.abort("blockedbyclient");
      return route.fulfill({
        body: readFileSync(file),
        contentType: url.includes("fonts.gstatic.com") ? "font/ttf" : "text/css; charset=utf-8",
        headers: { "access-control-allow-origin": "*" },
      });
    },
  );
  return true;
}

// The page's own content has been drawn (the sign-in, RSVP or account panel
// comes from the API after load).
export async function drawn(page) {
  await page.waitForFunction(
    () => [...document.querySelectorAll("#portal, [data-gallery-state]")].every((el) => el.children.length),
  );
}

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
// Signs in with the emailed link, from the page open now.
export async function signIn(page, harness, email) {
  await page.getByRole("textbox", { name: /Email|Correo/ }).first().fill(email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: /Email my sign-in link|Enviar enlace de acceso/ }).click();
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();
}

// Holds every request to an API path (POST only, unless said) until released:
// release() lets it through, release(response) answers it instead.
export async function hold(page, path, { method = "POST" } = {}) {
  let waiting = [],
    held = false,
    open = null;
  await page.route("**/api/" + path, async (route) => {
    if (method && route.request().method() !== method) return route.continue();
    held = true;
    if (open) return open(route);
    await new Promise((resolve) => waiting.push(() => resolve()));
    return open(route);
  });
  return {
    held: () => held,
    release(response) {
      open = (route) => (response ? route.fulfill(response) : route.continue());
      for (const go of waiting) go();
      waiting = [];
    },
  };
}
export const serverError = {
  status: 502,
  contentType: "text/html",
  body: "<!doctype html><title>502 Bad Gateway</title>",
};

// WCAG contrast of two computed colours ("rgb(…)"/"rgba(…)"); alpha is
// composited over the second colour.
export function contrast(text, background) {
  const parse = (c) => c.match(/[\d.]+/g).map(Number);
  const [r, g, b, a = 1] = parse(text),
    [R, G, B] = parse(background);
  const mixed = [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];
  const lum = (rgb) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  const [x, y] = [lum(mixed), lum([R, G, B])].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
