// "Download all photos" (server/gallery.mjs, GET /api/gallery/archive and
// /api/gallery/archive/<n>): who may download, what is in it, how it is split
// into parts, and the limits, through the application and the real HTTP
// server. Storage is memoryMedia, or a fake that records what happens to its
// streams. All names and emails are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import http from "node:http";
import { Readable } from "node:stream";
import { Ledger, memoryAdapter, memoryMedia } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { createHttpServer } from "../server/http.mjs";
import { hash, token } from "../server/auth.mjs";
import { siteSettings } from "../server/site-settings.mjs";
import { readZip } from "./zip-reader.mjs";

const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2027-01-20T18:00:00Z"),
  household = "12345678-1234-4234-8234-123456789012",
  otherHousehold = "22222222-2222-4222-8222-222222222222",
  key = Buffer.alloc(32, 6);
const id = (n) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-${String(n).padStart(12, "0")}`;

async function fixture(options = {}) {
  const saved = memoryAdapter(),
    ledger = new Ledger(saved),
    media = options.media || memoryMedia(),
    logs = [];
  let clock = at;
  const rows = {
    [household]: { id: household, name: "Example family", email: "guest@example.com", validCapacity: true, archived: false },
    [otherHousehold]: { id: otherHousehold, name: "Other family", email: "other@example.com", validCapacity: true, archived: false },
  };
  const launch = (ledger) =>
    createApplication({
      ledger,
      notion: {
        read: async (h) => structuredClone(rows[h]),
        list: async () => Object.values(rows).map((r) => structuredClone(r)),
      },
      mailer: { configured: false },
      verifyGoogle: async () => ({}),
      media,
      key,
      origin,
      adminEmails: ["owner@example.com"],
      now: () => clock,
      log: (entry) => logs.push(entry),
      ...options.app,
    });
  let app = launch(ledger);
  const sessions = {};
  await ledger.transaction((s) => {
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
      sessions[name] = { cookie: token(), csrf: token() };
      s.sessions[hash(sessions[name].cookie)] = {
        kind: "guest",
        accountId,
        householdId: home,
        email,
        csrf: sessions[name].csrf,
        startedAt: clock,
        expiresAt: clock + 86400000 * 30,
      };
    }
    s.invitations[household] = { id: household, name: "Example family", active: true, generation: 1 };
    sessions.link = { cookie: token(), csrf: token() };
    s.sessions[hash(sessions.link.cookie)] = {
      kind: "guest",
      householdId: household,
      generation: 1,
      scope: "rsvp",
      csrf: sessions.link.csrf,
      expiresAt: clock + 86400000 * 30,
    };
    sessions.admin = { cookie: token(), csrf: token() };
    s.sessions[hash(sessions.admin.cookie)] = {
      kind: "admin",
      actor: "owner",
      email: "owner@example.com",
      csrf: sessions.admin.csrf,
      expiresAt: clock + 86400000 * 30,
    };
  });
  const headersFor = (who) =>
    who ? { origin, cookie: "__session=" + sessions[who].cookie, "x-csrf-token": sessions[who].csrf } : { origin };
  const as = (who) => (p, { body, query } = {}) =>
    app.dispatch({ path: "/api/" + p, method: body ? "POST" : "GET", body: body || {}, query, headers: headersFor(who) });
  // A stored, approved photo or video, as the upload and review leave it.
  async function add(n, { kind = "photo", bytes = 1000, state = "approved", album = "event", stored = true, ...rest } = {}) {
    const photoId = id(n);
    if (stored) await media.put(photoId, Buffer.alloc(bytes, n), kind);
    await ledger.transaction((s) => {
      s.photos[photoId] = {
        id: photoId,
        kind,
        album,
        caption: "",
        state,
        householdId: household,
        receivedAt: at - 86400000 + n * 60000,
        ...(state === "approved" ? { approvedAt: at - 3600000 + n * 1000 } : {}),
        ...rest,
      };
    });
    return photoId;
  }
  return {
    get app() {
      return app;
    },
    restart: () => (app = launch(new Ledger(saved))),
    ledger,
    media,
    logs,
    rows,
    headersFor,
    guest: as("guest"),
    other: as("other"),
    link: as("link"),
    admin: as("admin"),
    anonymous: as(null),
    add,
    advance: (ms) => (clock += ms),
  };
}
const bytesOf = async (r) => Buffer.concat(await r.stream.toArray());
async function serve(t, app) {
  const server = createHttpServer({ app, root: process.cwd(), origin });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  return "http://127.0.0.1:" + server.address().port;
}

test("only an administrator or a guest signed in with their email may list or download; the same refusals as the gallery", async () => {
  const f = await fixture();
  await f.add(1);
  for (const p of ["gallery", "gallery/archive", "gallery/archive/1"]) {
    await assert.rejects(f.anonymous(p), { status: 401, code: "SIGN_IN_REQUIRED" }, p);
    // An invitation link opens the RSVP only.
    await assert.rejects(f.link(p), { status: 401, code: "SIGN_IN_REQUIRED" }, p);
  }
  const listed = await f.guest("gallery/archive");
  assert.equal(listed.totalCount, 1);
  assert.equal((await f.admin("gallery/archive")).totalCount, 1);
  assert.equal(listed.parts[0].url, `/api/gallery/archive/1?v=${listed.parts[0].version}`);
  // A guest whose email the family removed from their row is signed out,
  // exactly as on the gallery.
  f.rows[household].email = "someone-else@example.com";
  await assert.rejects(f.guest("gallery/archive"), { status: 401, code: "SIGN_IN_REQUIRED" });
  await assert.rejects(f.guest("gallery/archive/1"), { status: 401, code: "SIGN_IN_REQUIRED" });
});

test("only approved media with a stored file is included: not pending, rejected, still converting, failed or missing", async () => {
  const f = await fixture();
  const photo = await f.add(1),
    video = await f.add(2, { kind: "video", bytes: 3000, poster: true });
  await f.add(3, { state: "pending" });
  await f.add(4, { state: "rejected" });
  await f.add(5, { kind: "video", state: "processing", stored: false });
  await f.add(6, { kind: "video", state: "failed", stored: false });
  // Approved, but its file is gone from storage (for example cleaned up).
  await f.add(7, { stored: false });
  const listed = await f.guest("gallery/archive");
  assert.equal(listed.totalCount, 2);
  assert.equal(listed.totalPhotos, 1);
  assert.equal(listed.totalVideos, 1);
  assert.equal(listed.parts.length, 1);
  const zip = readZip(await bytesOf(await f.guest("gallery/archive/1"))).entries;
  assert.deepEqual(
    zip.map((e) => [e.name, e.size]),
    [
      ["sophia-xv-event-001.jpg", 1000],
      ["sophia-xv-event-002.mp4", 3000],
    ],
  );
  assert.deepEqual(zip[0].data, await f.media.get(photo, "photo"));
  assert.deepEqual(zip[1].data, await f.media.get(video, "video"));
  // The poster frame is not a file of its own.
  assert.equal(zip.some((e) => /poster/.test(e.name)), false);
});

test("entry names come from the server only: no caption, uploader or path text, whatever the caption says", async () => {
  const f = await fixture();
  await f.add(1, { caption: "../../etc/passwd Ana García", album: "family", uploaderName: "Ana García", email: "guest@example.com" });
  await f.add(2, { caption: "..\\..\\boot.ini", album: "family" });
  await f.add(3, { album: "Event Day/../x" });
  const archive = await bytesOf(await f.guest("gallery/archive/1"));
  assert.deepEqual(
    readZip(archive).entries.map((e) => e.name),
    ["sophia-xv-family-001.jpg", "sophia-xv-family-002.jpg", "sophia-xv-event-day-x-001.jpg"],
  );
  for (const text of ["passwd", "García", "boot.ini", "guest@example.com"])
    assert.equal(archive.includes(Buffer.from(text)), false, text);
});

test("parts: packed in approval order under the cap, a file over the cap alone, and later approvals go to the end", async () => {
  // A cap of 3,000 bytes: two 1,000-byte photos and their headers fit, three do not.
  const f = await fixture({ app: { galleryArchive: { partBytes: 3000 } } });
  for (const n of [1, 2, 3]) await f.add(n);
  await f.add(4, { kind: "video", bytes: 5000 });
  await f.add(5);
  const listed = await f.guest("gallery/archive");
  assert.deepEqual(
    listed.parts.map((p) => [p.part, p.count, p.photos, p.videos]),
    [
      [1, 2, 2, 0],
      [2, 1, 1, 0],
      [3, 1, 0, 1],
      [4, 1, 1, 0],
    ],
  );
  assert.equal(listed.partBytes, 3000);
  for (const p of listed.parts) if (p.videos === 0) assert.ok(p.bytes <= 3000);
  assert.ok(listed.parts[2].bytes > 5000, "the video is over the cap, in a part of its own");
  assert.equal(listed.totalBytes, listed.parts.reduce((n, p) => n + p.bytes, 0));
  // Each part is exactly the length the list said, and numbering runs on.
  const names = [];
  for (const p of listed.parts) {
    const r = await f.guest(`gallery/archive/${p.part}`, { query: { v: p.version } });
    assert.equal(r.length, p.bytes);
    assert.equal(r.contentType, "application/zip");
    const bytes = await bytesOf(r);
    assert.equal(bytes.length, p.bytes);
    names.push(readZip(bytes).entries.map((e) => e.name));
  }
  assert.deepEqual(names, [
    ["sophia-xv-event-001.jpg", "sophia-xv-event-002.jpg"],
    ["sophia-xv-event-003.jpg"],
    ["sophia-xv-event-004.mp4"],
    ["sophia-xv-event-005.jpg"],
  ]);
  assert.equal((await f.guest("gallery/archive/2")).disposition, `attachment; filename="sophia-xv-photos-part-2-of-4.zip"; filename*=UTF-8''sophia-xv-photos-part-2-of-4.zip`);
  // The family approves one more photo, uploaded before all the others: it
  // goes at the end, so the parts already downloaded keep their contents.
  const late = await f.add(6, { state: "pending", receivedAt: at - 86400000 * 3 });
  f.advance(60000);
  assert.deepEqual(await f.admin("admin/moderation", { body: { collection: "photos", id: late, state: "approved" } }), { state: "approved" });
  const again = await f.guest("gallery/archive");
  assert.notEqual(again.version, listed.version, "the list says the set changed");
  assert.deepEqual(
    again.parts.slice(0, 3).map((p) => p.version),
    listed.parts.slice(0, 3).map((p) => p.version),
  );
  assert.deepEqual(again.parts.map((p) => p.count), [2, 1, 1, 2]);
});

test("unknown parts are 404, and a part whose contents changed since the list was read is 409 ARCHIVE_CHANGED", async () => {
  const f = await fixture({ app: { galleryArchive: { partBytes: 3000 } } });
  for (const n of [1, 2, 3]) await f.add(n);
  const listed = await f.guest("gallery/archive");
  assert.equal(listed.parts.length, 2);
  for (const p of ["gallery/archive/3", "gallery/archive/0", "gallery/archive/01", "gallery/archive/x", "gallery/archive/1/2", "gallery/archive/"])
    await assert.rejects(f.guest(p), { status: 404, code: "NOT_FOUND" }, p);
  // The family takes back the first photo: part 1 is now different.
  await f.admin("admin/moderation", { body: { collection: "photos", id: id(1), state: "rejected" } });
  await assert.rejects(
    f.guest("gallery/archive/1", { query: { v: listed.parts[0].version } }),
    { status: 409, code: "ARCHIVE_CHANGED" },
  );
  await assert.rejects(f.guest("gallery/archive/1", { query: { v: "" } }), { status: 409, code: "ARCHIVE_CHANGED" });
  // Without a version, the current part; with the new one, too.
  const now = await f.guest("gallery/archive");
  assert.equal(now.parts.length, 1);
  assert.equal(readZip(await bytesOf(await f.guest("gallery/archive/1", { query: { v: now.parts[0].version } }))).entries.length, 2);
  assert.equal(readZip(await bytesOf(await f.guest("gallery/archive/1"))).entries.length, 2);
});

test("one part at a time per person, and 20 parts an hour, counted in the ledger: 429 with the reason", async () => {
  const f = await fixture();
  await f.add(1);
  const open = await f.guest("gallery/archive/1");
  await assert.rejects(f.guest("gallery/archive/1"), { status: 429, code: "ARCHIVE_BUSY" });
  assert.equal((await f.guest("gallery/archive")).limits.busy, true);
  // Another person is not held up.
  await bytesOf(await f.other("gallery/archive/1"));
  await bytesOf(open);
  await new Promise((r) => setImmediate(r));
  assert.equal((await f.guest("gallery/archive")).limits.busy, false);
  for (let i = 2; i <= 20; i++) {
    f.advance(1000);
    await bytesOf(await f.guest("gallery/archive/1"));
    await new Promise((r) => setImmediate(r));
  }
  const listed = await f.guest("gallery/archive");
  assert.deepEqual(listed.limits, { partsPerHour: 20, remaining: 0, waitMs: 3600000 - 19000, busy: false });
  await assert.rejects(f.guest("gallery/archive/1"), { status: 429, code: "ARCHIVE_HOURLY_LIMIT" });
  // A restart (or the second instance) does not start the hour over.
  f.restart();
  await assert.rejects(f.guest("gallery/archive/1"), { status: 429, code: "ARCHIVE_HOURLY_LIMIT" });
  // One millisecond before the first part's hour ends, still refused; then one frees up.
  f.advance(3600000 - 19000 - 1);
  await assert.rejects(f.guest("gallery/archive/1"), { status: 429, code: "ARCHIVE_HOURLY_LIMIT" });
  f.advance(1);
  await bytesOf(await f.guest("gallery/archive/1"));
  // The refusals were not counted; the ledger keeps a hash, not the account,
  // and the other person's hour has passed, so their counter is gone.
  const state = await f.ledger.read();
  assert.equal(Object.keys(state.archiveParts).length, 1);
  assert.equal(Object.values(state.archiveParts)[0].length, 20);
  assert.equal(JSON.stringify(state.archiveParts).includes("@"), false);
});

// P5-05: the session's renewal used to be saved after the part had taken the
// person's one-at-a-time slot; when that save failed, the stream was never
// read or destroyed and the person got ARCHIVE_BUSY until a restart.
test("if this session's renewal cannot be saved, nothing is held or counted: the next part streams", async () => {
  const f = await fixture();
  await f.add(1);
  const sessionHash = hash(f.headersFor("guest").cookie.slice(10));
  // Ten minutes left, so the next request renews the session.
  await f.ledger.transaction((s) => {
    s.sessions[sessionHash].expiresAt = at + 10 * 60000;
  });
  // Any save that renews this session fails, as when the ledger is BUSY.
  const real = f.ledger.transaction.bind(f.ledger);
  f.ledger.transaction = (fn) =>
    real(async (s) => {
      const before = s.sessions[sessionHash]?.expiresAt;
      const out = await fn(s);
      if (s.sessions[sessionHash]?.expiresAt !== before)
        throw Object.assign(new Error("Please retry."), { status: 503, code: "BUSY" });
      return out;
    });
  await assert.rejects(f.guest("gallery/archive/1"), { status: 503, code: "BUSY" });
  f.ledger.transaction = real;
  // The next request streams (it used to be ARCHIVE_BUSY until a restart).
  const part = await f.guest("gallery/archive/1");
  assert.ok(part.stream && part.setCookie, "streams, and renews this time");
  await bytesOf(part);
  await new Promise((r) => setImmediate(r));
  assert.equal((await f.guest("gallery/archive")).limits.busy, false);
  // Only that part is counted: the refused request charged nothing.
  assert.equal(Object.values((await f.ledger.read()).archiveParts)[0].length, 1);
});

test("two requests for a part at the same moment: one streams, the other is ARCHIVE_BUSY and not counted", async () => {
  const f = await fixture();
  await f.add(1);
  const [a, b] = await Promise.allSettled([f.guest("gallery/archive/1"), f.guest("gallery/archive/1")]);
  const streamed = [a, b].filter((r) => r.status === "fulfilled"),
    refused = [a, b].filter((r) => r.status === "rejected");
  assert.equal(streamed.length, 1);
  assert.deepEqual([refused[0].reason.status, refused[0].reason.code], [429, "ARCHIVE_BUSY"]);
  await bytesOf(streamed[0].value);
  assert.equal(Object.values((await f.ledger.read()).archiveParts)[0].length, 1);
});

test("the owner can keep downloading everything to administrators: guests get 403 DOWNLOAD_RESTRICTED, the gallery itself is unchanged", async () => {
  const f = await fixture();
  await f.add(1);
  const site = siteSettings(await f.ledger.read());
  assert.equal(site.gallery, undefined, "older settings have no choice saved: guests may download");
  assert.equal((await f.guest("gallery/archive")).totalCount, 1);
  for (const bad of [{ download: "everyone" }, { download: "" }, null, { download: ["guests"] }])
    await assert.rejects(f.admin("admin/site", { body: { ...site, gallery: bad } }), { status: 422, code: "INVALID_SITE_SETTINGS" });
  const saved = (await f.admin("admin/site", { body: { ...site, gallery: { download: "admins" } } })).site;
  assert.deepEqual(saved.gallery, { download: "admins" });
  for (const p of ["gallery/archive", "gallery/archive/1"])
    await assert.rejects(f.guest(p), { status: 403, code: "DOWNLOAD_RESTRICTED" }, p);
  // A save from a page that does not know the choice keeps it.
  const { gallery, ...older } = saved;
  assert.deepEqual(gallery, { download: "admins" });
  const kept = (await f.admin("admin/site", { body: older })).site;
  assert.deepEqual(kept.gallery, { download: "admins" });
  await assert.rejects(f.guest("gallery/archive"), { status: 403, code: "DOWNLOAD_RESTRICTED" });
  assert.equal((await f.guest("gallery")).media.length, 1);
  assert.equal((await f.admin("gallery/archive")).totalCount, 1);
  await bytesOf(await f.admin("gallery/archive/1"));
  await f.admin("admin/site", { body: { ...kept, gallery: { download: "guests" } } });
  assert.equal((await f.guest("gallery/archive")).totalCount, 1);
});

test("over HTTP: a ZIP attachment with its exact length, a safe file name and private, no-store caching", async (t) => {
  const f = await fixture();
  await f.add(1, { bytes: 20000 });
  await f.add(2, { kind: "video", bytes: 50000 });
  const base = await serve(t, f.app);
  const listed = await (await fetch(base + "/api/gallery/archive", { headers: f.headersFor("guest") })).json();
  const r = await fetch(base + listed.parts[0].url, { headers: f.headersFor("guest") });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "application/zip");
  assert.equal(
    r.headers.get("content-disposition"),
    `attachment; filename="sophia-xv-photos.zip"; filename*=UTF-8''sophia-xv-photos.zip`,
  );
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("accept-ranges"), null);
  const body = Buffer.from(await r.arrayBuffer());
  assert.equal(r.headers.get("content-length"), String(body.length));
  assert.equal(body.length, listed.parts[0].bytes);
  assert.equal(readZip(body).entries.length, 2);
  await new Promise((r) => setTimeout(r, 20));
  const refused = await fetch(base + "/api/gallery/archive/1", { headers: f.headersFor("link") });
  assert.equal(refused.status, 401);
  assert.deepEqual(await refused.json(), { error: "SIGN_IN_REQUIRED" });
  assert.deepEqual(
    f.logs.filter((l) => l.message === "gallery archive"),
    [{ severity: "INFO", message: "gallery archive", part: 1, parts: 1, count: 2, bytes: body.length, outcome: "complete" }],
  );
});

// Storage whose streams are slow and endless until destroyed, and which
// records what happened to them.
function trackingMedia(inner) {
  const streams = [];
  return {
    streams,
    ...inner,
    async stream(photoId, kind, start, end) {
      const record = { photoId, destroyed: false, sent: 0 };
      streams.push(record);
      const length = end - start + 1;
      const stream = new Readable({
        read() {
          if (record.fail && record.sent >= 4096) return this.destroy(Object.assign(new Error("storage dropped"), { code: "ECONNRESET" }));
          if (record.sent >= length) return this.push(null);
          // A trickle, as from a slow network: the client is faster here.
          setTimeout(() => {
            const n = Math.min(1024, length - record.sent);
            record.sent += n;
            this.push(Buffer.alloc(n, 7));
          }, 2);
        },
        destroy(e, callback) {
          record.destroyed = true;
          callback(e);
        },
      });
      return stream;
    },
  };
}
function getOnce(base, path, headers, onBody) {
  return new Promise((resolve, reject) => {
    const req = http.get(base + path, { headers }, (res) => {
      let seen = 0;
      res.on("data", (chunk) => {
        seen += chunk.length;
        onBody?.(seen, req, res);
      });
      res.on("end", () => resolve({ status: res.statusCode, seen, complete: true }));
      res.on("error", () => resolve({ status: res.statusCode, seen, complete: false }));
      res.on("aborted", () => resolve({ status: res.statusCode, seen, complete: false }));
    });
    req.on("error", (e) => (e.code === "ECONNRESET" ? resolve({ status: 0, seen: 0, complete: false }) : reject(e)));
    req.on("close", () => resolve({ status: 0, seen: 0, complete: false }));
  });
}

test("a client that goes away stops the storage read, and its one-at-a-time slot is free again", async (t) => {
  const media = trackingMedia(memoryMedia());
  const f = await fixture({ media });
  await f.add(1, { kind: "video", bytes: 2_000_000 });
  const base = await serve(t, f.app);
  await getOnce(base, "/api/gallery/archive/1", f.headersFor("guest"), (seen, req) => {
    if (seen > 8000) req.destroy();
  });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(media.streams.length, 1);
  assert.equal(media.streams[0].destroyed, true, "the storage stream was destroyed");
  assert.ok(media.streams[0].sent < 2_000_000, "and read no further");
  assert.equal((await f.guest("gallery/archive")).limits.busy, false);
  const entry = f.logs.find((l) => l.message === "gallery archive");
  assert.equal(entry.outcome, "stopped");
  assert.equal(entry.severity, "INFO");
});

test("a storage error mid-way cuts the response short instead of sending a file that looks complete", async (t) => {
  const media = trackingMedia(memoryMedia());
  const f = await fixture({ media });
  const photoId = await f.add(1, { kind: "video", bytes: 100_000 });
  const base = await serve(t, f.app);
  const original = media.stream;
  media.stream = async (...args) => {
    const s = await original(...args);
    media.streams.at(-1).fail = true;
    return s;
  };
  const result = await getOnce(base, "/api/gallery/archive/1", f.headersFor("guest"));
  assert.equal(result.complete, false);
  assert.ok(result.seen < (await f.guest("gallery/archive")).parts[0].bytes);
  await new Promise((r) => setTimeout(r, 50));
  const entry = f.logs.find((l) => l.message === "gallery archive");
  assert.deepEqual(
    { severity: entry.severity, outcome: entry.outcome, code: entry.code, id: entry.id },
    { severity: "WARNING", outcome: "failed", code: "ECONNRESET", id: photoId },
  );
  // Nothing personal is logged: ids and counts only.
  assert.equal(JSON.stringify(f.logs).includes("@"), false);
  assert.equal((await f.guest("gallery/archive")).limits.busy, false);
});
