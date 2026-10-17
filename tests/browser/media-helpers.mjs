// Shared steps for the photo journeys (party.spec.mjs, gallery.spec.mjs):
// the emailed sign-in, the table card, made-up photos and approved media.
import sharp from "sharp";
import { expect } from "./fixtures.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
// The emailed sign-in, from a page that shows the email form (EN or ES).
export async function signIn(page, harness, email, { es = false } = {}) {
  await page.getByRole("textbox", { name: es ? "Correo electrónico" : "Email" }).first().fill(email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: es ? "Enviar enlace de acceso" : "Email my sign-in link" }).click();
  // Sign-in requests answer in no less than 0.9 s by design: wait for the email.
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: es ? "Continuar" : "Continue", exact: true }).click();
}
// The family turns the table card on (Admin → Photos); returns the address
// printed on the card, for this browser.
export async function tableCard(harness) {
  const made = await harness.admin("party-card", { action: "create" });
  return { url: harness.forBrowser(made.url), code: made.url.split("#party=")[1] };
}
export const jpeg = (width = 1200, height = 900, background = "#d7b779") =>
  sharp({ create: { width, height, channels: 3, background } }).jpeg().toBuffer();
// Approved media, as the family's review leaves it: photos in two albums and
// a video with its poster.
export async function approvedMedia(harness, rows) {
  for (const r of rows) {
    if (r.kind === "video") {
      await harness.media.put(r.id, Buffer.from("harness video"), "video");
      await harness.media.put(r.id, await jpeg(64, 36, "#651625"), "poster");
    } else await harness.media.put(r.id, await jpeg(r.width || 1200, r.height || 900, r.color), "photo");
  }
  await harness.ledger.transaction((s) => {
    for (const r of rows)
      s.photos[r.id] = {
        id: r.id,
        kind: r.kind || "photo",
        album: r.album || "event",
        caption: r.caption || "",
        state: r.state || "approved",
        ...(r.kind === "video" ? { poster: true } : {}),
        ...(r.accountId ? { accountId: r.accountId } : {}),
      };
  });
}
// The account the emailed sign-in created for this address.
export async function accountOf(harness, email) {
  return Object.values((await harness.ledger.read()).accounts || {}).find((a) => a.email === email)?.id;
}
