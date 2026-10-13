import { defineConfig, devices } from "@playwright/test";
// Browser journeys in tests/browser, run with `npm run test:browser` (Chromium
// only). `npm test` and `npm run check` never need a downloaded browser.
export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.mjs",
  timeout: 20_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries: a flaky journey should show up as a failure, not pass quietly.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    locale: "en-US",
    timezoneId: "America/Chicago",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium" }],
});
