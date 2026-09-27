import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token, totp, base32 } from "../server/auth.mjs";
import sharp from "sharp";
const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-01T18:00:00Z");
const household = "12345678-1234-1234-1234-123456789012";
async function fixture() {
  const ledger = new Ledger(memoryAdapter()),
    adminToken = token(),
    guestToken = token();
  const row = {
    id: household,
    name: "Test family",
    capacity: { adultsTeens: 2, kids: 1 },
    email: "test@example.com",
    phone: "",
    validCapacity: true,
    archived: false,
  };
  let failing = false,
    sendCount = 0;
  let clock = at;
  const sent = [];
  const notion = {
    async read() {
      return structuredClone(row);
    },
    async list() {
      return [structuredClone(row)];
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
    media: { put: async () => {}, get: async () => Buffer.from("image") },
    key: Buffer.alloc(32, 4),
    origin,
    adminEmails: ["organizer@gmail.com"],
    now: () => clock,
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
  });
  const admin = (path, body) =>
    app.dispatch({
      path: "/api/admin/" + path,
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
  const guest = (path, body, headers = {}) =>
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
    admin,
    guest,
    input,
    row,
    guestToken,
    failSync: () => (failing = true),
    sends: () => sendCount,
    sent,
    advance: (ms) => {
      clock += ms;
    },
  };
}
async function registeredFixture() {
  const f = await fixture();
  await f.guest("rsvp", f.input(), { "idempotency-key": "register-rsvp" });
  await f.guest("auth/email/request", {
    register: true,
    name: "Test Contact",
    email: "test@example.com",
  });
  const link = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  const publicPost = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: "POST",
      body,
      headers: { origin },
    });
  const login = await publicPost("auth/email/verify", { token: link });
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
  return { ...f, link, account, verified, publicPost };
}
test("email registration requires saved RSVP and verification; codes cannot reopen a claimed account", async () => {
  const initial = await fixture();
  await assert.rejects(
    () =>
      initial.guest("auth/email/request", {
        register: true,
        name: "Contact",
        email: "test@example.com",
      }),
    (e) => e.code === "RSVP_FIRST",
  );
  const f = await registeredFixture();
  assert.equal((await f.verified("session")).verified, true);
  assert.deepEqual((await f.verified("session")).permissions, []);
  await assert.rejects(
    () => f.publicPost("auth/email/verify", { token: f.link }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
  await assert.rejects(
    () => f.publicPost("invitation-session", { token: f.guestToken }),
    (e) => e.code === "EMAIL_SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    () => f.guest("invitation"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  assert.equal(
    (await f.ledger.read()).invitations[household].syncState,
    "synced",
  );
});
test("returning email links are single-use, expire, and do not reveal whether an address exists", async () => {
  const f = await registeredFixture();
  const known = await f.publicPost("auth/email/request", {
    email: "TEST@example.com",
  });
  const raw = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  const unknown = await f.publicPost("auth/email/request", {
    email: "unknown@example.com",
  });
  assert.deepEqual(known, unknown);
  const outcomes = await Promise.allSettled([
    f.publicPost("auth/email/verify", { token: raw }),
    f.publicPost("auth/email/verify", { token: raw }),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const expired = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  f.advance(900000);
  await assert.rejects(
    () => f.publicPost("auth/email/verify", { token: expired }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
});
test("private page content is denied by default and permission removal takes effect in existing sessions", async () => {
  const f = await registeredFixture();
  await f.admin("pages", {
    page: "costs",
    en: "Private budget 1234",
    es: "Presupuesto privado",
    links: [],
  });
  await assert.rejects(
    () => f.verified("pages/costs"),
    (e) => e.code === "PAGE_NOT_ALLOWED",
  );
  await f.admin("accounts", {
    id: f.account.id,
    version: 1,
    active: true,
    permissions: ["costs"],
  });
  assert.equal(
    (await f.verified("pages/costs")).content.en,
    "Private budget 1234",
  );
  await assert.rejects(
    () => f.verified("admin/dashboard"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await f.admin("accounts", {
    id: f.account.id,
    version: 2,
    active: true,
    permissions: [],
  });
  await assert.rejects(
    () => f.verified("pages/costs"),
    (e) => e.code === "PAGE_NOT_ALLOWED",
  );
  await assert.rejects(
    () =>
      f.admin("accounts", {
        id: f.account.id,
        version: 3,
        active: true,
        permissions: ["superuser"],
      }),
    (e) => e.code === "INVALID_PERMISSIONS",
  );
});
test("guest administration requires owner grant and MFA; revoking grant rejects an outstanding challenge", async () => {
  const f = await registeredFixture();
  await assert.rejects(
    () => f.verified("auth/step-up", {}),
    (e) => e.code === "ADMIN_NOT_ALLOWED",
  );
  await f.admin("accounts", {
    id: f.account.id,
    version: 1,
    active: true,
    permissions: ["admin"],
  });
  const c = await f.verified("auth/step-up", {});
  await assert.rejects(
    () => f.verified("admin/accounts"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  const result = await f.publicPost("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(at / 30000)),
  });
  const delegated = (path, body) =>
    f.app.dispatch({
      path: "/api/admin/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: result.setCookie.split(";")[0],
        "x-csrf-token": result.csrf,
      },
    });
  assert.equal((await delegated("accounts")).owner, false);
  await assert.rejects(
    () =>
      delegated("accounts", {
        id: f.account.id,
        version: 2,
        active: true,
        permissions: [],
      }),
    (e) => e.code === "OWNER_REQUIRED",
  );
  const outstanding = await f.verified("auth/step-up", {});
  await f.admin("accounts", {
    id: f.account.id,
    version: 2,
    active: true,
    permissions: [],
  });
  await assert.rejects(
    () => delegated("dashboard"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    () =>
      f.publicPost("auth/mfa", {
        challenge: outstanding.challenge,
        code: "123456",
      }),
    (e) => e.code === "ADMIN_NOT_ALLOWED",
  );
});
test("disabling an account blocks an issued email link and current sessions", async () => {
  const f = await registeredFixture();
  await f.publicPost("auth/email/request", { email: "test@example.com" });
  const raw = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  await f.admin("accounts", {
    id: f.account.id,
    version: 1,
    active: false,
    permissions: [],
  });
  await assert.rejects(
    () => f.verified("account"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    () => f.publicPost("auth/email/verify", { token: raw }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
});
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
test("durable receipts survive reopening; duplicate submit is one response and one email draft", async () => {
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
  assert.equal(f.sends(), 0);
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
  const request = (body) =>
    f.app.dispatch({
      path: "/api/auth/google",
      method: "POST",
      headers: { origin },
      body,
      ip: "new-admin",
    });
  const login = await request({ credential: "verified-by-fixture" });
  const code = totp(login.enrollmentSecret, Math.floor(at / 30000));
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
  await f.admin("mail/send", { id, confirm: true });
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
    const id = Object.keys((await f.ledger.read()).outbox)[0];
    await f.admin(action, {
      id: household,
      invited: { ceremony: true, dinner: true, dance: false },
    });
    await assert.rejects(
      () => f.admin("mail/send", { id, confirm: true }),
      (e) => e.code === "MAIL_DRAFT_STALE",
    );
    assert.equal(f.sends(), 0);
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

test("photo submissions reject SVG and noncanonical base64 before storage", async () => {
  const f = await fixture();
  for (const base64 of [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64"),
    "!!!!",
  ]) {
    await assert.rejects(
      () => f.guest("photos", { base64, consent: true, caption: "" }),
      (e) => e.code === "INVALID_PHOTO",
    );
  }
  assert.equal(Object.keys((await f.ledger.read()).photos).length, 0);
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

test("a valid photo remains private until a family administrator approves it", async () => {
  const f = await fixture();
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#651625" },
  })
    .png()
    .toBuffer();
  const photo = await f.guest("photos", {
    base64: bytes.toString("base64"),
    caption: "Synthetic test image",
    consent: true,
  });
  const visible = () => f.app.dispatch({ path: "/api/public" });
  assert.equal((await visible()).photos.length, 0);
  await f.admin("moderation", {
    id: photo.id,
    collection: "photos",
    state: "approved",
  });
  assert.equal((await visible()).photos.length, 1);
  await f.admin("moderation", {
    id: photo.id,
    collection: "photos",
    state: "rejected",
  });
  assert.equal((await visible()).photos.length, 0);
});
