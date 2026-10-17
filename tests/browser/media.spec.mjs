// Sharing photos and videos, and the guests' gallery, from a phone's point of
// view: the printed QR opens /share/ signed out, the guest signs in and comes
// back, picks files straight from the phone (a JPEG, an iPhone .MOV, one clip
// too long, one HEIC photo), and sees each file's progress and outcome. The
// gallery shows one clear state at a time. Files are made up on the spot.
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { uploadQuota } from "../../server/upload-quota.mjs";
import { signIn as signInAs } from "./media-helpers.mjs";

const accountLink = /href="(https:\/\/127\.0\.0\.1:\d+\/(?:es\/)?account\/#[A-Za-z0-9_-]{43})"/;
async function signIn(page, harness, email) {
  await page.getByRole("textbox", { name: "Email" }).first().fill(email);
  const before = harness.sent.length;
  await page.getByRole("button", { name: "Email my sign-in link" }).click();
  // Sign-in requests answer in no less than 0.9 s by design: wait for the email.
  await expect.poll(() => harness.sent.slice(before).some((m) => m.to === email)).toBe(true);
  const mail = harness.sent.slice(before).findLast((m) => m.to === email);
  await page.goto(harness.forBrowser(mail.html.match(accountLink)[1]));
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
  // Round 2 review (R-088): the sign-in is explained once, by the form, not
  // again in the steps and in a note above the form.
  const english = await page.locator("main").evaluate((m) => {
    const copy = m.cloneNode(true);
    copy.querySelectorAll("[lang=es], [hidden]").forEach((el) => el.remove());
    return copy.textContent;
  });
  expect(english.match(/where you received your invitation/g)).toHaveLength(1);
  expect(english.match(/no password/gi)).toHaveLength(1);
  await expect(page.getByText("Sign in with your email to continue.")).toHaveCount(0);
  // Sharing during the party is covered too, not only afterwards.
  await expect(page.locator(".share-intro .lead")).toHaveText("Share your photos and videos, during the party or after it.");

  await signIn(page, harness, household.email);
  // The QR's page again, now with the upload form and without the steps.
  await expect(page).toHaveURL(harness.url("/share/"));
  await expect(page.getByRole("heading", { name: "Add your photos & videos" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How to share" })).toBeHidden();
  // Round 2 review (R-089) replaced the wall of limits with one line; sizes
  // and how many may be shared appear only in a file's own note.
  await expect(page.locator("#upload-help")).toHaveText(
    "Choose up to 10 photos or videos (60 seconds or less) from your phone.",
  );
  await expect(page.locator("#photo")).not.toContainText(/MB|a day|household/);
  const chooser = page.getByLabel("Choose photos & videos");
  await expect(chooser).toHaveAttribute("accept", /video\/quicktime/);
  // The chooser speaks the page's language: a button and a count line.
  await expect(page.locator("label.file-button")).toHaveText("Choose photos & videos");
  await expect(page.locator("#upload-chosen")).toHaveText("No files chosen yet");

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
  await expect(page.locator("#upload-chosen")).toHaveText("4 files chosen");
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
  await expect
    .poll(() => harness.sent.map((m) => m.subject))
    .toContainEqual(expect.stringMatching(/New photo awaiting review/));
  expect(await harness.processMedia()).toMatchObject({ converted: 1 });
  await expect
    .poll(() => harness.sent.map((m) => m.subject))
    .toContainEqual(expect.stringMatching(/New video awaiting review/));
});

// The upload form follows the site's form conventions (site/client.js): what
// is missing is listed in the page's language, not in browser bubbles, and
// the Send button keeps focus while it is busy.
test("the upload form lists what is missing and keeps focus on Send while sending", async ({
  page,
  harness,
}) => {
  const household = households.rivera;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/share/"));
  await signIn(page, harness, household.email);
  await expect(page.getByRole("heading", { name: "Add your photos & videos" })).toBeVisible();
  const form = page.locator("#photo"),
    send = page.getByRole("button", { name: "Send my photos & videos" });
  await expect(form).toHaveAttribute("novalidate", "");
  await expect(send).toBeEnabled();
  await send.click();
  const summary = form.locator(".error-summary");
  await expect(summary).toBeFocused();
  // One line per kind of problem, over a list of the fields to fix.
  await expect(summary.locator("p")).toHaveText(["Choose:", "Tick the box:"]);
  await expect(summary.getByRole("listitem")).toHaveText([
    "Photos & videos",
    "Permission from the people pictured",
  ]);
  const chooser = page.getByLabel("Choose photos & videos");
  await expect(chooser).toHaveAttribute("aria-invalid", "true");
  await expect(chooser).toHaveAccessibleDescription(/Choose at least one file\./);
  // Chosen, but nothing that can be sent: said next to the button.
  await chooser.setInputFiles([{ name: "IMG_0200.HEIC", mimeType: "image/heic", buffer: Buffer.from("not really a photo") }]);
  await page.getByLabel(/I have permission from the people pictured/).check();
  await send.click();
  await expect(form.locator("p.error")).toHaveText(
    "None of the files you chose can be sent. See the note next to each one, then choose others.",
  );
  await expect(send).toBeFocused();

  const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#d7b779" } })
    .jpeg()
    .toBuffer();
  await chooser.setInputFiles([{ name: "IMG_0201.JPG", mimeType: "image/jpeg", buffer: photo }]);
  await page.getByLabel(/I have permission from the people pictured/).check();
  // Hold the file on its way, to see the form while it is busy.
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await page.route(/\/api\/uploads\/[a-f0-9-]{36}\?offset=0$/, async (route) => {
    await held;
    await route.continue();
  });
  await send.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#upload-summary")).toContainText("Sending your files");
  await expect(summary).toHaveCount(0);
  // While busy the button says what it is doing, so its name changes too.
  const busy = form.locator("button[type=submit]");
  await expect(busy).toHaveAccessibleName("Sending…");
  await expect(busy).toHaveAttribute("aria-disabled", "true");
  await expect(busy).toBeFocused();
  await expect(chooser).toBeDisabled();
  release();
  await expect(page.locator("#upload-summary")).toContainText("1 of 1 arrived. Thank you!");
  await expect(send).not.toHaveAttribute("aria-disabled");
  await expect(send).toBeFocused();
  await expect(chooser).toBeEnabled();
});

// Round 2 review, section 4 (R-025, R-026): at the limit the summary said
// "paused, check your connection and tap Try again", and "Try again" could
// not succeed for hours. Now it says the limit the API gave and when more
// fit, and offers no Try again. The numbers come from the API's one setting.
for (const lang of ["en", "es"])
  test(`${lang.toUpperCase()}: at the limit the page names it and says when more fit, with no Try again and no "check your connection"`, async ({
    page,
    harness,
  }) => {
    const es = lang === "es",
      household = households.rivera,
      limit = uploadQuota.perDay;
    await harness.issueInvitation(household);
    // The family's last upload places all began an hour ago (12:00 PM,
    // Thursday, October 1, Fort Worth time), so the next fits 24 hours later.
    const began = harness.now() - 3600000;
    await harness.ledger.transaction((s) => (s.uploadsBegun = { [household.id]: Array(limit).fill(began) }));
    await page.goto(harness.url(es ? "/es/share/" : "/share/"));
    await signInAs(page, harness, household.email, { es });
    await expect(page).toHaveURL(harness.url(es ? "/es/share/" : "/share/"));
    const sentence = es
      ? `Tu familia ya compartió ${limit} fotos y videos en las últimas 24 horas, el máximo que podemos recibir a la vez. Puedes agregar más después de las 12:00 p. m. del viernes 2 de octubre.`
      : `Your family has shared ${limit} photos and videos in the last 24 hours, the most we can take at once. You can add more after 12:00 PM on Friday, October 2.`;
    // Said before choosing anything.
    await expect(page.locator("#upload-room")).toHaveText(sentence);
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#d7b779" } }).jpeg().toBuffer();
    await page.getByLabel(es ? "Elige fotos y videos" : "Choose photos & videos").setInputFiles([
      { name: "IMG_0301.JPG", mimeType: "image/jpeg", buffer: photo },
      { name: "IMG_0302.JPG", mimeType: "image/jpeg", buffer: photo },
    ]);
    await page.getByLabel(es ? /Tengo permiso/ : /I have permission/).check();
    const send = page.getByRole("button", { name: es ? "Enviar mis fotos y videos" : "Send my photos & videos" });
    await send.click();
    const summary = page.locator("#upload-summary");
    await expect(summary).toHaveText(`${es ? "Llegaron 0 de 2." : "0 of 2 arrived."} ${sentence}`);
    await expect(page.locator(".upload-result")).toHaveCount(2);
    for (const row of await page.locator(".upload-result").all())
      await expect(row).toContainText(es ? "No se envió: se alcanzó el límite." : "Not sent: the limit is reached.");
    await expect(page.getByRole("button", { name: es ? "Reintentar" : "Try again" })).toHaveCount(0);
    await expect(page.locator("#photo")).not.toContainText(es ? /revisa tu conexión|mañana/ : /check your connection|tomorrow/);
    // Focus stays on Send after a batch that could not finish (A7-V08), and
    // pressing it again repeats the reason instead of "nothing can be sent".
    await expect(send).toBeFocused();
    await page.getByLabel(es ? "Elige fotos y videos" : "Choose photos & videos").setInputFiles([
      { name: "IMG_0303.JPG", mimeType: "image/jpeg", buffer: photo },
    ]);
    await send.click();
    await expect(summary).toHaveText(`${es ? "Llegaron 0 de 1." : "0 of 1 arrived."} ${sentence}`);
    expect(Object.keys((await harness.ledger.read()).uploads || {})).toEqual([]);
  });

test("a lost connection still pauses with the connection message and Try again, which resumes", async ({ page, harness }) => {
  const household = households.morales;
  await harness.issueInvitation(household);
  await page.goto(harness.url("/share/"));
  await signIn(page, harness, household.email);
  // The page's quick retries wait 1, 3, 8 and 15 seconds before it pauses.
  test.setTimeout(75_000);
  let online = false;
  await page.route(/\/api\/uploads\/[a-f0-9-]{36}\?offset=\d+$/, (route) =>
    online ? route.continue() : route.abort("internetdisconnected"),
  );
  const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#651625" } }).jpeg().toBuffer();
  await page.getByLabel("Choose photos & videos").setInputFiles([{ name: "IMG_0401.JPG", mimeType: "image/jpeg", buffer: photo }]);
  await page.getByLabel(/I have permission/).check();
  await page.getByRole("button", { name: "Send my photos & videos" }).click();
  const summary = page.locator("#upload-summary");
  await expect(summary).toHaveText("0 of 1 arrived. Sending paused; check your connection and tap Try again.", {
    timeout: 45_000,
  });
  const again = page.getByRole("button", { name: "Try again" });
  await expect(again).toBeVisible();
  online = true;
  await again.click();
  await expect(summary).toContainText("1 of 1 arrived. Thank you!");
});

test("the gallery shows one clear state: sign in, nothing yet, then only albums and sections that have something", async ({
  page,
  harness,
  setNow,
}) => {
  // After the celebration (before it, an empty gallery says when it opens:
  // tests/browser/gallery.spec.mjs).
  await setNow(Date.parse("2027-01-16T12:00:00-06:00"));
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
