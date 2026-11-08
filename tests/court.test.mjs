// The court of honor (#108): names and portraits come only from the runtime
// event settings, never from this public repository. The settings rules, the
// public portrait route, the shared renderer, and the built court page's
// runtime slot. All names are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Ledger, memoryAdapter, memoryMedia } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token } from "../server/auth.mjs";
import { validateSettings } from "../server/site-settings.mjs";
import { celebration } from "../site/celebration.mjs";
import { courtSection, courtPhotoUrl, COURT_MAX } from "../site/court.mjs";

const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-01T18:00:00Z"),
  portrait = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222",
  pending = "33333333-3333-4333-8333-333333333333";
const court = [
  { name: "Example Escort", role: "escort" },
  { name: "Example Dama", role: "dama", pair: 1, line: { en: "Her cousin", es: "Su prima" }, photo: portrait },
  { name: "Example Chambelán", role: "chambelan", pair: 1 },
];

async function fixture() {
  const ledger = new Ledger(memoryAdapter()),
    media = memoryMedia(),
    adminToken = token();
  const app = createApplication({
    ledger,
    notion: { read: async () => null, list: async () => [], project: async () => {}, projectContact: async () => {}, projectAccount: async () => {} },
    mailer: { configured: false, send: async () => {} },
    verifyGoogle: async () => ({}),
    media,
    key: Buffer.alloc(32, 7),
    origin,
    adminEmails: ["owner@example.com"],
    now: () => at,
  });
  await ledger.transaction((s) => {
    s.sessions[hash(adminToken)] = { kind: "admin", actor: "owner", email: "owner@example.com", csrf: "admin-csrf", expiresAt: at + 86400000 };
    s.photos[portrait] = { id: portrait, state: "approved", kind: "photo" };
    s.photos[other] = { id: other, state: "approved", kind: "photo" };
    s.photos[pending] = { id: pending, state: "pending", kind: "photo" };
  });
  for (const id of [portrait, other, pending]) await media.put(id, Buffer.from("jpeg " + id), "photo");
  const call = (path, body, headers = {}) =>
    app.dispatch({ path: "/api/" + path, method: body ? "POST" : "GET", body, headers: { origin, ...headers }, ip: "test" });
  return {
    call,
    admin: (path, body) => call("admin/" + path, body, { cookie: "__session=" + adminToken, "x-csrf-token": "admin-csrf" }),
  };
}

test("the court is validated: roles, pairs of at most two, lines in both languages or neither, portraits by photo ID", () => {
  assert.equal(validateSettings(celebration).court, undefined);
  assert.deepEqual(validateSettings({ ...celebration, court: [] }).court, []);
  assert.deepEqual(validateSettings({ ...celebration, court: [{ name: " Example ", role: "dama", pair: "2", line: { en: "", es: "" }, photo: "" }] }).court, [
    { name: "Example", role: "dama", pair: 2, line: null, photo: null },
  ]);
  assert.equal(validateSettings({ ...celebration, court }).court[1].photo, portrait);
  for (const bad of [
    "not a list",
    [{ name: "", role: "dama" }],
    [{ name: "Example", role: "queen" }],
    [{ name: "Example", role: "dama", pair: 0 }],
    [{ name: "Example", role: "escort", pair: 1 }],
    [{ name: "Example", role: "dama", line: { en: "Only English", es: "" } }],
    [{ name: "Example", role: "dama", photo: "../../etc/passwd" }],
    [{ name: "Example\u0007", role: "dama" }],
    [1, 2, 3].map((n) => ({ name: "Example " + n, role: "dama", pair: 1 })),
    Array.from({ length: COURT_MAX + 1 }, (_, n) => ({ name: "Example " + n, role: "dama" })),
  ])
    assert.throws(() => validateSettings({ ...celebration, court: bad }), { code: "INVALID_SITE_SETTINGS" }, JSON.stringify(bad).slice(0, 80));
});

test("the court is served with the public site, and kept by a save that doesn't send it", async () => {
  const f = await fixture();
  assert.equal((await f.call("site")).site.court, undefined, "nothing until the family writes it");
  const { site } = await f.admin("site");
  const saved = (await f.admin("site", { ...site, court })).site;
  assert.equal((await f.call("site")).site.court.length, 3);
  const { court: kept, ...older } = saved;
  assert.equal(kept.length, 3);
  await f.admin("site", older);
  assert.equal((await f.call("site")).site.court.length, 3, "an older admin page keeps the court");
  await f.admin("site", { ...(await f.admin("site")).site, court: [] });
  assert.deepEqual((await f.call("site")).site.court, [], "an empty list clears it");
});

test("a court portrait is public only while a court entry names an approved photo", async () => {
  const f = await fixture();
  const notFound = (path) => assert.rejects(f.call(path), { status: 404 }, path);
  await notFound("court-photo/" + portrait);
  const { site } = await f.admin("site");
  await f.admin("site", { ...site, court: [...court, { name: "Example Pending", role: "dama", photo: pending }] });
  const served = await f.call("court-photo/" + portrait);
  assert.ok(served.stream, "the named, approved portrait is served without a sign-in");
  await notFound("court-photo/" + other);
  await notFound("court-photo/" + pending);
  await notFound("court-photo/not-an-id");
  await assert.rejects(f.call("photo/" + other), (e) => [401, 403].includes(e.status), "the gallery itself still needs a sign-in");
  await f.admin("site", { ...(await f.admin("site")).site, court: [] });
  await notFound("court-photo/" + portrait);
});

test("the shared renderer pairs damas with chambelanes and escapes names", () => {
  const html = courtSection([...court, { name: "<b>Example</b>", role: "dama" }], "es", { photoSrc: (p) => (p.photo ? courtPhotoUrl(p.photo) : "") });
  assert.match(html, /^<div class="court-escort">/);
  assert.match(html, /<div class="pair"><div class="person"><img class="monogram" loading="lazy" src="\/api\/court-photo\/11111111-1111-4111-8111-111111111111" alt="">[\s\S]*?<h2>Example Dama<\/h2><p>Su prima<\/p>[\s\S]*?&amp;[\s\S]*?<h2>Example Chambelán<\/h2>/);
  assert.match(html, /&lt;b&gt;Example&lt;\/b&gt;/);
  assert.equal(courtSection([], "en"), "");
});

test("the built court page names no one and has the runtime slot", async () => {
  for (const file of ["court/index.html", "es/court/index.html"]) {
    const html = await readFile(new URL("../dist/" + file, import.meta.url), "utf8");
    assert.match(html, /<div data-court-waiting>[\s\S]*?<\/div><div class="court" data-court hidden><\/div>/, file);
    assert.doesNotMatch(html, /class="person"/, file);
  }
});
