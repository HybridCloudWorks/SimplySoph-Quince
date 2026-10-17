// Sessions that run out while their page is open (WCAG 2.2.1 Timing
// Adjustable; P5-A11Y-01, P5-A11Y-03, QA-01, QA-02). A page warns two minutes
// before the end, with a button that keeps the session; using the page keeps
// it on its own; and once it really ends, the guest is told how to come
// back: the RSVP keeps the answers, and a table card phone is told to scan
// the card again, never to open an invitation link or sign in. The page's
// clock and the server's move together (page.clock.install). Synthetic
// households and made-up photos only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { tableCard, jpeg } from "./media-helpers.mjs";

const PARTY_NIGHT = Date.parse("2027-01-15T21:15:00-06:00");
const MIN = 60_000;
// Starts both clocks at `at`, paused: time moves only through `walk`.
async function freeze(page, harness, at) {
  harness.setNow(at);
  await page.clock.install({ time: at });
  await page.clock.pauseAt(at);
}
// Moves both clocks on by `ms`, running the page's timers on the way.
async function walk(page, harness, ms) {
  harness.setNow(harness.now() + ms);
  await page.clock.runFor(ms);
}
const sessionRow = async (harness, scope) =>
  Object.values((await harness.ledger.read()).sessions).find((s) => s.scope === scope);

test("the RSVP warns two minutes before its session ends, Keep going keeps it, and an ending says so before Save, answers kept", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  const opened = harness.now();
  await freeze(page, harness, opened);
  await page.goto(harness.forBrowser(link));
  await page.getByRole("button", { name: "Everyone’s coming" }).click();
  const heading = page.getByRole("heading", { name: "Review your RSVP" });
  await expect(heading).toBeFocused();
  const note = page.locator("#status");
  // Nothing is said while there is time.
  await walk(page, harness, 27 * MIN);
  await expect(note).toBeEmpty();
  // Two minutes before the end: a warning, with a way to keep going.
  await walk(page, harness, MIN + 1000);
  await expect(note).toContainText("Still there? For your security, this page stops saving in 2 minutes.");
  const keep = note.getByRole("button", { name: "Keep going" });
  await keep.focus();
  await page.keyboard.press("Enter");
  await expect(note).toBeEmpty();
  // Focus goes back to where it was, and the server kept the session.
  await expect(heading).toBeFocused();
  await expect.poll(async () => (await sessionRow(harness, "rsvp")).expiresAt).toBe(opened + 28 * MIN + 1000 + 30 * MIN);
  await page.clock.runFor(200);
  await expect(page.locator("#announce")).toHaveText("You have more time.");
  // Left alone again, it ends: the review says so now, not after Save.
  await walk(page, harness, 30 * MIN + 1000);
  await expect(page.locator("#portal .error")).toHaveText(
    "Your invitation link timed out. Open your invitation email again; your answers are kept here.",
  );
  await expect(note).toBeEmpty();
  await expect(page.getByRole("main").getByRole("listitem").first()).toHaveText("Ceremony: 2 adults/teens, 1 child");
});

test("filling in the RSVP keeps its session without any warning", async ({ page, harness }) => {
  const household = households.rivera;
  const { link } = await harness.issueInvitation(household);
  const opened = harness.now();
  await freeze(page, harness, opened);
  await page.goto(harness.forBrowser(link));
  await expect(page.getByRole("heading", { name: "Rivera Family" })).toBeVisible();
  await walk(page, harness, 20 * MIN);
  await page.getByRole("textbox", { name: /Anything we should know/ }).fill("No nuts, please");
  await expect.poll(async () => (await sessionRow(harness, "rsvp")).expiresAt).toBe(opened + 50 * MIN);
  await walk(page, harness, 27 * MIN);
  await expect(page.locator("#status")).toBeEmpty();
  await expect(page.locator("#portal .error")).toBeEmpty();
});

for (const lang of ["en", "es"]) {
  const es = lang === "es";
  test(`${lang.toUpperCase()}: a table card phone is kept while it chooses, warned before its time runs out, then told to scan the card again, with focus on it`, async ({
    page,
    harness,
  }) => {
    await freeze(page, harness, PARTY_NIGHT);
    const card = await tableCard(harness);
    await page.goto(harness.url((es ? "/es" : "") + "/share/#party=" + card.code));
    await expect(page.getByRole("heading", { name: es ? "Agrega tus fotos y videos" : "Add your photos & videos" })).toBeVisible();
    // Choosing photos 20 minutes in keeps the card's session (30 more minutes).
    await walk(page, harness, 20 * MIN);
    const renewed = page.waitForResponse((r) => r.url().endsWith("/api/session"));
    await page.getByLabel(es ? "Elige fotos y videos" : "Choose photos & videos").setInputFiles([
      { name: "IMG_3101.JPG", mimeType: "image/jpeg", buffer: await jpeg(400, 300) },
    ]);
    await renewed;
    await walk(page, harness, 9 * MIN);
    const note = page.locator("#status");
    await expect(note).toBeEmpty();
    // Then the phone sits on the table: a warning two minutes before the end.
    await walk(page, harness, 19 * MIN + 1000);
    await expect(note).toContainText(
      es ? "¿Sigues ahí? Esta página dejará de enviar en 2 minutos." : "Still there? This page stops sending in 2 minutes.",
    );
    await expect(note.getByRole("button", { name: es ? "Seguir compartiendo" : "Keep sharing" })).toBeVisible();
    // Nobody answers: the card's time runs out, and the page says how to come back.
    await walk(page, harness, 2 * MIN);
    const error = page.locator("#photo .error[role=alert]");
    const words = es
      ? "Se terminó tu tiempo con la tarjeta de la mesa. Vuelve a escanear la tarjeta de tu mesa para seguir compartiendo."
      : "Your time with the table card ran out. Scan the card on your table again to keep sharing.";
    await expect(error).toHaveText(words);
    await expect(error).toBeFocused();
    await expect(note).toBeEmpty();
    // Send now says the same, never the invitation link or the email sign-in.
    await page.getByLabel(es ? /Tengo permiso/ : /I have permission/).check();
    await page.getByRole("button", { name: es ? "Enviar mis fotos y videos" : "Send my photos & videos" }).click();
    await expect(error).toHaveText(words);
    await expect(error).toBeFocused();
    await expect(page.locator("#portal")).not.toContainText(es ? /enlace de invitación|Mi cuenta/ : /invitation link|My account/);
    // A reload says it too, above the sign-in for guests on the list.
    await page.reload();
    await expect(page.locator("#portal [role=alert]").first()).toHaveText(words);
  });
}

test("a table card replaced while a phone has the page open: the phone is told to scan the new card", async ({ page, harness }) => {
  await freeze(page, harness, PARTY_NIGHT);
  const card = await tableCard(harness);
  await page.goto(card.url);
  await page.getByLabel("Choose photos & videos").setInputFiles([{ name: "IMG_3201.JPG", mimeType: "image/jpeg", buffer: await jpeg(400, 300) }]);
  await page.getByLabel(/I have permission/).check();
  await harness.admin("party-card", { action: "rotate" });
  await page.getByRole("button", { name: "Send my photos & videos" }).click();
  const error = page.locator("#photo .error[role=alert]");
  await expect(error).toHaveText("This table card was replaced with a new one. Scan the new card on your table to keep sharing.");
  await expect(error).toBeFocused();
  expect(Object.values((await harness.ledger.read()).photos)).toEqual([]);
});
