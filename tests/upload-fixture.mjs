// One API instance over an in-memory ledger and storage, with a clock the test
// moves, for the upload limit and table card tests (tests/upload-quota.test.mjs,
// tests/party-card.test.mjs). Sessions: a signed-in guest (their email on the
// household's row), a person from another household, an invitation-link
// session and the owner. Every name and email is made up.
import { createHmac, randomBytes } from "node:crypto";
import sharp from "sharp";
import { Ledger, memoryAdapter, memoryMedia, UPLOAD_UNIT } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token } from "../server/auth.mjs";

export const origin = "https://misxv.simplysoph.com",
  household = "12345678-1234-1234-1234-123456789012",
  otherHousehold = "22222222-2222-4222-8222-222222222222",
  key = Buffer.alloc(32, 6);
// The celebration's defaults (site/celebration.mjs): the ceremony starts at
// 4:00 PM on Friday, January 15, 2027 in Fort Worth, and the party upload
// window ends at midnight that starts Monday, January 18 (site/lifecycle.mjs).
export const CEREMONY = Date.parse("2027-01-15T16:00:00-06:00"),
  WINDOW_END = Date.parse("2027-01-18T00:00:00-06:00"),
  HOUR = 3600000,
  DAY = 24 * HOUR;

export async function fixture({ at = Date.parse("2026-12-01T18:00:00Z"), ...options } = {}) {
  const saved = memoryAdapter(),
    ledger = new Ledger(saved),
    media = memoryMedia(),
    sent = [],
    logs = [];
  let clock = at;
  const row = {
    id: household,
    name: "Example family",
    capacity: { adultsTeens: 2, kids: 0 },
    email: "guest@example.com",
    validCapacity: true,
    archived: false,
  };
  const otherRow = { ...row, id: otherHousehold, name: "Other family", email: "other@example.com" };
  const app = createApplication({
    ledger,
    notion: {
      read: async (id) => structuredClone(id === otherHousehold ? otherRow : row),
      list: async () => [structuredClone(row), structuredClone(otherRow)],
    },
    mailer: { configured: true, send: async (m) => sent.push(m) },
    verifyGoogle: async () => ({ id: "x", email: "owner@example.com" }),
    media,
    key,
    origin,
    adminEmails: ["owner@example.com"],
    now: () => clock,
    photoGate: (task) => task(),
    log: (entry) => logs.push(entry),
    ...options,
  });
  const cookies = {};
  await ledger.transaction((s) => {
    s.invitations[household] = { id: household, name: row.name, active: true, generation: 1 };
    s.invitations[otherHousehold] = { id: otherHousehold, name: otherRow.name, active: true, generation: 1 };
    s.accounts = {};
    for (const [name, email, home] of [
      ["guest", "guest@example.com", household],
      ["other", "other@example.com", otherHousehold],
    ]) {
      const accountId = randomBytes(16).toString("hex").replace(/^(.{8})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4-");
      s.accounts[accountId] = {
        id: accountId,
        householdId: home,
        email,
        emailKey: createHmac("sha256", key).update("email:" + email).digest("hex"),
        active: true,
        version: 1,
      };
      cookies[name] = { cookie: "__session=" + token(), csrf: token() };
      s.sessions[hash(cookies[name].cookie.slice(10))] = {
        kind: "guest",
        accountId,
        householdId: home,
        generation: 1,
        email,
        csrf: cookies[name].csrf,
        startedAt: at,
        expiresAt: at + DAY * 90,
      };
    }
    cookies.link = { cookie: "__session=" + token(), csrf: token() };
    s.sessions[hash(cookies.link.cookie.slice(10))] = {
      kind: "guest",
      householdId: household,
      generation: 1,
      scope: "rsvp",
      csrf: cookies.link.csrf,
      expiresAt: at + DAY * 90,
    };
    cookies.admin = { cookie: "__session=" + token(), csrf: token() };
    s.sessions[hash(cookies.admin.cookie.slice(10))] = {
      kind: "admin",
      actor: "owner",
      email: "owner@example.com",
      csrf: cookies.admin.csrf,
      expiresAt: at + DAY * 90,
    };
  });
  // A request as one of the sessions above, or as { cookie, csrf } (a table
  // card session), or with no cookie at all (null).
  const request = (who, p, body, extra = {}) => {
    const c = typeof who === "string" ? cookies[who] : who;
    return app.dispatch({
      path: "/api/" + p,
      method: body || extra.bytes ? "POST" : "GET",
      body: body || {},
      query: extra.query,
      bytes: extra.bytes,
      headers: {
        origin,
        ...(c ? { cookie: c.cookie, "x-csrf-token": c.csrf } : {}),
        ...extra.headers,
      },
    });
  };
  const startBody = (bytes, rest = {}) => ({
    kind: "photo",
    type: "image/jpeg",
    size: bytes.length,
    album: "event",
    caption: "",
    consent: true,
    ...rest,
  });
  // Sends a whole file the way the page does.
  async function upload(who, bytes, rest = {}) {
    const { id } = await request(who, "uploads", startBody(bytes, rest));
    let offset = 0;
    for (;;) {
      const r = await request(who, "uploads/" + id, null, {
        bytes: bytes.subarray(offset, offset + 4 * UPLOAD_UNIT),
        query: { offset: String(offset) },
      });
      if (r.complete) return { id, ...r };
      offset = r.received;
    }
  }
  return {
    app,
    ledger,
    media,
    sent,
    logs,
    row,
    cookies,
    request,
    startBody,
    upload,
    as: (who) => (p, body, extra) => request(who, p, body, extra),
    now: () => clock,
    setNow: (value) => (clock = value),
    advance: (ms) => (clock += ms),
    state: () => ledger.read(),
  };
}
export const photo = (width = 120, height = 90) =>
  sharp({ create: { width, height, channels: 3, background: "#d7b779" } }).jpeg().toBuffer();
