// This repository is public, so the people in its tests are made up and their
// addresses use the domains reserved for examples (RFC 2606: example.com,
// example.org, example.net, .test), never a real mailbox provider's. A
// provider's domain stays only where the domain itself is what is tested.
import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const providers = /[\w.%+-]+@(?:gmail|googlemail|outlook|hotmail|live|msn|yahoo|icloud|me|aol|proton|protonmail)\.(?:com|me)\b/i;
const kept = {
  // server/auth.mjs: a personal Microsoft account must carry a Microsoft address.
  "sso.test.mjs": "personal Microsoft accounts",
  // server/auth.mjs: Google sign-in takes a gmail.com address or a Workspace domain.
  "google-verifier.test.mjs": "Google's gmail.com rule",
  "hardening.test.mjs": "Google's gmail.com rule",
  "browser/sign-in.spec.mjs": "Google's gmail.com rule",
  // Fixtures from before round 2, not about the domain; unchanged here.
  "application.test.mjs": "older fixture",
  "notifications.test.mjs": "older fixture",
  "notion-adapter.test.mjs": "older fixture",
};

test("made-up people in the tests use example domains, except where a provider's domain is the point", async () => {
  const found = [];
  for (const file of await readdir(new URL("./", import.meta.url), { recursive: true })) {
    if (!/\.m?js$/.test(file) || file in kept) continue;
    const text = await readFile(new URL(file, import.meta.url), "utf8");
    for (const [i, line] of text.split("\n").entries()) if (providers.test(line)) found.push(`tests/${file}:${i + 1}`);
  }
  assert.deepEqual(found, []);
});
