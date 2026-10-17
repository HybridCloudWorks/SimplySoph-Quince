// The printed table card on a phone (R-021, R-022): scanning it opens
// /share/#party=<code>, the page trades the code for an upload-only session
// and takes it out of the address bar, and anyone at the party (Mia, 15, not
// on any household's row) shares without signing in. Outside the party
// upload window the page says why and offers the usual sign-in. Viewing is
// unchanged: the gallery still asks for a sign-in. Made-up files only.
import { test, expect } from "./fixtures.mjs";
import { tableCard, jpeg } from "./media-helpers.mjs";

const PARTY_NIGHT = Date.parse("2027-01-15T21:15:00-06:00");
const phone = { width: 390, height: 844 };

test("EN: a guest at the table shares from the card without signing in, and the file waits for review, labelled", async ({
  page,
  harness,
  setNow,
}) => {
  await setNow(PARTY_NIGHT);
  await page.setViewportSize(phone);
  const card = await tableCard(harness);
  await page.goto(card.url);
  await expect(page.getByRole("heading", { name: "Add your photos & videos" })).toBeVisible();
  // The code is gone from the address bar (and so from history and copies).
  await expect(page).toHaveURL(harness.url("/share/"));
  expect(await page.evaluate(() => location.hash)).toBe("");
  await expect(page.locator(".party-note")).toContainText("there’s nothing to sign in to");
  await expect(page.locator(".party-note")).toContainText("we don’t ask for your email");
  // No sign-in anywhere in the party flow, and no link to a gallery it can't see.
  await expect(page.getByRole("heading", { name: "How to share" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Email my sign-in link" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "View the gallery" })).toHaveCount(0);
  await expect(page.locator("#upload-help")).toHaveText("Choose up to 10 photos or videos (60 seconds or less) from your phone.");
  await page.getByLabel("Choose photos & videos").setInputFiles([
    { name: "IMG_2101.JPG", mimeType: "image/jpeg", buffer: await jpeg() },
  ]);
  await expect(page.locator("#upload-chosen")).toHaveText("1 photo chosen");
  await page.getByRole("textbox", { name: "Your name (optional)" }).fill("Mia");
  // Consent is required on this path too.
  const send = page.getByRole("button", { name: "Send my photos & videos" });
  await send.click();
  await expect(page.locator(".error-summary")).toHaveText("Tick the box: Permission from the people pictured");
  await page.getByLabel(/I have permission from the people pictured/).check();
  await send.click();
  const row = page.locator(".upload-result").filter({ hasText: "IMG_2101.JPG" });
  await expect(row).toContainText("Arrived. We'll review it before it appears in the gallery.");
  await expect(row).toContainText(/Reference: [0-9A-F]{4}-[0-9A-F]{4}\./);
  await expect(page.locator("#upload-summary")).toContainText("1 of 1 arrived. Thank you!");
  await expect(page.locator("#upload-summary")).toContainText("email misxv@simplysoph.com with its reference");
  // Focus stays on Send once the batch is done (A7-V08).
  await expect(send).toBeFocused();
  // In the family's queue: pending, from the table card, with the name.
  const rows = Object.values((await harness.ledger.read()).photos);
  expect(rows.map((r) => [r.state, r.source, r.uploaderName])).toEqual([["pending", "party", "Mia"]]);
  const ref = (await row.textContent()).match(/Reference: ([0-9A-F-]{9})/)[1];
  expect((await harness.admin("moderation")).photos[0].ref).toBe(ref);
  // The card never opens the gallery.
  await page.goto(harness.url("/gallery/"));
  await expect(page.getByRole("link", { name: "Sign in to see the gallery" })).toBeVisible();
  await expect(page.locator("[data-gallery] img")).toHaveCount(0);
});

test("the Spanish switch is on the first phone screen of the card's page, and the card's session follows it into Spanish", async ({
  page,
  harness,
  setNow,
}) => {
  await setNow(PARTY_NIGHT);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto((await tableCard(harness)).url);
  await expect(page.getByRole("heading", { name: "Add your photos & videos" })).toBeVisible();
  const spanish = page.locator('.site-header a[href="/es/share/"]');
  await expect(spanish).toBeInViewport();
  await spanish.click();
  await expect(page).toHaveURL(harness.url("/es/share/"));
  await expect(page.getByRole("heading", { name: "Agrega tus fotos y videos" })).toBeVisible();
  await expect(page.locator(".party-note")).toContainText("Estás compartiendo desde la tarjeta de la mesa");
});

test("ES: the card in Spanish, the file picker in Spanish, and a file taken back before the review", async ({
  page,
  harness,
  setNow,
}) => {
  await setNow(PARTY_NIGHT);
  await page.setViewportSize(phone);
  const { code } = await tableCard(harness);
  await page.goto(harness.url("/es/share/#party=" + code));
  await expect(page.getByRole("heading", { name: "Agrega tus fotos y videos" })).toBeVisible();
  await expect(page).toHaveURL(harness.url("/es/share/"));
  await expect(page.locator("#upload-help")).toHaveText(
    "Elige hasta 10 fotos o videos (de 60 segundos o menos) desde tu teléfono.",
  );
  // The picker: a button and a count line in Spanish, never the browser's
  // "Choose Files / No file chosen".
  await expect(page.locator("label.file-button")).toHaveText("Elige fotos y videos");
  await expect(page.locator("#upload-chosen")).toHaveText("Aún no has elegido archivos");
  const chooser = page.getByLabel("Elige fotos y videos");
  await chooser.setInputFiles([
    { name: "IMG_3101.JPG", mimeType: "image/jpeg", buffer: await jpeg() },
    { name: "IMG_3102.JPG", mimeType: "image/jpeg", buffer: await jpeg(800, 600, "#651625") },
    { name: "IMG_3103.MOV", mimeType: "video/quicktime", buffer: Buffer.from("not really a video") },
  ]);
  await expect(page.locator("#upload-chosen")).toHaveText("3 archivos elegidos");
  await chooser.setInputFiles([
    { name: "IMG_3101.JPG", mimeType: "image/jpeg", buffer: await jpeg() },
    { name: "IMG_3102.JPG", mimeType: "image/jpeg", buffer: await jpeg(800, 600, "#651625") },
  ]);
  await expect(page.locator("#upload-chosen")).toHaveText("2 fotos elegidas");
  await page.getByLabel(/Tengo permiso de las personas que aparecen/).check();
  await page.getByRole("button", { name: "Enviar mis fotos y videos" }).click();
  await expect(page.locator("#upload-summary")).toContainText("Llegaron 2 de 2. ¡Gracias!");
  const row = page.locator(".upload-result").filter({ hasText: "IMG_3102.JPG" });
  await expect(row).toContainText(/Referencia: [0-9A-F]{4}-[0-9A-F]{4}\./);
  // Taken back: the button goes, focus lands on what happened to the file.
  await row.getByRole("button", { name: "Quitar IMG_3102.JPG" }).click();
  await expect(row).toContainText("Lo quitaste antes de que alguien lo viera.");
  await expect(row.locator("[data-status]")).toBeFocused();
  expect(Object.values((await harness.ledger.read()).photos).length).toBe(1);
});

test("outside the party window the card says when it opens or that it closed, and offers the usual sign-in", async ({
  page,
  harness,
  setNow,
}) => {
  await page.setViewportSize(phone);
  await setNow(Date.parse("2027-01-14T20:00:00-06:00"));
  const card = await tableCard(harness);
  await page.goto(card.url);
  await expect(page.locator("[role=alert].notice")).toHaveText(
    "Sharing from the table card opens on Friday, January 15 at 4:00 PM. Until then, guests on our list can share here.",
  );
  await expect(page).toHaveURL(harness.url("/share/"));
  await expect(page.getByRole("button", { name: "Email my sign-in link" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to share" })).toBeVisible();

  await setNow(Date.parse("2027-01-18T09:00:00-06:00"));
  await page.goto(card.url);
  await expect(page.locator("[role=alert].notice")).toHaveText(
    "Sharing from the table card has closed. Guests on our list can still share here.",
  );
  await expect(page.getByRole("button", { name: "Email my sign-in link" })).toBeVisible();
  // Spanish, from the Spanish page.
  await page.goto(harness.url("/es/share/#party=" + card.code));
  await expect(page.locator("[role=alert].notice")).toHaveText(
    "Ya no se puede compartir desde la tarjeta de la mesa. Los invitados de nuestra lista todavía pueden compartir aquí.",
  );
  await expect(page.getByRole("button", { name: "Enviar enlace de acceso" })).toBeVisible();
});

test("dormant: with no card created, a card address opens nothing", async ({ page, harness, setNow }) => {
  await setNow(PARTY_NIGHT);
  await page.goto(harness.url("/share/#party=" + "A".repeat(43)));
  await expect(page.locator("[role=alert].notice")).toHaveText(
    "This table card isn’t working. Ask the family for the current card.",
  );
  await expect(page.getByRole("button", { name: "Email my sign-in link" })).toBeVisible();
  expect(Object.values((await harness.ledger.read()).sessions).some((s) => s.kind === "party")).toBe(false);
});

test("Admin → Photos: the family turns the card on, downloads it once, sees table-card files labelled, and turns it off", async ({
  page,
  context,
  harness,
  setNow,
}) => {
  await setNow(PARTY_NIGHT);
  await context.addCookies([harness.ownerCookie()]);
  await page.goto(harness.url("/admin/photos/"));
  const card = page.locator("[data-party-card]");
  await expect(card).toContainText("The table card is off.");
  await page.getByRole("button", { name: "Create the table card" }).click();
  await expect(card).toContainText("The table card is on.");
  await expect(card.getByRole("img", { name: /The table card: a QR code/ })).toBeVisible();
  const download = card.getByRole("link", { name: "Download the card to print" });
  await expect(download).toHaveAttribute("download", "table-card.svg");
  expect(decodeURIComponent((await download.getAttribute("href")).split(",")[1])).toMatch(/^<svg /);
  await expect(card).toContainText("Friday, January 15 at 4:00 PM");
  // Reloaded, the picture is gone: the code was never stored.
  await page.reload();
  await expect(card).toContainText("The table card is on.");
  await expect(card.getByRole("img")).toHaveCount(0);
  // A guest's file from the card shows where it came from.
  await harness.ledger.transaction((s) => {
    s.photos["33333333-3333-4333-8333-333333333333"] = {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "photo",
      album: "event",
      caption: "",
      state: "pending",
      source: "party",
      uploaderName: "Mia",
    };
  });
  await harness.media.put("33333333-3333-4333-8333-333333333333", await jpeg(), "photo");
  await page.reload();
  await expect(page.locator(".cards .card").filter({ hasText: "From the table card" })).toContainText(
    "Name given: Mia. Reference 3333-3333.",
  );
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Turn off the table card" }).click();
  await expect(card).toContainText("The table card is off");
  expect((await harness.admin("party-card")).state).toBe("closed");
});
