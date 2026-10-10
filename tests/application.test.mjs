import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token, totp, base32, seal } from "../server/auth.mjs";
// The fixture owner's authenticator, for actions that need a fresh code.
const OWNER_TOTP = base32(Buffer.alloc(20, 9));
import sharp from "sharp";
const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-01T18:00:00Z");
const household = "12345678-1234-1234-1234-123456789012";
async function fixture(options = {}) {
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
    administratorEligible: true,
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
  // The pre-registration session is invalidated; the private link now opens a
  // fresh RSVP-only session instead (covered in detail below).
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
    code: await f.ownerCode(),
  });
  await f.admin("mfa-setup", { email: f.account.email, code: await f.ownerCode() });
  const c = await f.verified("auth/step-up", {});
  await assert.rejects(
    () => f.verified("admin/accounts"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  const result = await f.publicPost("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(at / 30000)),
  });
  const delegated = (path, body, query) =>
    f.app.dispatch({
      path: "/api/admin/" + path,
      query,
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
    (e) => e.code === "SIGN_IN_AGAIN",
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
  const f = await registeredFixture();
  const bytes = await sharp({
    create: { width: 4, height: 4, channels: 3, background: "#651625" },
  })
    .png()
    .toBuffer();
  const photo = await f.verified("photos", {
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
  assert.equal((await visible()).photos.length, 0);
  assert.equal((await f.verified("gallery")).media.length, 1);
  assert.ok((await f.verified("photo/" + photo.id)).binary);
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/photo/" + photo.id }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await f.admin("moderation", {
    id: photo.id,
    collection: "photos",
    state: "rejected",
  });
  assert.equal((await visible()).photos.length, 0);
  assert.equal((await f.verified("gallery")).media.length, 0);
  await assert.rejects(
    () => f.verified("photo/" + photo.id),
    (e) => e.code === "NOT_FOUND",
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
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/calendar/reception.ics" }),
    (e) => e.code === "END_TIME_PENDING",
  );
  await assert.rejects(
    () => f.guest("pages/gifts"),
    (e) => e.code === "PAGE_NOT_ALLOWED",
  );
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

test("video uploads are normalized before storage, moderated, album-aware, and access revocation blocks playback", async () => {
  let normalized = false,
    stored;
  const f = await registeredFixture({
    videoProcessor: async (bytes) => {
      assert.equal(bytes.toString(), "synthetic-video");
      normalized = true;
      return Buffer.from("normalized");
    },
    media: {
      put: async (id, bytes, kind) => {
        stored = { id, bytes, kind };
      },
      get: async () => Buffer.from("normalized"),
    },
  });
  const row = await f.verified("videos", {
    base64: Buffer.from("synthetic-video").toString("base64"),
    consent: true,
    album: "friends",
    caption: "A test clip",
  });
  assert.ok(normalized);
  assert.equal(stored.kind, "video");
  assert.equal(stored.bytes.toString(), "normalized");
  assert.equal((await f.verified("gallery")).media.length, 0);
  await assert.rejects(
    () => f.verified("photo/" + row.id),
    (e) => e.code === "NOT_FOUND",
  );
  await f.admin("moderation", {
    id: row.id,
    collection: "photos",
    state: "approved",
    album: "event",
  });
  assert.equal((await f.verified("gallery")).media[0].album, "event");
  assert.equal((await f.verified("photo/" + row.id)).contentType, "video/mp4");
  const { site } = await f.admin("site");
  site.albums = site.albums.filter((a) => a.id !== "event");
  await assert.rejects(
    () => f.admin("site", site),
    (e) => e.code === "ALBUM_HAS_MEDIA",
  );
  await f.admin("revoke", { id: household });
  await assert.rejects(
    () => f.verified("photo/" + row.id),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
});

test("Target registry is public while private gift notes still require permission", async () => {
  const f = await registeredFixture();
  await assert.rejects(
    () => f.verified("pages/gifts"),
    (e) => e.code === "PAGE_NOT_ALLOWED",
  );
  await f.admin("accounts", {
    id: f.account.id,
    version: f.account.version,
    active: true,
    permissions: ["gifts"],
  });
  const result = await f.verified("pages/gifts");
  assert.equal(
    result.registries[0].url,
    "https://www.target.com/gift-registry/gift/quincenera",
  );
  assert.equal(
    (await f.app.dispatch({ path: "/api/site" })).site.registries[0].url,
    "https://www.target.com/gift-registry/gift/quincenera",
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
  const google = await post("auth/google", { credential: "fixture" });
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

test("Notion administrator eligibility is required for owner grants and fresh admin access", async () => {
  const f = await registeredFixture();
  f.row.administratorEligible = false;
  await assert.rejects(
    () =>
      f.admin("accounts", {
        id: f.account.id,
        version: 1,
        active: true,
        permissions: ["admin"],
      }),
    (e) => e.code === "ADMIN_NOT_ELIGIBLE",
  );
  f.row.administratorEligible = true;
  assert.deepEqual((await f.verified("session")).permissions, []);
  await f.admin("accounts", {
    id: f.account.id,
    version: 1,
    active: true,
    permissions: ["admin"],
    code: await f.ownerCode(),
  });
  await f.admin("mfa-setup", { email: f.account.email, code: await f.ownerCode() });
  const c = await f.verified("auth/step-up", {});
  const login = await f.publicPost("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(at / 30000)),
  });
  const adminGet = () =>
    f.app.dispatch({
      path: "/api/admin/seating",
      method: "GET",
      headers: { origin, cookie: login.setCookie.split(";")[0] },
    });
  assert.ok(Array.isArray((await adminGet()).tables));
  f.row.administratorEligible = false;
  await assert.rejects(adminGet, (e) => e.code === "ADMIN_NOT_ELIGIBLE");
});
test("delete is reversible, revokes sessions and outstanding links, never restores admin", async () => {
  const f = await registeredFixture();
  await f.admin("accounts", {
    id: f.account.id,
    version: 1,
    active: true,
    permissions: ["costs", "admin"],
    code: await f.ownerCode(),
  });
  await f.publicPost("auth/email/request", { email: f.account.email });
  const raw = f.sent.at(-1).html.match(/account\/#([A-Za-z0-9_-]{43})/)[1];
  await f.admin("accounts/delete", { id: f.account.id, version: 2 });
  await assert.rejects(
    () => f.verified("account"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    () => f.publicPost("auth/email/verify", { token: raw }),
    (e) => e.code === "EMAIL_LINK_INVALID",
  );
  let state = await f.ledger.read();
  assert.ok(state.accounts[f.account.id].deletedAt);
  assert.equal(state.invitations[household].active, false);
  await f.admin("accounts/restore", { id: f.account.id, version: 3 });
  state = await f.ledger.read();
  assert.equal(state.accounts[f.account.id].deletedAt, undefined);
  assert.deepEqual(state.accounts[f.account.id].permissions, ["costs"]);
  assert.equal(state.invitations[household].active, true);
  await assert.rejects(
    () => f.verified("account"),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await f.ledger.transaction((s) => {
    s.accounts[f.account.id].email = "organizer@gmail.com";
  });
  await assert.rejects(
    () => f.admin("accounts/delete", { id: f.account.id, version: 4 }),
    (e) => e.code === "OWNER_PROTECTED",
  );
});

test("invited delegate signs in by email plus MFA without owner authority", async () => {
  const f = await fixture({ adminDelegateEmails: ["diana@example.com"] });
  f.row.email = "diana@example.com";
  const post = (path, body) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: "POST",
      headers: { origin },
      body,
    });
  await f.admin("mfa-setup", { email: "diana@example.com", code: await f.ownerCode() });
  await post("auth/admin-email/request", { email: "diana@example.com" });
  const raw = f.sent.at(-1).html.match(/login\/#([A-Za-z0-9_-]{43})/)[1];
  const c = await post("auth/admin-email/verify", { token: raw });
  const login = await post("auth/mfa", {
    challenge: c.challenge,
    code: totp(c.enrollmentSecret, Math.floor(at / 30000)),
  });
  const delegated = (path, body) =>
    f.app.dispatch({
      path: "/api/admin/" + path,
      method: body ? "POST" : "GET",
      headers: {
        origin,
        cookie: login.setCookie.split(";")[0],
        "x-csrf-token": login.csrf,
      },
      body,
    });
  assert.equal((await delegated("accounts")).owner, false);
  await assert.rejects(
    () => delegated("accounts/delete", { id: household, version: 1 }),
    (e) => e.code === "OWNER_REQUIRED",
  );
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  await f.ledger.transaction((s) => {
    s.accounts = {
      [id]: {
        id,
        householdId: household,
        email: "diana@example.com",
        active: true,
        permissions: [],
        version: 1,
      },
    };
  });
  await assert.rejects(
    () =>
      delegated("accounts", {
        id,
        version: 1,
        active: true,
        permissions: ["admin"],
      }),
    (e) => e.code === "OWNER_REQUIRED",
  );
  f.row.administratorEligible = false;
  await assert.rejects(
    () => delegated("seating"),
    (e) => e.code === "ADMIN_NOT_ELIGIBLE",
  );
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
  const codes = [];
  for (let i = 0; i < 70; i++)
    await post("auth/google", { credential: "junk" }).catch((e) => codes.push(e.code));
  assert.equal(codes.filter((c) => c === "SIGN_IN_FAILED").length, 60);
  assert.equal(codes.filter((c) => c === "TOO_MANY_REQUESTS").length, 10);
  assert.ok((await post("auth/google", { credential: "valid" })).challenge);
  for (let i = 0; i < 610; i++)
    await post("invitation-session", { token: "x".repeat(43) }).catch(() => {});
  assert.ok((await post("invitation-session", { token: f.guestToken })).setCookie);
  assert.equal((await f.ledger.read()).limits, undefined);
});

test("after registration the private link reopens the RSVP only, with contact hidden and preserved", async () => {
  const f = await registeredFixture();
  const opened = await f.publicPost("invitation-session", { token: f.guestToken });
  const as = (path, body, extra = {}) =>
    f.app.dispatch({
      path: "/api/" + path,
      method: body ? "POST" : "GET",
      body,
      headers: {
        origin,
        cookie: opened.setCookie.split(";")[0],
        "x-csrf-token": opened.csrf,
        ...extra,
      },
    });
  const session = await as("session");
  assert.equal(session.scope, "rsvp");
  assert.equal(session.verified, false);
  const inv = await as("invitation");
  assert.equal(inv.contactHidden, true);
  assert.deepEqual(inv.contact, { email: "", phone: "", address: null });
  assert.equal(inv.response.contact.email, "");
  // Every non-RSVP route treats the link session as signed out.
  for (const path of ["profile", "account", "messages"])
    await assert.rejects(() => as(path), (e) => e.code === "SIGN_IN_REQUIRED");
  // Submitting with hidden contact keeps the registered contact and receipt address.
  const before = (await f.ledger.read()).profiles[household].contact;
  const input = f.input();
  input.previousSubmissionId = inv.previousSubmissionId;
  input.contact = { email: "attacker@example.com", phone: "", address: null };
  await as("rsvp", input, { "idempotency-key": "11111111-1111-4111-8111-111111111111" });
  const state = await f.ledger.read();
  assert.deepEqual(state.profiles[household].contact, before);
  assert.equal(
    state.responses["11111111-1111-4111-8111-111111111111"].contact.email,
    before.email,
  );
  assert.ok(!f.sent.some((m) => m.to === "attacker@example.com"));
  // A typed invitation code still cannot reopen a registered household.
  await f.ledger.transaction((s) => {
    s.invitations[household].codeHash = hash("ABCDEFGHJKLMNPQR");
  });
  await assert.rejects(
    () => f.publicPost("invitation-session", { token: "ABCD-EFGH-JKLM-NPQR" }),
    (e) => e.code === "EMAIL_SIGN_IN_REQUIRED",
  );
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

test("a delegate can set up an authenticator only inside an owner-opened window, once", async () => {
  const f = await fixture({ adminDelegateEmails: ["diana@example.com"] });
  f.row.email = "diana@example.com";
  const post = (path, body) =>
    f.app.dispatch({ path: "/api/" + path, method: "POST", headers: { origin }, body });
  const emailChallenge = async () => {
    await post("auth/admin-email/request", { email: "diana@example.com" });
    const raw = f.sent.at(-1).html.match(/login\/#([A-Za-z0-9_-]{43})/)[1];
    return post("auth/admin-email/verify", { token: raw });
  };
  // Whoever completes Diana's sign-in first can no longer claim her admin account.
  await assert.rejects(emailChallenge, (e) => e.code === "MFA_SETUP_NOT_ALLOWED");
  const opened = await f.admin("mfa-setup", { email: "diana@example.com", code: await f.ownerCode() });
  assert.ok(opened.allowedUntil);
  const c = await emailChallenge();
  assert.ok(c.enrollmentSecret);
  await post("auth/mfa", { challenge: c.challenge, code: totp(c.enrollmentSecret, Math.floor(at / 30000)) });
  const s = await f.ledger.read();
  assert.equal(Object.keys(s.mfaSetup || {}).length, 0, "the window is used up");
  assert.deepEqual(s.roleEvents.map((e) => e.change), ["authenticator-setup-allowed", "authenticator-set-up"]);
  const note = (await f.admin("notifications")).notifications.find((n) => n.kind === "security");
  assert.equal(note.title, "Authenticator set up for diana@example.com");
  assert.equal(note.emailState, "none");
  // An owner reset removes the authenticator and requires a new window.
  await f.admin("mfa-setup", { email: "diana@example.com", code: await f.ownerCode(), reset: true });
  const again = await emailChallenge();
  assert.ok(again.enrollmentSecret, "a reset requires setting up again");
  assert.equal((await f.admin("role-events")).events[0].change, "authenticator-reset");
});

test("granting administration needs a fresh owner code; removing it does not and drops the authenticator", async () => {
  const f = await registeredFixture();
  const grant = (version, code) =>
    f.admin("accounts", { id: f.account.id, version, active: true, permissions: ["admin"], ...(code ? { code } : {}) });
  // An owner without an authenticator on record cannot grant at all.
  await assert.rejects(() => grant(1, "123456"), (e) => e.code === "MFA_REQUIRED");
  const code = await f.ownerCode();
  await assert.rejects(() => grant(1), (e) => e.code === "INVALID_MFA");
  await assert.rejects(() => grant(1, "000000"), (e) => e.code === "INVALID_MFA");
  await grant(1, code);
  // The same code cannot be replayed for another grant.
  await f.admin("accounts", { id: f.account.id, version: 2, active: true, permissions: [] });
  await assert.rejects(() => grant(3, code), (e) => e.code === "INVALID_MFA");
  await f.ledger.transaction((s) => {
    s.admins["account:" + f.account.id] = { secret: "x", lastStep: 0, email: f.account.email };
  });
  await grant(3, await f.ownerCode());
  await f.admin("accounts", { id: f.account.id, version: 4, active: true, permissions: [] });
  const s = await f.ledger.read();
  assert.equal(s.admins["account:" + f.account.id], undefined, "removal drops the authenticator");
  assert.deepEqual(
    s.roleEvents.map((e) => e.change),
    ["admin-granted", "admin-removed", "admin-granted", "admin-removed"],
  );
});

test("Notion schema changes, imports and authenticator windows are owner-only", async () => {
  const f = await fixture({ adminDelegateEmails: ["diana@example.com"] });
  f.row.email = "diana@example.com";
  const delegate = token();
  await f.ledger.transaction((s) => {
    s.sessions[hash(delegate)] = { kind: "admin", actor: "owner:diana@example.com", email: "diana@example.com", csrf: "d", expiresAt: at + 100000 };
  });
  const asDelegate = (path, body) =>
    f.app.dispatch({ path: "/api/admin/" + path, method: "POST", body, headers: { origin, cookie: "__session=" + delegate, "x-csrf-token": "d" } });
  for (const [path, body] of [["schema", {}], ["import", { rows: [] }], ["mfa-setup", { email: "x@example.com", code: "000000" }]])
    await assert.rejects(() => asDelegate(path, body), (e) => e.code === "OWNER_REQUIRED", path);
  await assert.rejects(
    () => f.app.dispatch({ path: "/api/admin/schema", method: "POST", body: {}, headers: { origin, cookie: "__session=" + delegate, "x-csrf-token": "dd" } }),
    (e) => e.code === "CSRF_REJECTED",
  );
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
