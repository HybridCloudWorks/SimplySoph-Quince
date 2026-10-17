// A site that knows what day it is (site/lifecycle.mjs, site/now.mjs,
// site/home.mjs): the home page, the header's RSVP pill, the RSVP page and
// its confirmation at the review's clock walk, on the server's clock even
// when the device's is wrong. The harness clock (server) and Playwright's
// clock (browser) are moved together unless a test skews them on purpose.
import { test, expect } from "./fixtures.mjs";
import { households, DEADLINE, AFTER_DEADLINE } from "./harness.mjs";

const at = (iso) => Date.parse(iso);
const home = {
  hero: (page) => page.locator("[data-home]"),
  status: (page) => page.locator("[data-home-status] p"),
  countdown: (page) => page.locator("[data-countdown]"),
  replyBy: (page) => page.locator("[data-reply-by]"),
  actions: (page) => page.locator("[data-home-actions] > a"),
  primary: (page) => page.locator("[data-home-actions] > a.button"),
  pill: (page) => page.locator("header .nav-rsvp"),
};
const NEW_TAB = { en: " (opens in a new tab)", es: " (se abre en otra pestaña)" };
async function openHome(page, harness, lang = "en") {
  await page.goto(harness.url(lang === "es" ? "/es/" : "/"));
  await expect(home.hero(page)).toHaveAttribute("data-phase", /./);
}
// What a household sees on the home page, checked as a whole.
async function expectHome(page, want, lang = "en") {
  await expect(home.hero(page)).toHaveAttribute("data-phase", want.phase);
  // The invitation's line, or after the party the thanks in its place.
  await expect(page.locator("[data-hero-line]")).toHaveText(
    want.line || (lang === "es" ? "Acompáñennos a celebrar los quince años de Sophia." : "Please join us as Sophia celebrates her fifteenth birthday."),
  );
  if (want.countdown) await expect(home.countdown(page)).toHaveText(want.countdown);
  else await expect(home.countdown(page)).toBeHidden();
  await expect(home.status(page)).toHaveText(want.status || []);
  if (want.replyBy) await expect(home.replyBy(page)).toHaveText(want.replyBy);
  else await expect(home.replyBy(page)).toBeHidden();
  // Only the first action is a button: the main thing to do now.
  await expect(home.primary(page)).toHaveCount(1);
  await expect(home.actions(page).first()).toHaveClass(/\bbutton\b/);
  // "Directions to the ceremony ↗" reads "… (opens in a new tab)" too.
  await expect(home.actions(page)).toHaveText(want.actions.map((a) => a.replace(/\s*↗$/, "↗" + NEW_TAB[lang])));
  if (want.href) await expect(home.primary(page)).toHaveAttribute("href", want.href);
  await expect(home.pill(page))[want.pill ? "toBeVisible" : "toBeHidden"]();
  if (!want.pill) await expect(page.getByRole("main").getByRole("link", { name: /^(RSVP|Confirmar asistencia)$/ })).toHaveCount(0);
}

const church = "Our Lady of Guadalupe Church",
  hall = "The AMZ Event Center";
// The review's clock walk, with what the home page must show at each point.
const walk = [
  ["today, unanswered", "2026-10-17T10:00:00-05:00", {
    phase: "rsvp-open",
    countdown: "Time left to RSVP 29 days 14 hours 59 minutes",
    replyBy: "Please RSVP by Sunday, November 15",
    actions: ["RSVP", "See the schedule→"],
    href: "/rsvp/",
    pill: true,
  }],
  ["a week before the deadline", "2026-11-08T12:00:00-06:00", {
    phase: "rsvp-open",
    countdown: "Time left to RSVP 7 days 11 hours 59 minutes",
    replyBy: "Please RSVP by Sunday, November 15",
    actions: ["RSVP", "See the schedule→"],
    pill: true,
  }],
  ["one second before the deadline", new Date(DEADLINE - 1000).toISOString(), {
    phase: "rsvp-open",
    countdown: "Time left to RSVP 0 days 0 hours 1 minute",
    replyBy: "Please RSVP by Sunday, November 15",
    actions: ["RSVP", "See the schedule→"],
    pill: true,
  }],
  ["the deadline itself", new Date(DEADLINE).toISOString(), {
    phase: "rsvp-closed",
    countdown: "Until the celebration 60 days 16 hours 1 minute",
    actions: ["See the schedule"],
    href: "/details/",
    pill: true,
  }],
  ["one second after the deadline", new Date(DEADLINE + 1000).toISOString(), {
    phase: "rsvp-closed",
    countdown: "Until the celebration 60 days 16 hours 1 minute",
    actions: ["See the schedule"],
    pill: true,
  }],
  ["a week before the celebration", "2027-01-08T12:00:00-06:00", {
    phase: "rsvp-closed",
    countdown: "Until the celebration 7 days 4 hours 0 minutes",
    actions: ["See the schedule"],
    pill: true,
  }],
  ["the morning of January 15", "2027-01-15T09:00:00-06:00", {
    phase: "day-of",
    countdown: "Today is the day!",
    status: [`Next Religious ceremony · 4:00 PM · ${church}`],
    actions: ["Directions to the ceremony ↗", "See the schedule→"],
    href: "https://www.google.com/maps/search/?api=1&query=4100%20Blue%20Mound%20Rd%2C%20Fort%20Worth%2C%20TX%2076106",
    pill: true,
  }],
  ["during the ceremony", "2027-01-15T16:30:00-06:00", {
    phase: "live",
    countdown: "Today is the day!",
    status: [`Now Religious ceremony · 4:00 PM – 5:00 PM · ${church}`, `Next Dinner · 6:30 PM · ${hall}`],
    actions: ["Directions to the ceremony ↗", "See the schedule→"],
    pill: true,
  }],
  ["between the ceremony and dinner", "2027-01-15T17:45:00-06:00", {
    phase: "live",
    countdown: "Today is the day!",
    status: [`Next Dinner · 6:30 PM · ${hall}`],
    actions: ["Directions to the reception ↗", "Share your photos→", "See the schedule→"],
    pill: true,
  }],
  ["one second before dinner", "2027-01-15T18:29:59-06:00", {
    phase: "live",
    countdown: "Today is the day!",
    status: [`Next Dinner · 6:30 PM · ${hall}`],
    actions: ["Directions to the reception ↗", "Share your photos→", "See the schedule→"],
    pill: true,
  }],
  ["dinner: sharing photos leads", "2027-01-15T18:30:00-06:00", {
    phase: "live",
    countdown: "Today is the day!",
    status: [`Now Dinner · 6:30 PM – 7:30 PM · ${hall}`, `Next Reception & dance · 7:30 PM · ${hall}`],
    actions: ["Share your photos", "Directions to the reception ↗", "See the schedule→"],
    href: "/share/#media-upload",
    pill: true,
  }],
  ["9:15 PM, the reception", "2027-01-15T21:15:00-06:00", {
    phase: "live",
    countdown: "Today is the day!",
    status: [`Now Reception & dance · 7:30 PM – 12:30 AM (Jan 16) · ${hall}`],
    actions: ["Share your photos", "Directions to the reception ↗", "See the schedule→"],
    pill: true,
  }],
  ["past midnight, the party still on", "2027-01-16T00:29:59-06:00", {
    phase: "live",
    status: [`Now Reception & dance · 7:30 PM – 12:30 AM (Jan 16) · ${hall}`],
    actions: ["Share your photos", "Directions to the reception ↗", "See the schedule→"],
    pill: true,
  }],
  ...[
    ["the reception's last minute ends", "2027-01-16T00:30:00-06:00"],
    ["January 16 at noon", "2027-01-16T12:00:00-06:00"],
    ["February 15", "2027-02-15T12:00:00-06:00"],
    ["January 2028", "2028-01-15T12:00:00-06:00"],
  ].map(([name, iso]) => [name, iso, {
    phase: "after",
    line: "Thank you for celebrating with us.",
    actions: ["See the photos", "Share your photos→", "Leave Sophia a note→"],
    href: "/gallery/",
    pill: false,
  }]),
];
test.describe("the home page through the celebration", () => {
  for (const [name, iso, want] of walk)
    test(`${name} (${iso})`, async ({ page, harness, setNow }) => {
      await setNow(at(iso));
      await openHome(page, harness);
      await expectHome(page, want);
      const over = want.phase === "after";
      // After the party: no invitation as the main thing, no past schedule.
      await expect(page.locator("[data-home-schedule]"))[over ? "toBeHidden" : "toBeVisible"]();
      await expect(page.locator("[data-home-invitation]"))[over ? "toBeHidden" : "toBeVisible"]();
      const directions = want.actions.find((a) => a.startsWith("Directions"));
      if (directions) {
        // Apple Maps and Waze beside the directions, for the same place.
        const place = directions.includes("ceremony") ? "4100%20Blue%20Mound%20Rd" : "5103%20Azle%20Ave";
        await expect(page.getByRole("link", { name: "Apple Maps (opens in a new tab)" })).toHaveAttribute("href", new RegExp("^https://maps\\.apple\\.com/\\?q=" + place));
        await expect(page.getByRole("link", { name: "Waze (opens in a new tab)" })).toHaveAttribute("href", new RegExp("^https://waze\\.com/ul\\?q=" + place + ".*&navigate=yes$"));
      } else await expect(page.locator(".map-choices")).toBeHidden();
    });
});

test.describe("the same states in Spanish, speaking to the household", () => {
  const es = [
    ["2026-10-17T10:00:00-05:00", {
      phase: "rsvp-open",
      countdown: "Tiempo para confirmar 29 días 14 horas 59 minutos",
      replyBy: "Por favor, confirmen a más tardar el domingo 15 de noviembre",
      actions: ["Confirmar asistencia", "Ver el programa→"],
      href: "/es/rsvp/",
      pill: true,
    }],
    [new Date(DEADLINE + 1000).toISOString(), {
      phase: "rsvp-closed",
      countdown: "Falta para la celebración 60 días 16 horas 1 minuto",
      actions: ["Ver el programa"],
      pill: true,
    }],
    ["2027-01-15T09:00:00-06:00", {
      phase: "day-of",
      countdown: "¡Hoy es el gran día!",
      status: [`Después Ceremonia religiosa · 4:00 p. m. · ${church}`],
      actions: ["Cómo llegar a la ceremonia ↗", "Ver el programa→"],
      pill: true,
    }],
    ["2027-01-15T21:15:00-06:00", {
      phase: "live",
      countdown: "¡Hoy es el gran día!",
      status: [`Ahora Recepción y baile · 7:30 p. m. – 12:30 a. m. (16 de enero) · ${hall}`],
      actions: ["Compartir fotos", "Cómo llegar a la recepción ↗", "Ver el programa→"],
      href: "/es/share/#media-upload",
      pill: true,
    }],
    ["2027-01-16T12:00:00-06:00", {
      phase: "after",
      line: "Gracias por celebrar con nosotros.",
      actions: ["Ver las fotos", "Compartir fotos→", "Déjenle un mensaje a Sophia→"],
      href: "/es/gallery/",
      pill: false,
    }],
  ];
  for (const [iso, want] of es)
    test(`${want.phase} (${iso})`, async ({ page, harness, setNow }) => {
      await setNow(at(iso));
      await openHome(page, harness, "es");
      await expectHome(page, want, "es");
    });
});

test("the home page changes at each boundary without a reload", async ({ context, harness }) => {
  // Two seconds before each boundary, then the page's clock runs past it.
  for (const [iso, part, before, after] of [
    [new Date(DEADLINE).toISOString(), "countdown", "Time left to RSVP 0 days 0 hours 1 minute", "Until the celebration 60 days 16 hours 1 minute"],
    ["2027-01-15T18:30:00-06:00", "primary", "Directions to the reception", "Share your photos"],
    ["2027-01-16T00:30:00-06:00", "primary", "Share your photos", "See the photos"],
  ]) {
    const page = await context.newPage(),
      start = at(iso) - 2000;
    harness.setNow(start);
    await page.clock.install({ time: start });
    await page.clock.pauseAt(start);
    await openHome(page, harness);
    await expect(home[part](page)).toContainText(before);
    harness.setNow(start + 3000);
    await page.clock.runFor(3000);
    await expect(home[part](page)).toContainText(after);
    await page.close();
  }
});

test("a countdown changes once a minute (no timer storm), and with reduced motion only at the boundary", async ({ context, harness }) => {
  const page = await context.newPage();
  const start = at("2026-10-17T10:00:00-05:00");
  harness.setNow(start);
  await page.clock.install({ time: start });
  await page.clock.pauseAt(start);
  await openHome(page, harness);
  await expect(home.countdown(page)).toHaveText("Time left to RSVP 29 days 14 hours 59 minutes");
  await page.evaluate(() => {
    window.changes = 0;
    new MutationObserver(() => window.changes++).observe(document.querySelector("[data-countdown]"), { childList: true, subtree: true, characterData: true });
  });
  await page.clock.runFor(120_000);
  await expect(home.countdown(page)).toHaveText("Time left to RSVP 29 days 14 hours 57 minutes");
  expect(await page.evaluate(() => window.changes)).toBeLessThanOrEqual(2);

  const calm = await context.newPage();
  await calm.emulateMedia({ reducedMotion: "reduce" });
  const near = DEADLINE - 90_000;
  harness.setNow(near);
  await calm.clock.install({ time: near });
  await calm.clock.pauseAt(near);
  await openHome(calm, harness);
  await expect(home.countdown(calm)).toHaveText("Time left to RSVP 0 days 0 hours 2 minutes");
  await calm.clock.runFor(60_000);
  // No ticking with reduced motion...
  await expect(home.countdown(calm)).toHaveText("Time left to RSVP 0 days 0 hours 2 minutes");
  // ...but a change of state is not motion: it still flips at the deadline.
  harness.setNow(DEADLINE + 1000);
  await calm.clock.runFor(31_000);
  await expect(home.countdown(calm)).toHaveText("Until the celebration 60 days 16 hours 1 minute");
});

test.describe("on a wrong device clock the page follows the server", () => {
  for (const skew of [-2, 2])
    test(`party night, device ${skew > 0 ? "+" : ""}${skew} h`, async ({ page, harness }) => {
      const server = at("2027-01-15T18:00:00-06:00");
      harness.setNow(server);
      await page.clock.setFixedTime(server + skew * 3_600_000);
      await openHome(page, harness);
      await expectHome(page, {
        phase: "live",
        countdown: "Today is the day!",
        status: [`Next Dinner · 6:30 PM · ${hall}`],
        actions: ["Directions to the reception ↗", "Share your photos→", "See the schedule→"],
        pill: true,
      });
    });

  test("a phone two minutes fast still saves its RSVP at 11:58 PM on November 15", async ({ page, harness }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    harness.setNow(DEADLINE - 60_000);
    await page.clock.setFixedTime(DEADLINE + 60_000);
    await page.goto(harness.forBrowser(link));
    await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
    await expect(page.locator("#portal .deadline")).toHaveText("Please reply by Sunday, November 15.");
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
    await expect(page.getByText("Saved Nov 15 · you can change it until November 15")).toBeVisible();
    // The home page counts the last minute on the server's clock.
    await page.goto(harness.url("/"));
    await expect(home.status(page)).toHaveText(["You replied ✓ · you can change it until Sunday, November 15"]);
  });

  test("a phone two minutes slow sees RSVPs closed once the server has closed them", async ({ page, harness }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    harness.setNow(DEADLINE + 60_000);
    await page.clock.setFixedTime(DEADLINE - 60_000);
    await page.goto(harness.forBrowser(link));
    await expect(page.getByRole("heading", { name: "RSVPs are closed" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Everyone’s coming" })).toHaveCount(0);
  });
});

test.describe("relatives abroad", () => {
  test.use({ timezoneId: "Europe/Madrid" });
  test("at 9:15 PM in Fort Worth (4:15 AM in Madrid) the evening shows in Fort Worth time", async ({ page, harness, setNow }) => {
    await setNow(at("2027-01-15T21:15:00-06:00"));
    await openHome(page, harness);
    await expectHome(page, {
      phase: "live",
      countdown: "Today is the day!",
      status: [`Now Reception & dance · 7:30 PM – 12:30 AM (Jan 16) · ${hall}`],
      actions: ["Share your photos", "Directions to the reception ↗", "See the schedule→"],
      pill: true,
    });
  });
});

test.describe("a household that replied", () => {
  async function answer(page, harness, household, { button = "Everyone’s coming", save = "Save my RSVP", locale } = {}) {
    const { link } = await harness.issueInvitation(household, locale ? { locale } : {});
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: button }).click();
    await page.getByRole("button", { name: save }).click();
    await expect(page).toHaveURL(/\/rsvp\/confirmed\/$/);
  }
  const marker = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("misxv-replied")));

  test("sees 'You replied ✓' instead of the countdown, the schedule first and no RSVP pill", async ({ page, harness }) => {
    await answer(page, harness, households.rivera);
    // Both confirmations offer the note (the attending one too).
    await expect(page.getByRole("link", { name: "Leave Sophia a note" })).toHaveAttribute("href", "/guestbook/");
    // What the device keeps: yes or no, when, and until the party is over.
    const note = await marker(page);
    expect(Object.keys(note).sort()).toEqual(["answer", "savedAt", "until", "v"]);
    expect(note).toMatchObject({ v: 1, answer: "yes", until: "2027-01-16T06:30:00.000Z" });
    expect(JSON.stringify(note)).not.toMatch(/Rivera|example\.com|0a1b2c3d/);
    await openHome(page, harness);
    await expectHome(page, {
      phase: "rsvp-open",
      status: ["You replied ✓ · you can change it until Sunday, November 15"],
      actions: ["See the schedule", "Change your RSVP→"],
      href: "/details/",
      pill: false,
    });
    await expect(page.locator("[data-home-actions]").getByRole("link", { name: "Change your RSVP" })).toHaveAttribute("href", "/rsvp/");
    // The pill stays away on the other pages too.
    await page.goto(harness.url("/details/"));
    await expect(home.pill(page)).toBeHidden();
  });

  test("still sees it the next day, from this device's note, with no session left", async ({ page, harness, browser }) => {
    await answer(page, harness, households.rivera);
    const { origins } = await page.context().storageState();
    harness.setNow(harness.now() + 86_400_000);
    // A new visit: the device's storage, but no cookie (the session ended).
    const next = await browser.newContext({ storageState: { cookies: [], origins }, timezoneId: "America/Chicago" });
    await next.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort("blockedbyclient"));
    const visit = await next.newPage();
    await visit.clock.setFixedTime(harness.now());
    await openHome(visit, harness);
    expect((await (await visit.request.get(harness.url("/api/session"))).json()).kind).toBe(null);
    await expect(home.status(visit)).toHaveText(["You replied ✓ · you can change it until Sunday, November 15"]);
    await expect(home.countdown(visit)).toBeHidden();
    await expect(home.pill(visit)).toBeHidden();
    // After the deadline: "You replied ✓", without "change until".
    harness.setNow(AFTER_DEADLINE);
    await visit.clock.setFixedTime(AFTER_DEADLINE);
    await openHome(visit, harness);
    await expect(home.status(visit)).toHaveText(["You replied ✓"]);
    await expect(home.countdown(visit)).toHaveText("Until the celebration 60 days 16 hours 0 minutes");
    await next.close();

    // A different browser knows nothing: the honest default.
    const stranger = await browser.newContext({ timezoneId: "America/Chicago" });
    await stranger.route((url) => url.hostname !== "127.0.0.1", (route) => route.abort("blockedbyclient"));
    const other = await stranger.newPage();
    harness.setNow(DEADLINE - 3_600_000);
    await other.clock.setFixedTime(DEADLINE - 3_600_000);
    await openHome(other, harness);
    await expect(home.countdown(other)).toHaveText("Time left to RSVP 0 days 1 hour 0 minutes");
    await expect(home.status(other)).toHaveCount(0);
    await expect(home.pill(other)).toBeVisible();
    await stranger.close();
  });

  test("a household that declined is thanked in its own words", async ({ page, harness }) => {
    await answer(page, harness, households.rivera, { button: "We can’t make it" });
    expect((await marker(page)).answer).toBe("no");
    await openHome(page, harness);
    await expect(home.status(page)).toHaveText(["Thank you for letting us know · you can change your RSVP until Sunday, November 15"]);
    await expect(home.primary(page)).toHaveText("See the schedule");
  });

  test("in Spanish, the home page speaks to the household that replied", async ({ page, harness }) => {
    await answer(page, harness, households.morales, { button: "Vamos todos", save: "Guardar mi respuesta", locale: "es" });
    await expect(page.getByRole("link", { name: "Déjenle un mensaje a Sophia" })).toHaveAttribute("href", "/es/guestbook/");
    await openHome(page, harness, "es");
    await expectHome(page, {
      phase: "rsvp-open",
      status: ["Ya respondieron ✓ · pueden cambiar su respuesta hasta el domingo 15 de noviembre"],
      actions: ["Ver el programa", "Cambiar la respuesta→"],
      pill: false,
    }, "es");
  });

  test("the server wins over the device: a wrong note is rewritten or deleted", async ({ page, harness }) => {
    await answer(page, harness, households.rivera, { button: "We can’t make it" });
    // The note says yes; the signed-in household said no.
    await page.evaluate(() => localStorage.setItem("misxv-replied", JSON.stringify({ v: 1, answer: "yes", savedAt: "x", until: "2027-01-16T06:30:00.000Z" })));
    await openHome(page, harness);
    await expect(home.status(page)).toHaveText(["Thank you for letting us know · you can change your RSVP until Sunday, November 15"]);
    expect((await marker(page)).answer).toBe("no");
    // A household that has not replied, signed in on a device with a stale note.
    const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
    await page.goto(harness.forBrowser(link));
    await expect(page.getByRole("heading", { name: "Familia Morales" })).toBeVisible();
    await page.evaluate(() => localStorage.setItem("misxv-replied", JSON.stringify({ v: 1, answer: "yes", savedAt: "x", until: "2027-01-16T06:30:00.000Z" })));
    await openHome(page, harness, "es");
    await expect(home.countdown(page)).toHaveText(/^Tiempo para confirmar/);
    await expect(home.status(page)).toHaveCount(0);
    expect(await marker(page)).toBe(null);
  });

  test("signing out forgets that this device's household replied", async ({ page, harness }) => {
    const household = households.rivera;
    await harness.issueInvitation(household);
    await page.goto(harness.url("/account/"));
    await page.getByRole("textbox", { name: "Email" }).first().fill(household.email);
    await page.getByRole("button", { name: "Email my sign-in link" }).click();
    await expect.poll(() => harness.sent.some((m) => m.to === household.email)).toBe(true);
    const mail = harness.sent.findLast((m) => m.to === household.email);
    await page.goto(harness.forBrowser(mail.html.match(/href="(https:\/\/127\.0\.0\.1:\d+\/account\/#[A-Za-z0-9_-]{43})"/)[1]));
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
    await page.goto(harness.url("/rsvp/"));
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));
    expect((await marker(page)).answer).toBe("yes");
    await page.goto(harness.url("/account/"));
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    // Signed out, My account is "Sign in" (R-041).
    await expect(page.getByRole("heading", { name: "Sign in with your email" })).toBeVisible();
    expect(await marker(page)).toBe(null);
    await openHome(page, harness);
    await expect(home.countdown(page)).toHaveText(/^Time left to RSVP/);
  });
});

test.describe("the RSVP page on the server's clock", () => {
  test("signed out after the deadline, /rsvp/ says first that RSVPs are closed, in English and Spanish", async ({ page, harness, setNow }) => {
    await setNow(DEADLINE - 1000);
    await page.goto(harness.url("/rsvp/"));
    await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();
    await expect(page.locator("#portal .deadline")).toHaveText("Please reply by Sunday, November 15.");
    await expect(page.getByRole("heading", { name: "RSVPs are closed" })).toHaveCount(0);
    await setNow(DEADLINE);
    await page.goto(harness.url("/rsvp/"));
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("RSVPs are closed");
    await expect(page.getByText("RSVPs closed on November 15. To answer or change your answer now, please contact us.")).toBeVisible();
    await expect(page.getByRole("main").getByRole("link", { name: "Contact us" })).toHaveAttribute("href", "/contact/");
    await expect(page.locator("#portal .deadline")).toHaveCount(0);
    // The link or code still opens the household's saved answer.
    await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();
    await page.goto(harness.url("/es/rsvp/"));
    await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText("Las respuestas están cerradas");
    await expect(page.getByText("Las respuestas cerraron el 15 de noviembre. Para responder o cambiar su respuesta, escríbannos.")).toBeVisible();
  });

  test("a form left open across the deadline turns into the closed note with the saved answer", async ({ context, harness }) => {
    // One page whose clock the test runs (Playwright's clock is per context).
    const { link } = await harness.issueInvitation(households.rivera),
      page = await context.newPage(),
      answered = DEADLINE - 20 * 60_000;
    harness.setNow(answered);
    await page.clock.install({ time: answered });
    await page.clock.pauseAt(answered);
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page).toHaveURL(harness.url("/rsvp/confirmed/"));

    // The same session, ten seconds before the deadline: they start changing it.
    const start = DEADLINE - 10_000;
    harness.setNow(start);
    await page.clock.pauseAt(start);
    await page.goto(harness.url("/rsvp/"));
    await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
    await page.getByRole("button", { name: "We can’t make it" }).click();
    await expect(page.getByRole("button", { name: "Save my RSVP" })).toBeVisible();
    harness.setNow(DEADLINE + 1000);
    await page.clock.runFor(12_000);
    await expect(page.getByRole("heading", { name: "RSVPs are closed" })).toBeVisible();
    await expect(page.getByText("Your saved answer:")).toBeVisible();
    await expect(page.getByRole("main").getByRole("listitem").first()).toHaveText("Ceremony: 2 adults/teens, 1 child");
    await expect(page.getByRole("button", { name: "Save my RSVP" })).toHaveCount(0);
  });

  test("a save that races the deadline gets the server's answer and a way to reach us", async ({ page, harness, setNow }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    await setNow(DEADLINE - 60_000);
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await setNow(AFTER_DEADLINE);
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page.getByRole("alert")).toHaveText("The RSVP deadline has passed. Please contact us.");
    // "contact us" in the alert is the link (R-075), so it is said once.
    await expect(page.getByRole("alert").getByRole("link", { name: "contact us" })).toHaveAttribute("href", "/contact/");
    await expect(page.locator("#portal").getByRole("link", { name: /contact us/i })).toHaveCount(1);
  });

  test("after the party the confirmation thanks the household and offers no calendar or directions", async ({ page, harness, setNow }) => {
    const { link } = await harness.issueInvitation(households.rivera);
    await page.goto(harness.forBrowser(link));
    await page.getByRole("button", { name: "Everyone’s coming" }).click();
    await page.getByRole("button", { name: "Save my RSVP" }).click();
    await expect(page.getByRole("heading", { name: "We can’t wait to celebrate with you!" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add to your calendar" })).toBeVisible();

    await setNow(at("2027-01-16T10:00:00-06:00"));
    await page.goto(harness.forBrowser(link));
    // /rsvp/ is closed; nothing to fill in.
    await expect(page.getByRole("heading", { name: "RSVPs are closed" })).toBeVisible();
    await page.goto(harness.url("/rsvp/confirmed/"));
    await expect(page.getByRole("heading", { name: "Thank you for celebrating with us!" })).toBeVisible();
    await expect(page.getByText("We can’t wait to celebrate with you!")).toHaveCount(0);
    await expect(page.getByText("Add to your calendar")).toHaveCount(0);
    await expect(page.getByText("Getting there")).toHaveCount(0);
    await expect(page.locator('#portal a[href$=".ics"]')).toHaveCount(0);
    await expect(page.locator("#portal").getByText(/contact us/i)).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("link", { name: "See the photos" })).toHaveAttribute("href", "/gallery/");
    await expect(page.getByRole("main").getByRole("link", { name: "Leave Sophia a note" })).toHaveAttribute("href", "/guestbook/");
    await expect(home.pill(page)).toBeHidden();
  });
});

test("the newest announcement sits under the status line, dated; older ones lower down, English marked as English", async ({ page, harness }) => {
  // One from before Spanish was required (English only), then a bilingual one.
  await harness.ledger.transaction((s) => {
    s.announcements.early = {
      id: "early",
      title: "Save the date",
      text: "Invitations are on their way.",
      titleEs: "",
      textEs: "",
      published: true,
      at: harness.now() - 2 * 86_400_000,
    };
  });
  await harness.announce({ title: "Parking", text: "Use the north lot.", titleEs: "Estacionamiento", textEs: "Usen el lote norte." });
  await page.setViewportSize({ width: 390, height: 844 });
  await openHome(page, harness);
  const latest = page.locator("[data-latest-update]");
  await expect(latest).toHaveText("Posted October 1ParkingUse the north lot.");
  await expect(latest.locator("time")).toHaveAttribute("datetime", new Date(harness.now()).toISOString());
  const box = await latest.boundingBox(),
    reply = await home.countdown(page).boundingBox(),
    strip = await page.locator(".schedule-strip").boundingBox();
  // Right under the status, before the schedule, on the first phone screen.
  expect(box.y).toBeGreaterThan(reply.y);
  expect(box.y + 40).toBeLessThan(844);
  expect(box.y).toBeLessThan(strip.y);
  await expect(page.locator("[data-announcements] article")).toHaveText(["Posted September 29Save the dateInvitations are on their way."]);

  await openHome(page, harness, "es");
  await expect(latest).toHaveText("Publicado el 1 de octubreEstacionamientoUsen el lote norte.");
  const older = page.locator("[data-announcements] article");
  await expect(older.locator("h3")).toHaveAttribute("lang", "en");
  await expect(older.locator("p:not(.update-date)")).toHaveAttribute("lang", "en");
  await expect(older.locator(".update-date")).toHaveText("Publicado el 29 de septiembre");
});

test("without announcements there is no empty box", async ({ page, harness }) => {
  await openHome(page, harness);
  await expect(page.locator("[data-latest-update]")).toBeHidden();
  await expect(page.locator("[data-announcements]")).toBeEmpty();
});

for (const [width, height] of [
  [1440, 900],
  [1280, 800],
])
  test(`on a ${width}×${height} screen the written schedule is on the first screen, in both languages`, async ({ page, harness }) => {
    await page.setViewportSize({ width, height });
    for (const lang of ["en", "es"]) {
      await openHome(page, harness, lang);
      const strip = await page.locator(".schedule-strip li").first().boundingBox();
      expect(strip.y + strip.height).toBeLessThan(height);
      // Sophia's words follow it, and "Leave Sophia a note" follows them.
      const quote = await page.locator("[data-home-quote]").boundingBox(),
        note = await page.locator("[data-home-note]").boundingBox();
      expect(quote.y).toBeGreaterThan(strip.y);
      expect(note.y).toBeGreaterThan(quote.y);
    }
  });

test("after the party the header's RSVP pill is gone from every page", async ({ page, harness, setNow }) => {
  await setNow(at("2027-01-16T00:30:00-06:00"));
  for (const path of ["/details/", "/es/faq/", "/gallery/"]) {
    await page.goto(harness.url(path));
    await expect(home.pill(page)).toBeHidden();
  }
  await setNow(at("2027-01-16T00:29:59-06:00"));
  await page.goto(harness.url("/details/"));
  await expect(home.pill(page)).toBeVisible();
});

test("each venue page offers Waze beside Google Maps and Apple Maps", async ({ page, harness }) => {
  await page.goto(harness.url("/ceremony/"));
  // Each map link also names its venue for screen readers (R-062); Chromium
  // puts a space before the hidden ": venue".
  await expect(page.getByRole("link", { name: /^Open in Waze ?: Religious ceremony \(opens in a new tab\)$/ })).toHaveAttribute(
    "href",
    "https://waze.com/ul?q=4100%20Blue%20Mound%20Rd%2C%20Fort%20Worth%2C%20TX%2076106&navigate=yes",
  );
  await page.goto(harness.url("/es/reception/"));
  const waze = page.getByRole("link", { name: /^Abrir en Waze ?: Cena y recepción \(se abre en otra pestaña\)$/ });
  await expect(waze).toHaveAttribute("href", /^https:\/\/waze\.com\/ul\?q=5103%20Azle%20Ave/);
  await expect(waze).toHaveAttribute("target", "_blank");
  expect((await waze.boundingBox()).height).toBeGreaterThanOrEqual(44);
});

test("siteClock() gives any page the milestones and the server's time", async ({ page, harness }) => {
  const server = at("2027-01-15T18:00:00-06:00");
  harness.setNow(server);
  await page.clock.setFixedTime(server - 2 * 3_600_000);
  await page.goto(harness.url("/gallery/"));
  const seen = await page.evaluate(async () => {
    const { m, now } = await (await import("/now.mjs")).siteClock();
    return { ceremonyStart: m.ceremonyStart, deadline: m.deadline, now: now() };
  });
  expect(seen).toEqual({ ceremonyStart: at("2027-01-15T16:00:00-06:00"), deadline: DEADLINE, now: server });
});
