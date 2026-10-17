// Sign-in, recovery, Contact and My account (round 2 review, wave 2): the
// signed-out account page that leads with the email sign-in, the header that
// says "My account" once signed in, "Check your email" with a way forward, a
// used or expired link that offers a new one, Contact that says where replies
// appear, tab titles that name a step only after the guest acts, "contact us"
// as a link, the skip link's focus, "Copy address", and the family's named
// host on Contact. Synthetic households only (harness.mjs).
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn, pathOf } from "./a11y-helpers.mjs";
import { registerFor } from "../../site/lexicon.mjs";

const site = { en: "Sophia’s Quinceañera", es: "Los XV de Sophia" };
const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
const emailBox = (page) => page.getByRole("textbox", { name: /^(Email|Correo electrónico)$/ });
const sendButton = (page) => page.getByRole("button", { name: /^(Email my sign-in link|Enviar enlace de acceso)$/ });
// Asks for a sign-in link from the page open now; returns it, for the browser.
async function emailedLink(page, harness, email, button = sendButton(page)) {
  await emailBox(page).fill(email);
  const before = harness.sent.length;
  await button.click();
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  return harness.forBrowser(harness.sent.slice(before).findLast((m) => m.to === email).html.match(accountLink)[1]);
}
const fits = async (page, where) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), where).toBe(0);

// ---- R-041: signed out, My account is "Sign in" ----
for (const [lang, signInName, accountName, rsvpLink, fold, code] of [
  ["en", "Sign in", "My account", "your RSVP", "Type the code from your invitation", "Invitation link or code"],
  ["es", "Entrar", "Mi cuenta", "tu respuesta", "Escribe el código de tu invitación", "Enlace o código de invitación"],
])
  test(`signed out, My account is “${signInName}”, with the email field on the first phone screen and the code folded under one line to the RSVP (${lang})`, async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const household = households.morales;
    await harness.issueInvitation(household, { locale: lang });
    await page.goto(harness.url(pathOf("account", lang) + "?return=gallery"));
    const title = page.getByRole("heading", { level: 1 });
    await expect(title).toHaveText(signInName);
    await expect(page.locator("#email-login")).toBeVisible();
    await expect(page).toHaveTitle(`${signInName} · ${site[lang]}`);
    // The email field is whole on the first screen of a phone.
    const box = await emailBox(page).boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // One line points people with a link or code to the RSVP, and the code
    // box is folded under it, after the email sign-in.
    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: rsvpLink, exact: true })).toHaveAttribute("href", pathOf("rsvp", lang));
    const codeBox = page.getByRole("textbox", { name: code });
    await expect(codeBox).toBeHidden();
    expect(
      await page.evaluate(
        () =>
          !!(
            document.querySelector("#email-login").compareDocumentPosition(document.querySelector("[data-invitation-way]")) &
            Node.DOCUMENT_POSITION_FOLLOWING
          ),
      ),
    ).toBe(true);
    await page.getByText(fold).click();
    await expect(codeBox).toBeVisible();
    // The emailed link still brings the guest back to the page they started
    // from, and signed in the page is My account again.
    await signIn(page, harness, household.email);
    await expect(page).toHaveURL(harness.url(pathOf("gallery", lang)));
    await page.goto(harness.url(pathOf("account", lang)));
    await expect(page.locator("#family-chat form")).toBeVisible();
    await expect(title).toHaveText(accountName);
    await expect(page).toHaveTitle(`${accountName} · ${site[lang]}`);
  });

test("a code typed on the signed-out account page opens its RSVP", async ({ page, harness }) => {
  const { code } = await harness.issueInvitation(households.rivera);
  await page.goto(harness.url("/account/"));
  await page.getByText("Type the code from your invitation").click();
  await page.getByRole("textbox", { name: "Invitation link or code" }).fill(code);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page).toHaveURL(harness.url("/rsvp/"));
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
});

// ---- R-042: the header's sign-in item follows the session ----
test("the header says Sign in until a guest signs in with an email, then My account / Mi cuenta; an invitation link is not a sign-in", async ({
  page,
  harness,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  const item = page.locator(".site-header .nav-signin a");
  await page.goto(harness.url("/"));
  await expect(item).toHaveText("Sign in");
  // In with the invitation link: the RSVP, still not signed in.
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: household.name })).toBeVisible();
  await expect(item).toHaveText("Sign in");
  // The narrowest screen with the flat header, signed out.
  await page.setViewportSize({ width: 1081, height: 900 });
  const bar = async () => (await page.locator("body > header").boundingBox()).height;
  const oneRow = await bar();
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  await expect(page.locator("#family-chat form")).toBeVisible();
  await expect(item).toHaveText("My account");
  // The longer label still fits the one row.
  expect(await bar()).toBe(oneRow);
  await page.goto(harness.url("/es/"));
  await expect(item).toHaveText("Mi cuenta");
  expect(await bar()).toBe(oneRow);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [path, name] of [
    ["/details/", "My account"],
    ["/", "My account"],
    ["/es/details/", "Mi cuenta"],
  ]) {
    await page.goto(harness.url(path));
    await expect(item, path).toHaveText(name);
  }
  // The built page still says "Sign in": the change is the browser's.
  const built = await (await page.request.get(harness.url("/details/"))).text();
  expect(built).toContain('<li class="nav-signin"><a href="/account/">Sign in</a></li>');
  // Signed out again: "Sign in".
  await page.goto(harness.url("/account/"));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.locator("#email-login")).toBeVisible();
  await expect(item).toHaveText("Sign in");
});

// ---- R-023: "Check your email" with a way forward ----
const nothingYet = {
  en: "Nothing after a few minutes? Try the email where you got your invitation, or write to us at misxv@simplysoph.com and we’ll add yours.",
  tu: "¿No llega en unos minutos? Prueba con el correo donde recibiste tu invitación o escríbenos a misxv@simplysoph.com y agregamos el tuyo.",
  ustedes:
    "¿No llega en unos minutos? Prueben con el correo donde recibieron su invitación o escríbannos a misxv@simplysoph.com y agregamos el suyo.",
};
for (const lang of ["en", "es"])
  test(`“Check your email” says what to do when nothing arrives, on every page that signs in, the same for any address (${lang})`, async ({
    page,
    harness,
  }) => {
    test.setTimeout(60_000);
    const household = households.rivera;
    await harness.issueInvitation(household);
    for (const route of ["account", "rsvp", "share", "guestbook", "contact"]) {
      const said = [];
      for (const email of [household.email, "not.on.the.list@example.com"]) {
        await page.goto(harness.url(pathOf(route, lang)));
        const before = harness.sent.length;
        await emailBox(page).fill(email);
        await sendButton(page).click();
        const state = page.locator("#portal .notice[role=status]");
        await expect(state.getByRole("heading")).toBeFocused();
        // In the page's Spanish: to the household on the RSVP, to one person elsewhere.
        const words = lang === "en" ? nothingYet.en : nothingYet[registerFor(route) === "ustedes" ? "ustedes" : "tu"];
        await expect(state.locator(".nothing-yet"), `${lang} /${route}/`).toHaveText(words);
        const ours = state.getByRole("link", { name: "misxv@simplysoph.com" });
        await expect(ours).toHaveAttribute("href", "mailto:misxv@simplysoph.com");
        await expect(ours).toHaveClass(/(^| )target( |$)/);
        expect((await ours.boundingBox()).height, "a 44px target").toBeGreaterThanOrEqual(43.9);
        said.push(await state.innerText());
        // Only an address on the list is sent a link (checked once: links to
        // one address are limited to 3 in 15 minutes).
        if (route === "account") expect(harness.sent.length - before).toBe(email === household.email ? 1 : 0);
      }
      // Word for word the same, so the page never says who is on the list.
      expect(said[1], `${lang} /${route}/`).toBe(said[0]);
    }
  });

// ---- R-078: a used or expired sign-in link ----
for (const [lang, newLink, send, said, proceed] of [
  [
    "en",
    "Get a new sign-in link",
    "Send me a new link",
    "This sign-in link has expired or was already used. Each link works once, within 15 minutes.",
    "Continue",
  ],
  [
    "es",
    "Pide un enlace nuevo",
    "Enviar un enlace nuevo",
    "Este enlace de acceso ya venció o ya se usó. Cada enlace funciona una sola vez, durante 15 minutos.",
    "Continuar",
  ],
])
  test(`a sign-in link already used, or past its 15 minutes, offers a new one instead of a Continue that cannot work (${lang})`, async ({
    page,
    harness,
    setNow,
  }) => {
    const household = households.rivera;
    await harness.issueInvitation(household);
    const account = harness.url(pathOf("account", lang));
    const expectNewLinkOffer = async () => {
      await expect(page.getByRole("heading", { name: newLink })).toBeFocused();
      await expect(page.locator("#portal [role=alert]").first()).toHaveText(said);
      await expect(page.getByRole("button", { name: proceed, exact: true })).toHaveCount(0);
      await expect(emailBox(page)).toBeVisible();
      // One step: the address, then the button sends a new link.
      const fresh = await emailedLink(page, harness, household.email, page.getByRole("button", { name: send }));
      await expect(page.getByRole("heading", { name: lang === "en" ? "Check your email" : "Revisa tu correo" })).toBeFocused();
      return fresh;
    };
    // Used: followed once, then opened again after signing out.
    await page.goto(account);
    const used = await emailedLink(page, harness, household.email);
    await page.goto(used);
    await page.getByRole("button", { name: proceed, exact: true }).click();
    await expect(page.locator("#family-chat form")).toBeVisible();
    await page.locator("#guest-logout").click();
    await expect(page.locator("#email-login")).toBeVisible();
    await page.goto(used);
    await page.getByRole("button", { name: proceed, exact: true }).click();
    const fresh = await expectNewLinkOffer();
    // Expired: the new link, opened 16 minutes later.
    await setNow(harness.now() + 16 * 60_000);
    await page.goto(fresh);
    await page.getByRole("button", { name: proceed, exact: true }).click();
    const newest = await expectNewLinkOffer();
    // And the link it sends works.
    await page.goto(newest);
    await page.getByRole("button", { name: proceed, exact: true }).click();
    await expect(page.locator("#family-chat form")).toBeVisible();
  });

// ---- R-084, R-085, R-166: Contact ----
const reply = {
  // L10N-04: Contact has no form; signed in, guests write from My account.
  en: "Write to that address and we’ll reply by email. Or sign in and write to us from My account, where our replies appear.",
  es: "Si escribes a ese correo, te respondemos por correo. También puedes entrar y escribirnos desde Mi cuenta, donde aparecen nuestras respuestas.",
};
for (const lang of ["en", "es"])
  test(`Contact leads with the address, says where a reply appears, and makes sending a message here a quiet second choice (${lang})`, async ({
    page,
    harness,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // A regular panel's heading, for comparison (the note page's sign-in).
    await page.goto(harness.url(pathOf("guestbook", lang)));
    const panelHeading = await page.locator("#portal h2").evaluate((h) => parseFloat(getComputedStyle(h).fontSize));
    await page.goto(harness.url(pathOf("contact", lang)));
    const main = page.getByRole("main"),
      address = main.getByRole("link", { name: "misxv@simplysoph.com" }),
      where = main.locator(".contact-reply"),
      portal = page.locator("#portal");
    await expect(where).toHaveText(reply[lang]);
    await expect(portal.getByRole("heading", { name: lang === "en" ? "Or write to us from My account" : "O escríbenos desde Mi cuenta" })).toBeVisible();
    // Address first, then where replies appear, then the sign-in.
    const top = async (locator) => (await locator.boundingBox()).y;
    expect(await top(address)).toBeLessThan(await top(where));
    expect(await top(where)).toBeLessThan(await top(portal));
    // No panel around the sign-in, and its heading a step smaller.
    const look = await portal.evaluate((el) => {
      const s = getComputedStyle(el);
      return { fill: s.backgroundColor, border: s.borderLeftStyle, heading: parseFloat(getComputedStyle(el.querySelector("h2")).fontSize) };
    });
    expect(look.fill).toBe("rgba(0, 0, 0, 0)");
    expect(look.border).toBe("none");
    expect(look.heading).toBeLessThan(panelHeading);
    // Nothing from the event settings: today's text, no host line.
    await expect(main.locator("[data-contact-host]")).toBeHidden();
  });

test("signed in, Contact points to the thread on My account instead of a second form; signed out it offers the sign-in", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/contact/"));
  await expect(page.locator("#email-login")).toBeVisible();
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/contact/"));
  await expect(page.getByRole("heading", { name: "Your messages with us" })).toBeVisible();
  await expect(page.locator("#portal form")).toHaveCount(0);
  const thread = page.getByRole("link", { name: "Write to us in My account" });
  await expect(thread).toHaveAttribute("href", "/account/");
  await thread.click();
  await expect(page.locator("#family-message")).toBeVisible();
  await page.goto(harness.url("/es/contact/"));
  await expect(page.getByRole("heading", { name: "Tus mensajes con nosotros" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Escríbenos en Mi cuenta" })).toHaveAttribute("href", "/es/account/");
});

test("Contact shows the family's named host from the event settings, under its first line, and nothing while it is empty", async ({
  page,
  harness,
}) => {
  const host = page.locator("[data-contact-host]");
  await page.goto(harness.url("/contact/"));
  await expect(page.locator("#portal h2")).toBeVisible();
  await expect(host).toBeHidden();
  await expect(host).toHaveText("");
  const { site } = await harness.admin("site");
  await harness.admin("site", {
    ...site,
    contact: { host: { en: "The hosts read every message.", es: "Los anfitriones leen cada mensaje." } },
  });
  for (const [lang, line] of [
    ["en", "The hosts read every message."],
    ["es", "Los anfitriones leen cada mensaje."],
  ]) {
    await page.goto(harness.url(pathOf("contact", lang)));
    await expect(host).toBeVisible();
    await expect(host).toHaveText(line);
    expect(await host.evaluate((el) => el.previousElementSibling.matches(".lead"))).toBe(true);
  }
});

// ---- R-073: tab titles ----
test("a tab title names a step only once the guest has acted", async ({ page, harness }) => {
  const household = households.rivera;
  const { code } = await harness.issueInvitation(household);
  await page.goto(harness.url("/contact/"));
  await expect(page.locator("#email-login")).toBeVisible();
  await expect(page).toHaveTitle("Contact · Sophia’s Quinceañera");
  await emailBox(page).fill(household.email);
  await sendButton(page).click();
  await expect(page).toHaveTitle("Check your email · Contact · Sophia’s Quinceañera");
  await page.goto(harness.url("/rsvp/"));
  await expect(page.getByRole("heading", { name: "Open your invitation" })).toBeVisible();
  await expect(page).toHaveTitle("RSVP · Sophia’s Quinceañera");
  await page.getByRole("textbox", { name: "Invitation link or code" }).fill(code);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("heading", { name: household.name })).toBeFocused();
  await expect(page).toHaveTitle(`${household.name} · RSVP · Sophia’s Quinceañera`);
  await page.goto(harness.url("/es/contact/"));
  await expect(page.locator("#email-login")).toBeVisible();
  await expect(page).toHaveTitle("Contacto · Los XV de Sophia");
});

// ---- R-075: "contact us" in an error is a link ----
for (const [lang, alert, words, contact] of [
  ["en", "That invitation could not be opened. Check the link or contact us.", "contact us", "/contact/"],
  // The RSVP speaks to the household (ustedes), its errors too (R-034).
  ["es", "No pudimos abrir la invitación. Revisen el enlace o escríbannos.", "escríbannos", "/es/contact/"],
])
  test(`“${words}” in an error is a link to Contact, made from text, never markup (${lang})`, async ({ page, harness }) => {
    await page.goto(harness.url(pathOf("rsvp", lang)));
    await page.getByRole("textbox", { name: /Invitation link or code|Enlace o código de invitación/ }).fill("AAAA-BBBB-CCCC-DDDD");
    await page.getByRole("button", { name: /^(Continue|Continuar)$/ }).click();
    const box = page.locator("#access .error");
    await expect(box).toHaveText(alert);
    await expect(box.getByRole("link", { name: words, exact: true })).toHaveAttribute("href", contact);
    // A message is only ever text: markup in it stays words.
    const made = await page.evaluate(async () => {
      const { sayError } = await import("/client.js");
      const p = document.createElement("p");
      sayError(p, '<img src="x"> Please contact us, or write to misxv@simplysoph.com.');
      return { tags: [...p.querySelectorAll("*")].map((el) => el.tagName), links: [...p.querySelectorAll("a")].map((a) => a.getAttribute("href")), text: p.textContent };
    });
    expect(made.tags).toEqual(["A", "A"]);
    expect(made.links).toEqual([contact, "mailto:misxv@simplysoph.com"]);
    expect(made.text).toBe('<img src="x"> Please contact us, or write to misxv@simplysoph.com.');
  });

// ---- R-076: the skip link focuses main ----
test("the skip link moves focus to the main content itself, with no ring drawn around it", async ({ page, harness }) => {
  for (const [path, name] of [
    ["/", "Skip to content"],
    ["/contact/", "Skip to content"],
    ["/es/account/", "Ir al contenido"],
    ["/details/", "Skip to content"],
  ]) {
    await page.goto(harness.url(path));
    const skip = page.getByRole("link", { name });
    await skip.focus();
    await page.keyboard.press("Enter");
    const main = page.locator("main");
    await expect(main, path).toBeFocused();
    expect(await main.evaluate((el) => getComputedStyle(el).outlineStyle), path).toBe("none");
    // The next Tab goes on inside the main content.
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest("main")), path).toBe(true);
  }
});

// ---- R-077: Copy address ----
for (const [lang, label, copied] of [
  ["en", "Copy address", "Address copied"],
  ["es", "Copiar dirección", "Dirección copiada"],
])
  test(`“${label}” says “${copied}” through the polite region, and its label comes back (${lang})`, async ({
    page,
    context,
    harness,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: harness.origin });
    await page.goto(harness.url(pathOf("ceremony", lang)));
    await page.waitForLoadState("networkidle");
    const button = page.locator("[data-copy-address]");
    await expect(button).toHaveText(label);
    const before = (await button.boundingBox()).width;
    await button.click();
    await expect(page.locator("#announce")).toHaveText(copied);
    await expect(button).toHaveText(copied);
    expect((await button.boundingBox()).width).toBeGreaterThanOrEqual(before - 0.5);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await button.getAttribute("data-copy-address"));
    await expect(button).toHaveText(label, { timeout: 6000 });
  });

// ---- R-090: words that sounded like software ----
for (const [lang, label, signed, caption] of [
  ["en", "Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)", "Our reply:", "Open the full invitation (opens in a new tab)"],
  ["es", "¿Algo que debamos saber? Alergias, necesidades de accesibilidad o una canción que les gustaría escuchar (opcional)", "Nuestra respuesta:", "Ver la invitación completa (se abre en otra pestaña)"],
])
  test(`the RSVP note, our replies and the invitation link say it plainly (${lang})`, async ({ page, harness }) => {
    const household = households.rivera;
    const { link } = await harness.issueInvitation(household, { locale: lang });
    await page.goto(harness.forBrowser(link));
    await expect(page.getByRole("textbox", { name: label, exact: true })).toBeVisible();
    // "opens in a new tab" is said once.
    await page.goto(harness.url(pathOf("", lang)));
    await expect(page.locator(".invitation figcaption a")).toHaveAccessibleName(caption);
    // Our reply in the thread is signed by Sophia's family, not "Family:".
    const id = "0a1b2c3d-9999-4999-8999-000000000002";
    await harness.ledger.transaction((s) => {
      s.messages ??= {};
      s.messages[id] = {
        id,
        householdId: household.id,
        kind: "contact",
        name: household.name,
        text: "Is there parking?",
        state: "pending",
        at: harness.now() - 86_400_000,
        replies: [{ text: "Yes.", at: harness.now() - 3_600_000 }],
      };
    });
    await page.goto(harness.url(pathOf("account", lang)));
    await signIn(page, harness, household.email);
    const answer = page.locator("#thread blockquote");
    await expect(answer).toHaveText(`${signed} Yes.`);
    await expect(answer.locator("strong")).toHaveText(signed);
  });

// ---- 320 px ----
test("My account and Contact reflow at 320px, signed out and signed in, in both languages", async ({ page, harness }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 640 });
  const household = households.rivera;
  await harness.issueInvitation(household);
  for (const lang of ["en", "es"]) {
    await page.goto(harness.url(pathOf("account", lang)));
    await expect(page.locator("#email-login")).toBeVisible();
    await page.locator("[data-invitation-way] summary").click();
    await fits(page, `${lang} /account/ signed out`);
    await page.goto(harness.url(pathOf("contact", lang)));
    await expect(page.locator("#email-login")).toBeVisible();
    await fits(page, `${lang} /contact/ signed out`);
    await emailBox(page).fill("not.on.the.list@example.com");
    await sendButton(page).click();
    await expect(page.locator(".nothing-yet")).toBeVisible();
    await fits(page, `${lang} /contact/ check your email`);
  }
  await page.goto(harness.url("/account/"));
  await signIn(page, harness, household.email);
  for (const lang of ["en", "es"]) {
    await page.goto(harness.url(pathOf("account", lang)));
    await expect(page.locator("#family-chat form")).toBeVisible();
    await fits(page, `${lang} /account/ signed in`);
    await page.goto(harness.url(pathOf("contact", lang)));
    await expect(page.locator("#portal .button")).toBeVisible();
    await fits(page, `${lang} /contact/ signed in`);
  }
});
