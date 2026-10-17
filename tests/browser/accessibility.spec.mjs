// Accessibility and responsive behaviour that every page shares, in a real
// browser (round 2 review, WS-C): lining figures, one text scale that follows
// the browser's font size, designed hover and pressed states, focus rings on
// dark surfaces, forced colours, 44px targets, link names, the RSVP's phone
// layout and what screen readers are told. Synthetic households only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import {
  guestPages,
  pathOf,
  defaultFontSize,
  serveFonts,
  drawn,
  signIn,
  contrast,
} from "./a11y-helpers.mjs";
import { terms } from "../../site/lexicon.mjs";

// ---- R-048: lining figures ----
// Every visible element whose own text has a digit and is set in Cormorant
// asks for lining figures (a font: shorthand used to reset them to normal).
const oldStyleFigures = (page) =>
  page.evaluate(() => {
    const bad = [];
    let seen = 0;
    for (const el of document.querySelectorAll("body *")) {
      const own = [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent)
        .join("");
      const style = getComputedStyle(el);
      if (!/\d/.test(own) || !/^"?Cormorant/.test(style.fontFamily) || !el.getClientRects().length) continue;
      seen++;
      if (!style.fontVariantNumeric.includes("lining-nums"))
        bad.push(`${el.tagName.toLowerCase()}.${el.className} "${own.trim().slice(0, 24)}": ${style.fontVariantNumeric}`);
    }
    return { seen, bad };
  });

test("serif times, dates and counts use lining figures, in English and Spanish", async ({
  page,
  harness,
  context,
}) => {
  const fonts = await serveFonts(context);
  const { link } = await harness.issueInvitation(households.rivera);
  for (const lang of ["en", "es"])
    // The pages with serif figures (the reception page sets its times in Manrope).
    for (const route of ["", "details", "ceremony", "travel"]) {
      await page.goto(harness.url(pathOf(route, lang)));
      if (!route) await expect(page.locator("[data-countdown] strong").first()).toBeVisible();
      const { seen, bad } = await oldStyleFigures(page);
      expect(seen, `${lang} /${route}: figures in Cormorant`).toBeGreaterThan(0);
      expect(bad, `${lang} /${route}`).toEqual([]);
    }
  // The RSVP form's "up to 2 adults/teens and 1 child".
  await page.goto(harness.forBrowser(link));
  await expect(page.locator(".allocation")).toContainText("up to 2 adults/teens and 1 child");
  expect((await oldStyleFigures(page)).bad).toEqual([]);
  // With Cormorant itself loaded, the setting inherited from body draws lining
  // figures (Cormorant's own default is old-style: a different width).
  if (!fonts) return test.info().annotations.push({ type: "fonts", description: "MISXV_FONT_CACHE not set: checked computed styles only" });
  await page.goto(harness.url("/"));
  const widths = await page.evaluate(async () => {
    await document.fonts.load('100px "Cormorant Garamond"');
    const probe = (variant) => {
      const s = document.createElement("span");
      s.style.cssText = `position:absolute;white-space:nowrap;font-family:"Cormorant Garamond";font-size:100px;${variant ? "font-variant-numeric:" + variant : ""}`;
      s.textContent = "0123456789";
      document.querySelector("main").append(s);
      const width = s.getBoundingClientRect().width;
      s.remove();
      return width;
    };
    return { inherited: probe(""), lining: probe("lining-nums"), oldStyle: probe("oldstyle-nums"), loaded: document.fonts.check('100px "Cormorant Garamond"') };
  });
  expect(widths.loaded).toBe(true);
  expect(widths.inherited).toBeCloseTo(widths.lining, 1);
  expect(Math.abs(widths.lining - widths.oldStyle)).toBeGreaterThan(5);
});

// ---- R-049 / R-126: one text scale; reflow at 320px, 200% zoom and larger text ----
for (const size of [16, 20, 24])
  for (const lang of ["en", "es"])
    test(`with a ${size}px browser font size, every ${lang === "es" ? "Spanish" : "English"} page fits 320, 360 and 390px${size === 16 ? " and 200% zoom" : ""}`, async ({
      page,
      harness,
    }) => {
      test.setTimeout(120_000);
      await defaultFontSize(page, size);
      const sizes = [[320, 640], [360, 740], [390, 844], ...(size === 16 ? [[640, 400]] : [])];
      const problems = [];
      for (const route of guestPages) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(harness.url(pathOf(route, lang)));
        await drawn(page);
        for (const [width, height] of sizes) {
          await page.setViewportSize({ width, height });
          const m = await page.evaluate(() => ({
            sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            header: document.querySelector("body > header").getBoundingClientRect().height,
            body: getComputedStyle(document.body).fontSize,
            root: getComputedStyle(document.documentElement).fontSize,
          }));
          const at = `${lang} /${route} at ${width}px`;
          if (m.sideways) problems.push(`${at}: scrolls ${m.sideways}px sideways`);
          // Running text follows the browser's size, like every rem label.
          if (m.body !== `${size}px` || m.root !== `${size}px`) problems.push(`${at}: body ${m.body}, root ${m.root}`);
          // One 64px header row, except where the header may take a second
          // row rather than scroll: 24px text, and 20px text on 320px (with
          // the fallback fonts this run draws; with Google Fonts the English
          // header still fits there, the Spanish one, whose RSVP is a longer
          // word, does not).
          const oneRow = size === 16 || (size === 20 && width >= 360);
          if (oneRow && width < 1000 && m.header > 64) problems.push(`${at}: header ${m.header}px`);
        }
      }
      expect(problems).toEqual([]);
    });

// ---- R-036 (fit): the Spanish RSVP pill as site/lexicon.mjs words it ----
test("the Spanish header fits its RSVP pill at 320px with 16, 20 and 24px text", async ({ page, harness }) => {
  test.setTimeout(60_000);
  const label = terms.rsvpPill.es + `<span class="visually-hidden">${terms.rsvpPillHidden.es}</span>`;
  for (const size of [16, 20, 24]) {
    const tab = await page.context().newPage();
    await tab.clock.setFixedTime(harness.now());
    await defaultFontSize(tab, size);
    await tab.setViewportSize({ width: 320, height: 640 });
    await tab.goto(harness.url("/es/"));
    // The label the Spanish header uses (or will), in place of today's.
    await tab.locator(".nav-rsvp").evaluate((pill, html) => (pill.innerHTML = html), label);
    for (const width of [320, 360, 390]) {
      await tab.setViewportSize({ width, height: 640 });
      const m = await tab.evaluate(() => ({
        sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        header: document.querySelector("body > header").getBoundingClientRect().height,
        pill: document.querySelector(".nav-rsvp").getBoundingClientRect().toJSON(),
      }));
      const at = `${size}px text at ${width}px`;
      expect(m.sideways, at).toBe(0);
      expect(m.pill.right, at).toBeLessThanOrEqual(width);
      if (size === 16 || (size === 20 && width >= 360)) expect(m.header, at).toBeLessThanOrEqual(64);
    }
    await expect(tab.getByRole("link", { name: "Confirmar asistencia", exact: true }).first()).toBeVisible();
    await tab.close();
  }
});

test("with 24px text a wide screen gets the compact header, and widening the window closes the menu", async ({
  page,
  harness,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await defaultFontSize(page, 24);
  await page.goto(harness.url("/"));
  // Deliberate: the header's breakpoint is 67.5em, which is 1620px with
  // 24px text, so the full row of links would not fit; the Menu takes them.
  const menu = page.getByRole("button", { name: "Menu" });
  await expect(menu).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeHidden();
  await menu.click();
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  // At the default size the same screen shows the links; the menu that was
  // open closes once its button is gone (site/nav.js follows the stylesheet).
  const other = await page.context().newPage();
  await other.setViewportSize({ width: 1000, height: 800 });
  await other.goto(harness.url("/"));
  await other.getByRole("button", { name: "Menu" }).click();
  await expect(other.getByRole("button", { name: "Close" })).toHaveAttribute("aria-expanded", "true");
  await other.setViewportSize({ width: 1440, height: 900 });
  await expect(other.locator(".menu-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(other.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await other.close();
});

// ---- R-051 / R-052: readable map buttons; "(Jan 16)" on one line ----
test("map buttons use the button text size, and the next-day date never splits", async ({ page, harness }) => {
  for (const lang of ["en", "es"])
    for (const route of ["ceremony", "reception"]) {
      await page.goto(harness.url(pathOf(route, lang)));
      const buttons = page.locator(".venue-actions .button");
      await expect(buttons).toHaveCount(2);
      for (const size of await buttons.evaluateAll((all) => all.map((b) => getComputedStyle(b).fontSize)))
        expect(size, `${lang} /${route}`).toBe("15.2px");
    }
  const lines = (selector, text) =>
    page.evaluate(
      ([selector, text]) => {
        for (const el of document.querySelectorAll(selector)) {
          const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent.replace(/\s/g, " ").includes(text));
          if (!node) continue;
          const at = node.textContent.replace(/\s/g, " ").indexOf(text),
            range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + text.length);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        }
        return 0;
      },
      [selector, text],
    );
  for (const [lang, text] of [["en", "12:30 AM (Jan 16)"], ["es", "12:30 a. m. (16 de enero)"]]) {
    await page.goto(harness.url(pathOf("details", lang)));
    for (const width of [360, 601, 760, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await lines(".schedule-time", text), `${lang} /details/ at ${width}px`).toBe(1);
    }
    await page.goto(harness.url(pathOf("reception", lang)));
    for (const width of [320, 390, 760]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await lines(".venue-schedule dd", text), `${lang} /reception/ at ${width}px`).toBe(1);
    }
  }
});

// ---- R-056: hover and pressed ----
const controls = [
  ["/", ".nav-rsvp", "RSVP pill"],
  ["/", ".hero .button", "hero RSVP"],
  ["/", ".hero .actions > a:not(.button)", "See the schedule"],
  ["/", ".lang-switch", "language pill"],
  ["/", ".footer-nav a", "footer link"],
  ["/faq/", ".faq-list summary", "question"],
  ["/ceremony/", ".venue-actions .burgundy", "burgundy button"],
  ["/ceremony/", ".venue-actions .outline", "outline button"],
  ["/ceremony/", ".venue-actions .plain-button", "text button"],
  ["/contact/", "#email-login [type=submit]", "form button"],
];
// What a state can change: fill, text colour, underline. The colour behind
// the text is the nearest opaque fill (dark surfaces carry their own).
const look = (page, selector) =>
  page.locator(selector).first().evaluate((el) => {
    const s = getComputedStyle(el);
    let under = s.backgroundColor,
      node = el;
    while (/rgba\(.*, 0\)$/.test(under) && node.parentElement) {
      node = node.parentElement;
      under = getComputedStyle(node).backgroundColor;
    }
    return {
      fill: s.backgroundColor,
      color: s.color,
      line: s.textDecorationLine + " " + s.textDecorationThickness,
      under,
      onDark: !!el.closest(".hero, .site-header"),
    };
  });
const boxes = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("a, button, input, select, textarea, summary")]
      .filter((el) => el.getClientRects().length)
      .map((el) => Object.values(el.getBoundingClientRect().toJSON()).map((v) => Math.round(v * 10) / 10).join(",")),
  );
for (const scheme of ["light", "dark"])
  test(`hover and pressed states show on every kind of control, and pressing moves nothing (${scheme})`, async ({
    page,
    harness,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: scheme });
    for (const [path, selector, what] of controls) {
      await page.goto(harness.url(path));
      await page.mouse.move(1, 1);
      const control = page.locator(selector).first();
      await control.scrollIntoViewIfNeeded();
      const rest = await look(page, selector);
      // Hover: a visible change, the clear cue being the underline.
      await control.hover();
      const hover = await look(page, selector);
      expect(hover, `${what}: hover changes something`).not.toEqual(rest);
      if (hover.fill !== rest.fill || hover.color !== rest.color)
        if (!hover.onDark || !/rgba\(.*, 0\)$/.test(hover.fill))
          expect(contrast(hover.color, hover.under), `${what}: hover text contrast`).toBeGreaterThanOrEqual(4.5);
      // Pressed: a colour change only; nothing on the page moves.
      const before = await boxes(page);
      await page.mouse.down();
      const pressed = await look(page, selector);
      expect(await boxes(page), `${what}: nothing moves while pressed`).toEqual(before);
      expect([pressed.fill, pressed.color, pressed.line], `${what}: pressed shows`).not.toEqual([rest.fill, rest.color, rest.line]);
      if (pressed.fill !== rest.fill || pressed.color !== rest.color)
        if (!pressed.onDark || !/rgba\(.*, 0\)$/.test(pressed.fill))
          expect(contrast(pressed.color, pressed.under), `${what}: pressed text contrast`).toBeGreaterThanOrEqual(4.5);
      // Let go somewhere else, so nothing is followed or sent.
      await page.mouse.move(1, 1);
      await page.mouse.up();
    }
  });

test.describe("on a touch screen", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test("a tap leaves no hover state behind", async ({ page, harness }) => {
    await page.goto(harness.url("/"));
    expect(await page.evaluate(() => matchMedia("(hover: hover)").matches)).toBe(false);
    for (const selector of [".nav-rsvp", ".hero .button", ".lang-switch"]) {
      const rest = await look(page, selector);
      await page.locator(selector).hover();
      expect(await look(page, selector), selector).toEqual(rest);
    }
  });
});

// ---- R-065: focus rings on dark surfaces ----
for (const scheme of ["light", "dark"])
  test(`the skip link and the dark note's Close button get a gold ring (${scheme})`, async ({ page, harness }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(harness.url("/contact/"));
    const ring = (locator) => locator.evaluate((el) => getComputedStyle(el).outlineColor);
    const fill = (selector) => page.locator(selector).evaluate((el) => getComputedStyle(el).backgroundColor);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    // The ring sits outside the link, over the dark header.
    expect(contrast(await ring(skip), await fill("body > header"))).toBeGreaterThanOrEqual(3);
    await page.evaluate(async () => (await import("/client.js")).notify("Photos are being prepared."));
    await page.locator(".footer-nav a").last().focus();
    await page.keyboard.press("Tab");
    const close = page.locator("#status").getByRole("button", { name: "Close" });
    await expect(close).toBeFocused();
    expect(contrast(await ring(close), await fill("#status"))).toBeGreaterThanOrEqual(3);
  });

// ---- R-064: forced colours ----
const canvasText = (page) =>
  page.evaluate(() => {
    const p = document.createElement("p");
    p.style.color = "CanvasText";
    document.body.append(p);
    const colour = getComputedStyle(p).color;
    p.remove();
    return colour;
  });
const computed = (page, selector, property, pseudo = null) =>
  page.locator(selector).first().evaluate((el, [property, pseudo]) => getComputedStyle(el, pseudo)[property], [property, pseudo]);
for (const scheme of ["light", "dark"])
  test(`in forced colours the RSVP pill, the schedule divider and the marks stay visible (${scheme})`, async ({
    page,
    harness,
  }) => {
    await page.emulateMedia({ forcedColors: "active", colorScheme: scheme });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(harness.url("/"));
    expect(await computed(page, ".nav-rsvp", "borderTopStyle")).toBe("solid");
    expect(await computed(page, "body > header", "borderBottomStyle")).toBe("solid");
    expect(await computed(page, ".schedule-strip li + li", "borderLeftStyle")).toBe("solid");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await computed(page, ".schedule-strip li + li", "borderTopStyle")).toBe("solid");
    await page.goto(harness.url("/travel/"));
    expect(await computed(page, ".route-strip > * + *", "borderTopStyle")).toBe("solid");
    // The error and success marks are painted in the system's text colour.
    await page.goto(harness.url("/contact/"));
    await page.getByRole("button", { name: "Email my sign-in link" }).click();
    await expect(page.locator(".error-summary")).toBeFocused();
    await page.locator("main").evaluate((main) =>
      main.insertAdjacentHTML("beforeend", '<p class="notice success">Saved.</p><p class="error">Check this.</p>'),
    );
    const text = await canvasText(page);
    for (const selector of [".error-summary", ".notice.success", "p.error:not(:empty)"])
      expect(await computed(page, selector, "backgroundColor", "::before"), selector).toBe(text);
  });

test("outside forced colours the header keeps its 64px and the pill has no border", async ({ page, harness }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harness.url("/"));
  expect((await page.locator("body > header").boundingBox()).height).toBe(64);
  expect(await computed(page, ".nav-rsvp", "borderTopStyle")).toBe("none");
});

// ---- R-060: 44px targets ----
const height = async (locator) => (await locator.boundingBox()).height;
test("standalone links and the Microsoft button are at least 44px tall", async ({ page, harness }) => {
  test.setTimeout(60_000);
  for (const lang of ["en", "es"]) {
    const instead = lang === "es" ? "O entra con Microsoft o Google" : "Sign in with Microsoft or Google instead";
    for (const route of ["rsvp", "share", "guestbook", "contact"]) {
      await page.goto(harness.url(pathOf(route, lang)));
      expect(await height(page.getByRole("link", { name: instead })), `${lang} /${route}`).toBeGreaterThanOrEqual(43.9);
    }
    expect(await height(page.getByRole("main").getByRole("link", { name: "misxv@simplysoph.com" })), "contact email").toBeGreaterThanOrEqual(43.9);
    await page.goto(harness.url(pathOf("", lang)));
    expect(await height(page.locator(".invitation figcaption a")), "full invitation").toBeGreaterThanOrEqual(43.9);
    await page.goto(harness.url(pathOf("travel", lang)));
    for (const link of await page.locator(".route-strip a").all())
      expect(await height(link), "travel venue link").toBeGreaterThanOrEqual(43.9);
    await page.goto(harness.url(pathOf("sms", lang)));
    for (const name of lang === "es" ? ["Términos SMS", "Política de Privacidad"] : ["SMS Terms", "Privacy Policy"])
      expect(await height(page.getByRole("main").getByRole("link", { name, exact: true })), name).toBeGreaterThanOrEqual(43.9);
    await page.goto(harness.url(pathOf("account", lang)));
    const microsoft = page.locator('[data-sso="microsoft"]');
    await expect(microsoft).toBeVisible();
    expect(await height(microsoft), "Microsoft button").toBeGreaterThanOrEqual(44);
  }
});

// ---- R-059 (and R-060 for WhatsApp's links): signed-in forms ----
test("consent checkboxes are 22px in the brand wine, and WhatsApp's links are 44px targets", async ({ page, harness }) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const wine = () => page.evaluate(() => {
    const p = document.createElement("p");
    p.style.color = "var(--wine)";
    document.body.append(p);
    const colour = getComputedStyle(p).color;
    p.remove();
    return colour;
  });
  const updates = page.locator("#whatsapp-preferences");
  await expect(updates.getByRole("checkbox")).toBeVisible();
  const boxes = [[updates.getByRole("checkbox"), "WhatsApp consent"]];
  for (const name of ["WhatsApp program details", "Privacy policy"])
    expect(await height(updates.getByRole("link", { name })), name).toBeGreaterThanOrEqual(43.9);
  const check = async (box, what) => {
    const { width, height: tall } = await box.boundingBox();
    expect(Math.round(width), what).toBe(22);
    expect(Math.round(tall), what).toBe(22);
    expect(await box.evaluate((el) => getComputedStyle(el).accentColor), what).toBe(await wine());
  };
  for (const [box, what] of boxes) await check(box, what);
  await page.goto(harness.url("/guestbook/"));
  await check(page.locator("#message").getByRole("checkbox"), "note consent");
  await page.goto(harness.url("/share/"));
  await check(page.locator("#photo").getByRole("checkbox"), "upload consent");
});

// ---- R-062: names ----
// A link's name as a screen reader gets it here: its text, without what is
// hidden from assistive technology (no link on these pages has an aria-label).
const linkNames = (page) =>
  page.locator("body").evaluate((body) =>
    [...body.querySelectorAll("a[href]")]
      .filter((a) => a.getClientRects().length)
      .map((a) => {
        const copy = a.cloneNode(true);
        copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        return [copy.textContent.replace(/\s+/g, " ").trim(), a.getAttribute("href")];
      }),
  );
const sharedNames = (links) => {
  const hrefs = new Map();
  for (const [name, href] of links) hrefs.set(name, new Set([...(hrefs.get(name) || []), href]));
  return [...hrefs].filter(([, set]) => set.size > 1).map(([name]) => name);
};
test("the wordmark says it goes home, and no two calendar or map links share a name", async ({ page, harness }) => {
  for (const [lang, home, add] of [["en", "home", "Add to calendar"], ["es", "inicio", "Agregar al calendario"]]) {
    await page.goto(harness.url(pathOf("details", lang)));
    // (Chromium puts a space before the hidden part: "S MIS XV , home".)
    await expect(page.locator("body > header").getByRole("link", { name: new RegExp(`^S MIS XV ?, ${home}$`) })).toBeVisible();
    for (const route of ["details", "reception", "ceremony"]) {
      await page.goto(harness.url(pathOf(route, lang)));
      expect(sharedNames(await linkNames(page)), `${lang} /${route}`).toEqual([]);
      await expect(page.getByRole("link", { name: add, exact: true })).toHaveCount(0);
    }
    await page.goto(harness.url(pathOf("details", lang)));
    await expect(page.getByRole("link", { name: new RegExp(`^${add} ?: ${lang === "es" ? "Cena" : "Dinner"}$`) })).toHaveCount(1);
    await expect(page.getByRole("link", { name: new RegExp(`^${lang === "es" ? "Mapa ?: Cena" : "Map ?: Dinner"} `) })).toHaveCount(1);
  }
});

// ---- R-057 / R-061 / R-062 on the RSVP's own steps, on a phone ----
test.describe("the RSVP on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("one width for every action, the confirmation's links on the left edge, and unique calendar names", async ({
    page,
    harness,
  }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    await page.goto(harness.forBrowser(link));
    const portal = page.locator("#portal");
    const inner = () =>
      portal.evaluate((el) => {
        const s = getComputedStyle(el);
        return el.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
      });
    const widths = (locator) => locator.evaluateAll((all) => all.map((el) => Math.round(el.getBoundingClientRect().width)));
    // The form: the main button is the panel's width, like the quick answers.
    await expect(page.getByRole("button", { name: "Review response" })).toBeVisible();
    const full = Math.round(await inner());
    expect(await widths(page.getByRole("button", { name: "Review response" }))).toEqual([full]);
    expect(await widths(portal.locator(".quick-answers .button"))).toEqual([full, full]);
    // The legend sits inside its box: no gap in the fieldset's top border.
    for (const fieldset of await portal.locator("fieldset").all()) {
      const [box, legend] = [await fieldset.boundingBox(), await fieldset.locator("legend").boundingBox()];
      expect(legend.y).toBeGreaterThan(box.y);
    }
    // The error summary: a list, one link per event, none broken across
    // lines; the notes under the six counts are six different sentences.
    await page.getByRole("button", { name: "Review response" }).click();
    const summary = portal.locator(".error-summary");
    await expect(summary).toBeFocused();
    await expect(summary.getByRole("listitem")).toHaveText(["Ceremony", "Dinner", "Reception & dance"]);
    for (const a of await summary.getByRole("link").all())
      expect(await a.evaluate((el) => el.getClientRects().length)).toBe(1);
    const notes = await portal.locator(".field-error").allTextContents();
    expect(notes).toHaveLength(6);
    expect(new Set(notes).size).toBe(6);
    // The review: both actions the panel's width, Save first.
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    const actions = portal.locator(".row-actions .button");
    await expect(actions).toHaveText(["Save my RSVP", "Change counts"]);
    expect(await widths(actions)).toEqual([full, full]);
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
    // The confirmation: "Getting there" links start where their heading does.
    const heading = page.getByRole("heading", { name: "Getting there" });
    const textLeft = (locator) =>
      locator.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects()[0].left;
      });
    const start = await textLeft(heading);
    const places = portal.locator(".row-actions a");
    await expect(places).toHaveCount(2);
    for (const place of await places.all()) {
      expect(Math.abs((await textLeft(place)) - start)).toBeLessThan(0.5);
      expect(await height(place)).toBeGreaterThanOrEqual(43.9);
    }
    expect(await widths(page.getByRole("link", { name: "Edit response" }))).toEqual([Math.round(await inner())]);
    expect(sharedNames(await linkNames(page))).toEqual([]);
    for (const name of ["Ceremony", "Dinner", "Reception & dance"])
      await expect(page.getByRole("link", { name: new RegExp(`^Add to calendar ?: ${name}$`) })).toHaveCount(1);
  });
});

// ---- R-082: the My account thread ----
test("My account's thread announces only replies that are new, not a redraw", async ({ page, harness }) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  const id = "0a1b2c3d-9999-4999-8999-000000000001";
  await harness.ledger.transaction((s) => {
    s.messages ??= {};
    s.messages[id] = {
      id,
      householdId: household.id,
      kind: "contact",
      name: household.name,
      text: "Is there parking at the church?",
      state: "pending",
      at: harness.now() - 86_400_000,
      replies: [{ text: "Yes, behind the church.", at: harness.now() - 3_600_000 }],
    };
  });
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const thread = page.locator("#thread"),
    announced = page.locator("#announce");
  await expect(thread).toContainText("Yes, behind the church.");
  // Not a live region: drawing it again would read the whole thread.
  await expect(thread).not.toHaveAttribute("aria-live");
  await expect(announced).toBeEmpty();
  // A minute later the page checks for replies; nothing new, nothing said.
  const poll = () => page.waitForResponse((r) => r.url().includes("/api/messages?poll=1"));
  let checked = poll();
  await page.clock.runFor(61_000);
  await checked;
  await page.clock.runFor(1_000);
  await expect(announced).toBeEmpty();
  // A new reply: only it is announced.
  await harness.ledger.transaction((s) => {
    s.messages[id].replies.push({ text: "And there is a ramp at the side door.", at: harness.now() });
  });
  checked = poll();
  await page.clock.runFor(60_000);
  await checked;
  await page.clock.runFor(1_000);
  await expect(announced).toHaveText("New reply from the family: And there is a ramp at the side door.");
  await expect(thread).toContainText("And there is a ramp at the side door.");
});

// ---- R-126: focus order ----
test("the keyboard reaches the header's controls in reading order, on a phone and a computer", async ({
  page,
  harness,
}) => {
  const order = async (names) => {
    for (const [role, name] of names) {
      await page.keyboard.press("Tab");
      await expect(page.getByRole(role, { name, exact: typeof name === "string" }).first(), String(name)).toBeFocused();
    }
  };
  const home = /^S MIS XV ?, home$/;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(harness.url("/"));
  await order([
    ["link", "Skip to content"],
    ["link", home],
    ["link", "Español"],
    ["link", "RSVP"],
    ["button", "Menu"],
  ]);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(harness.url("/"));
  await order([
    ["link", "Skip to content"],
    ["link", home],
    ...["Schedule", "Travel", "Photos", "Gifts", "Questions", "Contact", "Sign in"].map((n) => ["link", n]),
    ["link", "Español"],
    ["link", "RSVP"],
  ]);
});
