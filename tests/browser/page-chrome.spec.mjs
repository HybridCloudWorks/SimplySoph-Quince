// What every page shares (site/client.js): forms that check themselves in the
// page's language, a busy button that keeps focus and says what it is doing,
// honest messages when the server is in trouble, and the page-wide note that
// can be closed and never hides the focused control.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { hold, serverError } from "./a11y-helpers.mjs";

// R-050: a submit waiting on the server shows it, in words, everywhere the
// guest and a screen reader would look; nothing moves under the pointer; and
// once the answer comes the button is back, with any error said after the
// form stops being busy.
async function expectBusy(page, { form, button, words, label }) {
  await expect(button).toHaveAccessibleName(words);
  await expect(button).toHaveAttribute("aria-disabled", "true");
  await expect(button).toBeFocused();
  await expect(form).toHaveAttribute("aria-busy", "true");
  // One polite region outside every form says the same words.
  await expect(page.locator("#announce")).toHaveText(words);
  expect(await page.locator("#announce").evaluate((el) => !!el.closest("form"))).toBe(false);
  await expect(button).toHaveText(words);
  return label;
}
async function expectIdle(page, { form, button, label }) {
  await expect(form).not.toHaveAttribute("aria-busy");
  await expect(button).toHaveAccessibleName(label);
  await expect(button).not.toHaveAttribute("aria-disabled");
  await expect(page.locator("#announce")).toBeEmpty();
}

for (const [lang, label, words, error] of [
  ["en", "Email my sign-in link", "Sending…", "Something went wrong on our end."],
  ["es", "Enviar enlace de acceso", "Enviando…", "Algo falló de nuestro lado."],
])
  test(`a busy submit says “${words}”, keeps its place, and puts its label back when the answer is an error (${lang})`, async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(harness.url(lang === "es" ? "/es/contact/" : "/contact/"));
    const request = await hold(page, "auth/email/request");
    const form = page.locator("#email-login"),
      button = form.locator("button[type=submit]");
    await form.getByRole("textbox").fill("rivera.family@example.com");
    const before = await button.boundingBox();
    await button.click();
    await expectBusy(page, { form, button, words });
    // Same place, same height; never narrower (the label may be shorter).
    const during = await button.boundingBox();
    expect([during.x, during.y, during.height]).toEqual([before.x, before.y, before.height]);
    expect(during.width).toBeGreaterThanOrEqual(before.width - 0.5);
    request.release(serverError);
    await expect(form.locator(".error")).toContainText(error);
    await expectIdle(page, { form, button, label });
    await expect(button).toBeFocused();
  });

test("every guest submit says what it is doing while it waits: code, sign-in, details, messages and notes", async ({
  page,
  harness,
}) => {
  test.setTimeout(60_000);
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  // The invitation code: "Checking…".
  await page.goto(harness.url("/rsvp/"));
  let request = await hold(page, "invitation-session");
  let form = page.locator("#access"),
    button = form.locator("button[type=submit]");
  await form.getByRole("textbox").fill(link.split("#")[1]);
  await button.click();
  await expectBusy(page, { form, button, words: "Checking…" });
  request.release();
  await expect(page.getByRole("heading", { name: household.name })).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  // The emailed link's confirmation: "Signing in…".
  await page.goto(harness.url("/account/"));
  await page.getByRole("textbox", { name: "Email" }).first().fill(household.email);
  const sent = harness.sent.length;
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await expect.poll(() => harness.sent.length).toBe(sent + 1);
  const mail = harness.sent.at(-1);
  await page.goto(harness.forBrowser(mail.html.match(/href="(https:\/\/127\.0\.0\.1:\d+\/account\/#[A-Za-z0-9_-]{43})"/)[1]));
  request = await hold(page, "auth/email/verify");
  form = page.locator("#email-verify");
  button = form.locator("button[type=submit]");
  await button.click();
  await expectBusy(page, { form, button, words: "Signing in…" });
  request.release();
  // Contact details: "Saving…"; a message from My account: "Sending…".
  form = page.locator("#profile-form");
  await expect(form).toBeVisible();
  await page.unrouteAll({ behavior: "ignoreErrors" });
  for (const [path, selector, words, label, fill] of [
    ["profile", "#profile-form", "Saving…", "Save contact details", { name: "Phone", value: "817 555 0100" }],
    ["messages", "#family-message", "Sending…", "Send message", { name: "Your message", value: "Is there parking?" }],
  ]) {
    request = await hold(page, path);
    form = page.locator(selector);
    button = form.locator("button[type=submit]");
    await form.getByRole("textbox", { name: fill.name, exact: true }).fill(fill.value);
    await button.click();
    await expectBusy(page, { form, button, words });
    request.release();
    await expect(form.locator(".saved-note")).not.toBeEmpty();
    await expectIdle(page, { form, button, label });
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
  // A note for Sophia: "Sending…". (Signed in, Contact has no form of its
  // own: it points to the thread on My account, whose "Sending…" is above;
  // R-085, tests/browser/sign-in.spec.mjs.)
  for (const path of ["/guestbook/"]) {
    await page.goto(harness.url(path));
    form = page.locator("#message");
    button = form.locator("button[type=submit]");
    await form.getByRole("textbox", { name: "Your name, as you’d like it to appear", exact: true }).fill("The Riveras");
    await form.getByRole("textbox", { name: "Your note", exact: true }).fill("Congratulations, Sophia!");
    await form.getByRole("checkbox").check();
    request = await hold(page, "messages");
    await button.click();
    await expectBusy(page, { form, button, words: "Sending…" });
    request.release();
    await expect(page.locator("#portal .notice.success")).toBeVisible();
    await expect(page.locator("#announce")).toBeEmpty();
    await page.unrouteAll({ behavior: "ignoreErrors" });
  }
});

for (const [lang, words] of [
  ["en", "Saving…"],
  ["es", "Guardando…"],
])
  test(`Save on the RSVP review says “${words}” until the confirmation opens, and comes back after an error (${lang})`, async ({
    page,
    harness,
  }) => {
    const { link } = await harness.issueInvitation(households.rivera, { locale: lang });
    await page.goto(harness.forBrowser(link));
    await page.locator("[data-quick=yes]").click();
    const portal = page.locator("#portal"),
      button = page.locator("#confirm"),
      save = (await button.textContent()).trim();
    // First an error: the label comes back and the error is said.
    let request = await hold(page, "rsvp");
    await button.click();
    await expectBusy(page, { form: portal, button, words });
    request.release(serverError);
    await expect(portal.locator(".error")).not.toBeEmpty();
    await expectIdle(page, { form: portal, button, label: save });
    await expect(button).toBeFocused();
    await page.unrouteAll({ behavior: "ignoreErrors" });
    // Then the save: busy until the confirmation opens.
    request = await hold(page, "rsvp");
    await button.click();
    await expectBusy(page, { form: portal, button, words });
    request.release();
    await expect(page).toHaveURL(/\/rsvp\/confirmed\/$/);
  });

test("a form lists what is missing in the page’s language and moves focus to that list", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/es/contact/"));
  const form = page.locator("#email-login");
  await expect(form).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  const summary = form.locator(".error-summary");
  await expect(summary).toBeFocused();
  // A line per kind of problem over a list, one link per field to fix.
  await expect(summary.locator("p")).toHaveText(["Completa:"]);
  await expect(summary.getByRole("listitem")).toHaveText(["Correo electrónico"]);
  const email = page.getByRole("textbox", { name: "Correo electrónico" });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/Completa este campo\./);
  await expect(page).toHaveTitle(/^Error: /);
  await summary.getByRole("link", { name: "Correo electrónico" }).click();
  await expect(email).toBeFocused();
  // An address that isn't one.
  await email.fill("rivera.family");
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(summary.locator("p")).toHaveText(["Revisa el correo:"]);
  await expect(summary.getByRole("listitem")).toHaveText(["Correo electrónico"]);
  expect(harness.sent).toEqual([]);
});

test("a server error page reads as trouble on our end, and the busy button keeps focus", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/contact/"));
  await page.route("**/api/auth/email/request", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<!doctype html><title>502 Bad Gateway</title>",
    }),
  );
  await page.getByRole("textbox", { name: "Email" }).fill("rivera.family@example.com");
  const send = page.getByRole("button", { name: "Email my sign-in link" });
  await send.click();
  await expect(page.locator("#email-login .error")).toHaveText(
    "Something went wrong on our end. Your answers are still here — try again in a minute, or email misxv@simplysoph.com.",
  );
  await expect(page.getByText(/not open yet/)).toHaveCount(0);
  // Disabling the focused button used to drop focus to the page.
  await expect(send).toBeFocused();
  await expect(send).toBeEnabled();
});

test("the page-wide note can be closed and does not cover the control that has focus", async ({
  page,
  harness,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(harness.url("/contact/"));
  const button = page.getByRole("button", { name: "Email my sign-in link" });
  await button.focus();
  await page.evaluate(async () => {
    const { notify } = await import("/client.js");
    notify("Photos are being prepared.");
  });
  const note = page.locator("#status");
  await expect(note).toContainText("Photos are being prepared.");
  // The focused button sits above the note, in view.
  await expect
    .poll(async () => {
      const [noteBox, buttonBox] = [await note.boundingBox(), await button.boundingBox()];
      return buttonBox.y >= 0 && buttonBox.y + buttonBox.height <= noteBox.y;
    })
    .toBe(true);
  await note.getByRole("button", { name: "Close" }).click();
  await expect(note).toBeEmpty();
  await expect(button).toBeFocused();
});
