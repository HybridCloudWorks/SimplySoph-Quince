// Playwright fixtures shared by the browser journeys. Each test gets its own
// harness (server, ledger, Notion and mailbox), so tests never share state.
import { test as base, expect } from "@playwright/test";
import { startHarness, googleCredential } from "./harness.mjs";

export { expect };
export const test = base.extend({
  harness: async ({}, use, testInfo) => {
    const harness = await startHarness();
    await use(harness);
    await harness.close();
    // On failure, keep what the server saw next to the trace.
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach("server-log.json", {
        body: JSON.stringify(harness.logs, null, 2),
        contentType: "application/json",
      });
      if (harness.notion.unexpected.length)
        await testInfo.attach("unexpected-notion-calls.txt", {
          body: harness.notion.unexpected.join("\n"),
          contentType: "text/plain",
        });
    }
  },
  // No outside network: only the harness on 127.0.0.1 answers. Anything else
  // (Google Fonts, Google sign-in, Microsoft) is aborted unless a test mocks it
  // with page.route, which takes precedence over this context route. Depends
  // on the harness so the server outlives the pages it serves.
  context: async ({ context, harness: _ }, use, testInfo) => {
    const blocked = [],
      errors = [];
    await context.route(
      (url) => url.hostname !== "127.0.0.1",
      (route) => {
        blocked.push(route.request().url());
        return route.abort("blockedbyclient");
      },
    );
    // Uncaught exceptions in any page of the test fail it: a broken script
    // must not pass because the assertions happened to run first. Playwright's
    // clock (setFixedTime below) runs timers itself and reports an exception
    // thrown in a timer as a console error, not an uncaught one, so console
    // errors count too. The site never logs on purpose; the only expected
    // console errors are failed loads (4xx answers, blocked outside requests).
    context.on("weberror", (e) =>
      errors.push(String(e.error()?.stack || e.error())),
    );
    context.on("console", (message) => {
      if (
        message.type() === "error" &&
        !message.text().startsWith("Failed to load resource")
      )
        errors.push(message.text());
    });
    await use(context);
    if (blocked.length)
      await testInfo.attach("blocked-requests.txt", {
        body: blocked.join("\n"),
        contentType: "text/plain",
      });
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
  // The browser's clock follows the server's (the confirmation page compares
  // Date.now() with the deadline). Timers keep running normally.
  page: async ({ page, harness }, use) => {
    await page.clock.setFixedTime(harness.now());
    await use(page);
  },
  // Moves the server and browser clocks together.
  setNow: async ({ page, harness }, use) => {
    await use(async (time) => {
      harness.setNow(time);
      await page.clock.setFixedTime(time);
    });
  },
});

// Google Identity Services reduced to the two calls site/sso.js makes:
// initialize({ client_id, nonce, callback }) and renderButton(target, options).
// The button returns an ID token for `identity`, bound to the nonce of the
// page's one-time ticket, in the harness credential format that the harness's
// verifyGoogle reads. Only this script is mocked; the API checks are real.
export async function mockGoogleSignIn(page, identity) {
  await page.exposeBinding("harnessGoogleCredential", (_source, nonce) =>
    googleCredential({ ...identity, nonce }),
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "text/javascript; charset=utf-8",
      body: `(() => {
  let config = null;
  window.google = { accounts: { id: {
    initialize(options) { config = options; },
    renderButton(target) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Sign in with Google";
      button.addEventListener("click", async () => {
        const credential = await window.harnessGoogleCredential(config.nonce);
        config.callback({ credential, select_by: "btn" });
      });
      target.replaceChildren(button);
    },
  } } };
})();`,
    }),
  );
}
