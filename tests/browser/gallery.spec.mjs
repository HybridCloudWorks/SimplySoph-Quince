// The gallery around the celebration (R-071, R-081): before the ceremony an
// empty gallery says when photos open, with no sign-in wall; approved items
// that already exist are never hidden by that; a signed-in guest sees how
// many of their own files wait for review; a photo opens larger in an
// accessible dialog, at phone and desktop sizes, in English and Spanish.
// Viewing still needs a sign-in. Made-up households and files only.
import { test, expect } from "./fixtures.mjs";
import { households } from "./harness.mjs";
import { signIn, approvedMedia, accountOf } from "./media-helpers.mjs";

const BEFORE = Date.parse("2026-10-17T12:00:00-05:00"),
  AFTER = Date.parse("2027-01-16T12:00:00-06:00");
const ids = {
  dance: "11111111-1111-4111-8111-111111111111",
  cake: "22222222-2222-4222-8222-222222222222",
  clip: "44444444-4444-4444-8444-444444444444",
  baby: "55555555-5555-4555-8555-555555555555",
  mine: "66666666-6666-4666-8666-666666666666",
};

for (const lang of ["en", "es"])
  test(`${lang.toUpperCase()}: before the celebration an empty gallery says when photos open, with no sign-in wall`, async ({
    page,
    harness,
    setNow,
  }) => {
    await setNow(BEFORE);
    await page.goto(harness.url(lang === "es" ? "/es/gallery/" : "/gallery/"));
    const panel = page.locator("[data-gallery-state]");
    if (lang === "es") {
      await expect(panel.getByRole("heading")).toHaveText("Las fotos estarán aquí después de la celebración");
      await expect(panel).toContainText("del viernes 15 de enero aparecerán aquí después de la celebración");
      await expect(panel.getByRole("link", { name: "Compartir fotos" })).toHaveAttribute("href", "/es/share/");
      await expect(panel.getByRole("link", { name: "Déjale un mensaje a Sophia" })).toHaveAttribute("href", "/es/guestbook/");
    } else {
      await expect(panel.getByRole("heading")).toHaveText("Photos open after the celebration");
      await expect(panel).toContainText("from Friday, January 15 appear here after the celebration");
      await expect(panel.getByRole("link", { name: "Share your photos" })).toHaveAttribute("href", "/share/");
      await expect(panel.getByRole("link", { name: "Leave Sophia a note" })).toHaveAttribute("href", "/guestbook/");
    }
    // No sign-in wall.
    await expect(page.locator('main a[href*="/account/"]')).toHaveCount(0);
    await expect(page.locator("main form")).toHaveCount(0);
  });

test("from the ceremony on, the gallery asks for a sign-in as before", async ({ page, harness, setNow }) => {
  await setNow(Date.parse("2027-01-15T16:00:00-06:00"));
  await page.goto(harness.url("/gallery/"));
  await expect(page.getByRole("link", { name: "Sign in to see the gallery" })).toBeVisible();
  await expect(page.getByText("Photos open after the celebration")).toHaveCount(0);
});

test("approved photos that exist before the celebration are never hidden by the 'open after' line", async ({
  page,
  harness,
  setNow,
}) => {
  await setNow(BEFORE);
  await approvedMedia(harness, [{ id: ids.baby, album: "family", caption: "Sophia at one year old" }]);
  await page.goto(harness.url("/gallery/"));
  // Signed out: there is something to see, so the sign-in it needs.
  await expect(page.getByRole("link", { name: "Sign in to see the gallery" })).toBeVisible();
  await expect(page.getByText("Photos open after the celebration")).toHaveCount(0);
  await page.getByRole("link", { name: "Sign in to see the gallery" }).click();
  await signIn(page, harness, households.morales.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  await expect(page.getByRole("img", { name: "Sophia at one year old" })).toBeVisible();
  await expect(page.getByText("Photos open after the celebration")).toHaveCount(0);
});

test("a signed-in uploader sees how many of their own files wait for review, before and after the celebration", async ({
  page,
  harness,
  setNow,
}) => {
  await setNow(BEFORE);
  const household = households.rivera;
  await page.goto(harness.url("/account/?return=gallery"));
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  await expect(page.getByRole("heading", { name: "Photos open after the celebration" })).toBeVisible();
  await expect(page.locator("[data-gallery-pending]")).toBeHidden();
  // Two of this person's files wait; someone else's does not count.
  const me = await accountOf(harness, household.email);
  await approvedMedia(harness, [
    { id: ids.mine, state: "pending", accountId: me },
    { id: ids.cake, state: "processing", kind: "video", accountId: me },
    { id: ids.dance, state: "pending", accountId: "someone-else" },
  ]);
  await page.reload();
  await expect(page.locator("[data-gallery-pending]")).toHaveText(
    "You have 2 files waiting for our review. They appear here once we’ve looked.",
  );
  await expect(page.getByRole("heading", { name: "Photos open after the celebration" })).toBeVisible();
  // Three months later the sign-in has long ended: sign in again.
  await setNow(AFTER);
  await page.reload();
  await page.getByRole("link", { name: "Sign in to see the gallery" }).click();
  await signIn(page, harness, household.email);
  await expect(page).toHaveURL(harness.url("/gallery/"));
  await expect(page.locator("[data-gallery-pending]")).toHaveText(
    "You have 2 files waiting for our review. They appear here once we’ve looked.",
  );
  await expect(page.getByRole("heading", { name: "Nothing here yet" })).toBeVisible();
  // Their files are not shown before the family's review.
  await expect(page.locator("[data-gallery] img")).toHaveCount(0);
});

// Structural accessibility checks that need no extra package: names for every
// control and image, unique ids, nothing wider than the window.
async function structure(page) {
  return page.evaluate(() => {
    const name = (el) =>
      (el.getAttribute("aria-label") || el.textContent || el.querySelector("img")?.alt || "").trim();
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
    return {
      overflow: document.documentElement.scrollWidth - window.innerWidth,
      unnamedButtons: [...document.querySelectorAll("main button, dialog button")].filter((b) => !name(b)).length,
      imagesWithoutAlt: [...document.querySelectorAll("main img")].filter((i) => !i.hasAttribute("alt")).length,
      duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
      // The grid's controls in the order Tab reaches them, with where they sit.
      order: [...document.querySelectorAll("[data-gallery] :is(button, a[href]), [data-videos] :is(video[controls], a[href])")].map(
        (el) => {
          const r = el.getBoundingClientRect();
          return [Math.round(r.top + window.scrollY), Math.round(r.left)];
        },
      ),
    };
  });
}
for (const [lang, size] of [
  ["en", { width: 390, height: 844 }],
  ["en", { width: 1440, height: 900 }],
  ["es", { width: 390, height: 844 }],
  ["es", { width: 1440, height: 900 }],
])
  test(`${lang.toUpperCase()} ${size.width}px: approved photos and a video lay out, and a photo opens larger by keyboard and by tap`, async ({
    page,
    harness,
    setNow,
  }) => {
    const es = lang === "es";
    await setNow(AFTER);
    await page.setViewportSize(size);
    await approvedMedia(harness, [
      { id: ids.dance, album: "family", caption: "Abuela dancing", width: 1600, height: 1200 },
      { id: ids.cake, album: "event", caption: "", width: 900, height: 1400, color: "#e9c77b" },
      { id: ids.clip, kind: "video", album: "event", caption: "First dance" },
    ]);
    await page.goto(harness.url(es ? "/es/account/?return=gallery" : "/account/?return=gallery"));
    await signIn(page, harness, households.morales.email, { es });
    await expect(page).toHaveURL(harness.url(es ? "/es/gallery/" : "/gallery/"));
    await expect(page.locator("[data-gallery] figure")).toHaveCount(2);
    const s = await structure(page);
    expect(s.overflow, "no sideways scrolling").toBeLessThanOrEqual(0);
    expect(s.unnamedButtons).toBe(0);
    expect(s.imagesWithoutAlt).toBe(0);
    expect(s.duplicateIds).toEqual([]);
    // Tab follows the reading order: down the page, left to right in a row.
    for (let i = 1; i < s.order.length; i++) {
      const [top, left] = s.order[i],
        [prevTop, prevLeft] = s.order[i - 1];
      expect(top > prevTop + 4 || (Math.abs(top - prevTop) <= 4 && left >= prevLeft), `control ${i} after ${i - 1}`).toBe(true);
    }
    // Videos keep their own controls and no enlarge button.
    await expect(page.locator("[data-videos] video")).toHaveAttribute("controls", "");
    await expect(page.locator("[data-videos] [data-enlarge]")).toHaveCount(0);

    // Keyboard: the photo's own button opens the dialog, focus starts on
    // Close, Tab goes round inside it, Escape closes it and focus comes back.
    const caption = "Abuela dancing";
    const open = page.getByRole("button", { name: es ? `Ver más grande: ${caption}` : `View larger: ${caption}` });
    await open.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: caption });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img", { name: caption })).toBeVisible();
    const close = dialog.getByRole("button", { name: es ? "Cerrar" : "Close" }),
      download = dialog.getByRole("link", { name: es ? "Descargar" : "Download" });
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(download).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(download).toBeFocused();
    expect(await dialog.evaluate((d) => d.open && d.matches(":modal"))).toBe(true);
    // The big photo fits the window.
    const box = await dialog.getByRole("img").boundingBox();
    expect(box.width).toBeLessThanOrEqual(size.width);
    expect(box.height).toBeLessThanOrEqual(size.height);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    // A tap on a photo (no caption: its description is the default one).
    const plain = es ? "Foto de la celebración" : "Photo from the celebration";
    await page.locator(`[data-gallery] img[data-enlarge="${ids.cake}"]`).click();
    const second = page.getByRole("dialog", { name: plain });
    await expect(second).toBeVisible();
    await second.getByRole("button", { name: es ? "Cerrar" : "Close" }).click();
    await expect(second).toBeHidden();
    await expect(page.getByRole("button", { name: es ? `Ver más grande: ${plain}` : `View larger: ${plain}` })).toBeFocused();
  });
