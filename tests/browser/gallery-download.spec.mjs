// "Download all photos" on the gallery, in English and Spanish: a signed-in
// guest sees the action once the family has approved photos, saves them as
// one ZIP through the browser's own downloader, and is told in words when the
// photos changed under the page. The owner can turn the action off. Photos
// are made up on the spot; the household is synthetic.
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { siteSettings } from "../../server/site-settings.mjs";
import { readZip } from "../zip-reader.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
async function signIn(page, harness, email) {
  await page.getByRole("textbox", { name: "Email" }).first().fill(email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
// A photo as the upload leaves it (stored, waiting for review); the family
// then approves it the way Admin → Photos does.
async function approvedPhoto(harness, id, album, shade) {
  const jpeg = await sharp({ create: { width: 48, height: 32, channels: 3, background: shade } }).jpeg().toBuffer();
  await harness.media.put(id, jpeg, "photo");
  await harness.ledger.transaction((s) => {
    s.photos[id] = { id, kind: "photo", album, caption: "A caption with ../ in it", state: "pending", receivedAt: harness.now() };
  });
  await harness.moderate(id, "approved");
  return jpeg;
}

// After the celebration, when there are photos to download (before the
// ceremony the gallery says when photos open instead: tests/browser/gallery.spec.mjs).
const AFTER = Date.parse("2027-01-16T12:00:00-06:00");

test("a signed-in guest downloads all approved photos as one ZIP, in English and Spanish", async ({ page, harness, setNow }) => {
  await setNow(AFTER);
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/gallery/"));
  await page.getByRole("link", { name: "Sign in to see the gallery" }).click();
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  // Nothing approved yet: no download action.
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Download all photos" })).toHaveCount(0);

  const first = await approvedPhoto(harness, "31111111-1111-4111-8111-111111111111", "family", "#d7b779");
  const second = await approvedPhoto(harness, "32222222-2222-4222-8222-222222222222", "event", "#651625");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Download all photos" })).toBeVisible();
  const link = page.getByRole("link", { name: /^Download all \(2 photos, about 0\.1 MB\)$/ });
  await expect(link).toHaveAttribute("download", "sophia-xv-photos.zip");
  await expect(page.getByText("Large files: on a phone, use Wi-Fi.")).toBeVisible();
  // A real target on a phone: at least 44 px tall, and the page fits 320 px.
  expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 320, height: 720 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await page.setViewportSize({ width: 1280, height: 720 });

  const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
  expect(download.suggestedFilename()).toBe("sophia-xv-photos.zip");
  const zip = readZip(await readFile(await download.path()));
  expect(zip.entries.map((e) => e.name)).toEqual(["sophia-xv-family-001.jpg", "sophia-xv-event-001.jpg"]);
  expect(zip.entries[0].data.equals(first)).toBe(true);
  expect(zip.entries[1].data.equals(second)).toBe(true);

  // The family approves one more while the page is open: the old link would
  // now get a different file, so the page says so and shows the new list.
  await approvedPhoto(harness, "33333333-3333-4333-8333-333333333333", "event", "#203040");
  await link.click();
  const alert = page.locator(".download-all [role=alert]");
  await expect(alert).toHaveText(
    "Photos were added or removed since this page opened, so the parts changed. The list below is up to date: download from it again.",
  );
  await expect(alert).toBeFocused();
  await expect(page.getByRole("link", { name: /^Download all \(3 photos, about 0\.1 MB\)$/ })).toBeVisible();

  await page.goto(harness.url("/es/gallery/"));
  await expect(page.getByRole("heading", { name: "Descargar todas las fotos" })).toBeVisible();
  const enlace = page.getByRole("link", { name: /^Descargar todo \(3 fotos, unos 0\.1 MB\)$/ });
  await expect(page.getByText("Archivos grandes: en el teléfono, usa wifi.")).toBeVisible();
  const [descarga] = await Promise.all([page.waitForEvent("download"), enlace.click()]);
  expect(readZip(await readFile(await descarga.path())).entries).toHaveLength(3);
});

test("when the owner keeps downloading everything to administrators, guests do not see the action", async ({ page, harness, setNow }) => {
  await setNow(AFTER);
  const household = households.morales;
  await harness.issueInvitation(household);
  await approvedPhoto(harness, "34444444-4444-4444-8444-444444444444", "event", "#d7b779");
  await harness.ledger.transaction((s) => {
    s.site = { ...siteSettings(s), gallery: { download: "admins" } };
  });
  await page.goto(harness.url("/account/?return=gallery"));
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  // The gallery itself is unchanged; only the download-all action is gone.
  await expect(page.getByRole("img", { name: "A caption with ../ in it" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Download all photos" })).toHaveCount(0);
  await expect(page.locator(".download-all")).toHaveCount(0);
});
