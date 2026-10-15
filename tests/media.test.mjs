// Guest photos and videos end to end through the application (no HTTP):
// uploads in pieces, photo conversion, the scheduled video conversion, the
// family's review and the gallery. Storage is memoryMedia, which keeps Cloud
// Storage's rules for resumable uploads. All names and emails are made up.
import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { Ledger, memoryAdapter, memoryMedia, UPLOAD_UNIT } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, token } from "../server/auth.mjs";
import { createGate } from "../server/gate.mjs";
import { conversionSlot } from "../server/video.mjs";

const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-12-01T18:00:00Z"),
  household = "12345678-1234-1234-1234-123456789012",
  key = Buffer.alloc(32, 4);
const MiB = 1024 * 1024;

async function fixture(options = {}) {
  const saved = memoryAdapter(),
    ledger = new Ledger(saved),
    media = options.media || memoryMedia(),
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
  // One API instance. Rate-limit counters live in memory per ledger object.
  const launch = (ledger) =>
    createApplication({
      ledger,
      notion: {
        read: async () => structuredClone(row),
        list: async () => [structuredClone(row)],
      },
      mailer: { configured: true, send: async (m) => sent.push(m) },
      verifyGoogle: async () => ({ id: "x", email: "owner@example.com" }),
      media,
      key,
      origin,
      adminEmails: ["owner@example.com"],
      now: () => clock,
      log: (entry) => logs.push(entry),
      ...options,
    });
  let app = launch(ledger);
  // A signed-in guest (their email on the household's row), a second person
  // from another household, a link-only session, and the owner.
  const sessions = {};
  await ledger.transaction((s) => {
    s.invitations[household] = { id: household, name: row.name, active: true, generation: 1 };
    s.accounts = {};
    for (const [name, email, home] of [
      ["guest", "guest@example.com", household],
      ["other", "other@example.com", "22222222-2222-4222-8222-222222222222"],
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
        generation: 1,
        email,
        csrf: sessions[name].csrf,
        startedAt: at,
        expiresAt: at + 86400000 * 30,
      };
    }
    sessions.link = { cookie: token(), csrf: token() };
    s.sessions[hash(sessions.link.cookie)] = {
      kind: "guest",
      householdId: household,
      generation: 1,
      scope: "rsvp",
      csrf: sessions.link.csrf,
      expiresAt: at + 86400000 * 30,
    };
    sessions.admin = { cookie: token(), csrf: token() };
    s.sessions[hash(sessions.admin.cookie)] = {
      kind: "admin",
      actor: "owner",
      email: "owner@example.com",
      csrf: sessions.admin.csrf,
      expiresAt: at + 86400000 * 30,
    };
  });
  const as = (who) => (p, body, extra = {}) =>
    app.dispatch({
      path: "/api/" + p,
      method: body || extra.bytes ? "POST" : "GET",
      body: body || {},
      query: extra.query,
      bytes: extra.bytes,
      headers: {
        origin,
        cookie: "__session=" + sessions[who].cookie,
        "x-csrf-token": sessions[who].csrf,
        ...extra.headers,
      },
    });
  const guest = as("guest"),
    admin = (p, body) => as("admin")("admin/" + p, body);
  const piece = (id, offset, bytes, who = "guest") =>
    as(who)("uploads/" + id, null, { bytes, query: { offset: String(offset) } });
  const start = (bytes, { kind = "photo", type = "image/jpeg", ...rest } = {}) =>
    guest("uploads", { kind, type, size: bytes.length, album: "event", caption: "", consent: true, ...rest });
  // Sends a whole file the way the page does: pieces in order, continuing
  // from whatever count the server answers.
  async function upload(bytes, options = {}, size = 4 * UPLOAD_UNIT) {
    const { id } = await start(bytes, options);
    let offset = 0;
    for (;;) {
      const r = await piece(id, offset, bytes.subarray(offset, offset + size));
      if (r.complete) return { id, ...r };
      offset = r.received;
    }
  }
  return {
    get app() {
      return app;
    },
    // The API restarts (or the second instance answers): the same ledger and
    // storage, nothing that was kept in memory.
    restart: () => (app = launch(new Ledger(saved))),
    ledger,
    media,
    sent,
    logs,
    guest,
    other: as("other"),
    link: as("link"),
    admin,
    // The family's own requests outside /api/admin/ (viewing media to review).
    family: as("admin"),
    piece,
    start,
    upload,
    advance: (ms) => (clock += ms),
    state: () => ledger.read(),
  };
}
const photoBytes = (width = 2600, height = 1200) =>
  sharp({ create: { width, height, channels: 3, noise: { type: "gaussian", mean: 128, sigma: 40 } } })
    .withMetadata({ orientation: 6 })
    .withExif({ IFD0: { Artist: "Example Photographer" } })
    .jpeg({ quality: 92 })
    .toBuffer();
// Stands in for convertVideo: writes an output and a poster into the
// working directory, the way the real one does.
const fakeConverter = (calls = []) => async (input, directory) => {
  calls.push(input);
  const video = path.join(directory, "output.mp4"),
    poster = path.join(directory, "poster.jpg");
  await writeFile(video, Buffer.from("converted-video-bytes"));
  await writeFile(poster, Buffer.from("poster-jpeg"));
  return { video, poster, duration: 12.4 };
};
const stored = (f, kind, id) =>
  f.media.objects.get(
    { photo: `private/photos/${id}.jpg`, video: `private/videos/${id}.mp4`, poster: `private/posters/${id}.jpg`, upload: `private/uploads/${id}` }[kind],
  );
const text = async (r) => Buffer.concat(await r.stream.toArray()).toString();

test("a phone photo arrives in pieces, is re-encoded upright without its metadata, and stays private until approved", async () => {
  const f = await fixture();
  const original = await photoBytes();
  assert.ok(original.length > 4 * UPLOAD_UNIT, "big enough to need several pieces");
  const done = await f.upload(original, {}, UPLOAD_UNIT);
  assert.deepEqual(done, { id: done.id, received: original.length, complete: true, state: "review" });
  const image = sharp(stored(f, "photo", done.id));
  const meta = await image.metadata();
  assert.equal(meta.format, "jpeg");
  assert.deepEqual([meta.width, meta.height], [923, 2000], "turned upright and at most 2000 px");
  assert.equal(meta.exif, undefined, "no EXIF (camera, location) is kept");
  assert.equal(meta.orientation, undefined);
  assert.equal(stored(f, "upload", done.id), undefined, "the original is not kept");
  // The family is told, and nobody but them sees it yet.
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].subject, /New photo awaiting review/);
  assert.deepEqual((await f.guest("gallery")).media, []);
  assert.deepEqual(await f.guest("uploads/" + done.id), { state: "review" });
  const row = (await f.admin("moderation")).photos.find((p) => p.id === done.id);
  assert.equal(row.state, "pending");
  assert.ok((await f.family("photo/" + done.id)).stream, "the family can look before approving");
  await assert.rejects(f.guest("photo/" + done.id), (e) => e.code === "NOT_FOUND");
  await f.admin("moderation", { id: done.id, collection: "photos", state: "approved" });
  const [item] = (await f.guest("gallery")).media;
  assert.deepEqual(item, { id: done.id, kind: "photo", album: "event", caption: "", url: "/api/photo/" + done.id, poster: null });
  const served = await f.guest("photo/" + done.id);
  assert.equal(served.contentType, "image/jpeg");
  assert.equal(served.length, stored(f, "photo", done.id).length);
  await assert.rejects(
    f.app.dispatch({ path: "/api/photo/" + done.id }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await f.admin("moderation", { id: done.id, collection: "photos", state: "rejected" });
  assert.deepEqual((await f.guest("gallery")).media, []);
  await assert.rejects(f.guest("photo/" + done.id), (e) => e.code === "NOT_FOUND");
});

test("only bytes storage does not have are written: repeated, overlapping and early pieces get the stored count", async () => {
  const f = await fixture();
  const bytes = randomBytes(4 * UPLOAD_UNIT + 100);
  const { id } = await f.start(bytes, { kind: "video", type: "video/quicktime" });
  const at = (offset, length) => bytes.subarray(offset, offset + length);
  assert.deepEqual(await f.piece(id, 0, at(0, UPLOAD_UNIT)), { received: UPLOAD_UNIT, complete: false });
  // The answer was lost and the page sends the same piece again.
  assert.deepEqual(await f.piece(id, 0, at(0, UPLOAD_UNIT)), { received: UPLOAD_UNIT, complete: false });
  // A piece beyond what arrived is not stored; the page goes back.
  assert.deepEqual(await f.piece(id, 3 * UPLOAD_UNIT, at(3 * UPLOAD_UNIT, UPLOAD_UNIT)), { received: UPLOAD_UNIT, complete: false });
  // A bigger piece overlapping what is stored adds only its new part.
  assert.deepEqual(await f.piece(id, 0, at(0, 3 * UPLOAD_UNIT)), { received: 3 * UPLOAD_UNIT, complete: false });
  assert.deepEqual(await f.guest("uploads/" + id), { state: "receiving", received: 3 * UPLOAD_UNIT, size: bytes.length });
  const last = await f.piece(id, 3 * UPLOAD_UNIT, at(3 * UPLOAD_UNIT, UPLOAD_UNIT + 100));
  assert.deepEqual(last, { received: bytes.length, complete: true, state: "processing" });
  assert.deepEqual(stored(f, "upload", id), bytes, "storage holds exactly the file, once");
  // The last piece again (its answer was lost): same answer, nothing added twice.
  assert.deepEqual(await f.piece(id, 3 * UPLOAD_UNIT, at(3 * UPLOAD_UNIT, UPLOAD_UNIT + 100)), last);
  assert.deepEqual(await f.piece(id, 0, at(0, UPLOAD_UNIT)), last);
  const s = await f.state();
  assert.equal(Object.keys(s.photos).length, 1);
  assert.equal(s.photos[id].state, "processing");
  assert.equal(s.photos[id].kind, "video");
});

test("pieces are whole 256 KiB units except the last, at most 8 MiB, inside the file, and only from its owner", async () => {
  const f = await fixture();
  const bytes = randomBytes(3 * UPLOAD_UNIT);
  const { id } = await f.start(bytes, { kind: "video", type: "video/mp4" });
  const refused = (e) => e.status === 422 && e.code === "INVALID_PIECE";
  await assert.rejects(f.piece(id, 0, bytes.subarray(0, 1000)), refused, "not a whole unit and not the last");
  await assert.rejects(f.piece(id, 100, bytes.subarray(100, 100 + UPLOAD_UNIT)), refused, "starts mid-unit");
  await assert.rejects(f.piece(id, 0, randomBytes(4 * UPLOAD_UNIT)), refused, "past the declared size");
  await assert.rejects(f.piece(id, 0, Buffer.alloc(0)), refused, "empty");
  await assert.rejects(f.piece(id, -UPLOAD_UNIT, bytes.subarray(0, UPLOAD_UNIT)), refused);
  await assert.rejects(f.piece(id, "x", bytes.subarray(0, UPLOAD_UNIT)), refused);
  const big = await f.start(randomBytes(40 * MiB), { kind: "video", type: "video/mp4" });
  await assert.rejects(f.piece(big.id, 0, Buffer.alloc(8 * MiB + UPLOAD_UNIT)), refused, "over 8 MiB");
  // Someone else's upload does not exist for them; RSVP-only links cannot upload.
  await assert.rejects(f.piece(id, 0, bytes.subarray(0, UPLOAD_UNIT), "other"), (e) => e.code === "NOT_FOUND");
  await assert.rejects(f.other("uploads/" + id), (e) => e.code === "NOT_FOUND");
  await assert.rejects(f.piece(id, 0, bytes.subarray(0, UPLOAD_UNIT), "link"), (e) => e.code === "SIGN_IN_REQUIRED");
  await assert.rejects(
    f.link("uploads", { kind: "photo", type: "image/jpeg", size: 10, consent: true }),
    (e) => e.code === "SIGN_IN_REQUIRED",
  );
  await assert.rejects(
    f.guest("uploads/" + id, null, { bytes: bytes.subarray(0, UPLOAD_UNIT), query: { offset: "0" }, headers: { "x-csrf-token": "wrong" } }),
    (e) => e.code === "CSRF_REJECTED",
  );
  assert.equal(stored(f, "upload", id), undefined);
});

test("uploads are refused up front when too large, of an unknown or HEIC type, or without consent; 20 a day per household", async () => {
  const f = await fixture();
  const ask = (body) => f.guest("uploads", { album: "event", caption: "", consent: true, ...body });
  await assert.rejects(ask({ kind: "photo", type: "image/jpeg", size: 40 * MiB + 1 }), (e) => e.status === 413 && e.code === "PHOTO_TOO_LARGE");
  await assert.rejects(ask({ kind: "video", type: "video/quicktime", size: 300 * MiB + 1 }), (e) => e.status === 413 && e.code === "VIDEO_TOO_LARGE");
  for (const body of [
    { kind: "photo", type: "image/heic", size: 10 },
    { kind: "photo", type: "image/gif", size: 10 },
    { kind: "photo", type: "video/mp4", size: 10 },
    { kind: "video", type: "image/jpeg", size: 10 },
    { kind: "photo", type: "image/jpeg", size: 0 },
    { kind: "photo", type: "image/jpeg", size: 1.5 },
  ])
    await assert.rejects(ask(body), (e) => e.code === "INVALID_UPLOAD", JSON.stringify(body));
  await assert.rejects(ask({ kind: "photo", type: "image/jpeg", size: 10, consent: false }), (e) => e.code === "CONSENT_REQUIRED");
  await assert.rejects(ask({ kind: "photo", type: "image/jpeg", size: 10, album: "nope" }), (e) => e.code === "INVALID_ALBUM");
  // The real limits pass: a 300 MB iPhone video and a 40 MB photo.
  assert.ok((await ask({ kind: "video", type: "video/quicktime", size: 300 * MiB })).id);
  assert.ok((await ask({ kind: "photo", type: "image/jpeg", size: 40 * MiB })).id);
  for (let i = 2; i < 20; i++) await ask({ kind: "photo", type: "image/png", size: 10 });
  await assert.rejects(ask({ kind: "photo", type: "image/webp", size: 10 }), (e) => e.status === 429 && e.code === "DAILY_UPLOAD_LIMIT");
});

test("the 20 a day per household is counted in the ledger: a restart or a second instance does not reset it", async () => {
  const f = await fixture();
  const ask = () => f.guest("uploads", { kind: "video", type: "video/mp4", size: 300 * MiB, album: "event", caption: "", consent: true });
  const full = (e) => e.status === 429 && e.code === "DAILY_UPLOAD_LIMIT";
  const records = async () => Object.keys((await f.state()).uploads).length;
  // One finished photo and 11 begun (opening the 11th gives up the oldest
  // unfinished one, which still counts), then the instance restarts.
  const photo = await f.upload(await photoBytes(200, 100));
  for (let i = 0; i < 11; i++) await ask();
  f.advance(3600000);
  f.restart();
  for (let i = 0; i < 8; i++) await ask();
  const before = await records();
  await assert.rejects(ask(), full);
  // Nor does another restart, or the other instance, start the day over.
  f.restart();
  await assert.rejects(ask(), full);
  assert.equal(await records(), before, "a refused upload leaves no record");
  // A day after the first 12 began, there is room for 12 more.
  f.advance(23 * 3600000 + 1000);
  f.restart();
  for (let i = 0; i < 12; i++) await ask();
  await assert.rejects(ask(), full);
  assert.equal((await f.state()).photos[photo.id].state, "pending", "the photo itself stays");
});

test("two uploads at once for the household's last place today: one is refused as it is saved, and its storage session is cancelled", async () => {
  const f = await fixture();
  await f.ledger.transaction((s) => (s.uploadsBegun = { [household]: Array(19).fill(at - 3600000) }));
  const cancelled = [],
    cancel = f.media.cancel.bind(f.media);
  f.media.cancel = (uri) => (cancelled.push(uri), cancel(uri));
  const ask = () => f.guest("uploads", { kind: "photo", type: "image/jpeg", size: 10, album: "event", caption: "", consent: true });
  const both = await Promise.allSettled([ask(), ask()]);
  assert.deepEqual(both.map((r) => r.status).sort(), ["fulfilled", "rejected"]);
  const { reason } = both.find((r) => r.status === "rejected");
  assert.equal(reason.code, "DAILY_UPLOAD_LIMIT");
  assert.equal(Object.keys((await f.state()).uploads).length, 1);
  assert.equal(cancelled.length, 1, "nothing is left open in storage");
  // The page can then tell the guest plainly, without opening anything more.
  await assert.rejects(ask(), (e) => e.code === "DAILY_UPLOAD_LIMIT");
  assert.equal(cancelled.length, 1);
});

test("a HEIC photo, or a file that is not a photo, is refused after its last piece with a reason, and nothing is kept", async () => {
  const f = await fixture();
  const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), randomBytes(500)]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
  for (const [bytes, code] of [
    [heic, "HEIC_NOT_SUPPORTED"],
    [svg, "INVALID_PHOTO"],
    [randomBytes(300), "INVALID_PHOTO"],
  ]) {
    const { id } = await f.start(bytes);
    await assert.rejects(f.piece(id, 0, bytes), (e) => e.status === 422 && e.code === code);
    // Sent again, the same answer: the refusal is remembered.
    await assert.rejects(f.piece(id, 0, bytes), (e) => e.code === code);
    assert.deepEqual(await f.guest("uploads/" + id), { state: "failed", problem: code });
    assert.equal(stored(f, "upload", id), undefined);
  }
  const s = await f.state();
  assert.deepEqual(s.photos, {});
  assert.equal(f.sent.length, 0, "the family is not asked to review nothing");
});

test("a busy photo converter answers PHOTO_BUSY, and the same last piece sent later finishes the photo once (SEC-13)", async () => {
  let busy = true;
  const gate = createGate({ max: 1, queue: 0 });
  const f = await fixture({
    photoGate: (task) => (busy ? Promise.reject(Object.assign(new Error(), { status: 503, code: "PHOTO_BUSY" })) : gate(task)),
  });
  const bytes = await photoBytes(400, 300);
  const { id } = await f.start(bytes);
  await assert.rejects(f.piece(id, 0, bytes), (e) => e.status === 503 && e.code === "PHOTO_BUSY");
  assert.deepEqual(await f.guest("uploads/" + id), { state: "receiving", received: bytes.length, size: bytes.length });
  busy = false;
  assert.equal((await f.piece(id, 0, bytes)).state, "review");
  assert.equal(Object.keys((await f.state()).photos).length, 1);
});

test("a video waits for the scheduled conversion, and the family can approve it once it plays, with a poster", async () => {
  const calls = [];
  const f = await fixture({ videoProcessor: fakeConverter(calls) });
  const original = randomBytes(3 * UPLOAD_UNIT + 7);
  const { id, state } = await f.upload(original, { kind: "video", type: "video/quicktime", caption: "First dance", album: "friends" });
  assert.equal(state, "processing");
  assert.deepEqual(await f.guest("uploads/" + id), { state: "processing", problem: null });
  assert.equal(f.sent.length, 0, "nothing to review yet");
  await assert.rejects(
    f.admin("moderation", { id, collection: "photos", state: "approved" }),
    (e) => e.status === 409 && e.code === "MEDIA_NOT_READY",
  );
  await assert.rejects(f.family("photo/" + id), (e) => e.code === "NOT_FOUND", "nothing to play yet");
  const result = await f.app.processMedia();
  assert.deepEqual(result, { converted: 1, refused: 0, retrying: 0, abandoned: 0 });
  assert.equal(calls.length, 1);
  assert.equal(stored(f, "upload", id), undefined, "the original is deleted once converted");
  assert.equal(stored(f, "video", id).toString(), "converted-video-bytes");
  assert.equal(stored(f, "poster", id).toString(), "poster-jpeg");
  const row = (await f.state()).photos[id];
  assert.equal(row.state, "pending");
  assert.equal(row.poster, true);
  assert.equal(row.duration, 12);
  assert.equal(row.lease, undefined);
  assert.match(f.sent.at(-1).subject, /New video awaiting review/);
  assert.deepEqual(await f.guest("uploads/" + id), { state: "review" });
  // A second run finds nothing to do and writes nothing.
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  await f.admin("moderation", { id, collection: "photos", state: "approved" });
  const [item] = (await f.guest("gallery")).media;
  assert.deepEqual(item, {
    id,
    kind: "video",
    album: "friends",
    caption: "First dance",
    url: "/api/photo/" + id,
    poster: "/api/photo/" + id + "?poster=1",
  });
  const part = await f.guest("photo/" + id, null, { headers: { range: "bytes=10-" } });
  assert.equal(part.status, 206);
  assert.equal(part.contentType, "video/mp4");
  assert.equal(part.contentRange, "bytes 10-20/21");
  assert.equal(await text(part), "video-bytes");
  const poster = await f.guest("photo/" + id, null, { query: { poster: "1" } });
  assert.equal(poster.contentType, "image/jpeg");
  assert.equal(await text(poster), "poster-jpeg");
  // An album holding media cannot be removed, and revoking the household's
  // invitation ends playback on the next request.
  const { site } = await f.admin("site");
  site.albums = site.albums.filter((a) => a.id !== "friends");
  await assert.rejects(f.admin("site", site), (e) => e.code === "ALBUM_HAS_MEDIA");
  await f.admin("revoke", { id: household });
  await assert.rejects(f.guest("photo/" + id), (e) => e.code === "SIGN_IN_REQUIRED");
});

test("a video that can never play is marked with its reason; a server problem is retried, then given up after 3 tries", async () => {
  let answer;
  const media = memoryMedia(),
    downloads = [],
    download = media.download.bind(media);
  media.download = (id, ...rest) => (downloads.push(id), download(id, ...rest));
  const f = await fixture({
    media,
    videoProcessor: async () => {
      throw answer;
    },
  });
  const tooLong = await f.upload(randomBytes(1000), { kind: "video", type: "video/mp4" });
  answer = Object.assign(new Error(), { status: 422, code: "VIDEO_TOO_LONG" });
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 1, retrying: 0, abandoned: 0 });
  assert.deepEqual(await f.guest("uploads/" + tooLong.id), { state: "failed", problem: "VIDEO_TOO_LONG" });
  assert.equal(stored(f, "upload", tooLong.id), undefined);
  await assert.rejects(
    f.admin("moderation", { id: tooLong.id, collection: "photos", state: "approved" }),
    (e) => e.code === "MEDIA_NOT_READY",
  );
  // The family can still clear it from the list.
  await f.admin("moderation", { id: tooLong.id, collection: "photos", state: "rejected" });

  const slow = await f.upload(randomBytes(1000), { kind: "video", type: "video/mp4" });
  answer = Object.assign(new Error(), { status: 503, code: "VIDEO_TIMEOUT" });
  for (const attempt of [1, 2]) {
    assert.deepEqual(await f.app.processMedia({ budgetMs: 0 }), { converted: 0, refused: 0, retrying: 0, abandoned: 0 }, "no budget, no start");
    assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 1, abandoned: 0 });
    const row = (await f.state()).photos[slow.id];
    assert.equal(row.state, "processing");
    assert.equal(row.attempts, attempt);
    assert.ok(stored(f, "upload", slow.id), "kept for the next try");
    assert.ok(f.logs.some((l) => l.message === "video conversion will be retried" && l.code === "VIDEO_TIMEOUT"));
  }
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 1, retrying: 0, abandoned: 0 });
  assert.deepEqual(await f.guest("uploads/" + slow.id), { state: "failed", problem: "PROCESSING_FAILED" });

  // This instance is still converting (the previous run, say): the run ends
  // before it claims or downloads anything, and the video waits untouched.
  const waiting = await f.upload(randomBytes(1000), { kind: "video", type: "video/mp4" });
  const running = conversionSlot(),
    fetched = downloads.length;
  try {
    assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  } finally {
    running.release();
  }
  assert.equal(downloads.length, fetched, "nothing downloaded");
  assert.equal((await f.state()).photos[waiting.id].lease, undefined, "not claimed");
  assert.equal((await f.state()).photos[waiting.id].attempts, undefined, "no attempt used");
  assert.ok(f.logs.some((l) => l.message === "media job skipped: this instance is converting a video"));
  // A video another instance is converting (its lease is current) is left alone.
  await f.ledger.transaction((s) => (s.photos[waiting.id].lease = Date.parse("2026-12-01T18:05:00Z")));
  answer = Object.assign(new Error(), { status: 422, code: "INVALID_VIDEO" });
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  f.advance(10 * 60000);
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 1, retrying: 0, abandoned: 0 }, "after the lease ends");
});

test("a video whose conversion takes the instance down with it is given up on the 4th run, without converting it again", async () => {
  const calls = [];
  let converting;
  const f = await fixture({
    videoProcessor: async (input, directory, { slot }) => {
      calls.push(input);
      if (calls.length > 3) throw Object.assign(new Error(), { status: 503, code: "VIDEO_TIMEOUT" });
      // The instance is killed mid-conversion (out of memory, say): nothing
      // after this runs or is saved, and its slot and /tmp go with it.
      slot.release();
      await rm(directory, { recursive: true, force: true });
      converting();
      return new Promise(() => {});
    },
  });
  const { id } = await f.upload(randomBytes(1000), { kind: "video", type: "video/mp4" });
  for (const attempt of [1, 2, 3]) {
    await new Promise((resolve) => {
      converting = resolve;
      f.app.processMedia(); // never returns
    });
    const row = (await f.state()).photos[id];
    assert.equal(row.state, "processing");
    assert.equal(row.attempts, attempt);
    assert.ok(row.lease, "claimed, and no outcome was ever recorded");
    // The next scheduled run on a fresh instance, after the lease ran out.
    f.advance(10 * 60000 + 1000);
  }
  assert.equal(calls.length, 3);
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 1, retrying: 0, abandoned: 0 });
  assert.equal(calls.length, 3, "not converted a 4th time");
  const row = (await f.state()).photos[id];
  assert.equal(row.state, "failed");
  assert.equal(row.problem, "PROCESSING_FAILED");
  assert.equal(row.lease, undefined);
  assert.equal(stored(f, "upload", id), undefined, "the original is removed");
  assert.deepEqual(await f.guest("uploads/" + id), { state: "failed", problem: "PROCESSING_FAILED" });
  assert.ok(f.logs.some((l) => l.severity === "ERROR" && /given up/.test(l.message) && l.attempts === 3));
  // Never leased again.
  f.advance(10 * 60000 + 1000);
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  assert.equal((await f.state()).photos[id].lease, undefined);
  assert.equal(calls.length, 3);
});

test("removing a video before it is converted discards the original, and the media job skips it", async () => {
  const calls = [];
  const f = await fixture({ videoProcessor: fakeConverter(calls) });
  const { id } = await f.upload(randomBytes(2000), { kind: "video", type: "video/webm" });
  await f.admin("moderation", { id, collection: "photos", state: "rejected" });
  assert.equal(stored(f, "upload", id), undefined);
  assert.deepEqual(await f.app.processMedia(), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  assert.equal(calls.length, 0);
});

test("the media job runs only for Cloud Scheduler's signed token", async () => {
  const call = (f, authorization) =>
    f.app.dispatch({ path: "/api/internal/media", method: "POST", body: {}, headers: { authorization } });
  const off = await fixture();
  await assert.rejects(call(off, "Bearer anything"), (e) => e.status === 404, "off without the scheduler settings");
  const on = await fixture({ verifyScheduler: async (h) => h === "Bearer good-token-for-tests" });
  await assert.rejects(call(on, "Bearer forged-token-for-tests"), (e) => e.status === 401);
  assert.deepEqual(await call(on, "Bearer good-token-for-tests"), { converted: 0, refused: 0, retrying: 0, abandoned: 0 });
  await assert.rejects(
    on.app.dispatch({ path: "/api/internal/media", method: "GET", headers: { authorization: "Bearer good-token-for-tests" } }),
    (e) => e.status === 405,
  );
});

test("unfinished uploads are given up after a day, and a person keeps at most one batch (10) open", async () => {
  const f = await fixture();
  const bytes = randomBytes(2 * UPLOAD_UNIT);
  const first = await f.start(bytes, { kind: "video", type: "video/mp4" });
  await f.piece(first.id, 0, bytes.subarray(0, UPLOAD_UNIT));
  for (let i = 0; i < 9; i++) await f.start(bytes, { kind: "video", type: "video/mp4" });
  assert.equal(Object.keys((await f.state()).uploads).length, 10);
  // The 11th gives up the oldest unfinished one.
  await f.start(bytes, { kind: "video", type: "video/mp4" });
  assert.equal((await f.state()).uploads[first.id], undefined);
  await assert.rejects(f.piece(first.id, UPLOAD_UNIT, bytes.subarray(UPLOAD_UNIT)), (e) => e.code === "NOT_FOUND");
  // Opening a 12th gives up the next oldest; once finished, it is not "open".
  const done = await f.upload(await photoBytes(200, 100));
  f.advance(86400000 + 1000);
  const result = await f.app.processMedia();
  assert.equal(result.abandoned, 9);
  assert.deepEqual((await f.state()).uploads, {}, "finished and abandoned records are both gone");
  assert.deepEqual((await f.state()).uploadsBegun, {}, "and so is the day's count");
  assert.equal((await f.state()).photos[done.id].state, "pending", "the photo itself stays");
  // Nothing is left in storage from the abandoned ones.
  assert.deepEqual([...f.media.objects.keys()].filter((k) => k.startsWith("private/uploads/")), []);
});

test("pieces have their own hourly budget instead of the 120 actions an hour", async () => {
  const f = await fixture();
  const bytes = randomBytes(2 * UPLOAD_UNIT);
  const { id } = await f.start(bytes, { kind: "video", type: "video/mp4" });
  for (let i = 0; i < 150; i++) await f.piece(id, 0, bytes.subarray(0, UPLOAD_UNIT));
  assert.equal((await f.piece(id, UPLOAD_UNIT, bytes.subarray(UPLOAD_UNIT))).complete, true);
});
