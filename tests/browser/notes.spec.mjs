// "A note for Sophia": the notes first, under their heading; who can read them
// said the same way on the note page, in the box on the form and on Privacy,
// from the family's one switch; and a household in by its invitation link
// leaving its note without a second sign-in.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

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
// An approved note, as the review queue leaves it.
async function approvedNote(harness, { id, text, display }) {
  await harness.ledger.transaction((s) => {
    s.messages[id] = {
      id,
      email: "",
      topic: "",
      householdId: households.morales.id,
      accountId: null,
      name: "Tía Lupe",
      text,
      kind: "guestbook",
      ...(display ? { display } : {}),
      state: "approved",
      at: harness.now() - 1000,
    };
  });
}
// Whether `a` comes before `b` in the page.
const before = async (a, b) =>
  a.evaluate(
    (x, y) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING),
    await b.elementHandle(),
  );

test("the note page puts the notes first under their heading; signed out it says who can read them, signed in it shows them", async ({
  page,
  harness,
}) => {
  await harness.issueInvitation(households.rivera);
  await approvedNote(harness, { id: "note-1", text: "Feliz cumpleaños, mija.", display: "guests" });
  await page.goto(harness.url("/guestbook/"));
  const notes = page.getByRole("region", { name: "Notes for Sophia" });
  await expect(notes.getByRole("heading", { level: 2 })).toHaveText("Notes for Sophia");
  await expect(notes).toContainText("Only guests who sign in can see the notes here, and only after we read them.");
  const signInHeading = page.getByRole("heading", { name: "Sign in with your email" });
  await expect(signInHeading).toBeVisible();
  // Signed out, the switch's default keeps the notes for signed-in guests.
  await expect(notes.locator("article")).toHaveCount(0);
  expect(await before(notes, signInHeading)).toBe(true);

  await signIn(page, harness, households.rivera.email);
  await expect(page).toHaveURL(harness.url("/guestbook/"));
  await expect(notes.locator("article")).toHaveText(["Feliz cumpleaños, mija.— Tía Lupe"]);
  const form = page.getByRole("heading", { name: "Leave Sophia a note" });
  await expect(form).toBeVisible();
  expect(await before(notes, form)).toBe(true);
  // The box is a real choice, unticked, worded for who would see the note.
  const box = page.getByRole("checkbox", {
    name: "Show my name and note on this page to guests who sign in, once you’ve read it.",
  });
  await expect(box).not.toBeChecked();
  await expect(box).toHaveAccessibleDescription(
    "Leave it unchecked and only Sophia and her family will read your note.",
  );
  await page.getByLabel("Your name, as you’d like it to appear").fill("The Riveras");
  await page.getByLabel("Your note").fill("Happy fifteenth!");
  await box.check();
  await page.getByRole("button", { name: "Send my note" }).click();
  await expect(page.getByText("Thank you! Your note will appear here once we’ve read it.")).toBeVisible();
  const sent = Object.values((await harness.ledger.read()).messages).find((m) => m.text === "Happy fifteenth!");
  expect(sent).toMatchObject({ display: "guests", state: "pending" });
  expect(sent.via).toBeUndefined();

  // Privacy says the same thing, from the same switch.
  await page.goto(harness.url("/privacy/"));
  await expect(page.locator("[data-note-audience]")).toHaveText(
    "We read every note for Sophia before it appears on “A note for Sophia”, and only guests who sign in can see the notes there. If you leave the box to show your note unchecked, only Sophia and her family read it.",
  );
});

test.describe("when the family makes the notes public", () => {
  test("the note page, the box and Privacy say anyone can read them, and visitors who aren't signed in see only the notes whose writers agreed", async ({
    page,
    harness,
  }) => {
    await harness.admin("guestbook-visibility", { visibility: "public" });
    await approvedNote(harness, { id: "note-public", text: "For everyone to read", display: "public" });
    await approvedNote(harness, { id: "note-guests", text: "For our guests only", display: "guests" });
    await page.goto(harness.url("/guestbook/"));
    const notes = page.getByRole("region", { name: "Notes for Sophia" });
    await expect(notes).toContainText("Anyone with the site’s address can see the notes here, after we read them.");
    await expect(notes.locator("article blockquote")).toHaveText(["For everyone to read"]);

    await page.goto(harness.url("/es/privacy/"));
    await expect(page.locator("[data-note-audience]")).toHaveText(
      "Leemos cada mensaje para Sophia antes de que aparezca en “Un mensaje para Sophia”, y cualquier persona con la dirección del sitio puede ver los mensajes ahí. Si dejas sin marcar la casilla para mostrar tu mensaje, solo Sophia y su familia lo leen.",
    );

    // The box, for a household in by its invitation link, in Spanish.
    const { link } = await harness.issueInvitation(households.morales, { locale: "es" });
    await page.goto(harness.forBrowser(link));
    await expect(page.getByRole("button", { name: "Vamos todos" })).toBeVisible();
    await page.goto(harness.url("/es/guestbook/"));
    await expect(page.locator("[data-note-audience]")).toHaveText(
      "Cualquier persona con la dirección del sitio puede ver los mensajes de esta página, después de que los leemos.",
    );
    await expect(
      page.getByRole("checkbox", {
        name: "Pueden mostrar mi nombre y mi mensaje en esta página después de leerlo. Cualquier persona con la dirección del sitio puede ver esta página.",
      }),
    ).not.toBeChecked();
  });
});

test("a Spanish household in by its invitation link leaves Sophia one note without signing in by email", async ({
  page,
  harness,
}) => {
  const household = households.morales;
  const { link } = await harness.issueInvitation(household, { locale: "es" });
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "No podremos asistir" }).click();
  await page.getByRole("button", { name: /^Guardar/ }).click();
  await expect(page.getByRole("heading", { name: "Gracias por avisarnos." })).toBeFocused();
  const sentBefore = harness.sent.length;
  // From the confirmation: tap, write, tick the box, send.
  await page.getByRole("link", { name: "Déjenle un mensaje a Sophia" }).click();
  await expect(page).toHaveURL(harness.url("/es/guestbook/"));
  await expect(page.getByRole("heading", { name: "Entra con tu correo" })).toHaveCount(0);
  await expect(page.getByLabel("Tu nombre, como quieres que aparezca")).toHaveValue("Familia Morales");
  await page.getByLabel("Tu mensaje").fill("Te queremos mucho, Sophia.");
  await page
    .getByRole("checkbox", {
      name: "Pueden mostrar mi nombre y mi mensaje en esta página a los invitados que entran al sitio, después de leerlo.",
    })
    .check();
  await page.getByRole("button", { name: "Enviar mi mensaje" }).click();
  await expect(page.getByText("¡Gracias! Tu mensaje aparecerá aquí cuando lo hayamos leído.")).toBeVisible();
  const [note] = Object.values((await harness.ledger.read()).messages);
  expect(note).toMatchObject({
    via: "link",
    householdId: household.id,
    name: "Familia Morales",
    text: "Te queremos mucho, Sophia.",
    display: "guests",
    state: "pending",
  });
  expect(harness.sent.slice(sentBefore).some((m) => m.to === household.email)).toBe(false);
  // One note per invitation link: a second is refused, with the way to write more.
  await page.goto(harness.url("/es/guestbook/"));
  await page.getByLabel("Tu mensaje").fill("Otro mensaje");
  await page.getByRole("button", { name: "Enviar mi mensaje" }).click();
  await expect(page.locator("#message .error")).toHaveText(
    "Tu familia ya envió un mensaje desde este enlace de invitación. Para escribir otro, entra con tu correo.",
  );
  expect(Object.values((await harness.ledger.read()).messages)).toHaveLength(1);
  // The link still reads no notes: the list stays empty for this session.
  await expect(page.locator("[data-notes] article")).toHaveCount(0);
});

test("on Admin → Messages the family sets who can read approved notes, and each note says what its writer agreed to and where it came from", async ({
  page,
  context,
  harness,
}) => {
  // A note sent from an invitation link with the box unchecked.
  await harness.ledger.transaction((s) => {
    s.messages["link-note"] = {
      id: "link-note",
      email: "",
      topic: "",
      householdId: households.rivera.id,
      accountId: null,
      via: "link",
      generation: 1,
      name: "Rivera Family",
      text: "Just for you, Sophia.",
      kind: "guestbook",
      display: "family",
      state: "pending",
      at: harness.now(),
    };
  });
  await context.addCookies([await harness.adminCookie()]);
  await page.goto(harness.url("/admin/guestbook/"));
  const form = page.getByRole("group", { name: "Who can read approved notes on “A note for Sophia”" });
  await expect(form.getByRole("radio", { name: /Guests who sign in \(default\)/ })).toBeChecked();
  const card = page.locator(".cards > .card").filter({ hasText: "Just for you, Sophia." });
  await expect(card).toContainText("The writer left the box unchecked: for Sophia and the family only. It can’t be shown.");
  await expect(card).toContainText("Sent from the household’s invitation link, without an email sign-in.");
  await expect(card.getByRole("button", { name: "Approve" })).toHaveCount(0);

  await form.getByRole("radio", { name: /Anyone with the site’s address/ }).check();
  await page.getByRole("button", { name: "Save who can read notes" }).click();
  await expect(page.locator("#status")).toContainText(
    "Saved: approved notes whose writers agreed can now be read by anyone",
  );
  expect((await harness.ledger.read()).guestbook).toEqual({ visibility: "public" });
  await page.goto(harness.url("/guestbook/"));
  await expect(page.locator("[data-note-audience]")).toHaveText(
    "Anyone with the site’s address can see the notes here, after we read them.",
  );
});
