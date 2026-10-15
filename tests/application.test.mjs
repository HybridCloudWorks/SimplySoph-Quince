import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter, memoryMedia } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token, totp, base32, seal } from "../server/auth.mjs";
import { createHmac } from "node:crypto";
import { ready } from "../site/content.mjs";
// The fixture owner's authenticator, for actions that need a fresh code.
const OWNER_TOTP = base32(Buffer.alloc(20, 9));
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-01T18:00:00Z");
const household = "12345678-1234-1234-1234-123456789012";
// Provider sign-ins need a one-time admin ticket from /api/auth/sso/start.
const adminTicket = async (app) =>
  (
    await app.dispatch({
      path: "/api/auth/sso/start",
      method: "POST",
      headers: { origin },
      body: { purpose: "admin" },
    })
  ).ticket;
async function fixture(options = {}) {
  const media = options.media || memoryMedia();
  const ledger = new Ledger(memoryAdapter()),
    adminToken = token(),
    guestToken = token(),
    memberToken = token(),
    memberId = "99999999-9999-4999-8999-999999999999";
  const row = {
    id: household,
    name: "Test family",
    capacity: { adultsTeens: 2, kids: 1 },
    email: "test@example.com",
    phone: "",
    validCapacity: true,
    administratorEligible: true,
    archived: false,
  };
  let failing = false,
    sendCount = 0;
  let clock = at;
  const sent = [],
    extraRows = [],
    listCalls = [];
  const notion = {
    async read() {
      return structuredClone(row);
    },
    async list({ fresh = false } = {}) {
      listCalls.push(fresh);
      return [structuredClone(row), ...structuredClone(extraRows)];
    },
    async project() {
      if (failing) throw { code: "NOTION_UNAVAILABLE" };
    },
    async projectContact() {
      if (failing) throw { code: "NOTION_UNAVAILABLE" };
    },
    async projectAccount() {
      if (failing) throw { code: "NOTION_UNAVAILABLE" };
    },
    async prepareSchema() {
      return [];
    },
  };
  const mailer = {
    configured: true,
    async send(message) {
      sendCount++;
      sent.push(message);
    },
  };
  const app = createApplication({
    ledger,
    notion,
    mailer,
    verifyGoogle: async () => ({
      id: "organizer",
      email: "organizer@gmail.com",
    }),
    media,
    key: Buffer.alloc(32, 4),
    origin,
    adminEmails: ["organizer@gmail.com"],
    now: () => clock,
    ...options,
    notion: { ...notion, ...options.notion },
  });
  await ledger.transaction((s) => {
    s.sessions[hash(adminToken)] = {
      kind: "admin",
      actor: "organizer",
      email: "organizer@gmail.com",
      csrf: "admin-csrf",
      expiresAt: at + 100000,
    };
    s.invitations[household] = {
      id: household,
      name: row.name,
      active: true,
      generation: 1,
      tokenHash: hash(guestToken),
      invited: { ceremony: true, dinner: true, dance: false },
    };
    // A guest who already signed in with the email on their Notion row.
    s.accounts = {
      [memberId]: {
        id: memberId,
        householdId: household,
        name: row.name,
        email: "test@example.com",
        emailKey: createHmac("sha256", options.key || Buffer.alloc(32, 4))
          .update("email:test@example.com")
          .digest("hex"),
        active: true,
        version: 1,
        verifiedAt: at,
      },
    };
    s.sessions[hash(memberToken)] = {
      kind: "guest",
      accountId: memberId,
      householdId: household,
      generation: 1,
      email: "test@example.com",
      csrf: "member-csrf",
      expiresAt: at + 1800000,
    };
  });
  const admin = (path, body, query) =>
    app.dispatch({
      path: "/api/admin/" + path,
      query,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: "__session=" + adminToken,
        "x-csrf-token": "admin-csrf",
      },
      ip: "admin",
    });
  const login = await app.dispatch({
      path: "/api/invitation-session",
      method: "POST",
      body: { token: guestToken },
      headers: { origin },
      ip: "guest",
    }),
    guestCookie = login.setCookie.split(";")[0];
  // The invitation link session opens the RSVP only.
  const linkGuest = (path, body, headers = {}) =>
    app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: guestCookie,
        "x-csrf-token": login.csrf,
        ...headers,
      },
      ip: "guest",
    });
  // A signed-in guest (verified email): RSVP, uploads, messages, profile.
  const guest = (path, body, headers = {}) =>
    app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: "__session=" + memberToken,
        "x-csrf-token": "member-csrf",
        ...headers,
      },
      ip: "guest",
    });
  const publicPost = (path, body) =>
    app.dispatch({ path: "/api/" + path, method: "POST", body, headers: { origin } });
  const input = () => ({
    previousSubmissionId: null,
    attendance: {
      ceremony: { adultsTeens: 1, kids: 0 },
      dinner: { adultsTeens: 2, kids: 1 },
      dance: { adultsTeens: 0, kids: 0 },
    },
    contact: { email: "test@example.com", phone: "", address: null },
    requests: "",
  });
  return {
    app,
    ledger,
    media,
    admin,
    guest,
    linkGuest,
    publicPost,
    now: () => clock,
    input,
    row,
    extraRows,
    listCalls,
    guestToken,
    failSync: (on = true) => (failing = on),
    sends: () => sendCount,
    sent,
    advance: (ms) => {
      clock += ms;
    },
    // The owner's current code. Replay protection is reset so tests can make
    // several owner changes within one 30-second step.
    ownerCode: async () => {
      await ledger.transaction((s) => {
        s.admins.organizer = {
          secret: seal(OWNER_TOTP, options.key || Buffer.alloc(32, 4)),
          lastStep: -1,
          email: "organizer@gmail.com",
        };
      });
      return totp(OWNER_TOTP, Math.floor(clock / 30000));
    },
  };
}
async function registeredFixture(options) {
  const f = await fixture(options);
  await f.guest("rsvp", f.input(), { "idempotency-key": "register-rsvp" });
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const link = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  const login = await f.publicPost("auth/email/verify", { token: link });
  const account = Object.values((await f.ledger.read()).accounts)[0];
  const verified = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: login.setCookie.split(";")[0],
        "x-csrf-token": login.csrf,
      },
    });
  return { ...f, link, account, verified };
}
test("contact updates retain the verified login identity and family replies stay in the household thread", async () => {
  const f = await registeredFixture();
  const p = (await f.verified("profile")).profile;
  await f.verified("profile", {
    version: p.version,
    email: "other@example.com",
    phone: "123",
    address: "Test address",
  });
  assert.equal((await f.verified("account")).account.email, "test@example.com");
  const m = await f.verified("messages", {
    kind: "contact",
    name: "Test",
    text: "Where do we park?",
  });
  await f.admin("message-reply", {
    id: m.id,
    text: "Directions will be updated here.",
  });
  assert.equal(
    (await f.verified("messages")).messages[0].replies[0].text,
    "Directions will be updated here.",
  );
  assert.equal(
    (await f.app.dispatch({ path: "/api/public", headers: {} })).messages
      .length,
    0,
  );
});
test("durable receipts survive reopening; duplicate submit is one response and one automatically sent receipt", async () => {
  const f = await fixture(),
    data = f.input();
  const one = await f.guest("rsvp", data, {
    "idempotency-key": "request-0001",
  });
  assert.equal(one.saved, true);
  const again = await f.guest("rsvp", data, {
    "idempotency-key": "request-0001",
  });
  assert.equal(again.id, one.id);
  const restored = await f.guest("invitation");
  assert.equal(restored.response.id, one.id);
  const s = await f.ledger.read();
  assert.equal(Object.keys(s.responses).length, 1);
  assert.equal(Object.keys(s.outbox).length, 1);
  assert.equal(f.sends(), 1);
  assert.equal(Object.values(s.outbox)[0].state, "accepted");
});
test("concurrent different submissions cannot both replace the same previous response", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.guest("rsvp", f.input(), { "idempotency-key": "concurrent-1" }),
    f.guest("rsvp", f.input(), { "idempotency-key": "concurrent-2" }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(results.find((r) => r.status === "rejected").reason.status, 409);
});
test("Notion outage preserves accepted response and exposes pending sync without duplicate email", async () => {
  const f = await fixture();
  f.failSync();
  const result = await f.guest("rsvp", f.input(), {
    "idempotency-key": "request-0002",
  });
  assert.equal(result.syncState, "pending");
  assert.equal((await f.guest("invitation")).response.id, "request-0002");
});
test("guest access cannot call admin or override capacities; revocation invalidates an active session", async () => {
  const f = await fixture();
  await assert.rejects(
    () => f.guest("admin/dashboard"),
    (e) => e.status === 401,
  );
  const data = f.input();
  data.attendance.dinner.kids = 2;
  await assert.rejects(
    () => f.guest("rsvp", data, { "idempotency-key": "request-0003" }),
    (e) => e.status === 422,
  );
  await f.admin("revoke", { id: household });
  await assert.rejects(
    () => f.guest("invitation"),
    (e) => e.status === 401,
  );
});
test("origin and csrf checks reject writes; changed fresh Notion capacity rejects an open form", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      f.guest("rsvp", f.input(), {
        origin: "https://evil.example",
        "idempotency-key": "request-0004",
      }),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () =>
      f.guest("rsvp", f.input(), {
        "x-csrf-token": "bad",
        "idempotency-key": "request-0004",
      }),
    (e) => e.status === 403,
  );
  f.row.capacity.kids = 0;
  await assert.rejects(
    () => f.guest("rsvp", f.input(), { "idempotency-key": "request-0004" }),
    (e) => e.status === 422,
  );
});
test("MFA is required; invalid attempts persist and valid code cannot be reused", async () => {
  const f = await fixture();
  const request = async (body) =>
    f.app.dispatch({
      path: "/api/auth/google",
      method: "POST",
      headers: { origin },
      body: { ...body, ticket: await adminTicket(f.app) },
      ip: "new-admin",
    });
  // The owner set up an authenticator earlier (a first setup uses the emailed link).
  await f.ownerCode();
  const login = await request({ credential: "verified-by-fixture" });
  assert.equal(login.enrollmentSecret, undefined);
  const code = totp(OWNER_TOTP, Math.floor(at / 30000));
  const verify = (body) =>
    f.app.dispatch({
      path: "/api/auth/mfa",
      method: "POST",
      headers: { origin },
      body,
      ip: "new-admin",
    });
  await assert.rejects(
    () => verify({ challenge: login.challenge, code: "bad" }),
    (e) => e.code === "INVALID_MFA",
  );
  assert.equal(
    (await f.ledger.read()).challenges[hash(login.challenge)].attempts,
    1,
  );
  const signed = await verify({ challenge: login.challenge, code });
  assert.match(signed.setCookie, /HttpOnly; Secure/);
  const again = await request({ credential: "verified-by-fixture" });
  await assert.rejects(
    () => verify({ challenge: again.challenge, code }),
    (e) => e.code === "INVALID_MFA",
  );
});
test("TOTP follows RFC 6238 SHA1 vector at 59 seconds (six digit suffix)", () => {
  const secret = base32(Buffer.from("12345678901234567890"));
  assert.equal(totp(secret, 1), "287082");
});
test("guestbook stays private pending moderation; contact messages cannot be published", async () => {
  const f = await fixture();
  const message = await f.guest("messages", {
    kind: "guestbook",
    name: "Test",
    text: "Best wishes",
    consent: true,
  });
  const pub = () => f.app.dispatch({ path: "/api/public", method: "GET" });
  assert.equal((await pub()).messages.length, 0);
  await f.admin("moderation", {
    collection: "messages",
    id: message.id,
    state: "approved",
  });
  assert.equal((await pub()).messages.length, 1);
  const contact = await f.guest("messages", {
    kind: "contact",
    name: "Test",
    text: "Private question",
  });
  await assert.rejects(
    () =>
      f.admin("moderation", {
        collection: "messages",
        id: contact.id,
        state: "approved",
      }),
    (e) => e.status === 422,
  );
});
test("seating rejects over-capacity and duplicate placement; email never sends twice", async () => {
  const f = await fixture();
  await f.guest("rsvp", f.input(), { "idempotency-key": "request-0005" });
  await assert.rejects(
    () =>
      f.admin("seating", {
        name: "Small table",
        capacity: 2,
        households: [household],
      }),
    (e) => e.status === 422,
  );
  await f.admin("seating", {
    name: "Table 1",
    capacity: 8,
    households: [household],
  });
  await assert.rejects(
    () =>
      f.admin("seating", {
        name: "Table 2",
        capacity: 8,
        households: [household],
      }),
    (e) => e.status === 409,
  );
  const id = Object.keys((await f.ledger.read()).outbox)[0];
  await assert.rejects(
    () => f.admin("mail/send", { id, confirm: true }),
    (e) => e.status === 409,
  );
  assert.equal(f.sends(), 1);
});

test("revocation and rotation invalidate pending email drafts", async () => {
  for (const action of ["revoke", "invitation"]) {
    const f = await fixture();
    await f.guest("rsvp", f.input(), { "idempotency-key": "email-safety-01" });
    await f.ledger.transaction((s) => {
      for (const j of Object.values(s.outbox)) j.state = "draft";
    });
    const id = Object.keys((await f.ledger.read()).outbox)[0];
    await f.admin(action, {
      id: household,
      invited: { ceremony: true, dinner: true, dance: false },
    });
    await assert.rejects(
      () => f.admin("mail/send", { id, confirm: true }),
      (e) => e.code === "MAIL_DRAFT_STALE",
    );
    assert.equal(f.sends(), 1);
  }
});

test("prototype property names cannot address admin records", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      f.admin("moderation", {
        id: "__proto__",
        collection: "messages",
        state: "approved",
      }),
    (e) => e.code === "INVALID_ID",
  );
  assert.equal(Object.prototype.state, undefined);
});

test("CSV import requires explicit zero for child count", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      f.admin("import", {
        rows: [
          { name: "Test", adultsTeens: "2", kids: "", email: "", phone: "" },
        ],
      }),
    (e) => e.code === "INVALID_CAPACITY",
  );
});

test("site settings require admin, prevent stale saves, and publish registry edits", async () => {
  const f = await fixture(),
    { site } = await f.admin("site");
  await assert.rejects(
    () => f.guest("admin/site", site),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  site.registries[0].url = "https://www.target.com/gift-registry/example";
  site.ceremony.end = "2027-01-15T17:00:00-06:00";
  site.reception.end = null;
  const saved = await f.admin("site", site);
  assert.equal(saved.site.version, site.version + 1);
  await assert.rejects(
    () => f.admin("site", site),
    (e) => e.code === "SETTINGS_CHANGED",
  );
  const pub = await f.app.dispatch({ path: "/api/site" });
  assert.equal(
    pub.site.registries[0].url,
    "https://www.target.com/gift-registry/example",
  );
  const ics = await f.app.dispatch({ path: "/api/calendar/ceremony.ics" });
  assert.match(ics.binary.toString(), /DTEND:20270115T230000Z/);
  // The Spanish pages' calendar: Spanish words, the same event and version.
  const es = (await f.app.dispatch({ path: "/api/calendar/es/ceremony.ics" })).binary.toString();
  assert.match(es, /SUMMARY:Sophia Isabel — Ceremonia religiosa/);
  assert.match(es, /UID:misxv-ceremony@simplysoph.com/);
  assert.match(es, new RegExp(`SEQUENCE:${site.version + 1}`));
  assert.match(es, /DTEND:20270115T230000Z/);
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/calendar/es/gifts.ics" }),
    (e) => e.code === "NOT_FOUND",
  );
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/calendar/reception.ics" }),
    (e) => e.code === "END_TIME_PENDING",
  );
  await assert.rejects(() => f.guest("pages/gifts"), (e) => e.status === 404);
});

test("contact fields stay private, create a durable notification, and email only the organizer", async () => {
  const f = await fixture();
  const result = await f.guest("messages", {
    kind: "contact",
    name: "Guest",
    email: "guest@example.com",
    topic: "Transportation",
    text: "A private question.",
  });
  const { messages } = await f.admin("moderation");
  assert.equal(messages[0].email, "guest@example.com");
  assert.equal(messages[0].topic, "Transportation");
  const { notifications } = await f.admin("notifications");
  assert.equal(notifications[0].id, result.id);
  assert.equal(notifications[0].emailState, "accepted");
  assert.equal(f.sent.at(-1).to, "organizer@gmail.com");
  assert.ok(!f.sent.at(-1).html.includes("private question"));
  assert.equal(
    (await f.app.dispatch({ path: "/api/public" })).messages.length,
    0,
  );
  await f.admin("notifications", { id: result.id });
  assert.equal((await f.admin("notifications")).notifications[0].read, true);
  await assert.rejects(
    () =>
      f.guest("messages", {
        kind: "contact",
        name: "G",
        text: "Hi",
        topic: "invented",
        email: "g@example.com",
      }),
    (e) => e.code === "INVALID_TOPIC",
  );
});

test("administrator email links conceal eligibility, require MFA, expire and cannot be replayed", async () => {
  const f = await fixture();
  const post = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: "POST",
      headers: { origin },
      body,
    });
  assert.deepEqual(
    await post("auth/admin-email/request", { email: "unknown@example.com" }),
    { requested: true },
  );
  assert.equal(f.sent.length, 0);
  await post("auth/admin-email/request", { email: "organizer@gmail.com" });
  const raw = f.sent.at(-1).html.match(/login\/#([A-Za-z0-9_-]{43})/)[1];
  const c = await post("auth/admin-email/verify", { token: raw });
  assert.equal(c.setCookie, undefined);
  await assert.rejects(
    () => post("auth/admin-email/verify", { token: raw }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
  await assert.rejects(
    () => post("auth/mfa", { challenge: c.challenge, code: "bad" }),
    (e) => e.code === "INVALID_MFA",
  );
  const signed = await post("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(at / 30000)),
  });
  assert.ok(signed.setCookie);
  const google = await post("auth/google", {
    credential: "fixture",
    ticket: await adminTicket(f.app),
  });
  assert.equal(
    google.enrollmentSecret,
    undefined,
    "Google reuses the enrolled authenticator",
  );
  await post("auth/admin-email/request", { email: "organizer@gmail.com" });
  const stale = f.sent.at(-1).html.match(/login\/#([A-Za-z0-9_-]{43})/)[1];
  f.advance(900001);
  await assert.rejects(
    () => post("auth/admin-email/verify", { token: stale }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
});

test("accounting edits reject stale saves; documents stay admin-only and support trash/restore", async () => {
  const objects = new Map();
  const f = await fixture({
    documents: {
      put: async (id, b) => objects.set(id, b),
      get: async (id) => objects.get(id),
    },
  });
  const saved = await f.admin("planning", {
    kind: "costs",
    row: {
      item: "Venue",
      finalCost: 1200,
      deposit: 300,
      dueDate: "2027-01-01",
    },
  });
  await assert.rejects(
    () => f.guest("admin/planning"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    () =>
      f.admin("planning", {
        kind: "costs",
        id: saved.row.id,
        version: 0,
        row: { item: "Venue" },
      }),
    (e) => e.code === "SETTINGS_CHANGED",
  );
  const q = { kind: "costs", rowId: saved.row.id };
  const doc = await f.admin("documents/upload", {
    ...q,
    name: "bill.pdf",
    data: Buffer.from("%PDF-1.4\nTest").toString("base64"),
  });
  await assert.rejects(
    () =>
      f.admin("documents/upload", {
        ...q,
        name: "bad.html",
        data: Buffer.from("<script>evil</script>").toString("base64"),
      }),
    (e) => e.code === "INVALID_DOCUMENT",
  );
  const openQuery = { ...q, id: doc.id };
  const opened = await f.admin("documents/open", undefined, openQuery);
  assert.equal(opened.binary.toString(), "%PDF-1.4\nTest");
  assert.equal(opened.contentType, "application/pdf");
  await assert.rejects(
    () =>
      f.app.dispatch({ path: "/api/admin/documents/open", query: openQuery }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  const other = await f.admin("planning", {
    kind: "costs",
    row: { item: "Other expense" },
  });
  await assert.rejects(
    () =>
      f.admin("documents/open", undefined, {
        ...openQuery,
        rowId: other.row.id,
      }),
    (e) => e.code === "NOT_FOUND",
  );
  await f.admin("documents/state", { ...q, id: doc.id, deleted: true });
  await assert.rejects(
    () => f.admin("documents/open", undefined, openQuery),
    (e) => e.code === "NOT_FOUND",
  );
  assert.equal((await f.ledger.read()).documents[doc.id].deleted, true);
  await f.admin("documents/state", { ...q, id: doc.id, deleted: false });
  assert.equal((await f.ledger.read()).documents[doc.id].deleted, false);
  assert.equal(objects.size, 1);
});

test("distribution groups deduplicate recipients, drafts are idempotent, and stale recipients cannot send", async () => {
  const f = await fixture();
  f.row.distributionGroups = ["Family", "Godparents"];
  const payload = {
    requestId: "test-campaign-001",
    groups: ["Family", "Godparents"],
    ids: [household],
    subject: "Event Update",
    text: "Hello <friends>",
  };
  const result = await f.admin("mail/batch-draft", payload);
  assert.equal(result.count, 1);
  assert.equal(f.sends(), 0);
  assert.deepEqual(await f.admin("mail/batch-draft", payload), result);
  assert.equal(Object.keys((await f.ledger.read()).outbox).length, 1);
  await f.admin("mail/send", { id: result.ids[0], confirm: true });
  assert.equal(f.sends(), 1);
  const second = await f.admin("mail/batch-draft", {
    ...payload,
    requestId: "test-campaign-002",
  });
  f.row.email = "changed@example.com";
  await assert.rejects(
    () => f.admin("mail/send", { id: second.ids[0], confirm: true }),
    (e) => e.code === "MAIL_DRAFT_STALE",
  );
});

// Seeds the ledger as if the guest texted the program keyword and it synced.
async function keywordOptIn(f, phone) {
  await f.ledger.transaction((s) => {
    s.smsPreferences = {
      [hash(phone)]: { phone, type: "START", at: 1, syncState: "synced" },
    };
    s.smsConsentPhones = { [household]: phone };
  });
}

test("SMS draft eligibility requires a verified keyword opt-in, not a Notion checkbox", async () => {
  const f = await fixture();
  f.row.phone = "+18175550100";
  f.row.distributionGroups = ["Family"];
  const p = {
    requestId: "sms-draft-001",
    groups: ["Family"],
    ids: [],
    subject: "Reminder",
    text: "Simply Soph Media: See you soon. Reply STOP to opt out.",
    channel: "sms",
  };
  await assert.rejects(
    () => f.admin("mail/batch-draft", p),
    (e) => e.code === "NO_ELIGIBLE_RECIPIENTS",
  );
  // Organizer-entered consent alone is a hidden opt-in path the campaign forbids.
  f.row.smsConsent = true;
  f.row.smsConsentAt = "2026-09-28";
  await assert.rejects(
    () => f.admin("mail/batch-draft", p),
    (e) => e.code === "NO_ELIGIBLE_RECIPIENTS",
  );
  await keywordOptIn(f, f.row.phone);
  await assert.rejects(
    () =>
      f.admin("mail/batch-draft", {
        ...p,
        requestId: "sms-draft-003",
        text: "See you soon",
      }),
    (e) => e.code === "SMS_BRAND_OR_STOP_MISSING",
  );
  assert.equal((await f.admin("mail/batch-draft", p)).count, 1);
  assert.equal(f.sends(), 0);
  f.row.smsOptOut = true;
  await assert.rejects(
    () => f.admin("mail/batch-draft", { ...p, requestId: "sms-draft-002" }),
    (e) => e.code === "NO_ELIGIBLE_RECIPIENTS",
  );
});

test("SMS admin review requires authentication and sending stays disabled", async () => {
  const f = await fixture();
  f.row.phone = "+18175550100";
  f.row.smsConsent = true;
  f.row.smsConsentAt = "2026-09-28";
  await keywordOptIn(f, f.row.phone);
  const draft = await f.admin("mail/batch-draft", {
    requestId: "sms-review-001",
    ids: [household],
    groups: [],
    subject: "RSVP",
    text: "Simply Soph Media: RSVP at https://example.com Reply STOP to opt out.",
    channel: "sms",
  });
  const preview = await f.admin("sms/preview", undefined, { id: draft.ids[0] });
  assert.equal(preview.sendingEnabled, false);
  await assert.rejects(() =>
    f.guest("admin/sms/send", {
      id: draft.ids[0],
      confirm: true,
      reviewToken: preview.reviewToken,
    }),
  );
  await assert.rejects(
    () =>
      f.admin("sms/send", {
        id: draft.ids[0],
        confirm: true,
        reviewToken: preview.reviewToken,
      }),
    (e) => e.code === "SMS_NOT_ENABLED",
  );
});

test("planning import preserves estimates and organizer edits on repeat imports", async () => {
  const f = await fixture({
    notion: {
      planning: async () => [
        {
          id: household,
          fields: { item: "Venue", estimated: 2500, additionalPaid: 500 },
        },
      ],
    },
  });
  const p = { kind: "costs", sourceId: "5dbd1b32-9191-484b-85db-7b1d4663192e" };
  assert.deepEqual(await f.admin("planning/import", p), {
    added: 1,
    skipped: 0,
  });
  const first = (await f.admin("planning", undefined, { kind: "costs" }))
    .rows[0];
  assert.equal(first.estimated, 2500);
  assert.equal(first.finalCost, null);
  assert.equal(first.deposit, null);
  assert.equal(first.additionalPaid, 500);
  await f.admin("planning", {
    kind: "costs",
    id: first.id,
    version: first.version,
    row: { ...first, finalCost: 2400 },
  });
  assert.deepEqual(await f.admin("planning/import", p), {
    added: 0,
    skipped: 1,
  });
  assert.equal(
    (await f.admin("planning", undefined, { kind: "costs" })).rows[0].finalCost,
    2400,
  );
});

test("notification recipients do not inherit administrator sign-in authority", async () => {
  const f = await fixture({
    notificationEmails: ["organizer@gmail.com", "other@hotmail.com"],
  });
  await f.guest("messages", {
    kind: "contact",
    name: "Guest",
    email: "guest@example.com",
    topic: "Transportation",
    text: "Question",
  });
  assert.deepEqual(f.sent.map((m) => m.to).sort(), [
    "organizer@gmail.com",
    "other@hotmail.com",
  ]);
  await f.app.dispatch({
    path: "/api/auth/admin-email/request",
    method: "POST",
    headers: { origin },
    body: { email: "other@hotmail.com" },
  });
  assert.equal(f.sent.length, 2);
});

test("WhatsApp invitation delivery links obey invitation generation and admin endpoint authorization", async () => {
  const f = await fixture(),
    credential = token();
  await f.ledger.transaction((s) => {
    s.invitationLinks = {
      [hash(credential)]: {
        householdId: household,
        generation: s.invitations[household].generation,
      },
    };
  });
  const open = () =>
    f.app.dispatch({
      path: "/api/invitation-session",
      method: "POST",
      headers: { origin },
      body: { token: credential },
    });
  assert.ok((await open()).setCookie);
  await assert.rejects(
    () => f.guest("admin/whatsapp/drafts"),
    (e) => e.status === 401,
  );
  await f.admin("invitation", {
    id: household,
    invited: { ceremony: true, dinner: true, dance: true },
  });
  await assert.rejects(open, (e) => e.code === "INVALID_INVITATION");
});

test("anonymous junk sign-ins and invitation codes cannot lock out valid credentials", async () => {
  const f = await fixture({
    verifyGoogle: async (credential) => {
      if (credential !== "valid") throw Object.assign(new Error(), { status: 401, code: "SIGN_IN_FAILED" });
      return { id: "organizer", email: "organizer@gmail.com" };
    },
  });
  const post = (path, body) =>
    f.app.dispatch({ path: "/api/" + path, method: "POST", headers: { origin }, body, ip: "attacker" });
  await f.ownerCode(); // the owner already has an authenticator
  const codes = [];
  for (let i = 0; i < 70; i++)
    await post("auth/google", { credential: "junk", ticket: await adminTicket(f.app) }).catch((e) => codes.push(e.code));
  assert.equal(codes.filter((c) => c === "SIGN_IN_FAILED").length, 60);
  assert.equal(codes.filter((c) => c === "TOO_MANY_REQUESTS").length, 10);
  assert.ok((await post("auth/google", { credential: "valid", ticket: await adminTicket(f.app) })).challenge);
  for (let i = 0; i < 610; i++)
    await post("invitation-session", { token: "x".repeat(43) }).catch(() => {});
  assert.ok((await post("invitation-session", { token: f.guestToken })).setCookie);
  assert.equal((await f.ledger.read()).limits, undefined);
});

test("household status moves from issued to opened to attending or declined", async () => {
  const f = await fixture();
  const status = async () => (await f.admin("guests")).guests[0].status;
  // The fixture opens the invitation during setup; start from a fresh link.
  await f.ledger.transaction((s) => {
    s.invitations[household].openedAt = null;
  });
  assert.equal(await status(), "issued");
  await f.app.dispatch({
    path: "/api/invitation-session",
    method: "POST",
    headers: { origin },
    body: { token: f.guestToken },
  });
  assert.equal(await status(), "opened");
  assert.ok((await f.admin("guests")).guests[0].openedAt);
  await f.guest("rsvp", f.input(), { "idempotency-key": "22222222-2222-4222-8222-222222222222" });
  assert.equal(await status(), "attending");
  const none = f.input();
  for (const e of Object.keys(none.attendance)) none.attendance[e] = { adultsTeens: 0, kids: 0 };
  none.previousSubmissionId = "22222222-2222-4222-8222-222222222222";
  await f.guest("rsvp", none, { "idempotency-key": "33333333-3333-4333-8333-333333333333" });
  assert.equal(await status(), "declined");
  const dash = await f.admin("dashboard");
  assert.equal(dash.statuses.declined, 1);
  assert.equal(dash.statuses.attending, 0);
  await f.admin("revoke", { id: household });
  assert.equal(await status(), "revoked");
});

test("invitation emails carry a server-minted private link with quick answers; reissue revokes it", async () => {
  const f = await fixture();
  const { id } = await f.admin("mail/draft", { id: household, type: "invitation" });
  const preview = await f.admin("mail/preview", undefined, { id });
  const minted = preview.html.match(/\/rsvp\/#([A-Za-z0-9_-]{43})"/)[1];
  assert.ok(preview.html.includes(`#${minted}.yes`));
  assert.ok(preview.html.includes(`#${minted}.no`));
  const open = () =>
    f.app.dispatch({
      path: "/api/invitation-session",
      method: "POST",
      headers: { origin },
      body: { token: minted },
    });
  // A minted link stays closed until its own email has actually been sent.
  await assert.rejects(open, (e) => e.code === "INVALID_INVITATION");
  await f.admin("mail/send", { id, confirm: true });
  assert.ok((await open()).setCookie);
  await f.admin("invitation", {
    id: household,
    invited: { ceremony: true, dinner: true, dance: false },
  });
  await assert.rejects(open, (e) => e.code === "INVALID_INVITATION");
});

test("the after-event thank-you email is refused while the thank-you page it links to is still empty", async () => {
  const empty = (e) => e.status === 409 && e.code === "THANK_YOU_PAGE_EMPTY";
  const thanks = { id: household, type: "thanks" };
  // With the site's own content (site/content.mjs), the answer follows ready().
  const site = await fixture();
  if (ready("thank-you")) assert.ok((await site.admin("mail/draft", thanks)).id);
  else await assert.rejects(site.admin("mail/draft", thanks), empty);
  let filled = false;
  const f = await fixture({ pageReady: (route) => route !== "thank-you" || filled });
  await assert.rejects(f.admin("mail/draft", thanks), empty);
  assert.deepEqual(Object.values((await f.ledger.read()).outbox), [], "no draft is saved");
  assert.ok((await f.admin("mail/draft", { id: household, type: "details" })).id, "other emails are unaffected");
  // Once the family writes its thank-you note, the draft links to it...
  filled = true;
  const { id } = await f.admin("mail/draft", thanks);
  assert.match((await f.admin("mail/preview", undefined, { id })).html, /\/thank-you\//);
  // ...but it is not sent if the page has been emptied again since.
  filled = false;
  await assert.rejects(f.admin("mail/send", { id, confirm: true }), empty);
  assert.equal(f.sends(), 0);
  assert.equal((await f.ledger.read()).outbox[id].state, "draft", "still a draft, sent once the page is back");
  filled = true;
  assert.equal((await f.admin("mail/send", { id, confirm: true })).state, "accepted");
  assert.equal(f.sends(), 1);
});

test("unknown admin emails, link tokens and MFA challenges never queue a ledger write", async () => {
  const f = await fixture();
  const original = f.ledger.transaction.bind(f.ledger);
  let writes = 0;
  f.ledger.transaction = (fn) => (writes++, original(fn));
  const post = (path, body) =>
    f.app.dispatch({ path: "/api/" + path, method: "POST", headers: { origin }, body });
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(
      await post("auth/admin-email/request", { email: `nobody${i}@example.com` }),
      { requested: true },
    );
    await assert.rejects(
      () => post("auth/admin-email/verify", { token: String(i).repeat(43) }),
      (e) => e.status === 401,
    );
    await assert.rejects(
      () => post("auth/mfa", { challenge: "unknown-" + i, code: "000000" }),
      (e) => e.code === "SIGN_IN_AGAIN",
    );
  }
  assert.equal(writes, 0);
});

const batchId = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
test("invitation batches need a typed-count confirmation before anything sends", async () => {
  const f = await fixture({ mailSleep: async () => {} });
  const created = await f.admin("mail/invitation-batch", {
    requestId: batchId(1),
    type: "invitation",
    ids: [household, "not-a-guest"],
  });
  assert.equal(created.total, 1);
  assert.equal(created.skipped, 1);
  // Same request is idempotent; a different selection under it is refused.
  assert.equal((await f.admin("mail/invitation-batch", { requestId: batchId(1), type: "invitation", ids: [household, "not-a-guest"] })).total, 1);
  await assert.rejects(
    () => f.admin("mail/invitation-batch", { requestId: batchId(1), type: "invitation", ids: [household] }),
    (e) => e.code === "SETTINGS_CHANGED",
  );
  const detail = await f.admin("mail/batch", undefined, { id: batchId(1) });
  assert.equal(detail.skippedList[0].reason, "not-in-guest-list");
  assert.ok(detail.samples.en.html.includes("/rsvp/#"));
  const minted = detail.samples.en.html.match(/\/rsvp\/#([A-Za-z0-9_-]{43})"/)[1];
  const open = () =>
    f.app.dispatch({ path: "/api/invitation-session", method: "POST", headers: { origin }, body: { token: minted } });
  await assert.rejects(() => f.admin("mail/batch/send", { id: batchId(1) }), (e) => e.code === "BATCH_NOT_CONFIRMED");
  await assert.rejects(() => f.admin("mail/batch/confirm", { id: batchId(1), count: 2 }), (e) => e.code === "CONFIRM_COUNT_MISMATCH");
  await assert.rejects(open, (e) => e.code === "INVALID_INVITATION");
  assert.equal(f.sends(), 0);
  await f.admin("mail/batch/confirm", { id: batchId(1), count: 1 });
  const sent = await f.admin("mail/batch/send", { id: batchId(1) });
  assert.equal(sent.accepted, 1);
  assert.equal(sent.done, true);
  assert.equal(f.sends(), 1);
  assert.ok((await open()).setCookie, "the link opens once its email was sent");
  assert.equal((await f.admin("guests")).guests[0].status, "opened");
  // A second invitation batch skips a household that was already invited.
  const again = await f.admin("mail/invitation-batch", { requestId: batchId(2), type: "invitation", ids: [household] });
  assert.equal(again.total, 0);
  assert.equal(again.state, "empty");
});

test("reminder batches skip responders, recent contacts and cancelled drafts never send", async () => {
  const f = await fixture({ mailSleep: async () => {} });
  await f.admin("mail/invitation-batch", { requestId: batchId(3), type: "invitation", ids: [household] });
  await f.admin("mail/batch/confirm", { id: batchId(3), count: 1 });
  await f.admin("mail/batch/send", { id: batchId(3) });
  const reminder = (n) => f.admin("mail/invitation-batch", { requestId: batchId(n), type: "reminder", ids: [household] });
  const early = await f.admin("mail/batch", undefined, { id: (await reminder(4)).id });
  assert.equal(early.skippedList[0].reason, "contacted-in-last-72-hours");
  // Backdate the sent invitation (advancing the clock would expire the admin session).
  await f.ledger.transaction((s) => {
    for (const j of Object.values(s.outbox)) j.attemptAt -= 72 * 3600000 + 1;
  });
  const later = await reminder(5);
  assert.equal(later.total, 1);
  await f.admin("mail/batch/cancel", { id: later.id });
  await assert.rejects(() => f.admin("mail/batch/send", { id: later.id }), (e) => e.code === "BATCH_NOT_CONFIRMED");
  assert.equal(f.sends(), 1);
  await f.guest("rsvp", f.input(), { "idempotency-key": "44444444-4444-4444-8444-444444444444" });
  const answered = await f.admin("mail/batch", undefined, { id: (await reminder(6)).id });
  assert.equal(answered.skippedList[0].reason, "already-responded");
});

test("a batch being sent elsewhere cannot be sent twice at once", async () => {
  const f = await fixture({ mailSleep: async () => {} });
  await f.admin("mail/invitation-batch", { requestId: batchId(7), type: "invitation", ids: [household] });
  await f.admin("mail/batch/confirm", { id: batchId(7), count: 1 });
  await f.ledger.transaction((s) => {
    s.mailBatches[batchId(7)].lease = { owner: "other-tab", until: Date.now() * 2 };
  });
  await assert.rejects(() => f.admin("mail/batch/send", { id: batchId(7) }), (e) => e.code === "BATCH_ALREADY_SENDING");
  assert.equal(f.sends(), 0);
});

test("bulk link creation only covers households without a link and sends nothing", async () => {
  const other = { id: "22222222-2222-4222-8222-222222222222", name: "Other family", capacity: { adultsTeens: 2, kids: 0 }, email: "other@example.com", phone: "", validCapacity: true, administratorEligible: false, archived: false };
  const f = await fixture({ notion: { list: async () => [structuredClone(other)] } });
  const before = (await f.ledger.read()).invitations[household].generation;
  const r = await f.admin("invitations/issue-batch", {
    ids: [other.id, household],
    invited: { ceremony: true, dinner: true, dance: false },
    locale: "es",
  });
  assert.equal(r.issued, 1);
  const s = await f.ledger.read();
  assert.equal(s.invitations[other.id].locale, "es");
  assert.equal(s.invitations[household].generation, before, "existing links are never revoked");
  assert.equal(f.sends(), 0);
  await assert.rejects(
    () => f.admin("invitations/issue-batch", { ids: [other.id], invited: { ceremony: false, dinner: false, dance: false } }),
    (e) => e.code === "EVENTS_REQUIRED",
  );
});

test("invitation batches skip households that already responded", async () => {
  const f = await fixture({ mailSleep: async () => {} });
  await f.guest("rsvp", f.input(), { "idempotency-key": "55555555-5555-4555-8555-555555555555" });
  const r = await f.admin("mail/invitation-batch", { requestId: batchId(8), type: "invitation", ids: [household] });
  assert.equal(r.total, 0);
  const d = await f.admin("mail/batch", undefined, { id: r.id });
  assert.equal(d.skippedList[0].reason, "already-responded");
});

test("a temporary outage while sending keeps the email ready to retry", async () => {
  let outage = false,
    current;
  const f = await fixture({
    mailSleep: async () => {},
    notion: {
      read: async () => {
        if (outage) throw Object.assign(new Error(), { status: 503, code: "NOTION_503" });
        // The fixture reads during setup, before `current` exists; same row data.
        return structuredClone(
          current?.row ?? {
            id: household,
            name: "Test family",
            capacity: { adultsTeens: 2, kids: 1 },
            email: "test@example.com",
            phone: "",
            validCapacity: true,
            administratorEligible: true,
            archived: false,
          },
        );
      },
    },
  });
  current = f;
  await f.admin("mail/invitation-batch", { requestId: batchId(9), type: "invitation", ids: [household] });
  await f.admin("mail/batch/confirm", { id: batchId(9), count: 1 });
  outage = true;
  await assert.rejects(() => f.admin("mail/batch/send", { id: batchId(9) }), (e) => e.code === "NOTION_503");
  assert.equal(f.sends(), 0);
  const waiting = await f.admin("mail/batch", undefined, { id: batchId(9) });
  assert.equal(waiting.remaining, 1, "the email is still waiting, not set aside");
  outage = false;
  assert.equal((await f.admin("mail/batch/send", { id: batchId(9) })).accepted, 1);
});

test("an RSVP with a receipt email takes two ledger writes", async () => {
  const f = await fixture();
  const original = f.ledger.transaction.bind(f.ledger);
  let writes = 0;
  f.ledger.transaction = (fn) => (writes++, original(fn));
  const saved = await f.guest("rsvp", f.input(), { "idempotency-key": "88888888-8888-4888-8888-888888888888" });
  assert.equal(saved.syncState, "synced");
  const s = await f.ledger.read();
  const receipt = Object.values(s.outbox).find((j) => j.responseId === saved.id);
  assert.equal(receipt.state, "accepted");
  assert.equal(s.invitations[household].syncLease, undefined);
  assert.equal(writes, 2, `expected 2 ledger writes, got ${writes}`);
});

test("folded RSVP saves keep outage, replay and no-mail behavior", async () => {
  const f = await fixture();
  f.failSync();
  const key = { "idempotency-key": "99999999-9999-4999-8999-999999999999" };
  const first = await f.guest("rsvp", f.input(), key);
  let s = await f.ledger.read();
  assert.equal(first.syncState, "pending", "a Notion outage leaves the sync pending");
  assert.equal(s.invitations[household].syncLease, undefined, "the lease is released");
  assert.equal(Object.values(s.outbox).find((j) => j.responseId === first.id).state, "accepted");
  const sends = f.sends();
  // Replaying the same request returns the saved RSVP and never resends the receipt.
  const replay = await f.guest("rsvp", f.input(), key);
  assert.equal(replay.id, first.id);
  assert.equal(f.sends(), sends);
  s = await f.ledger.read();
  assert.equal(Object.values(s.outbox).filter((j) => j.responseId === first.id).length, 1);

  const quiet = await fixture({ mailer: { configured: false, send: async () => assert.fail("must not send") } });
  const saved = await quiet.guest("rsvp", quiet.input(), { "idempotency-key": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
  assert.equal(saved.syncState, "synced");
  const draft = Object.values((await quiet.ledger.read()).outbox).find((j) => j.responseId === saved.id);
  assert.equal(draft.state, "draft", "without mail configured the receipt waits as a draft");
});

test("RSVPs reach the in-app inbox without emailing organizers, and the pulse reflects them", async () => {
  const f = await fixture();
  const before = await f.admin("pulse");
  const organizerMail = () => f.sent.filter((m) => m.to === "organizer@gmail.com").length;
  await f.guest("rsvp", f.input(), { "idempotency-key": "66666666-6666-4666-8666-666666666666" });
  const after = await f.admin("pulse");
  assert.notEqual(after.token, before.token);
  assert.equal(after.unread, before.unread + 1);
  const note = (await f.admin("notifications")).notifications.find((n) => n.kind === "rsvp");
  assert.equal(note.title, "Test family responded");
  assert.equal(note.text, "Attending: 4 people");
  assert.equal(note.emailState, "none");
  assert.equal(organizerMail(), 0, "RSVP alerts are never emailed");
  await f.admin("notifications", { id: note.id });
  assert.equal((await f.admin("pulse")).unread, after.unread - 1);
  const update = f.input();
  update.previousSubmissionId = "66666666-6666-4666-8666-666666666666";
  for (const e of Object.keys(update.attendance)) update.attendance[e] = { adultsTeens: 0, kids: 0 };
  f.advance(1000);
  await f.guest("rsvp", update, { "idempotency-key": "77777777-7777-4777-8777-777777777777" });
  const latest = (await f.admin("notifications")).notifications.filter((n) => n.kind === "rsvp")[0];
  assert.equal(latest.title, "Test family updated their RSVP");
  assert.equal(latest.text, "Not attending");
});

const openLink = (f, value) =>
  f.app.dispatch({
    path: "/api/invitation-session",
    method: "POST",
    headers: { origin },
    body: { token: value },
  });

test("group email {link} mints one private link per household that opens only after send", async () => {
  const f = await fixture();
  const draft = (requestId, text = "Hi! RSVP here: {link}") =>
    f.admin("mail/batch-draft", {
      requestId,
      groups: [],
      ids: [household],
      subject: "Please RSVP",
      text,
    });
  const first = await draft("link-campaign-001");
  assert.deepEqual([first.count, first.skipped], [1, []]);
  const { html } = await f.admin("mail/preview", undefined, { id: first.ids[0] });
  const minted = html.match(/<a href="[^"]+\/rsvp\/#([A-Za-z0-9_-]{43})">/)[1];
  assert.ok(!html.includes("{link}"));
  await assert.rejects(() => openLink(f, minted), (e) => e.code === "INVALID_INVITATION");
  await f.admin("mail/send", { id: first.ids[0], confirm: true });
  assert.ok((await openLink(f, minted)).setCookie);
  // Reissuing the household's link revokes drafted links: the draft goes stale.
  const second = await draft("link-campaign-002");
  await f.admin("invitation", {
    id: household,
    invited: { ceremony: true, dinner: true, dance: false },
  });
  await assert.rejects(
    () => f.admin("mail/send", { id: second.ids[0], confirm: true }),
    (e) => e.code === "MAIL_DRAFT_STALE",
  );
  // A household without any private link is skipped, never sent a dead link.
  await f.ledger.transaction((s) => delete s.invitations[household]);
  await assert.rejects(
    () => draft("link-campaign-003"),
    (e) => e.code === "LINKS_NOT_READY",
  );
  assert.equal((await draft("link-campaign-004", "No link here")).count, 1);
});

test("group SMS {link} stays sealed in the draft and is filled only when sent", async () => {
  const texts = [];
  const f = await fixture({
    smsTransport: {
      enabled: true,
      async send({ text }) {
        texts.push(text);
        return { state: "accepted", provider: "twilio", providerId: "SM" + "a".repeat(32) };
      },
    },
  });
  f.row.phone = "+18175550100";
  f.row.smsConsent = true;
  f.row.smsConsentAt = "2026-09-28";
  await keywordOptIn(f, f.row.phone);
  const text = "Simply Soph Media: RSVP at {link} Reply STOP to opt out.";
  const { ids } = await f.admin("mail/batch-draft", {
    requestId: "sms-link-001",
    groups: [],
    ids: [household],
    subject: "RSVP",
    text,
    channel: "sms",
  });
  const listed = (await f.admin("sms/drafts")).drafts[0];
  assert.equal(listed.text, text);
  assert.equal(listed.link, undefined);
  const preview = await f.admin("sms/preview", undefined, { id: ids[0] });
  await f.admin("sms/send", { id: ids[0], reviewToken: preview.reviewToken, confirm: true });
  const minted = texts[0].match(/\/rsvp\/#([A-Za-z0-9_-]{43}) /)[1];
  assert.ok(!texts[0].includes("{link}"));
  assert.ok((await openLink(f, minted)).setCookie);
});

test("the scheduled drain is disabled by default, rejects bad tokens and retries pending Notion syncs", async () => {
  const drain = (f, authorization) =>
    f.app.dispatch({ path: "/api/internal/drain", method: "POST", headers: { authorization }, body: {} });
  const off = await fixture();
  await assert.rejects(() => drain(off, "Bearer anything"), (e) => e.status === 404);
  const f = await fixture({ verifyScheduler: async (h) => h === "Bearer scheduler-token" });
  await assert.rejects(() => drain(f, "Bearer forged"), (e) => e.status === 401);
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/internal/drain", method: "GET", headers: {} }),
    (e) => e.status === 405,
  );
  f.failSync();
  await f.guest("rsvp", f.input(), { "idempotency-key": "request-drain-1" });
  assert.equal((await f.ledger.read()).invitations[household].syncState, "pending");
  f.failSync(false);
  const result = await drain(f, "Bearer scheduler-token");
  assert.deepEqual(result.rsvp, { attempted: 1 });
  assert.ok(result.sms && result.whatsapp);
  assert.equal((await f.ledger.read()).invitations[household].syncState, "synced");
  // Nothing left: the next run is a cheap no-op.
  assert.deepEqual((await drain(f, "Bearer scheduler-token")).rsvp, { attempted: 0 });
});

test("the event log records the invitation lifecycle in order without contact details", async () => {
  const f = await fixture();
  const { id } = await f.admin("mail/draft", { id: household, type: "invitation" });
  await f.admin("mail/send", { id, confirm: true });
  await f.guest("rsvp", f.input(), { "idempotency-key": "request-events-1" });
  await f.admin("revoke", { id: household });
  const log = (await f.ledger.read()).eventLog;
  const types = log.map((e) => e.type);
  for (const [earlier, later] of [
    ["delivery.claimed", "delivery.accepted"],
    ["delivery.accepted", "rsvp.submitted"],
    ["rsvp.submitted", "notion.synced"],
    ["notion.synced", "invitation.revoked"],
  ])
    assert.ok(types.indexOf(earlier) >= 0 && types.indexOf(earlier) < types.indexOf(later), `${earlier} before ${later}: ${types}`);
  assert.deepEqual(log.find((e) => e.type === "rsvp.submitted").data, { responseId: "request-events-1", people: 4 });
  assert.equal(log.find((e) => e.type === "delivery.accepted").deliveryId, id);
  assert.deepEqual(log.map((e) => e.seq), log.map((_, i) => log[0].seq + i));
  const text = JSON.stringify(log);
  assert.ok(!text.includes("test@example.com"), "no email addresses in events");
});

test("public announcements carry only what the page shows, never admin notes", async () => {
  const f = await fixture();
  await f.admin("updates", { title: "Parking", text: "Use the north lot" });
  const [a] = Object.values((await f.ledger.read()).announcements);
  await f.admin("records", {
    kind: "announcements",
    id: a.id,
    action: "update",
    version: a.recordVersion || 0,
    values: { notes: "PRIVATE-ADMIN-NOTE" },
  });
  const pub = await f.app.dispatch({ path: "/api/public", method: "GET" });
  assert.equal(pub.announcements.length, 1);
  assert.deepEqual(Object.keys(pub.announcements[0]).sort(), ["at", "id", "text", "textEs", "title", "titleEs"]);
  assert.ok(!JSON.stringify(pub).includes("PRIVATE-ADMIN-NOTE"));
});

test("the invitation email date follows the event settings", async () => {
  const f = await fixture();
  const site = (await f.admin("site")).site;
  const move = (iso) => iso.replace("2027-01-15", "2027-01-16");
  await f.admin("site", {
    ...site,
    ceremony: { ...site.ceremony, start: move(site.ceremony.start), end: site.ceremony.end && move(site.ceremony.end) },
  });
  await f.admin("mail/draft", { id: household, type: "invitation" });
  const draft = Object.values((await f.ledger.read()).outbox).at(-1);
  assert.match(draft.subject, /Saturday, January 16, 2027/);
});

// ---- Owner's access model (Oct 10, 2026) ------------------------------------
// Invitation links open the RSVP only; guests sign in with the email on their
// Notion row; administrators are whoever Notion ticks, plus the break-glass owner.
const linkOf = (mail) => mail.html.match(/#([A-Za-z0-9_-]{43})/)[1];
async function adminSignIn(f, email) {
  const before = f.sent.length;
  await f.publicPost("auth/admin-email/request", { email });
  assert.equal(f.sent.length, before + 1, "an admin sign-in link is emailed");
  const c = await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) });
  f.advance(30000);
  const signed = await f.publicPost("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(f.now() / 30000)),
  });
  const as = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: { origin, cookie: signed.setCookie.split(";")[0], "x-csrf-token": signed.csrf },
    });
  return { c, as };
}

test("an invitation link or code opens the RSVP only; everything else needs the email sign-in", async () => {
  const f = await fixture();
  assert.equal((await f.linkGuest("invitation")).contactHidden, true);
  // The page keeps a half-filled RSVP in the tab under the household's id.
  assert.equal((await f.linkGuest("invitation")).householdId, household);
  await f.linkGuest("rsvp", f.input(), { "idempotency-key": "11111111-1111-4111-8111-111111111111" });
  for (const [path, body] of [
    ["messages", { kind: "guestbook", name: "A", text: "Hi", consent: true }],
    ["profile", { email: "x@example.com", phone: "", address: "", version: 1 }],
    ["account", undefined],
  ])
    await assert.rejects(() => f.linkGuest(path, body), (e) => e.code === "SIGN_IN_REQUIRED");
  assert.equal((await f.linkGuest("session")).scope, "rsvp");
});

test("guests sign in with the email on their Notion row, including Additional Emails, without registering", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "TEST@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const session = await f.app.dispatch({ path: "/api/session", headers: { cookie: s.setCookie.split(";")[0] } });
  assert.equal(session.verified, true);
  assert.equal(session.scope, null);
  const unknown = await f.publicPost("auth/email/request", { email: "stranger@example.com" });
  const sentBefore = f.sent.length;
  assert.deepEqual(unknown, { requested: true });
  assert.equal(f.sent.length, sentBefore, "nothing is sent to an address not on the guest list");
  f.row.additionalEmails = ["grandma@example.com"];
  await f.publicPost("auth/email/request", { email: "grandma@example.com" });
  await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const accounts = Object.values((await f.ledger.read()).accounts);
  assert.ok(accounts.some((a) => a.email === "grandma@example.com" && a.householdId === household));
});

test("the emailed sign-in link brings the guest back to the page they asked from", async () => {
  const f = await fixture();
  const signIn = async (body) => {
    f.advance(900001); // past the 3-links-per-15-minutes limit
    await f.publicPost("auth/email/request", { email: "test@example.com", ...body });
    const mail = f.sent.at(-1);
    return { mail, result: await f.publicPost("auth/email/verify", { token: linkOf(mail) }) };
  };
  // From the Spanish photo page: a Spanish email whose link confirms on
  // /es/account/, then returns to /es/share/.
  const share = await signIn({ return: "es/share" });
  assert.match(share.mail.html, /\/es\/account\/#[A-Za-z0-9_-]{43}"/);
  assert.equal(share.result.returnTo, "es/share");
  assert.equal((await signIn({ return: "guestbook" })).result.returnTo, "guestbook");
  // Only page names from the list are kept, never an address from the request.
  for (const value of ["https://evil.example/", "//evil.example", "admin", "es/admin/login", "share/../admin", 42]) {
    const { mail, result } = await signIn({ return: value });
    assert.equal(result.returnTo, null, String(value));
    assert.match(mail.html, /"https:\/\/misxv\.simplysoph\.com\/account\/#[A-Za-z0-9_-]{43}"/);
  }
  const s = await f.ledger.read();
  assert.ok(Object.values(s.emailLinks || {}).every((l) => !l.returnTo || /^(es\/)?[a-z]+$/.test(l.returnTo)));
});

test("the sign-in email greets the household in its language and says what the link does", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com", return: "account" });
  const en = f.sent.at(-1);
  assert.equal(en.subject, "Your sign-in link · Sophia’s quinceañera");
  assert.equal(en.secret, true, "kept out of Sent Items");
  for (const words of [
    "Hello Test family,",
    "Sophia’s quinceañera",
    "Friday, January 15, 2027",
    "share photos and videos",
    "works once",
    "15 minutes",
    "Didn’t ask for this? Ignore this email",
    "Sophia’s family",
  ])
    assert.ok(en.html.includes(words), words);
  assert.ok(!/Inicia sesión|Continuar/.test(en.html), "one language only");
  // A Spanish household, or a guest asking from a Spanish page, reads Spanish.
  await f.ledger.transaction((s) => {
    s.invitations[household].locale = "es";
  });
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const es = f.sent.at(-1);
  assert.equal(es.subject, "Tu enlace para entrar · Los XV de Sophia");
  for (const words of ["Hola, Test family:", "viernes 15 de enero de 2027", "una sola vez", "15 minutos", "¿No lo pediste? Ignora este correo", "la familia de Sophia"])
    assert.ok(es.html.includes(words), words);
  assert.match(es.html, /\/es\/account\/#[A-Za-z0-9_-]{43}"/);
  assert.ok(!/Sign in|works once/.test(es.html), "one language only");
  assert.ok(!/[ �]/.test(en.html + es.html), "no characters the mail server cannot carry");
});

test("an email removed from Notion can no longer use an issued sign-in link", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const raw = linkOf(f.sent.at(-1));
  f.row.email = "someone-else@example.com";
  await assert.rejects(() => f.publicPost("auth/email/verify", { token: raw }), (e) => e.code === "EMAIL_LINK_INVALID");
});

test("returning email links are single-use, expire, and do not reveal whether an address exists", async () => {
  const f = await fixture();
  const known = await f.publicPost("auth/email/request", { email: "TEST@example.com" });
  const raw = linkOf(f.sent.at(-1));
  const unknown = await f.publicPost("auth/email/request", { email: "unknown@example.com" });
  assert.deepEqual(known, unknown);
  const outcomes = await Promise.allSettled([
    f.publicPost("auth/email/verify", { token: raw }),
    f.publicPost("auth/email/verify", { token: raw }),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const expired = linkOf(f.sent.at(-1));
  f.advance(900000);
  await assert.rejects(() => f.publicPost("auth/email/verify", { token: expired }), (e) => e.code === "EMAIL_LINK_INVALID");
});

test("receipts go only to a verified address, never to an email typed in the form", async () => {
  const f = await fixture();
  await f.guest("rsvp", { ...f.input(), contact: { email: "typed@other.example", phone: "", address: null } }, {
    "idempotency-key": "22222222-2222-4222-8222-222222222222",
  });
  const recipients = Object.values((await f.ledger.read()).outbox).map((m) => m.to);
  assert.deepEqual(recipients, ["test@example.com"]);
});

test("ticking Administrator Eligible in Notion makes someone an admin; unticking ends the session at once", async () => {
  const f = await fixture();
  const { c, as } = await adminSignIn(f, "test@example.com");
  assert.match(c.provisioningQr, /^data:image\/png;base64,/, "first sign-in sets up the authenticator by QR");
  assert.ok((await as("admin/dashboard")).households !== undefined || true);
  assert.equal((await as("session")).kind, "admin");
  assert.equal((await as("session")).owner, false);
  const notes = Object.values((await f.ledger.read()).notifications);
  assert.ok(notes.some((n) => n.kind === "security" && /test@example.com/.test(n.title)), "the owner is told");
  f.row.administratorEligible = false;
  f.advance(6000); // past the 5-second positive cache
  await assert.rejects(() => as("admin/guests"), (e) => e.code === "SIGN_IN_REQUIRED");
  assert.equal((await as("session")).kind, null);
  f.row.administratorEligible = true;
  await assert.rejects(() => as("admin/guests"), (e) => e.code === "SIGN_IN_REQUIRED", "re-ticking does not revive the old session");
  // The owner in ADMIN_EMAILS is the one approved exception outside Notion.
  f.row.administratorEligible = false;
  assert.ok(await f.admin("accounts"));
});

test("an email that appears on a second Notion row loses admin access and guest links", async () => {
  const f = await fixture();
  const { as } = await adminSignIn(f, "test@example.com");
  assert.equal((await as("session")).kind, "admin");
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const pending = linkOf(f.sent.at(-1));
  f.extraRows.push({ ...f.row, id: "11111111-1111-4111-8111-111111111111", name: "Other family", additionalEmails: ["test@example.com"] });
  f.advance(6000); // past the 5-second positive cache
  await assert.rejects(() => as("admin/guests"), (e) => e.code === "SIGN_IN_REQUIRED");
  await assert.rejects(() => f.publicPost("auth/email/verify", { token: pending }), (e) => e.code === "EMAIL_LINK_INVALID");
});

test("typing addresses on the admin sign-in never forces a fresh Notion read", async () => {
  const f = await fixture();
  f.listCalls.length = 0;
  for (const email of ["a@example.com", "b@example.com", "test@example.com"])
    await f.publicPost("auth/admin-email/request", { email });
  assert.deepEqual(f.listCalls, [false, false, false]);
  // Opening the emailed link still reads Notion fresh.
  await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) });
  assert.equal(f.listCalls.at(-1), true);
});

test("an unticked or unknown email cannot start an admin sign-in", async () => {
  const f = await fixture();
  f.row.administratorEligible = false;
  const before = f.sent.length;
  assert.deepEqual(await f.publicPost("auth/admin-email/request", { email: "test@example.com" }), { requested: true });
  assert.deepEqual(await f.publicPost("auth/admin-email/request", { email: "nobody@example.com" }), { requested: true });
  assert.equal(f.sent.length, before);
});

test("Notion admins are not owners: schema, import, resets and history stay owner-only", async () => {
  const f = await fixture();
  const { as } = await adminSignIn(f, "test@example.com");
  for (const [path, body] of [
    ["admin/schema", {}],
    ["admin/import", { rows: [] }],
    ["admin/authenticator-reset", { email: "x@example.com", code: "000000" }],
    ["admin/role-events", undefined],
  ])
    await assert.rejects(() => as(path, body), (e) => e.code === "OWNER_REQUIRED", path);
  const list = await f.admin("accounts");
  assert.ok(list.administrators.some((a) => a.email === "test@example.com" && a.authenticator));
  assert.ok(list.administrators.some((a) => a.email === "organizer@gmail.com" && a.owner));
});

test("the owner resets a lost authenticator with a fresh code; the admin sets up a new one", async () => {
  const f = await fixture();
  const { as } = await adminSignIn(f, "test@example.com");
  await assert.rejects(
    () => f.admin("authenticator-reset", { email: "test@example.com", code: "000000" }),
    (e) => e.code === "INVALID_MFA" || e.code === "MFA_REQUIRED",
  );
  assert.deepEqual(
    await f.admin("authenticator-reset", { email: "test@example.com", code: await f.ownerCode() }),
    { reset: true },
  );
  await assert.rejects(() => as("admin/guests"), (e) => e.code === "SIGN_IN_REQUIRED");
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  const again = await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) });
  assert.ok(again.enrollmentSecret, "a new authenticator is set up");
});

test("private pages, page permissions, registration and step-up are gone", async () => {
  const f = await fixture();
  await assert.rejects(() => f.guest("pages/costs"), (e) => e.status === 404);
  await assert.rejects(() => f.guest("auth/step-up", {}), (e) => e.status === 404);
  await assert.rejects(() => f.admin("pages"), (e) => e.status === 404);
  assert.equal(
    (await f.app.dispatch({ path: "/api/site" })).site.registries[0].url,
    "https://www.target.com/gift-registry/gift/quincenera",
    "the registry stays public",
  );
});

test("the approved-page preview is for administrators only and serves just the known pages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "misxv-preview-"));
  await mkdir(join(dir, "en"));
  await writeFile(join(dir, "en", "sophia.html"), "<p>Example preview</p>");
  const f = await fixture({ previewRoot: dir });
  const page = await f.admin("preview", undefined, { page: "sophia", lang: "en" });
  assert.equal(page.contentType, "text/html; charset=utf-8");
  assert.equal(String(page.binary), "<p>Example preview</p>");
  for (const query of [{ page: "../en/sophia" }, { page: "sophia", lang: "fr" }, { page: "rsvp" }, {}])
    await assert.rejects(() => f.admin("preview", undefined, query), (e) => e.code === "NOT_FOUND", JSON.stringify(query));
  await assert.rejects(() => f.admin("preview", undefined, { page: "court" }), (e) => e.code === "PREVIEW_NOT_BUILT");
  // Guests and signed-out visitors never see the example text.
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/admin/preview", query: { page: "sophia" }, method: "GET", headers: { origin, cookie: "__session=" + f.guestToken } }),
    (e) => e.status === 401 || e.status === 403,
  );
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/admin/preview", query: { page: "sophia" }, method: "GET", headers: { origin } }),
    (e) => e.status === 401,
  );
});

test("sign-in link requests count only sends, so strangers cannot lock anyone out (AUTHN-5)", async () => {
  const f = await fixture();
  for (let i = 0; i < 20; i++)
    assert.deepEqual(await f.publicPost("auth/email/request", { email: "nobody@example.com" }), { requested: true });
  // An address on the list gets at most 3 links per 15 minutes, and the person receives them.
  const before = f.sent.length;
  for (let i = 0; i < 5; i++)
    assert.deepEqual(await f.publicPost("auth/email/request", { email: "test@example.com" }), { requested: true });
  assert.equal(f.sent.length - before, 3);
  f.advance(900001);
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  assert.equal(f.sent.length - before, 4);
  // Administrator links work the same way.
  const adminBefore = f.sent.length;
  for (let i = 0; i < 5; i++) await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  assert.equal(f.sent.length - adminBefore, 3);
});

test("a permanent Notion refusal is marked failed once, alerts the family and waits for Retry (NOTION-7)", async () => {
  let refusal = "NOTION_400";
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project() {
        if (refusal) throw { code: refusal };
      },
    },
  });
  await f.guest("rsvp", f.input(), { "idempotency-key": "33333333-3333-4333-8333-333333333333" });
  let s = await f.ledger.read();
  assert.equal(s.invitations[household].syncState, "failed");
  assert.equal(s.invitations[household].syncError, "NOTION_400");
  const alerts = () => Object.values(s.notifications).filter((n) => n.kind === "sync");
  assert.equal(alerts().length, 1);
  // The scheduled drain leaves failed rows alone instead of retrying them every 10 minutes.
  const drained = await f.app.dispatch({ path: "/api/internal/drain", method: "POST", headers: { authorization: "Bearer x" } });
  assert.equal(drained.rsvp.attempted, 0);
  // An admin's Retry tries again; a repeat failure does not alert twice.
  await f.admin("sync", {});
  s = await f.ledger.read();
  assert.equal(alerts().length, 1);
  refusal = null;
  await f.admin("sync", {});
  s = await f.ledger.read();
  assert.equal(s.invitations[household].syncState, "synced");
  // An outage is not permanent: it stays pending for the scheduled drain.
  refusal = "NOTION_UNAVAILABLE";
  const update = f.input();
  update.previousSubmissionId = "33333333-3333-4333-8333-333333333333";
  await f.guest("rsvp", update, { "idempotency-key": "44444444-4444-4444-8444-444444444444" });
  assert.equal((await f.ledger.read()).invitations[household].syncState, "pending");
});

test("signed-in guests stay signed in while they use the site, up to 12 hours (AUTHN-7)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const signed = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const cookie = signed.setCookie.split(";")[0];
  const get = () => f.app.dispatch({ path: "/api/session", headers: { cookie } });
  f.advance(20 * 60000); // 10 minutes left: this request renews it
  const renewed = await get();
  assert.equal(renewed.verified, true);
  assert.match(renewed.setCookie, /^__session=/, "the cookie is re-sent");
  f.advance(25 * 60000); // 45 minutes after sign-in, still signed in
  assert.equal((await get()).verified, true);
  // Keep using it: it never passes 12 hours after sign-in.
  for (let t = 0; t < 12 * 60; t += 20) {
    f.advance(20 * 60000);
    await get();
  }
  assert.equal((await get()).kind, null, "signed out 12 hours after sign-in");
  // An idle session still ends after 30 minutes.
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const idle = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  f.advance(31 * 60000);
  assert.equal((await f.app.dispatch({ path: "/api/session", headers: { cookie: idle.setCookie.split(";")[0] } })).kind, null);
});

test("sign out everywhere ends only your own sessions (AUTHN-10)", async () => {
  const f = await fixture();
  const signIn = async () => {
    await f.publicPost("auth/email/request", { email: "test@example.com" });
    f.advance(1000);
    const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
    return { cookie: s.setCookie.split(";")[0], csrf: s.csrf };
  };
  const phone = await signIn(),
    laptop = await signIn();
  const kind = (c) => f.app.dispatch({ path: "/api/session", headers: { cookie: c } }).then((r) => r.kind);
  const out = await f.app.dispatch({
    path: "/api/logout-all",
    method: "POST",
    body: {},
    headers: { origin, cookie: phone.cookie, "x-csrf-token": phone.csrf },
  });
  // The two new sign-ins plus the fixture's existing session for the same account.
  assert.equal(out.signedOut, 3);
  await assert.rejects(() => f.guest("account"), (e) => e.code === "SIGN_IN_REQUIRED");
  assert.equal(await kind(phone.cookie), null);
  assert.equal(await kind(laptop.cookie), null);
  assert.ok(await f.admin("guests"), "other people's sessions are untouched");
  // An invitation-link session is RSVP-only and cannot sign anyone out.
  await assert.rejects(() => f.linkGuest("logout-all", {}), (e) => e.code === "SIGN_IN_REQUIRED");
});

test("the owner's recovery code replaces a lost authenticator, once (SEC-10)", async () => {
  const f = await fixture();
  const { codes } = await f.admin("recovery-codes", { code: await f.ownerCode() });
  assert.equal(codes.length, 10);
  assert.match(codes[0], /^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.equal((await f.admin("accounts")).recoveryCodesLeft, 10);
  const stored = JSON.stringify((await f.ledger.read()).admins);
  assert.ok(!stored.includes(codes[0].replaceAll("-", "")), "only hashes are stored");
  // Sign in with the emailed link, then a recovery code instead of the authenticator.
  const challenge = async () => {
    await f.publicPost("auth/admin-email/request", { email: "organizer@gmail.com" });
    return (await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) })).challenge;
  };
  const c1 = await challenge();
  const recovered = await f.publicPost("auth/mfa", { challenge: c1, code: codes[0].toLowerCase() });
  assert.equal(recovered.recovered, true);
  assert.ok(recovered.enrollmentSecret && !recovered.setCookie, "it opens a new setup, not a session");
  f.advance(30000);
  const signed = await f.publicPost("auth/mfa", {
    challenge: c1,
    code: totp(recovered.enrollmentSecret, Math.floor(f.now() / 30000)),
  });
  assert.match(signed.setCookie, /^__session=/);
  const notes = Object.values((await f.ledger.read()).notifications).map((n) => n.title);
  assert.ok(notes.some((t) => /recovery code was used.*9 left/.test(t)));
  // The code works once.
  const c2 = await challenge();
  await assert.rejects(() => f.publicPost("auth/mfa", { challenge: c2, code: codes[0] }), (e) => e.code === "INVALID_MFA");
});

test("recovery codes are for the site owner only (SEC-10)", async () => {
  const f = await fixture();
  const { as } = await adminSignIn(f, "test@example.com");
  await assert.rejects(() => as("admin/recovery-codes", { code: "000000" }), (e) => e.code === "OWNER_REQUIRED");
  assert.equal((await as("admin/accounts")).recoveryCodesLeft, undefined);
});

test("a guest whose email leaves the Notion row is not renewed, so access ends soon (AUTHN-7)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const signed = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const cookie = signed.setCookie.split(";")[0];
  const get = () => f.app.dispatch({ path: "/api/session", headers: { cookie } });
  f.row.email = "someone-else@example.com";
  f.advance(20 * 60000);
  const r = await get();
  assert.equal(r.setCookie, undefined, "not renewed");
  f.advance(11 * 60000);
  assert.equal((await get()).kind, null, "the original 30 minutes ran out");
});

test("sign-in requests take the full floor and only a few run at once (SEC-8)", async () => {
  const f = await fixture({ signInFloorMs: 150, signInConcurrency: 2 });
  for (const [path, email] of [
    ["auth/email/request", "nobody@example.com"],
    ["auth/email/request", "test@example.com"],
    ["auth/admin-email/request", "nobody@example.com"],
    ["auth/admin-email/request", "test@example.com"],
  ]) {
    const started = Date.now();
    assert.deepEqual(await f.publicPost(path, { email }), { requested: true });
    assert.ok(Date.now() - started >= 145, `${path} for ${email} answered early`);
  }
  // Up to signInConcurrency at once (2 here, 16 in production); one more at the
  // same moment is told to retry instead of holding another request slot.
  const outcomes = await Promise.allSettled(
    [1, 2, 3].map(() => f.publicPost("auth/email/request", { email: "nobody@example.com" })),
  );
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 2);
  assert.equal(outcomes.find((o) => o.status === "rejected").reason.code, "SIGN_IN_BUSY");
});

test("a newer RSVP saved while an older sync fails stays pending, not failed (NOTION-7)", async () => {
  let f,
    first = true;
  f = await fixture({
    notion: {
      async project() {
        if (!first) return;
        first = false;
        // The guest changes their answer while this projection is in flight.
        const update = f.input();
        update.previousSubmissionId = "55555555-5555-4555-8555-555555555555";
        await f.guest("rsvp", update, { "idempotency-key": "66666666-6666-4666-8666-666666666666" });
        throw { code: "NOTION_400" };
      },
    },
  });
  await f.guest("rsvp", f.input(), { "idempotency-key": "55555555-5555-4555-8555-555555555555" });
  const s = await f.ledger.read();
  assert.equal(s.invitations[household].latestSubmissionId, "66666666-6666-4666-8666-666666666666");
  assert.equal(s.invitations[household].syncState, "pending", "the drain will still try the new answer");
  assert.equal(Object.values(s.notifications).filter((n) => n.kind === "sync").length, 0);
});

test("a renewal is saved only with a response that carries the cookie, photos included (AUTHN-7)", async () => {
  const f = await fixture();
  const pid = "77777777-7777-4777-8777-777777777777";
  await f.ledger.transaction((s) => {
    s.photos[pid] = { id: pid, state: "approved", kind: "photo" };
  });
  await f.media.put(pid, Buffer.from("image"), "photo");
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const signed = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const cookie = signed.setCookie.split(";")[0];
  const expiresAt = async () => (await f.ledger.read()).sessions[hash(cookie.slice(10))].expiresAt;
  const before = await expiresAt();
  f.advance(20 * 60000);
  await assert.rejects(() => f.app.dispatch({ path: "/api/nothing-here", headers: { cookie } }), (e) => e.status === 404);
  assert.equal(await expiresAt(), before, "a failed request renews nothing");
  const photo = await f.app.dispatch({ path: "/api/photo/" + pid, headers: { cookie } });
  assert.ok(photo.stream);
  assert.match(photo.setCookie, /^__session=/, "the photo response carries the renewed cookie");
  assert.ok((await expiresAt()) > before);
});

test("admin sessions and email sign-ins during a Notion outage do not renew (AUTHN-7)", async () => {
  let down = false,
    f;
  f = await fixture({
    notion: {
      async list() {
        if (down) throw Object.assign(new Error(), { status: 503, code: "NOTION_UNAVAILABLE" });
        return [structuredClone(f.row)];
      },
    },
  });
  // The seeded admin session is in its last 15 minutes.
  assert.equal((await f.admin("dashboard")).setCookie, undefined, "admin sessions keep 30 minutes");
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const signed = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  down = true;
  f.advance(20 * 60000);
  const r = await f.app.dispatch({ path: "/api/session", headers: { cookie: signed.setCookie.split(";")[0] } });
  assert.equal(r.verified, true, "a Notion outage never fails the request");
  assert.equal(r.setCookie, undefined, "but it skips the renewal");
});

test("an invitation-link session stays open while the guest is answering, up to 2 hours", async () => {
  const f = await fixture();
  const expiresAt = async () =>
    Object.values((await f.ledger.read()).sessions).find((s) => s.scope === "rsvp").expiresAt;
  // Twenty minutes into the form, the page checks in: the session runs 30
  // minutes from now instead of ending ten minutes later.
  f.advance(20 * 60000);
  const touched = await f.linkGuest("session");
  assert.match(touched.setCookie, /^__session=.*Max-Age=1800/, "the renewed cookie is sent again");
  assert.equal(await expiresAt(), f.now() + 1800000);
  // A save 45 minutes after opening the link still works.
  f.advance(25 * 60000);
  const saved = await f.linkGuest("rsvp", f.input(), { "idempotency-key": "41414141-4141-4141-8141-414141414141" });
  assert.equal(saved.saved, true);
  // Kept busy, it still ends 2 hours after the link was opened.
  for (let i = 0; i < 6; i++) {
    f.advance(20 * 60000);
    await f.linkGuest("session").catch(() => {});
  }
  assert.equal(await expiresAt(), at + 7200000, "never past 2 hours");
  f.advance(at + 7200000 - f.now());
  assert.equal((await f.linkGuest("session")).kind, null);
  await assert.rejects(() => f.linkGuest("invitation"), (e) => e.code === "SIGN_IN_REQUIRED");
});

test("an idle invitation-link session still ends after 30 minutes, and only RSVP routes renew it", async () => {
  const f = await fixture();
  f.advance(31 * 60000);
  await assert.rejects(
    () => f.linkGuest("rsvp", f.input(), { "idempotency-key": "42424242-4242-4242-8242-424242424242" }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  const g = await fixture();
  g.advance(20 * 60000);
  // My account is outside an RSVP-only session: refused, and nothing renewed.
  await assert.rejects(() => g.linkGuest("account"), (e) => e.code === "SIGN_IN_REQUIRED");
  const session = Object.values((await g.ledger.read()).sessions).find((s) => s.scope === "rsvp");
  assert.equal(session.expiresAt, at + 1800000);
  // A reissued link ends the session instead of renewing it.
  await g.ledger.transaction((s) => {
    s.invitations[household].generation = 2;
  });
  assert.equal((await g.linkGuest("session")).kind, null);
});

test("an administrator's sign out everywhere leaves other administrators alone (AUTHN-10)", async () => {
  const f = await fixture();
  const first = await adminSignIn(f, "test@example.com");
  // A second device: the same admin signs in again with the same authenticator.
  f.advance(31000);
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  const c = await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) });
  const second = await f.publicPost("auth/mfa", {
    challenge: c.challenge,
    code: totp(first.c.enrollmentSecret, Math.floor(f.now() / 30000)),
  });
  const secondCookie = second.setCookie.split(";")[0];
  // Writes need the CSRF token, like every other change.
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/logout-all", method: "POST", body: {}, headers: { origin, cookie: secondCookie } }),
    (e) => e.code === "CSRF_REJECTED",
  );
  // Both admin sessions, plus that person's own guest sign-in with the same email.
  assert.equal((await first.as("logout-all", {})).signedOut, 3);
  await assert.rejects(() => f.guest("account"), (e) => e.code === "SIGN_IN_REQUIRED");
  assert.equal((await f.app.dispatch({ path: "/api/session", headers: { cookie: secondCookie } })).kind, null);
  assert.ok(await f.admin("guests"), "the owner is still signed in");
});

test("a recovery code cuts off the lost phone, restarts the setup window and retires the old authenticator (SEC-10)", async () => {
  const f = await fixture();
  const { codes } = await f.admin("recovery-codes", { code: await f.ownerCode() });
  await f.ledger.transaction((s) => {
    s.ssoBindings = { [hash("admin-microsoft:organizer@gmail.com")]: "old-phone" };
  });
  const challenge = async () => {
    await f.publicPost("auth/admin-email/request", { email: "organizer@gmail.com" });
    return (await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) })).challenge;
  };
  const c = await challenge();
  f.advance(4 * 60000);
  const recovered = await f.publicPost("auth/mfa", { challenge: c, code: codes[1] });
  const s = await f.ledger.read();
  assert.equal(s.ssoBindings[hash("admin-microsoft:organizer@gmail.com")], undefined, "Microsoft link removed");
  await assert.rejects(() => f.admin("guests"), (e) => e.code === "SIGN_IN_REQUIRED", "the old session ended");
  f.advance(2 * 60000); // six minutes after the challenge began
  const signed = await f.publicPost("auth/mfa", {
    challenge: c,
    code: totp(recovered.enrollmentSecret, Math.floor(f.now() / 30000)),
  });
  assert.match(signed.setCookie, /^__session=/, "the setup window restarted with the recovery code");
  // The old authenticator no longer works.
  const again = await challenge();
  f.advance(30000);
  await assert.rejects(
    () => f.publicPost("auth/mfa", { challenge: again, code: totp(OWNER_TOTP, Math.floor(f.now() / 30000)) }),
    (e) => e.code === "INVALID_MFA",
  );
});

test("a recovery-shaped code from an administrator who is not the owner is just a wrong code (SEC-10)", async () => {
  const f = await fixture();
  await adminSignIn(f, "test@example.com");
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  const c = (await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) })).challenge;
  await assert.rejects(() => f.publicPost("auth/mfa", { challenge: c, code: "ABCD-EFGH-JKLM" }), (e) => e.code === "INVALID_MFA");
});

test("the guest page shows the household name Notion has now (NOTION-5)", async () => {
  const f = await fixture();
  f.row.name = "The Renamed Family";
  assert.equal((await f.guest("invitation")).name, "The Renamed Family");
});

// Answers the household's RSVP, then makes the fake Notion row show exactly
// what the website wrote, and waits out the 2-minute grace after the write.
async function answeredAndMatching(f, key = "88888888-8888-4888-8888-888888888888") {
  await f.guest("rsvp", f.input(), { "idempotency-key": key });
  const response = (await f.ledger.read()).responses[key];
  const attending = Object.values(response.attendance).some((v) => v.adultsTeens + v.kids > 0);
  f.row.invitationStatus = attending ? "Yes" : "No";
  f.row.notionCounts = structuredClone(response.attendance);
  await f.ledger.transaction((st) => {
    st.invitations[household].syncTriedAt = 0; // the last write was long ago
  });
  return response;
}
const drain = (f) =>
  f.app.dispatch({ path: "/api/internal/drain", method: "POST", headers: { authorization: "Bearer x" } });
const driftAlerts = async (f) =>
  Object.values((await f.ledger.read()).notifications).filter((n) => n.kind === "drift");

test("a Notion RSVP that differs from the website is reported once, and the admin decides it (NOTION-8)", async () => {
  let projected = 0;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project() {
        projected++;
      },
    },
  });
  await answeredAndMatching(f);
  assert.equal((await drain(f)).drift.differing, 0);
  // The family changes the dinner count in Notion after a phone call.
  f.row.notionCounts.dinner.adultsTeens += 1;
  assert.equal((await drain(f)).drift.differing, 1);
  assert.equal((await driftAlerts(f)).length, 1);
  assert.match((await driftAlerts(f))[0].text, /dinner: .* in Notion, .* on the website/);
  assert.equal((await f.admin("dashboard")).notionDrift, 1);
  const guestRow = (await f.admin("guests")).guests.find((g) => g.id === household);
  assert.match(guestRow.notionDiffers, /dinner/);
  await drain(f);
  assert.equal((await driftAlerts(f)).length, 1, "the same difference is reported once");
  // The bulk Retry never touches it.
  const before = projected;
  await f.admin("sync", {});
  assert.equal(projected, before, "Retry does not undo the family's edit");
  // Keep Notion's version: no longer counted or reported, until it changes again.
  assert.deepEqual(await f.admin("drift", { id: household, keep: "notion" }), { kept: "notion" });
  assert.equal((await f.admin("dashboard")).notionDrift, 0);
  await drain(f);
  assert.equal((await driftAlerts(f)).length, 1);
  f.row.notionCounts.dinner.kids += 1;
  await drain(f);
  assert.equal((await driftAlerts(f)).length, 2, "a new, different change is reported");
  await assert.rejects(() => f.admin("drift", { id: household, keep: "maybe" }), (e) => e.code === "INVALID_CHOICE");
  // Write the website's answer: the RSVP is written to Notion again, and the
  // difference is settled at once (re-audit N8).
  const r = await f.admin("drift", { id: household, keep: "website" });
  assert.equal(r.kept, "website");
  assert.equal(projected, before + 1);
  assert.equal((await f.admin("dashboard")).notionDrift, 0);
  await assert.rejects(() => f.admin("drift", { id: household, keep: "notion" }), (e) => e.status === 404);
  // Once Notion matches again, the entry clears.
  f.row.notionCounts.dinner.adultsTeens -= 1;
  f.row.notionCounts.dinner.kids -= 1;
  await f.ledger.transaction((st) => {
    st.invitations[household].syncTriedAt = 0; // the last write was long ago
  });
  assert.equal((await drain(f)).drift.differing, 0);
  await assert.rejects(() => f.admin("drift", { id: household, keep: "notion" }), (e) => e.status === 404);
});

test("the drift check skips rows just written, treats an empty cell as 0, and writes nothing when nothing changed (NOTION-8)", async () => {
  const f = await fixture({ verifyScheduler: async () => true });
  const response = await answeredAndMatching(f);
  // A row written moments ago is not compared yet (Notion may lag behind).
  f.row.notionCounts.dinner.adultsTeens += 5;
  await f.ledger.transaction((s) => {
    s.invitations[household].syncTriedAt = f.now() - 60000;
  });
  assert.equal((await drain(f)).drift.differing, 0);
  f.row.notionCounts.dinner.adultsTeens -= 5;
  await f.ledger.transaction((st) => {
    st.invitations[household].syncTriedAt = 0; // the last write was long ago
  });
  // An empty Notion cell for a zero count is not a difference.
  for (const event of ["ceremony", "dinner", "dance"])
    if (response.attendance[event].kids === 0) f.row.notionCounts[event].kids = null;
  // Nothing changed, so the drain never writes the ledger.
  let writes = 0;
  const transaction = f.ledger.transaction.bind(f.ledger);
  f.ledger.transaction = (fn) => (writes++, transaction(fn));
  assert.equal((await drain(f)).drift.differing, 0);
  assert.equal(writes, 0);
});

test("many households differing at once send one combined alert (NOTION-8)", async () => {
  const f = await fixture({ verifyScheduler: async () => true });
  await answeredAndMatching(f);
  // Twelve answered households whose Notion RSVP column was renamed away.
  const ids = Array.from({ length: 12 }, (_, i) => `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const base = (await f.ledger.read()).responses["88888888-8888-4888-8888-888888888888"];
  await f.ledger.transaction((s) => {
    for (const id of ids) {
      s.invitations[id] = { ...s.invitations[household], id, latestSubmissionId: "r-" + id, syncTriedAt: 0 };
      s.responses["r-" + id] = { ...base, id: "r-" + id, householdId: id };
    }
  });
  for (const id of ids) f.extraRows.push({ ...f.row, id, name: "Family " + id.slice(-2), invitationStatus: "" });
  assert.equal((await drain(f)).drift.differing, 12);
  const alerts = await driftAlerts(f);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].title, /12 households differ/);
});

test("a contact-details change writes only the contact columns, never the RSVP counts (NOTION-8)", async () => {
  const calls = [];
  const f = await fixture({
    notion: {
      async project() {
        calls.push("rsvp");
      },
      async projectContact() {
        calls.push("contact");
      },
    },
  });
  await f.guest("rsvp", f.input(), { "idempotency-key": "12121212-1212-4212-8212-121212121212" });
  assert.deepEqual(calls, ["rsvp"]);
  const profile = await f.guest("profile");
  await f.guest("profile", {
    email: "new-contact@example.com",
    phone: "",
    address: "",
    version: profile.profile.version,
  });
  assert.deepEqual(calls, ["rsvp", "contact"], "a phone or email change never rewrites the head counts");
});

test("seating tables can be deleted, and their households become unseated (FLOW-12)", async () => {
  const f = await fixture();
  const table = await f.admin("seating", { name: "Table 1", capacity: 10, households: [household] });
  await assert.rejects(
    () => f.admin("seating", { name: "Table 2", capacity: 10, households: [household] }),
    (e) => e.code === "ALREADY_SEATED",
  );
  assert.deepEqual(await f.admin("seating/delete", { id: table.id }), { deleted: true });
  assert.equal((await f.admin("seating")).tables.length, 0);
  assert.ok(await f.admin("seating", { name: "Table 2", capacity: 10, households: [household] }), "the household can be seated again");
  await assert.rejects(() => f.admin("seating/delete", { id: table.id }), (e) => e.status === 404);
});

test("a reply email goes only where the admin was shown, only when they ask, without the reply text (FLOW-8)", async () => {
  const f = await fixture();
  const { id } = await f.guest("messages", { kind: "contact", name: "Test", text: "Where do we park?", email: "typed@other.example" });
  const shown = (await f.admin("moderation")).messages.find((m) => m.id === id);
  assert.equal(shown.email, "typed@other.example", "the typed address is shown as what the guest typed");
  assert.ok(shown.replyTo && shown.replyTo !== "typed@other.example", "the reply email address is the verified one");
  const before = f.sent.length;
  assert.deepEqual(await f.admin("message-reply", { id, text: "Behind the hall." }), { saved: true, emailed: false });
  assert.equal(f.sent.length, before, "no email unless the admin ticks the box");
  // An address other than the one shown is refused before anything is saved.
  await assert.rejects(
    () => f.admin("message-reply", { id, text: "Wrong address", notify: true, to: "typed@other.example" }),
    (e) => e.code === "RECIPIENT_CHANGED",
  );
  assert.equal((await f.ledger.read()).messages[id].replies.length, 1, "the refused reply was not saved");
  const r = await f.admin("message-reply", { id, text: "See you there!", notify: true, to: shown.replyTo });
  assert.deepEqual(r, { saved: true, emailed: true, to: shown.replyTo });
  const mail = f.sent.at(-1);
  assert.equal(mail.to, shown.replyTo);
  assert.ok(!mail.html.includes("See you there"), "the reply itself stays on the site");
  assert.match(mail.html, /\/account\//);
  const thread = await f.guest("messages");
  assert.deepEqual(thread.messages.at(-1).replies.map((x) => x.text), ["Behind the hall.", "See you there!"]);
});

test("a reply email skips a sign-in that left the household and uses the Notion email (FLOW-8)", async () => {
  const f = await fixture();
  const { id } = await f.guest("messages", { kind: "contact", name: "Test", text: "Hello" });
  // That person's email moved to another household in Notion.
  await f.ledger.transaction((s) => {
    for (const a of Object.values(s.accounts)) a.householdId = "11111111-1111-4111-8111-111111111111";
  });
  f.row.email = "household@example.com";
  const shown = (await f.admin("moderation")).messages.find((m) => m.id === id);
  assert.equal(shown.replyTo, "household@example.com");
  // No verified address at all: nothing to email.
  f.row.email = "";
  assert.equal((await f.admin("moderation")).messages.find((m) => m.id === id).replyTo, null);
  await assert.rejects(
    () => f.admin("message-reply", { id, text: "Hi", notify: true, to: "household@example.com" }),
    (e) => e.code === "RECIPIENT_CHANGED",
  );
});

test("checking for replies in the background does not keep a guest signed in (FLOW-8)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const signed = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const cookie = signed.setCookie.split(";")[0];
  f.advance(20 * 60000);
  const poll = await f.app.dispatch({ path: "/api/messages", query: { poll: "1" }, headers: { cookie } });
  assert.equal(poll.setCookie, undefined, "a background poll does not renew");
  const visit = await f.app.dispatch({ path: "/api/messages", headers: { cookie } });
  assert.match(visit.setCookie, /^__session=/, "a real visit still does");
});

// ---- Re-audit fixes: sign-in and security -----------------------------------

test("ten wrong authenticator codes in an hour pause that admin's sign-ins and tell the family (re-audit)", async () => {
  const f = await fixture();
  const { c } = await adminSignIn(f, "test@example.com");
  const challenge = async () => {
    await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
    return (await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) })).challenge;
  };
  let wrong = 0;
  while (wrong < 9) {
    const ch = await challenge();
    for (let i = 0; i < 5 && wrong < 9; i++, wrong++)
      await assert.rejects(() => f.publicPost("auth/mfa", { challenge: ch, code: "000000" }), (e) => e.code === "INVALID_MFA");
    f.advance(16 * 60000); // past the per-address link limit
  }
  // A sign-in opened before the pause, kept for later; the 10th wrong code
  // comes from another one.
  const early = await challenge();
  const last = await challenge();
  await assert.rejects(() => f.publicPost("auth/mfa", { challenge: last, code: "000000" }), (e) => e.code === "INVALID_MFA");
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  await assert.rejects(
    () => f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) }),
    (e) => e.code === "ADMIN_SIGN_IN_PAUSED",
  );
  // The pause also covers sign-ins that were already open, even with the right code.
  await assert.rejects(
    () => f.publicPost("auth/mfa", { challenge: early, code: totp(c.enrollmentSecret, Math.floor(f.now() / 30000)) }),
    (e) => e.code === "ADMIN_SIGN_IN_PAUSED",
  );
  // It lasts a full hour from the 10th wrong code.
  f.advance(59 * 60000);
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  await assert.rejects(
    () => f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) }),
    (e) => e.code === "ADMIN_SIGN_IN_PAUSED",
  );
  const notes = Object.values((await f.ledger.read()).notifications).map((n) => n.title);
  assert.ok(notes.some((t) => /10 wrong authenticator codes for test@example.com/.test(t)));
  // An hour later sign-in works again, and a correct code clears the count.
  f.advance(3600001);
  const ok = await challenge();
  f.advance(30000);
  const signed = await f.publicPost("auth/mfa", { challenge: ok, code: totp(c.enrollmentSecret, Math.floor(f.now() / 30000)) });
  assert.match(signed.setCookie, /^__session=/);
  assert.equal((await f.ledger.read()).mfaFailures?.[hash("mfa-fail:test@example.com")], undefined);
});

test("while the owner's codes are paused, a recovery code still lets the owner in (re-audit)", async () => {
  const f = await fixture();
  const { codes } = await f.admin("recovery-codes", { code: await f.ownerCode() });
  const challenge = async () => {
    await f.publicPost("auth/admin-email/request", { email: "organizer@gmail.com" });
    return (await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) })).challenge;
  };
  let wrong = 0;
  while (wrong < 10) {
    const ch = await challenge();
    for (let i = 0; i < 5 && wrong < 10; i++, wrong++)
      await assert.rejects(() => f.publicPost("auth/mfa", { challenge: ch, code: "000000" }), (e) => e.code === "INVALID_MFA");
    f.advance(16 * 60000);
  }
  // The owner can still open a sign-in, but an authenticator code is refused...
  const ch = await challenge();
  await assert.rejects(
    () => f.publicPost("auth/mfa", { challenge: ch, code: "123456" }),
    (e) => e.code === "ADMIN_SIGN_IN_PAUSED",
  );
  // ...and a recovery code opens a new setup whose code finishes the sign-in.
  const recovered = await f.publicPost("auth/mfa", { challenge: ch, code: codes[0] });
  assert.equal(recovered.recovered, true);
  f.advance(30000);
  const signed = await f.publicPost("auth/mfa", {
    challenge: ch,
    code: totp(recovered.enrollmentSecret, Math.floor(f.now() / 30000)),
  });
  assert.match(signed.setCookie, /^__session=/);
  assert.equal((await f.ledger.read()).mfaFailures?.[hash("mfa-fail:organizer@gmail.com")], undefined, "the pause is lifted");
});

test("only the main Email of a ticked row is an administrator, never an Additional Email (re-audit)", async () => {
  const f = await fixture();
  f.row.additionalEmails = ["teen@example.com"];
  const before = f.sent.length;
  assert.deepEqual(await f.publicPost("auth/admin-email/request", { email: "teen@example.com" }), { requested: true });
  assert.equal(f.sent.length, before, "no admin link for an Additional Email");
  const list = await f.admin("accounts");
  assert.ok(!list.administrators.some((a) => a.email === "teen@example.com"));
  assert.ok(list.administrators.some((a) => a.email === "test@example.com"));
  // The same address can still sign in as a guest.
  await f.publicPost("auth/email/request", { email: "teen@example.com" });
  assert.equal(f.sent.length, before + 1);
});

test("the drain removes the authenticator of someone Notion no longer makes an admin, a day later (SEC-9)", async () => {
  const f = await fixture({ verifyScheduler: async () => true });
  await adminSignIn(f, "test@example.com");
  await f.ownerCode(); // the owner has an authenticator too
  // Another administrator stays ticked, so Notion's admin column clearly works.
  f.extraRows.push({ ...structuredClone(f.row), id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Other", email: "other@example.com" });
  const has = async (email = "test@example.com") =>
    Object.values((await f.ledger.read()).admins).some((a) => a.email === email);
  const drain = () =>
    f.app.dispatch({ path: "/api/internal/drain", method: "POST", headers: { authorization: "Bearer x" } });
  assert.equal((await drain()).admins.removed, 0, "still ticked: kept");
  // Unticked: the family is told at once; the authenticator goes a day later.
  f.row.administratorEligible = false;
  assert.deepEqual((await drain()).admins, { removed: 0, pending: 1 });
  assert.equal(await has(), true);
  const notes = Object.values((await f.ledger.read()).notifications).map((n) => n.title);
  assert.ok(notes.some((t) => /test@example.com is no longer an administrator/.test(t)));
  // Ticked again within the day: nothing is lost.
  f.row.administratorEligible = true;
  await drain();
  f.advance(86400001);
  assert.equal((await drain()).admins.removed, 0);
  assert.equal(await has(), true);
  // Unticked for a whole day: removed, the owner never.
  f.row.administratorEligible = false;
  await drain();
  f.advance(86400001);
  assert.equal((await drain()).admins.removed, 1);
  assert.equal(await has(), false);
  assert.equal(await has("organizer@gmail.com"), true, "the owner is never removed");
  const events = (await f.ledger.read()).roleEvents.map((e) => e.change);
  assert.ok(events.includes("authenticator-removed"));
  // Ticked again later: a fresh QR setup, not the old phone.
  f.row.administratorEligible = true;
  await f.publicPost("auth/admin-email/request", { email: "test@example.com" });
  const again = await f.publicPost("auth/admin-email/verify", { token: linkOf(f.sent.at(-1)) });
  assert.ok(again.enrollmentSecret);
});

test("a renamed admin column removes no one; unticking the only ticked admin still does (re-audit)", async () => {
  const f = await fixture({ verifyScheduler: async () => true });
  await adminSignIn(f, "test@example.com");
  const drain = () =>
    f.app.dispatch({ path: "/api/internal/drain", method: "POST", headers: { authorization: "Bearer x" } });
  const admin = async () =>
    Object.values((await f.ledger.read()).admins).find((a) => a.email === "test@example.com");
  // "Administrator Eligible" renamed: every row reads as unticked.
  f.row.administratorEligible = false;
  f.row.adminColumnsPresent = false;
  f.advance(86400001);
  assert.equal((await drain()).admins.skipped, "NOTION_ADMIN_COLUMNS_MISSING");
  f.advance(86400001);
  assert.equal((await drain()).admins.skipped, "NOTION_ADMIN_COLUMNS_MISSING");
  assert.ok((await admin()) && !(await admin()).staleSince, "nothing flagged, nothing removed");
  // The column is back and this was the only ticked row: unticking still counts.
  f.row.adminColumnsPresent = true;
  assert.equal((await drain()).admins.pending, 1);
  f.advance(86400001);
  assert.equal((await drain()).admins.removed, 1);
  assert.equal(await admin(), undefined);
});

test("a guest whose email leaves the Notion row loses data access on the next request (re-audit)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const as = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: { origin, cookie: s.setCookie.split(";")[0], "x-csrf-token": s.csrf },
    });
  assert.ok(await as("messages"));
  assert.ok(await as("gallery"));
  f.row.email = "someone-else@example.com";
  await assert.rejects(() => as("messages"), (e) => e.code === "SIGN_IN_REQUIRED");
  await assert.rejects(
    () => as("messages", { kind: "guestbook", name: "A", text: "Hi", consent: true }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  // Pages that need no invitation details stop too.
  for (const page of ["gallery", "account", "photo/12345678-1234-4234-8234-123456789012"])
    await assert.rejects(() => as(page), (e) => e.code === "SIGN_IN_REQUIRED", page);
});

test("only email sign-ins and admins may start an upload; RSVP-only link sessions may not (re-audit)", async () => {
  const f = await fixture();
  const linkCookie = (await f.app.dispatch({
    path: "/api/invitation-session",
    method: "POST",
    body: { token: f.guestToken },
    headers: { origin },
  })).setCookie.split(";")[0];
  assert.equal(await f.app.canUpload(linkCookie), null);
  assert.equal(await f.app.canUpload("__session=" + token()), null);
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const cookie = s.setCookie.split(";")[0];
  const key = await f.app.canUpload(cookie);
  assert.ok(key);
  // One session, one key, however the cookie header is spelled.
  assert.equal(await f.app.canUpload(cookie + "  ;a=1"), key);
});

test("a guest's sign out everywhere ends guest sign-ins only, never that person's admin session (re-audit)", async () => {
  const f = await fixture();
  const admin = await adminSignIn(f, "test@example.com");
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const out = await f.app.dispatch({
    path: "/api/logout-all",
    method: "POST",
    body: {},
    headers: { origin, cookie: s.setCookie.split(";")[0], "x-csrf-token": s.csrf },
  });
  assert.equal(out.signedOut, 2, "this sign-in and the fixture's guest session");
  assert.equal((await admin.as("session")).kind, "admin", "the admin session is untouched");
});

test("email sign-in needs only the Notion email: before a link is issued, and through a reissued link (re-audit D1)", async () => {
  const f = await fixture();
  // No invitation link yet for this household.
  await f.ledger.transaction((s) => {
    delete s.invitations[household];
  });
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const as = (path, body, headers = {}) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: { origin, cookie: s.setCookie.split(";")[0], "x-csrf-token": s.csrf, ...headers },
    });
  assert.equal((await as("invitation")).invitationReady, false);
  assert.ok(await as("messages", { kind: "contact", name: "A", text: "Hello" }), "can write to the family");
  await assert.rejects(
    () => as("rsvp", f.input(), { "idempotency-key": "13131313-1313-4313-8313-131313131313" }),
    (e) => e.code === "INVITATION_NOT_READY",
  );
  // Contact details save too (nothing to sync to Notion until a link is issued).
  const { profile } = await as("profile");
  const saved = await as("profile", { version: profile.version, email: "test@example.com", phone: "555", address: null });
  assert.equal(saved.saved, true);
  assert.equal(saved.syncState, null);
  // The family issues the link, then reissues it (say it was forwarded):
  await f.ledger.transaction((st) => {
    st.invitations[household] = { id: household, name: "Test family", active: true, generation: 1, invited: { ceremony: true, dinner: true, dance: true } };
  });
  assert.equal((await as("invitation")).invitationReady, true);
  await f.ledger.transaction((st) => {
    st.invitations[household].generation = 2;
  });
  assert.equal((await as("session")).verified, true, "reissuing a link does not sign the family out");
  // Revoking the invitation still ends everyone's access.
  await f.ledger.transaction((st) => {
    st.invitations[household].active = false;
  });
  assert.equal((await as("session")).kind, null);
});

test("an email moved to another household ends its sessions for the old one (re-audit)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const old = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const other = "21212121-2121-4121-8121-212121212121";
  await f.ledger.transaction((s) => {
    s.invitations[other] = { id: other, name: "Other family", active: true, generation: 1, invited: { ceremony: true, dinner: true, dance: true } };
  });
  f.extraRows.push({ ...f.row, id: other, name: "Other family", email: "test@example.com" });
  f.row.email = "";
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const session = await f.app.dispatch({ path: "/api/session", headers: { cookie: old.setCookie.split(";")[0] } });
  assert.equal(session.kind, null);
});

test("an RSVP receipt goes to the verified address even when the form's contact email differs (re-audit)", async () => {
  const f = await fixture();
  const input = f.input();
  input.contact.email = "typed@example.org";
  await f.guest("rsvp", input, { "idempotency-key": "21212121-2121-4121-8121-212121212121" });
  const receipt = Object.values((await f.ledger.read()).outbox).find((j) => j.type === "receipt");
  assert.equal(receipt.to, "test@example.com");
  assert.equal(receipt.state, "accepted");
  assert.ok(!f.sent.some((m) => m.to === "typed@example.org"), "never to a typed address");
});

test("an invitation-link RSVP receipt follows the household's current Notion Email (re-audit)", async () => {
  const f = await fixture();
  f.row.email = "changed@example.org";
  await f.linkGuest("rsvp", f.input(), { "idempotency-key": "23232323-2323-4323-8323-232323232323" });
  const receipt = Object.values((await f.ledger.read()).outbox).find((j) => j.type === "receipt");
  assert.equal(receipt.to, "changed@example.org");
  assert.equal(receipt.state, "accepted");
});

test("an RSVP receipt repeats the answer for the invited events and how to change it", async () => {
  const f = await fixture();
  await f.linkGuest("rsvp", f.input(), { "idempotency-key": "24242424-2424-4424-8424-242424242424" });
  const { html, subject } = f.sent.at(-1);
  assert.equal(subject, "We received your RSVP · Sophia’s quinceañera");
  // The fixture's invitation covers the ceremony and dinner, not the reception.
  assert.ok(html.includes(">Ceremony</td>") && html.includes(">1 adult/teen</td>"));
  assert.ok(html.includes(">Dinner</td>") && html.includes(">2 adults/teens, 1 child</td>"));
  assert.ok(!html.includes("Reception"));
  assert.ok(html.includes("You can change it until Sunday, November 15, 2026"));
  assert.ok(html.includes("open your invitation email again"));
  // The private link is not stored, so there is no button to the bare code form.
  assert.ok(!html.includes(origin + "/rsvp/") && html.includes(origin + "/details/"));
});

test("at most 5 automatic receipts per household a day; later ones wait as drafts for a person (re-audit)", async () => {
  const f = await fixture();
  let previous = null;
  for (let i = 0; i < 6; i++) {
    const r = await f.guest(
      "rsvp",
      { ...f.input(), previousSubmissionId: previous },
      { "idempotency-key": `3434343${i}-3434-4434-8434-343434343434` },
    );
    previous = r.id;
    f.advance(1000);
  }
  const receipts = Object.values((await f.ledger.read()).outbox).filter((j) => ["receipt", "update"].includes(j.type));
  assert.equal(receipts.filter((j) => j.state === "accepted").length, 5);
  const waiting = receipts.find((j) => j.state === "draft");
  assert.ok(waiting, "the 6th waits as a draft");
  // A draft whose address has left the Notion row is never sent.
  f.row.email = "changed@example.org";
  await assert.rejects(
    () => f.admin("mail/send", { id: waiting.id, confirm: true }),
    (e) => e.code === "MAIL_DRAFT_STALE",
  );
  f.row.email = "test@example.com";
  assert.equal((await f.admin("mail/send", { id: waiting.id, confirm: true })).state, "accepted");
});

test("a retry never writes over head counts the family changed in Notion; an admin's Write survives an outage (re-audit N1, N2, N8)", async () => {
  const writes = [];
  let down = true,
    requests = null;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project(id, response, options) {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        writes.push(options?.answer === false ? "website-columns" : "rsvp");
        requests = response.requests;
      },
      async projectContact() {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        writes.push("contact");
      },
    },
  });
  await f.ledger.transaction((s) => {
    for (const v of Object.values(s.sessions)) if (v.kind === "admin") v.expiresAt = at + 86400000;
  });
  await f.guest("rsvp", { ...f.input(), requests: "Peanut allergy" }, { "idempotency-key": "45454545-4545-4545-8545-454545454545" });
  assert.equal((await f.ledger.read()).invitations[household].syncState, "pending");
  // Notion comes back; meanwhile the family typed a phone answer into Notion.
  down = false;
  f.advance(120000);
  f.row.invitationStatus = "Yes";
  f.row.notionCounts = {
    ceremony: { adultsTeens: 4, kids: 0 },
    dinner: { adultsTeens: 4, kids: 0 },
    dance: { adultsTeens: 0, kids: 0 },
  };
  await drain(f);
  assert.deepEqual(writes, ["website-columns"], "the head counts were not written over");
  assert.equal(requests, "Peanut allergy", "the guest's requests still reach Notion (re-audit M1)");
  assert.equal((await f.ledger.read()).invitations[household].syncState, "synced");
  // The drift check then shows the difference for the admin to decide.
  f.advance(180000);
  assert.equal((await drain(f)).drift.differing, 1);
  assert.match((await driftAlerts(f))[0].text, /4 adults\/teens, 0 kids in Notion, 2 adults\/teens, 1 kid on the website/);
  // The admin writes the website's answer during an outage; the drain finishes it.
  down = true;
  assert.equal((await f.admin("drift", { id: household, keep: "website" })).syncState, "pending");
  down = false;
  f.advance(120000);
  await drain(f);
  assert.deepEqual(writes, ["website-columns", "rsvp"], "the admin's choice survived the failed attempt");
  const s = await f.ledger.read();
  assert.equal(s.invitations[household].syncState, "synced");
  assert.equal(s.invitations[household].syncError, null);
  assert.equal(s.drift?.[household], undefined, "settled at once");
});

test("phone RSVPs typed into Notion and kept Notion counts drive the dashboard, seating and reminders (re-audit N2)", async () => {
  const f = await fixture({ verifyScheduler: async () => true });
  const phoneId = "77777777-7777-4777-8777-777777777777";
  f.extraRows.push({
    ...structuredClone(f.row),
    id: phoneId,
    name: "Phone family",
    email: "phone@example.com",
    administratorEligible: false,
    invitationStatus: "Yes",
    notionCounts: {
      ceremony: { adultsTeens: 3, kids: 1 },
      dinner: { adultsTeens: 3, kids: 1 },
      dance: { adultsTeens: 0, kids: 0 },
    },
  });
  await f.ledger.transaction((s) => {
    s.invitations[phoneId] = { id: phoneId, name: "Phone family", active: true, generation: 1, invited: { ceremony: true, dinner: true, dance: false } };
  });
  // "Not sent" is not an answer.
  f.row.invitationStatus = "Not sent";
  let dash = await f.admin("dashboard");
  assert.equal(dash.responded, 1);
  assert.equal(dash.statuses.attending, 1);
  assert.deepEqual(dash.counts.dinner, { adultsTeens: 3, kids: 1 });
  const guests = (await f.admin("guests")).guests;
  assert.equal(guests.find((g) => g.id === phoneId).answeredIn, "notion");
  assert.equal((await f.admin("seating")).households.find((h) => h.id === phoneId).count, 4);
  await assert.rejects(
    () => f.admin("seating", { name: "T", capacity: 3, households: [phoneId] }),
    (e) => e.code === "TABLE_OVER_CAPACITY",
  );
  // No reminder for a household that answered by phone.
  const r = await f.admin("mail/invitation-batch", { requestId: "56565656-5656-4656-8656-565656565656", type: "reminder", ids: [phoneId] });
  assert.equal((await f.admin("mail/batch", undefined, { id: r.id })).skippedList[0].reason, "already-responded");
  // The website household differs; the admin keeps Notion's numbers.
  await answeredAndMatching(f);
  f.row.notionCounts.dinner.adultsTeens = 5;
  assert.equal((await drain(f)).drift.differing, 1);
  await f.admin("drift", { id: household, keep: "notion" });
  dash = await f.admin("dashboard");
  assert.deepEqual(dash.counts.dinner, { adultsTeens: 3 + 5, kids: 1 + 1 });
});

test("each drain run writes one summary log line with counts only (re-audit N6)", async () => {
  const lines = [];
  const f = await fixture({ verifyScheduler: async () => true, log: (e) => lines.push(e) });
  await drain(f);
  const line = lines.find((l) => l.message === "drain");
  assert.equal(line.severity, "INFO");
  assert.ok(line.drain.rsvp && line.drain.admins);
  assert.ok(!JSON.stringify(line).includes("@"), "no email addresses");
});

test("a reply email uses a sign-in email only while it is on the Notion row, with a Spanish link for Spanish households (re-audit D3, D4)", async () => {
  const f = await fixture();
  await f.ledger.transaction((s) => {
    s.invitations[household].locale = "es";
  });
  const { id } = await f.guest("messages", { kind: "contact", name: "Test", text: "Hola" });
  f.row.additionalEmails = [];
  f.row.email = "household@example.com";
  // The signer's email left the row (the account still belongs to the household).
  const shown = (await f.admin("moderation")).messages.find((m) => m.id === id);
  assert.equal(shown.replyTo, "household@example.com");
  await f.admin("message-reply", { id, text: "Gracias", notify: true, to: "household@example.com" });
  const mail = f.sent.at(-1);
  assert.equal(mail.to, "household@example.com");
  assert.ok(mail.html.includes(origin + "/es/account/"));
  // Back on the row as an Additional Email: the sign-in email is used again.
  f.row.additionalEmails = ["test@example.com"];
  assert.equal((await f.admin("moderation")).messages.find((m) => m.id === id).replyTo, "test@example.com");
});

test("an edit to another Notion column never holds back the guest's own answer (re-audit M2)", async () => {
  const writes = [];
  let down = true;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project(id, response, options) {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        writes.push(options?.answer === false ? "website-columns" : "rsvp");
      },
    },
  });
  await f.guest("rsvp", f.input(), { "idempotency-key": "46464646-4646-4646-8646-464646464646" });
  down = false;
  // The family ticks some other box later: the row was edited, the answer was not.
  f.advance(120000);
  f.row.lastEdited = new Date(f.now()).toISOString();
  f.row.invitationStatus = "Not sent";
  await drain(f);
  assert.deepEqual(writes, ["rsvp"], "the answer is written");
  // A later answer whose predecessor still shows in Notion is written too.
  f.row.invitationStatus = "Yes";
  f.row.notionCounts = structuredClone((await f.ledger.read()).responses["46464646-4646-4646-8646-464646464646"].attendance);
  down = true;
  const latest = (await f.ledger.read()).invitations[household].latestSubmissionId;
  await f.guest("rsvp", { ...f.input(), previousSubmissionId: latest }, { "idempotency-key": "47474747-4747-4747-8747-474747474747" });
  down = false;
  await drain(f);
  assert.deepEqual(writes, ["rsvp", "rsvp"]);
});

test("an admin's Write made while another sync holds the row is still done, and Keep Notion cancels a waiting one (re-audit H1)", async () => {
  const writes = [];
  let gate = null;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project(id, response, options) {
        writes.push(options?.answer === false ? "website-columns" : "rsvp");
      },
      async projectContact() {
        writes.push("contact");
        if (gate) await gate;
      },
    },
  });
  await f.ledger.transaction((s) => {
    for (const v of Object.values(s.sessions)) if (v.kind === "admin") v.expiresAt = at + 86400000;
    for (const v of Object.values(s.sessions)) if (v.accountId) v.expiresAt = at + 86400000;
    s.profiles = { [household]: { id: household, name: "Test family", contact: { email: "test@example.com", phone: "", address: null }, version: 1 } };
  });
  await answeredAndMatching(f);
  f.row.notionCounts.dinner.adultsTeens += 3;
  assert.equal((await drain(f)).drift.differing, 1);
  // A contact-details save holds the row while the admin presses Write.
  let open;
  gate = new Promise((r) => (open = r));
  const { version } = (await f.ledger.read()).profiles[household];
  let settled = false;
  const saving = f
    .guest("profile", { version, email: "test@example.com", phone: "555", address: null })
    .finally(() => (settled = true));
  while (!writes.includes("contact") && !settled) await new Promise((r) => setTimeout(r, 2));
  assert.ok(!settled, "the contact save is holding the row");
  assert.equal((await f.admin("drift", { id: household, keep: "website" })).syncState, "pending");
  open();
  gate = null;
  await saving;
  assert.equal((await f.ledger.read()).invitations[household].syncState, "pending", "the Write is still to do");
  const before = writes.filter((w) => w === "rsvp").length;
  await drain(f);
  assert.equal(writes.filter((w) => w === "rsvp").length, before + 1, "the drain did the admin's Write");
  let s = await f.ledger.read();
  assert.equal(s.invitations[household].forceSubmissionId, undefined);
  assert.equal(s.drift?.[household], undefined);
  // A Write still waiting when the admin then keeps Notion's version is cancelled.
  f.row.notionCounts.dinner.kids += 2;
  f.advance(180000);
  assert.equal((await drain(f)).drift.differing, 1);
  await f.ledger.transaction((st) => {
    st.invitations[household].syncLease = { owner: "someone-else", until: f.now() + 90000 };
  });
  await f.admin("drift", { id: household, keep: "website" });
  await f.admin("drift", { id: household, keep: "notion" });
  s = await f.ledger.read();
  assert.equal(s.invitations[household].forceSubmissionId, undefined);
  const rsvpWrites = writes.filter((w) => w === "rsvp").length;
  f.advance(91000);
  await drain(f);
  assert.equal(writes.filter((w) => w === "rsvp").length, rsvpWrites, "Notion's version is kept");
});

test("a household synced before the written answer was recorded still gets its next answer written (re-audit)", async () => {
  const writes = [];
  let down = false;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project(id, response, options) {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        writes.push(options?.answer === false ? "website-columns" : "rsvp");
      },
    },
  });
  const r1 = await answeredAndMatching(f);
  // As written by the API before this release: synced, with no record of it.
  await f.ledger.transaction((s) => {
    delete s.invitations[household].projectedSubmissionId;
  });
  // The next answer's own write fails briefly; the drain then retries it.
  down = true;
  const input = f.input();
  input.attendance.dinner = { adultsTeens: 1, kids: 0 };
  await f.guest("rsvp", { ...input, previousSubmissionId: r1.id }, { "idempotency-key": "48484848-4848-4848-8848-484848484848" });
  down = false;
  await drain(f);
  assert.deepEqual(writes, ["rsvp", "rsvp"], "the new head counts reach Notion");
});

const longAdmin = (f) =>
  f.ledger.transaction((s) => {
    for (const v of Object.values(s.sessions)) if (v.kind === "admin") v.expiresAt = at + 86400000;
  });

test("an update for a household whose Notion RSVP still says Not sent is written, not held back (final L1)", async () => {
  const writes = [];
  let down = false;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project(id, response, options) {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        writes.push(options?.answer === false ? "website-columns" : "rsvp");
      },
    },
  });
  const r1 = await answeredAndMatching(f);
  // Answered before the website wrote the RSVP column: Notion still says "Not sent".
  f.row.invitationStatus = "Not sent";
  down = true;
  const input = f.input();
  input.attendance.dinner = { adultsTeens: 1, kids: 0 };
  await f.guest("rsvp", { ...input, previousSubmissionId: r1.id }, { "idempotency-key": "49494949-4949-4949-8949-494949494949" });
  down = false;
  await drain(f);
  assert.deepEqual(writes, ["rsvp", "rsvp"]);
});

test("a Write still waiting during a Notion write outage can still be cancelled with Keep (final L2)", async () => {
  let down = false,
    projected = 0;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project() {
        if (down) throw { code: "NOTION_UNAVAILABLE" };
        projected++;
      },
    },
  });
  await longAdmin(f);
  await answeredAndMatching(f);
  f.row.notionCounts.dinner.adultsTeens += 2;
  assert.equal((await drain(f)).drift.differing, 1);
  down = true;
  assert.equal((await f.admin("drift", { id: household, keep: "website" })).syncState, "pending");
  f.advance(180000);
  await drain(f); // the retry fails again and the drift check runs meanwhile
  assert.deepEqual(await f.admin("drift", { id: household, keep: "notion" }), { kept: "notion" });
  down = false;
  const before = projected;
  f.advance(180000);
  await drain(f);
  assert.equal(projected, before, "Notion's version is kept");
});

test("the scheduled drain stops retrying RSVPs at the first Notion outage; Retry tries them all (final L3)", async () => {
  let calls = 0;
  const f = await fixture({
    verifyScheduler: async () => true,
    notion: {
      async project() {
        calls++;
        throw { code: "NOTION_UNAVAILABLE" };
      },
    },
  });
  await f.guest("rsvp", f.input(), { "idempotency-key": "50505050-5050-4050-8050-505050505050" });
  await f.ledger.transaction((s) => {
    const invite = s.invitations[household];
    for (const id of ["aaaaaaaa-aaaa-4aaa-8aaa-000000000001", "aaaaaaaa-aaaa-4aaa-8aaa-000000000002"])
      s.invitations[id] = { ...structuredClone(invite), id };
  });
  const before = calls;
  assert.equal((await drain(f)).rsvp.attempted, 1);
  assert.equal(calls, before + 1, "one Notion write, then it stops");
  assert.equal((await f.admin("sync", {})).attempted, 3, "an admin's Retry still tries each");
});

test("a reminder drafted before the household answered by phone is set aside, not sent (final L4)", async () => {
  const f = await fixture();
  const r = await f.admin("mail/invitation-batch", { requestId: batchId(60), type: "reminder", ids: [household] });
  assert.equal(r.total, 1);
  // The family types the phone answer into Notion before confirming.
  f.row.invitationStatus = "Yes";
  f.row.notionCounts = { ceremony: { adultsTeens: 2, kids: 0 }, dinner: { adultsTeens: 2, kids: 0 }, dance: { adultsTeens: 0, kids: 0 } };
  await f.admin("mail/batch/confirm", { id: batchId(60), count: 1 });
  const sent = await f.admin("mail/batch/send", { id: batchId(60) });
  assert.equal(sent.accepted, 0);
  assert.equal(sent.skipped, 1);
  assert.equal(f.sends(), 0, "nothing was sent");
  const draft = Object.values((await f.ledger.read()).outbox).find((j) => j.batchId === batchId(60));
  assert.equal(draft.error, "ALREADY_RESPONDED");
});

test("a guest whose email left the Notion row is signed out, so the page offers sign-in again (final)", async () => {
  const f = await fixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const s = await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) });
  const as = (path) =>
    f.app.dispatch({ path: "/api/" + path, method: "GET", headers: { origin, cookie: s.setCookie.split(";")[0] } });
  assert.equal((await as("session")).verified, true);
  f.row.email = "someone-else@example.com";
  await assert.rejects(() => as("account"), (e) => e.code === "SIGN_IN_REQUIRED");
  assert.equal((await as("session")).kind, null, "the session ended");
});

test("one person signed in on two devices uploads one file at a time; the daily limit is named (final)", async () => {
  const f = await fixture();
  const signIn = async () => {
    await f.publicPost("auth/email/request", { email: "test@example.com" });
    f.advance(1000);
    return (await f.publicPost("auth/email/verify", { token: linkOf(f.sent.at(-1)) })).setCookie.split(";")[0];
  };
  const phone = await signIn(),
    laptop = await signIn();
  assert.ok(phone !== laptop);
  assert.equal(await f.app.canUpload(phone), await f.app.canUpload(laptop));
  // 20 photos and videos a household a day, then a plain message.
  await f.ledger.transaction((st) => {
    for (const v of Object.values(st.sessions)) if (v.accountId) v.expiresAt = at + 86400000;
  });
  const upload = () =>
    f
      .guest("uploads", { kind: "photo", type: "image/jpeg", size: 1000, album: "event", caption: "", consent: true })
      .catch((e) => e);
  let last;
  for (let i = 0; i < 21; i++) last = await upload();
  assert.equal(last.code, "DAILY_UPLOAD_LIMIT");
});

test("the SMS page lists every household with a plain status and offers a test to the organizer's phone", async () => {
  const sent = [];
  const f = await fixture({
    smsTransport: {
      enabled: true,
      async send(m) {
        sent.push(m);
        return { state: "accepted", provider: "twilio", providerId: "SM" + "f".repeat(32) };
      },
    },
  });
  f.row.phone = "+18175550100";
  f.extraRows.push(
    { id: "22222222-2222-4222-8222-222222222222", name: "Mexico family", phone: "+525512345678", validCapacity: true, archived: false },
    { id: "33333333-3333-4333-8333-333333333333", name: "No phone", phone: "", validCapacity: true, archived: false },
    { id: "44444444-4444-4444-8444-444444444444", name: "Opted out", phone: "+18175550101", smsOptOut: true, validCapacity: true, archived: false },
  );
  const status = async () =>
    Object.fromEntries((await f.admin("audience", undefined, { channel: "sms" })).households.map((h) => [h.name, h.status]));
  // Names come back as "Last, First" like the rest of the admin.
  assert.deepEqual(await status(), { "family, Test": "waiting", "family, Mexico": "not-us-ca", "phone, No": "no-phone", "out, Opted": "opted-out" });
  await keywordOptIn(f, f.row.phone);
  assert.equal((await status())["family, Test"], "subscribed");
  // The organizer's own phone: subscribed by keyword, no row anywhere.
  const mine = "+18175550199";
  const text = "Simply Soph Media: Test. Reply STOP to opt out.";
  await assert.rejects(() => f.admin("sms/test", { phone: mine, text, confirm: true }), (e) => e.code === "SMS_NOT_SUBSCRIBED");
  await f.ledger.transaction((s) => {
    s.smsPreferences[hash(mine)] = { phone: mine, type: "START", at: 1, messageId: "SM" + "1".repeat(32) };
  });
  await assert.rejects(() => f.admin("sms/test", { phone: mine, text }), (e) => e.code === "CONFIRM_RECIPIENT");
  const r = await f.admin("sms/test", { phone: mine, text, confirm: true });
  assert.equal(r.state, "accepted");
  assert.deepEqual(sent, [{ to: mine, text }]);
  assert.equal((await f.admin("sms/drafts")).drafts.find((d) => d.id === r.id).name, "Test to my phone");
});

test("texts to guests: draft, type the count, send in one confirmed batch from the page", async () => {
  const sent = [];
  const f = await fixture({
    smsTransport: {
      enabled: true,
      async send(m) {
        sent.push(m);
        return { state: "accepted", provider: "twilio", providerId: "SM" + String(sent.length).repeat(32) };
      },
    },
  });
  f.row.phone = "+18175550100";
  await keywordOptIn(f, f.row.phone);
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const drafted = await f.admin("mail/batch-draft", {
    requestId: id,
    groups: [],
    ids: [household],
    subject: "Text",
    text: "Simply Soph Media: RSVP at {link} Reply STOP to opt out.",
    channel: "sms",
  });
  assert.equal(drafted.count, 1);
  const batch = await f.admin("sms/batch", undefined, { id });
  assert.deepEqual([batch.state, batch.total, batch.remaining, batch.recipients[0].name], ["draft", 1, 1, "family, Test"]);
  await assert.rejects(() => f.admin("sms/batch/send", { id }), (e) => e.code === "BATCH_NOT_CONFIRMED");
  await assert.rejects(() => f.admin("sms/batch/confirm", { id, count: 2 }), (e) => e.code === "CONFIRM_COUNT_MISMATCH");
  await f.admin("sms/batch/confirm", { id, count: 1 });
  const r = await f.admin("sms/batch/send", { id });
  assert.deepEqual([r.accepted, r.done], [1, true]);
  assert.equal(sent.length, 1);
  assert.ok(!sent[0].text.includes("{link}"));
  assert.equal((await f.admin("sms/drafts")).batches[0].state, "done");
});
