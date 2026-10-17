// Sign-in, recovery, Contact and My account (round 2 review, wave 2), on the
// built pages, the guest scripts, the emails and the server: one Spanish verb
// for signing in, the invitation code's hint, the contact topics' labels, the
// named-host setting, the skip link's target and Contact's built page. The
// browser journeys are in tests/browser/account-contact.spec.mjs. All names
// and emails are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { Ledger, memoryAdapter, memoryMedia } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token, invitationCode, invitationCredential } from "../server/auth.mjs";
import { validateSettings } from "../server/site-settings.mjs";
import { terms, say } from "../site/lexicon.mjs";
import { celebration, contactTopics, contactTopicsEn, contactTopicsEs } from "../site/celebration.mjs";
import { renderSignInEmail } from "../emails/templates.mjs";

const dist = new URL("../dist/", import.meta.url);
const page = (file) => readFile(new URL(file, dist), "utf8");
const source = (file) => readFile(new URL("../" + file, import.meta.url), "utf8");
const main = (html) => html.match(/<main[\s\S]*?<\/main>/)[0];
const builtPages = async () =>
  (await readdir(dist, { recursive: true })).filter((f) => f.endsWith(".html"));
// What a guest reads that is written in code (the lexicon itself is left
// out: it lists the variants it bans).
const guestCode = [
  "site/guest.js",
  "site/guest-account.js",
  "site/client.js",
  "site/sso.js",
  "site/media-upload.js",
  "site/guest-whatsapp.js",
  "site/gallery-download.js",
  "site/home.mjs",
  "site/experience.js",
  "site/notes.mjs",
  "site/celebration.mjs",
  "site/content.mjs",
  "scripts/build-pages.mjs",
  "emails/templates.mjs",
];

test("Spanish has one verb for signing in, “Entrar” (with “acceso”), on every page, in the guest scripts and in the sign-in email (R-042)", async () => {
  const other = /inici\w*\s+(?:la\s+)?sesi[oó]n/i;
  for (const file of (await builtPages()).filter((f) => f.startsWith("es/")))
    assert.doesNotMatch(await page(file), other, file);
  for (const file of guestCode) assert.doesNotMatch(await source(file), other, file);
  const mail = renderSignInEmail({
    locale: "es",
    household: "Familia Ejemplo",
    url: "https://misxv.simplysoph.com/es/account/#example",
    eventDate: "viernes 15 de enero de 2027",
  });
  assert.doesNotMatch(mail.subject + mail.html + mail.text, other);
  // The link is named as the button that asks for it ("Enviar enlace de acceso").
  assert.ok(mail.subject.includes(terms.signInLink.es), mail.subject);
  assert.deepEqual([terms.signIn.es, terms.signInLink.es, terms.myAccount.es], ["Entrar", "enlace de acceso", "Mi cuenta"]);
  // The header, and the account page as built (signed out): the sign-in's name.
  for (const [file, link, name, site] of [
    ["account/index.html", "/account/", "Sign in", "Sophia’s Quinceañera"],
    ["es/account/index.html", "/es/account/", "Entrar", "Los XV de Sophia"],
  ]) {
    const html = await page(file);
    assert.match(html, new RegExp(`<li class="nav-signin"><a href="${link}" aria-current="page">${name}</a></li>`), file);
    assert.match(html, new RegExp(`<title>${name} · ${site}</title>`), file);
    assert.match(main(html), new RegExp(`<h1>${name}</h1>`), file);
  }
});

test("no guest page or guest script says “display name” (R-090)", async () => {
  const software = /display name|nombre para mostrar/i;
  for (const file of await builtPages()) if (!file.startsWith("admin")) assert.doesNotMatch(await page(file), software, file);
  for (const file of guestCode) assert.doesNotMatch(await source(file), software, file);
});

test("the code hint shows a code's real shape, with a made-up example that can never be a code (R-080)", () => {
  // A code as the server makes it and Admin shows it (application.mjs).
  const code = invitationCode(),
    shown = code.match(/.{4}/g).join("-");
  assert.ok(invitationCredential(shown), "the grouping Admin shows is a valid way to type it");
  for (const lang of ["en", "es"]) {
    const hint = say(terms.invitationCodeHint, lang);
    assert.equal(Number(hint.match(/\b(\d+)\b/)[1]), code.length, `${lang}: the length`);
    const example = hint.match(/(?:[A-Z2-7]{4}-)+…/)?.[0];
    assert.ok(example, `${lang}: an example in groups of four, from the code's own letters and numbers`);
    assert.equal(invitationCredential(example), null, `${lang}: never a real code`);
    assert.equal(invitationCredential(example.replace(/-?…$/, "")), null);
  }
});

test("contact topics read the way people say them; the stored values the server checks are unchanged (R-090)", () => {
  assert.deepEqual(contactTopics, [
    "RSVP Questions",
    "Event Information",
    "Accommodations",
    "Transportation",
    "Photo Submissions",
    "Registry Questions",
    "Other",
  ]);
  assert.equal(contactTopicsEn.length, contactTopics.length);
  assert.equal(contactTopicsEs.length, contactTopics.length);
  for (const label of [...contactTopicsEn, ...contactTopicsEs])
    assert.doesNotMatch(label, /Registry questions|Photo submissions|Preguntas sobre RSVP|Registro de regalos|Envío de fotos/, label);
  const gifts = contactTopics.indexOf("Registry Questions");
  assert.equal(contactTopicsEn[gifts], say(terms.gifts, "en"));
  assert.equal(contactTopicsEs[gifts], say(terms.gifts, "es"));
});

test("every page's main takes focus from the skip link (R-076)", async () => {
  for (const file of await builtPages()) {
    const html = await page(file);
    assert.equal(html.match(/<main\b[^>]*>/)[0], '<main id="main" tabindex="-1">', file);
  }
});

test("the home page's invitation link says “opens in a new tab” once (R-090)", async () => {
  // Before: "Open the full invitation in a new tab (opens in a new tab)".
  for (const [file, words] of [
    ["index.html", "new tab"],
    ["es/index.html", "otra pestaña"],
  ]) {
    const caption = (await page(file)).match(/<figcaption>([\s\S]*?)<\/figcaption>/)[1];
    assert.equal(caption.split(words).length - 1, 1, file);
  }
});

test("Contact as built: the address first, then where a reply appears, the sign-in quiet under it, and an empty host slot (R-084, R-166)", async () => {
  for (const [file, reply] of [
    ["contact/index.html", "Write to that address and we’ll reply by email. If you sign in and write to us here, our reply appears in My account."],
    ["es/contact/index.html", "Si escribes a ese correo, te respondemos por correo. Si entras y nos escribes aquí, nuestra respuesta aparece en Mi cuenta."],
  ]) {
    const html = main(await page(file)),
      at = (text) => html.indexOf(text);
    assert.ok(at(reply) > 0, file);
    assert.ok(at('href="mailto:misxv@simplysoph.com"') < at(reply), `${file}: the address first`);
    assert.ok(at(reply) < at('id="portal"'), `${file}: then the sign-in`);
    assert.match(html, /<div class="portal portal-quiet" id="portal" data-view="contact">/);
    assert.match(html, /<p class="lead">[^<]*<\/p><p class="contact-host" data-contact-host hidden><\/p>/);
  }
});

// A household on the guest list, an owner session, and email to an array.
const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-01T18:00:00Z"),
  household = "12345678-1234-4234-8234-123456789012",
  key = Buffer.alloc(32, 7);
async function fixture() {
  const ledger = new Ledger(memoryAdapter()),
    adminToken = token(),
    memberToken = token(),
    sent = [];
  let clock = at;
  const row = {
    id: household,
    name: "Example family",
    capacity: { adultsTeens: 2, kids: 0 },
    email: "example.family@example.com",
    phone: "",
    validCapacity: true,
    archived: false,
  };
  const app = createApplication({
    ledger,
    notion: {
      read: async () => structuredClone(row),
      list: async () => [structuredClone(row)],
      project: async () => {},
      projectContact: async () => {},
      projectAccount: async () => {},
    },
    mailer: { configured: true, send: async (m) => void sent.push(m) },
    verifyGoogle: async () => ({}),
    media: memoryMedia(),
    key,
    origin,
    adminEmails: ["owner@example.com"],
    now: () => clock,
  });
  await ledger.transaction((s) => {
    s.sessions[hash(adminToken)] = { kind: "admin", actor: "owner", email: "owner@example.com", csrf: "admin-csrf", expiresAt: at + 86400000 };
    s.invitations[household] = { id: household, name: row.name, active: true, generation: 1, invited: { ceremony: true, dinner: true, dance: true } };
    const accountId = "99999999-9999-4999-8999-999999999999";
    s.accounts = {
      [accountId]: {
        id: accountId,
        householdId: household,
        name: row.name,
        email: row.email,
        emailKey: createHmac("sha256", key).update("email:" + row.email).digest("hex"),
        active: true,
        version: 1,
      },
    };
    s.sessions[hash(memberToken)] = { kind: "guest", accountId, householdId: household, generation: 1, email: row.email, csrf: "member-csrf", expiresAt: at + 86400000 };
  });
  const call = (path, body, headers = {}) =>
    app.dispatch({ path: "/api/" + path, method: body ? "POST" : "GET", body, headers: { origin, ...headers }, ip: "test" });
  return {
    sent,
    row,
    tick: (ms) => (clock += ms),
    call,
    admin: (path, body) => call("admin/" + path, body, { cookie: "__session=" + adminToken, "x-csrf-token": "admin-csrf" }),
    guest: (path, body) => call(path, body, { cookie: "__session=" + memberToken, "x-csrf-token": "member-csrf" }),
  };
}

test("the server still takes the stored topic values, and refuses a label (R-090)", async () => {
  const f = await fixture();
  assert.equal((await f.guest("messages", { kind: "contact", name: "Example", text: "A gift question", topic: "Registry Questions" })).state, "pending");
  await assert.rejects(f.guest("messages", { kind: "contact", name: "Example", text: "Hi", topic: "Gifts" }), { code: "INVALID_TOPIC" });
});

test("Contact's named host comes from the event settings: empty by default, both languages or neither, and kept by a save that doesn't send it (R-166)", async () => {
  assert.equal(validateSettings(celebration).contact, undefined);
  const host = { en: "The hosts read every message.", es: "Los anfitriones leen cada mensaje." };
  assert.deepEqual(validateSettings({ ...celebration, contact: { host: { en: ` ${host.en} `, es: host.es } } }).contact, { host });
  assert.deepEqual(validateSettings({ ...celebration, contact: { host: { en: "", es: "" } } }).contact, { host: { en: "", es: "" } });
  for (const bad of [
    { host: { en: "Only English", es: "" } },
    { host: { en: "", es: "Solo español" } },
    { host: { en: "x".repeat(301), es: "y" } },
    { host: { en: "a\u0007", es: "b" } },
    { host: { en: 5, es: "b" } },
  ])
    assert.throws(() => validateSettings({ ...celebration, contact: bad }), { code: "INVALID_SITE_SETTINGS" }, JSON.stringify(bad));
  const f = await fixture();
  assert.equal((await f.call("site")).site.contact, undefined, "nothing until the family writes it");
  const { site } = await f.admin("site");
  const saved = (await f.admin("site", { ...site, contact: { host } })).site;
  assert.deepEqual((await f.call("site")).site.contact, { host });
  // An admin page from before the field sends none: the line stays.
  const { contact, ...older } = saved;
  assert.deepEqual(contact, { host });
  await f.admin("site", older);
  assert.deepEqual((await f.call("site")).site.contact, { host });
});

test("the server answers a used link, an expired one and an unknown one alike, so the page says “expired or already used” (R-078)", async () => {
  const f = await fixture();
  const linkOf = () => f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  await f.call("auth/email/request", { email: f.row.email });
  const used = linkOf();
  assert.ok((await f.call("auth/email/verify", { token: used })).csrf);
  await f.call("auth/email/request", { email: f.row.email });
  const expired = linkOf();
  f.tick(15 * 60_000 + 1);
  for (const link of [used, expired, "A".repeat(43)])
    await assert.rejects(f.call("auth/email/verify", { token: link }), { status: 401, code: "EMAIL_LINK_INVALID" });
});
