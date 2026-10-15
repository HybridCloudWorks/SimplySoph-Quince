// What every page shares (site/client.js): forms that check themselves in the
// page's language, a busy button that keeps focus, honest messages when the
// server is in trouble, navigation menus that let go of focus, and the
// page-wide note that can be closed and never hides the focused control.
import { test, expect } from "./fixtures.mjs";

test("a form lists what is missing in the page’s language and moves focus to that list", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/es/contact/"));
  const form = page.locator("#email-login");
  await expect(form).toHaveAttribute("novalidate", "");
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  const summary = form.locator(".error-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toHaveText("Completa: Correo electrónico");
  const email = page.getByRole("textbox", { name: "Correo electrónico" });
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toHaveAccessibleDescription(/Completa este campo\./);
  await expect(page).toHaveTitle(/^Error: /);
  await summary.getByRole("link", { name: "Correo electrónico" }).click();
  await expect(email).toBeFocused();
  // An address that isn't one.
  await email.fill("rivera.family");
  await page.getByRole("button", { name: "Enviar enlace de acceso" }).click();
  await expect(summary).toHaveText("Revisa el correo: Correo electrónico");
  expect(harness.sent).toEqual([]);
});

test("a server error page reads as trouble on our end, and the busy button keeps focus", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/contact/"));
  await page.route("**/api/auth/email/request", (route) =>
    route.fulfill({
      status: 502,
      contentType: "text/html",
      body: "<!doctype html><title>502 Bad Gateway</title>",
    }),
  );
  await page.getByRole("textbox", { name: "Email" }).fill("rivera.family@example.com");
  const send = page.getByRole("button", { name: "Email my sign-in link" });
  await send.click();
  await expect(page.locator("#email-login .error")).toHaveText(
    "Something went wrong on our end. Your answers are still here — try again in a minute, or email misxv@simplysoph.com.",
  );
  await expect(page.getByText(/not open yet/)).toHaveCount(0);
  // Disabling the focused button used to drop focus to the page.
  await expect(send).toBeFocused();
  await expect(send).toBeEnabled();
});

test("a menu closes on Escape with focus back on its button, and when focus leaves it", async ({
  page,
  harness,
}) => {
  await page.goto(harness.url("/"));
  const menu = page.locator(".nav-group").first();
  const summary = menu.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();

  // Tabbing past the last item closes it instead of leaving it over the page.
  await page.keyboard.press("Enter");
  const links = await menu.getByRole("link").count();
  for (let i = 0; i <= links; i++) await page.keyboard.press("Tab");
  await expect(menu).not.toHaveAttribute("open", "");
});

test("the page-wide note can be closed and does not cover the control that has focus", async ({
  page,
  harness,
}) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto(harness.url("/contact/"));
  const button = page.getByRole("button", { name: "Email my sign-in link" });
  await button.focus();
  await page.evaluate(async () => {
    const { notify } = await import("/client.js");
    notify("Photos are being prepared.");
  });
  const note = page.locator("#status");
  await expect(note).toContainText("Photos are being prepared.");
  // The focused button sits above the note, in view.
  await expect
    .poll(async () => {
      const [noteBox, buttonBox] = [await note.boundingBox(), await button.boundingBox()];
      return buttonBox.y >= 0 && buttonBox.y + buttonBox.height <= noteBox.y;
    })
    .toBe(true);
  await note.getByRole("button", { name: "Close" }).click();
  await expect(note).toBeEmpty();
  await expect(button).toBeFocused();
});
