// Messages that take focus are not live regions too, so they are read once
// (P5-A11Y-10); the error summary's links are 44 px targets (P5-A11Y-11);
// the "Check your email" address breaks inside the screen at 320 px with a
// 24 px default font (P5-A11Y-14). Synthetic households only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn } from "./media-helpers.mjs";
import { serveFonts, defaultFontSize } from "./a11y-helpers.mjs";

test("the RSVP's error summary takes focus without being an alert too, and each of its links is a 44 px target", async ({ page, harness }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { link } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Review your RSVP" }).click();
  const summary = page.locator(".error-summary");
  await expect(summary).toBeFocused();
  await expect(summary).not.toHaveAttribute("role", /.*/);
  const links = summary.getByRole("link");
  await expect(links).toHaveText(["Ceremony", "Dinner", "Reception & dance"]);
  for (const box of await links.evaluateAll((all) => all.map((a) => a.getBoundingClientRect().height)))
    expect(box).toBeGreaterThanOrEqual(44);
});

test("My account's saved note takes focus without being a live region too", async ({ page, harness }) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  const form = page.locator("#profile-form");
  await form.getByRole("textbox", { name: "Phone" }).fill("+1 817 555 0199");
  await form.getByRole("button", { name: "Save contact details" }).click();
  const note = form.locator(".saved-note");
  await expect(note).toHaveText("Contact details saved.");
  await expect(note).toBeFocused();
  await expect(note).not.toHaveAttribute("role", /.*/);
});

test("“Check your email” fits a 320 px screen with a 24 px default font", async ({ page, context, harness }) => {
  // With the site's own fonts when a local copy is given (MISXV_FONT_CACHE):
  // the address overflowed by 3 px in Manrope.
  if (!(await serveFonts(context))) test.info().annotations.push({ type: "fonts", description: "MISXV_FONT_CACHE not set: fallback fonts" });
  await page.setViewportSize({ width: 320, height: 700 });
  await defaultFontSize(page, 24);
  await page.goto(harness.url("/account/"));
  await page.getByRole("textbox", { name: "Email" }).first().fill("rivera.family@example.com");
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
});

// V-08: a message to us, the way a guest finds it (Contact, sign in there,
// then "Write to us in My account", where our replies appear), and once it
// is sent: focus lands on what happened, next to the button, and stays there
// (never lost to the page); it is said once, by the focus, with no live
// region saying it again and the busy "Sending…" taken back.
for (const [lang, household, words] of [
  ["en", households.rivera, { write: "Write to us in My account", message: "Your message", send: "Send message", sent: "Sent. Our reply will appear here." }],
  ["es", households.morales, { write: "Escríbenos en Mi cuenta", message: "Tu mensaje", send: "Enviar mensaje", sent: "Enviado. Nuestra respuesta aparecerá aquí." }],
])
  test(`after a message to us is sent, focus is on “${words.sent}”, said once (${lang})`, async ({ page, harness }) => {
    await harness.issueInvitation(household, { locale: lang });
    const es = lang === "es",
      path = (p) => harness.url((es ? "/es" : "") + p);
    await page.goto(path("/contact/"));
    await signIn(page, harness, household.email, { es });
    await expect(page).toHaveURL(path("/contact/"));
    await page.getByRole("link", { name: words.write }).click();
    await expect(page).toHaveURL(path("/account/"));
    const form = page.locator("#family-message"),
      text = es ? "¿Hay estacionamiento?" : "Is there parking?";
    await form.getByRole("textbox", { name: words.message, exact: true }).fill(text);
    await form.getByRole("button", { name: words.send }).click();
    const note = form.locator(".saved-note");
    await expect(note).toHaveText(words.sent);
    await expect(note).toBeFocused();
    // Said by the focus alone: not a live region, and no region says it too.
    await expect(note).not.toHaveAttribute("role", /.*/);
    await expect(note).not.toHaveAttribute("aria-live", /.*/);
    await expect(page.locator("#announce")).toBeEmpty();
    await expect(page.locator("#status")).toBeEmpty();
    // The message is in the thread and the form is ready for another, while
    // focus stays on the note, not on the page.
    await expect(page.locator("#thread")).toContainText(text);
    await expect(form.getByRole("textbox", { name: words.message, exact: true })).toHaveValue("");
    await expect(form.getByRole("button", { name: words.send })).not.toHaveAttribute("aria-disabled");
    await page.waitForTimeout(300);
    await expect(note).toBeFocused();
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false);
  });
