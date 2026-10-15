// Sharing photos and videos, and the guests' gallery, from a phone's point of
// view: the printed QR opens /share/ signed out, the guest signs in and comes
// back, picks files straight from the phone (a JPEG, an iPhone .MOV, one clip
// too long, one HEIC photo), and sees each file's progress and outcome. The
// gallery shows one clear state at a time. Files are made up on the spot.
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
async function signIn(page, harness, email) {
  await page.getByRole("textbox", { name: "Email" }).first().fill(email);
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  await page.goto(harness.forBrowser(harness.sent.at(-1).html.match(accountLink)[1]));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}
// An MP4/MOV as a phone writes it: media data first, the movie header (with
// its length) at the end. Only the length matters here.
function phoneVideo(seconds) {
  const box = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(8 + body.length);
    head.write(type, 4, "ascii");
    return Buffer.concat([head, body]);
  };
  const mvhd = Buffer.alloc(20);
  mvhd.writeUInt32BE(600, 12);
  mvhd.writeUInt32BE(600 * seconds, 16);
  return Buffer.concat([
    box("ftyp", Buffer.from("qt  \0\0\0\0qt  ")),
    box("mdat", randomBytes(3 * 1024 * 1024)),
    box("moov", box("mvhd", mvhd)),
  ]);
}

test("the table QR opens a two-language explanation, and after sign-in a guest shares phone photos and videos", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/share/#media-upload"));
  // One screen before sign-in: how it works, a Spanish line, and the sign-in form.
  await expect(page.getByRole("heading", { name: "How to share" })).toBeVisible();
  await expect(page.locator('[data-share-steps] p[lang="es"]')).toContainText("En español:");
  await expect(page.getByRole("link", { name: "Ver esta página en español" })).toHaveAttribute("href", "/es/share/");
  await expect(page.getByRole("button", { name: "Email my sign-in link" })).toBeVisible();
  // No complementary landmark nested in main (axe: landmark-complementary-is-top-level).
  await expect(page.locator("main aside, main [role=complementary]")).toHaveCount(0);

  await signIn(page, harness, household.email);
  // The QR's page again, now with the upload form and without the steps.
  await expect(page).toHaveURL(harness.url("/share/"));
  await expect(page.getByRole("heading", { name: "Add your photos & videos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to share" })).toBeHidden();
  await expect(page.locator("#upload-help")).toHaveText(
    "Choose photos and short videos straight from your phone, up to 10 at a time. Videos can be up to 60 seconds long. Each photo can be up to 40 MB and each video up to 300 MB. Your household can share up to 20 files a day.",
  );
  const chooser = page.getByLabel("Choose photos & videos");
  await expect(chooser).toHaveAttribute("accept", /video\/quicktime/);

  // The first piece of a file is lost on the way: the page tries again by itself.
  let dropped = false;
  await page.route(/\/api\/uploads\/[a-f0-9-]{36}\?offset=0$/, (route) => {
    if (dropped) return route.continue();
    dropped = true;
    return route.abort("connectionreset");
  });
  const photo = await sharp({ create: { width: 1600, height: 1200, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 30 } } })
    .jpeg()
    .toBuffer();
  await chooser.setInputFiles([
    { name: "IMG_0101.JPG", mimeType: "image/jpeg", buffer: photo },
    { name: "IMG_0102.MOV", mimeType: "video/quicktime", buffer: phoneVideo(20) },
    { name: "IMG_0103.MOV", mimeType: "video/quicktime", buffer: phoneVideo(75) },
    { name: "IMG_0104.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a photo") },
  ]);
  const row = (name) => page.locator(".upload-result").filter({ hasText: name });
  await expect(row("IMG_0103.MOV")).toContainText(
    "This video is 1:15 long. Videos can be up to 60 seconds: trim it in your Photos or Gallery app and choose it again.",
  );
  await expect(row("IMG_0104.HEIC")).toContainText("This photo is in HEIC format, which the site can't open.");
  await expect(row("IMG_0101.JPG")).toContainText("Ready to send");
  await page.getByLabel(/I have permission from the people pictured/).check();
  await page.getByRole("button", { name: "Send my photos & videos" }).click();

  await expect(row("IMG_0101.JPG")).toContainText("Arrived. We'll review it before it appears in the gallery.");
  await expect(row("IMG_0102.MOV")).toContainText("Arrived. We're preparing the video so we can review it; you can close this page.");
  await expect(page.locator("#upload-summary")).toContainText("2 of 2 arrived. Thank you!");
  expect(dropped).toBe(true);
  const rows = Object.values((await harness.ledger.read()).photos);
  expect(rows.map((r) => [r.kind, r.state]).sort()).toEqual([
    ["photo", "pending"],
    ["video", "processing"],
  ]);
  // The family is told about the photo now, and about the video once converted.
  expect(harness.sent.at(-1).subject).toMatch(/New photo awaiting review/);
  expect(await harness.processMedia()).toMatchObject({ converted: 1 });
  expect(harness.sent.at(-1).subject).toMatch(/New video awaiting review/);
});

test("the gallery shows one clear state: sign in, nothing yet, then only albums and sections that have something", async ({
  page,
  harness,
}) => {
  const household = households.morales;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/gallery/"));
  await expect(page.getByRole("heading", { name: "Our guests’ photos and videos" })).toBeVisible();
  const signInLink = page.getByRole("link", { name: "Sign in to see the gallery" });
  await expect(signInLink).toHaveAttribute("href", "/account/?return=gallery");
  await expect(page.getByText("Explore this album")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Photographs" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "The video collection" })).toBeHidden();

  await signInLink.click();
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  await expect(page.locator("[data-gallery-state]").getByRole("link", { name: "Share your photos" })).toHaveAttribute("href", "/share/");
  await expect(page.locator(".album-card")).toHaveCount(0);

  // The family approved a photo for one album and a video for another.
  const photoId = "11111111-1111-4111-8111-111111111111",
    videoId = "22222222-2222-4222-8222-222222222222";
  const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#d7b779" } }).jpeg().toBuffer();
  await harness.media.put(photoId, jpeg, "photo");
  await harness.media.put(videoId, Buffer.from("harness video"), "video");
  await harness.media.put(videoId, jpeg, "poster");
  await harness.ledger.transaction((s) => {
    s.photos[photoId] = { id: photoId, kind: "photo", album: "family", caption: "Abuela dancing", state: "approved" };
    s.photos[videoId] = { id: videoId, kind: "video", album: "event", caption: "", state: "approved", poster: true };
  });
  await page.reload();
  const cards = page.locator(".album-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Family moments 1 photo");
  await expect(cards.first().locator("img")).toHaveAttribute("src", `/api/photo/${photoId}`);
  await expect(cards.nth(1)).toContainText("Event day highlights 1 video");
  await expect(cards.nth(1).locator("img")).toHaveAttribute("src", `/api/photo/${videoId}?poster=1`);
  await expect(page.getByRole("img", { name: "Abuela dancing" })).toBeVisible();
  await expect(page.locator("[data-videos] video")).toHaveAttribute("poster", `/api/photo/${videoId}?poster=1`);
  // Choosing an album shows only its sections.
  await cards.first().click();
  await expect(cards.first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "The video collection" })).toBeHidden();
  await expect(page.locator("[data-album-label]")).toHaveText("Family moments");
  await cards.first().click();
  await expect(page.getByRole("heading", { name: "The video collection" })).toBeVisible();
});
