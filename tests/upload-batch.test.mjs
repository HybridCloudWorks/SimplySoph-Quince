import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  classify,
  createUploadBatch,
  sendUploadBatch,
  progress,
  uploadAccept,
  uploadLimits,
} from "../site/upload-batch.mjs";
import * as batch from "../site/upload-batch.mjs";

const MB = 1024 * 1024,
  UNIT = uploadLimits.unit;
// A file as the browser hands it over: a name, a type (sometimes empty) and a size.
const file = (name, type, size = 100) => ({ name, type, size });
const real = (name, type, bytes) => new File([bytes], name, { type });

test("what phones actually send is accepted: iPhone .mov, Android .mp4, JPEG from Photos, by type or extension", () => {
  const cases = [
    [file("IMG_0001.MOV", "video/quicktime"), "video", "video/quicktime"],
    // Some browsers (and Windows) give no type for .mov; the extension decides.
    [file("IMG_0002.MOV", ""), "video", "video/quicktime"],
    [file("clip.mov", "application/octet-stream"), "video", "video/quicktime"],
    [file("PXL_20270115.mp4", "video/mp4"), "video", "video/mp4"],
    [file("VID.m4v", "video/x-m4v"), "video", "video/x-m4v"],
    [file("screen.webm", "video/webm"), "video", "video/webm"],
    [file("IMG_0003.JPG", "image/jpeg"), "photo", "image/jpeg"],
    [file("photo.jpeg", ""), "photo", "image/jpeg"],
    [file("screenshot.png", "image/png"), "photo", "image/png"],
    [file("photo.webp", "image/webp"), "photo", "image/webp"],
  ];
  for (const [f, kind, type] of cases) assert.deepEqual(classify(f), { kind, type }, f.name);
  // HEIC is named, so the page can say what to do; anything else is "type".
  assert.equal(classify(file("IMG_0004.HEIC", "image/heic")).problem, "heic");
  assert.equal(classify(file("IMG_0005.heic", "")).problem, "heic");
  assert.equal(classify(file("IMG_0006.HEIF", "image/heif")).problem, "heic");
  assert.equal(classify(file("anim.gif", "image/gif")).problem, "type");
  assert.equal(classify(file("notes.pdf", "application/pdf")).problem, "type");
  assert.equal(classify(file("no-extension", "")).problem, "type");
  // The chooser offers .mov but not HEIC, so iPhones hand over JPEG.
  assert.match(uploadAccept, /video\/quicktime/);
  assert.match(uploadAccept, /\.mov/);
  assert.doesNotMatch(uploadAccept, /heic|heif|image\/\*/i);
});

test("limits are real phone sizes: photos up to 40 MB, videos up to 300 MB, 10 files at a time", () => {
  const rows = createUploadBatch([
    file("48mp.jpg", "image/jpeg", 40 * MB),
    file("huge.jpg", "image/jpeg", 40 * MB + 1),
    file("one-minute-4k.MOV", "video/quicktime", 170 * MB),
    file("android-1080p.mp4", "video/mp4", 130 * MB),
    file("too-big.mp4", "video/mp4", 300 * MB + 1),
    file("empty.jpg", "image/jpeg", 0),
    file("IMG.HEIC", "image/heic", 3 * MB),
    file("doc.pdf", "application/pdf"),
  ]);
  assert.deepEqual(
    rows.map((r) => [r.kind, r.problem]),
    [
      ["photo", null],
      ["photo", "photo-size"],
      ["video", null],
      ["video", null],
      ["video", "video-size"],
      ["photo", "empty"],
      [null, "heic"],
      [null, "type"],
    ],
  );
  assert.throws(() => createUploadBatch(Array.from({ length: 11 }, () => file("a.jpg", "image/jpeg"))), /BATCH_SIZE/);
  assert.throws(() => createUploadBatch([]), /BATCH_SIZE/);
});

// The API as the page sees it: start an upload, then pieces that answer with
// how much is stored (server/application.mjs). Pieces must be whole 256 KiB
// units except the last. `before(call)` can throw to stand in for a failure.
function fakeApi({ before = () => {}, after = () => {} } = {}) {
  const uploads = new Map(),
    calls = [];
  let n = 0;
  return {
    uploads,
    calls,
    transport: {
      async start(entry) {
        calls.push({ start: entry.file.name });
        await before({ start: entry.file.name });
        const id = "upload-" + ++n;
        uploads.set(id, { name: entry.file.name, size: entry.size, kind: entry.kind, bytes: Buffer.alloc(0) });
        return { id };
      },
      async put(id, offset, blob, onBytes) {
        const u = uploads.get(id),
          bytes = Buffer.from(await blob.arrayBuffer()),
          call = { id, offset, length: bytes.length };
        calls.push(call);
        await before(call);
        if (offset + bytes.length < u.size) assert.equal(bytes.length % UNIT, 0, "whole units until the last piece");
        if (offset <= u.bytes.length && offset + bytes.length > u.bytes.length)
          u.bytes = Buffer.concat([u.bytes, bytes.subarray(u.bytes.length - offset)]);
        onBytes(bytes.length);
        const complete = u.bytes.length === u.size;
        await after(call, u);
        return { received: u.bytes.length, complete, state: complete ? (u.kind === "video" ? "processing" : "review") : undefined };
      },
    },
  };
}
const quick = { sleep: async () => {}, clock: () => 0 };

test("files go one at a time, in pieces that grow on a fast connection, with progress per file", async () => {
  const api = fakeApi(),
    video = randomBytes(20 * MB + 123),
    photo = randomBytes(3 * MB);
  const rows = createUploadBatch([real("clip.MOV", "video/quicktime", video), real("photo.jpg", "image/jpeg", photo)]);
  const seen = [];
  await sendUploadBatch(rows, api.transport, () => seen.push(rows.map(progress)), quick);
  assert.deepEqual(rows.map((r) => r.state), ["processing", "received"], "a video is converted next; a photo is in");
  assert.deepEqual([...api.uploads.values()].map((u) => u.bytes), [video, photo], "each file arrived whole, once");
  const pieces = api.calls.filter((c) => c.id === "upload-1").map((c) => c.length);
  assert.deepEqual(pieces.slice(0, 3), [2 * MB, 4 * MB, 8 * MB], "2 MiB first, doubling while fast");
  assert.ok(pieces.every((p) => p <= 8 * MB), "never over 8 MiB");
  assert.ok(seen.some(([v]) => v > 0 && v < 100), "progress moves while a file is sending");
  assert.deepEqual(seen.at(-1), [100, 100]);
  // Strictly sequential: the photo starts only after the video finished.
  const order = api.calls.map((c) => c.start || c.id);
  assert.ok(order.lastIndexOf("upload-1") < order.indexOf("photo.jpg"));
});

test("a slow connection gets smaller pieces, and a timed-out piece is retried smaller", async () => {
  let time = 0,
    timedOut = false;
  const api = fakeApi({
    before: (call) => {
      if (call.id && call.offset === 2 * MB && !timedOut) {
        timedOut = true;
        throw Object.assign(new Error("timeout"), { timeout: true });
      }
      time += 25000; // every piece takes 25 s
    },
  });
  const rows = createUploadBatch([real("slow.mp4", "video/mp4", randomBytes(6 * MB))]);
  await sendUploadBatch(rows, api.transport, () => {}, { sleep: async () => {}, clock: () => time });
  assert.equal(rows[0].state, "processing");
  const pieces = api.calls.filter((c) => c.id).map((c) => [c.offset / MB, c.length / MB]);
  assert.deepEqual(pieces.slice(0, 3), [[0, 2], [2, 1], [2, 0.25]], "halved when slow, quartered after a timeout");
});

test("a dropped connection is retried from what the server has; a lost answer never stores a byte twice", async () => {
  let drops = 0;
  const api = fakeApi({
    // The piece at 4 MiB is stored, but its answer is lost twice.
    after: (call) => {
      if (call.offset === 6 * MB && drops < 2) {
        drops++;
        throw new TypeError("Failed to fetch");
      }
    },
  });
  const waits = [];
  const bytes = randomBytes(9 * MB + 5);
  const rows = createUploadBatch([real("party.mp4", "video/mp4", bytes)]);
  await sendUploadBatch(rows, api.transport, () => {}, { ...quick, sleep: async (ms) => waits.push(ms) });
  assert.equal(rows[0].state, "processing");
  assert.deepEqual(api.uploads.get("upload-1").bytes, bytes, "the file arrived exactly once");
  assert.deepEqual(waits, [1000, 3000], "short waits between tries");
  assert.equal(api.calls.filter((c) => c.start).length, 1, "the upload was not started again");
});

test("after a few tries a file pauses, the batch stops there, and Try again resumes where the server is", async () => {
  let online = false;
  const api = fakeApi({
    before: (call) => {
      if (!online && call.id && call.offset >= 2 * MB) throw new TypeError("Failed to fetch");
    },
  });
  const first = randomBytes(5 * MB),
    second = randomBytes(MB);
  const rows = createUploadBatch([real("a.mp4", "video/mp4", first), real("b.jpg", "image/jpeg", second)]);
  await sendUploadBatch(rows, api.transport, () => {}, quick);
  assert.deepEqual(rows.map((r) => r.state), ["paused", "queued"], "the second file waits");
  assert.equal(rows[0].sent, 2 * MB, "what arrived is kept");
  assert.equal(progress(rows[0]), 40);
  online = true;
  await sendUploadBatch(rows, api.transport, () => {}, quick);
  assert.deepEqual(rows.map((r) => r.state), ["processing", "received"]);
  assert.deepEqual([...api.uploads.values()].map((u) => u.bytes), [first, second]);
  assert.equal(api.calls.filter((c) => c.start).length, 2, "one upload each, resumed rather than restarted");
});

// Round 2 review, section 4: at the 21st file the summary said "paused, check
// your connection and tap Try again" while the limit could not pass for hours.
// This test used to assert exactly that ("a limit pauses at once": the limited
// file "paused", the next one "queued"). A limit is now its own outcome: the
// file and every later one are "limited", with the server's reset time, and
// none of them can be tried again before it.
test("a refusal is final for that file only; a limit stops the batch with its reset time and no early retry; nothing invalid is sent", async () => {
  const retryAt = "2027-01-16T03:15:00.000Z";
  const api = fakeApi({
    before: (call) => {
      if (call.start === "long.mov")
        throw Object.assign(new Error("This video is longer than 60 seconds."), { status: 422, code: "VIDEO_TOO_LONG" });
      if (call.start === "limit.jpg")
        throw Object.assign(new Error("Your family has reached its limit."), {
          status: 429,
          code: "DAILY_UPLOAD_LIMIT",
          details: { error: "DAILY_UPLOAD_LIMIT", reason: "quota", limit: 60, used: 60, retryAt, scope: "family" },
        });
    },
  });
  const waits = [];
  const rows = createUploadBatch([
    real("long.mov", "video/quicktime", randomBytes(1000)),
    real("IMG.HEIC", "image/heic", randomBytes(1000)),
    real("ok.png", "image/png", randomBytes(1000)),
    real("limit.jpg", "image/jpeg", randomBytes(1000)),
    real("after.jpg", "image/jpeg", randomBytes(1000)),
  ]);
  await sendUploadBatch(rows, api.transport, () => {}, { ...quick, sleep: async (ms) => waits.push(ms) });
  assert.deepEqual(rows.map((r) => r.state), ["rejected", "invalid", "received", "limited", "limited"]);
  assert.equal(rows[0].message, "This video is longer than 60 seconds.");
  assert.equal(rows[0].reason, "validation");
  assert.deepEqual(
    [rows[3].reason, rows[3].limit, rows[3].retryAt, rows[4].reason, rows[4].retryAt],
    ["quota", 60, Date.parse(retryAt), "quota", Date.parse(retryAt)],
  );
  assert.deepEqual(waits, [], "no quick retries for a refusal or a limit");
  assert.ok(!api.calls.some((c) => c.start === "IMG.HEIC"), "the HEIC photo never left the phone");
  assert.ok(!api.calls.some((c) => c.start === "after.jpg"), "nothing more is asked once the limit is reached");
  // Try again is only for what can succeed: not before the reset time.
  assert.equal(batch.retryable(rows[3], Date.parse(retryAt) - 1), false);
  assert.equal(batch.retryable(rows[3], Date.parse(retryAt)), true);
  assert.equal(batch.retryable(rows[0], Date.parse(retryAt)), false, "a refused file never is");
});

test("each failure is classified once: only a dropped connection or a busy server is tried again at once", () => {
  const kind = (err) => batch.failureKind(err);
  const e = (status, code, extra = {}) => Object.assign(new Error(code || ""), { status, code, ...extra });
  assert.equal(kind(new TypeError("Failed to fetch")), "network");
  assert.equal(kind(e(undefined, undefined, { timeout: true })), "network");
  assert.equal(kind(e(408, "REQUEST_TIMEOUT")), "network");
  assert.equal(kind(e(503, "UPLOAD_BUSY")), "busy");
  assert.equal(kind(e(503, "UPLOAD_STORAGE_BUSY")), "busy");
  assert.equal(kind(e(502)), "busy", "a proxy's error page");
  assert.equal(kind(e(409, "CONFLICT")), "busy");
  assert.equal(kind(e(429, "DAILY_UPLOAD_LIMIT")), "quota");
  assert.equal(kind(e(429, "PARTY_DEVICE_LIMIT")), "quota");
  assert.equal(kind(e(429, "PARTY_CARD_FULL")), "quota");
  assert.equal(kind(e(429, "TOO_MANY_REQUESTS")), "rate");
  assert.equal(kind(e(401, "SIGN_IN_REQUIRED")), "auth");
  assert.equal(kind(e(403, "CSRF_REJECTED")), "auth");
  assert.equal(kind(e(403, "PARTY_CLOSED")), "auth");
  assert.equal(kind(e(422, "INVALID_PHOTO")), "validation");
  assert.equal(kind(e(413, "PHOTO_TOO_LARGE")), "validation");
  assert.equal(kind(e(410, "UPLOAD_EXPIRED")), "validation");
});

test("a rate limit waits for its time; a busy server and a lost connection pause with their own reason; a lost sign-in stops", async () => {
  const at = "2027-01-15T22:00:00.000Z";
  const run = async (failure, names = ["a.jpg", "b.jpg"]) => {
    const waits = [];
    const api = fakeApi({ before: (call) => call.start === "a.jpg" && failure() });
    const rows = createUploadBatch(names.map((n) => real(n, "image/jpeg", randomBytes(1000))));
    await sendUploadBatch(rows, api.transport, () => {}, { ...quick, sleep: async (ms) => waits.push(ms) });
    return { rows, waits, api };
  };
  const rate = await run(() => {
    throw Object.assign(new Error("Wait"), { status: 429, code: "TOO_MANY_REQUESTS", details: { reason: "rate", retryAt: at } });
  });
  assert.deepEqual(rate.rows.map((r) => [r.state, r.reason]), [["waiting", "rate"], ["queued", undefined]]);
  assert.equal(rate.rows[0].retryAt, Date.parse(at));
  assert.deepEqual(rate.waits, [], "an hourly budget does not pass in seconds");
  assert.equal(batch.retryable(rate.rows[0], Date.parse(at) - 1), false);
  assert.equal(batch.retryable(rate.rows[0], Date.parse(at)), true);

  const busy = await run(() => {
    throw Object.assign(new Error(""), { status: 503, code: "UPLOAD_BUSY" });
  });
  assert.deepEqual(busy.rows.map((r) => [r.state, r.reason]), [["paused", "busy"], ["queued", undefined]]);
  assert.equal(busy.waits.length, 4, "a busy server gets the quick retries first");
  assert.equal(batch.retryable(busy.rows[0], 0), true);

  const offline = await run(() => {
    throw new TypeError("Failed to fetch");
  });
  assert.deepEqual(offline.rows.map((r) => [r.state, r.reason]), [["paused", "network"], ["queued", undefined]]);
  assert.equal(offline.waits.length, 4);
  assert.equal(batch.retryable(offline.rows[0], 0), true);

  const signedOut = await run(() => {
    throw Object.assign(new Error("Your sign-in ended."), { status: 401, code: "SIGN_IN_REQUIRED" });
  });
  assert.deepEqual(signedOut.rows.map((r) => [r.state, r.reason]), [["blocked", "auth"], ["queued", undefined]]);
  assert.deepEqual(signedOut.waits, []);
  assert.equal(signedOut.api.calls.filter((c) => c.start).length, 1, "the next file is not tried with a lost sign-in");
  assert.equal(batch.retryable(signedOut.rows[0], Date.parse(at)), false);
});

// An MP4/MOV file reduced to the boxes the length check reads.
const mp4Box = (type, ...parts) => {
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, "ascii");
  return Buffer.concat([head, body]);
};
const mvhd = (scale, length, version = 0) => {
  const b = Buffer.alloc(version ? 32 : 20);
  b.writeUInt8(version, 0);
  if (version) {
    b.writeUInt32BE(scale, 20);
    b.writeBigUInt64BE(BigInt(length), 24);
  } else {
    b.writeUInt32BE(scale, 12);
    b.writeUInt32BE(length, 16);
  }
  return mp4Box("mvhd", b);
};

test("a video's length is read from the file itself, so one over a minute is caught before it is sent", async () => {
  // Camera files put the movie header after the media data.
  const camera = Buffer.concat([
    mp4Box("ftyp", Buffer.from("qt  \0\0\0\0qt  ")),
    mp4Box("wide"),
    mp4Box("mdat", randomBytes(5000)),
    mp4Box("moov", mvhd(600, 600 * 75), mp4Box("trak", Buffer.alloc(20))),
  ]);
  const { videoSeconds, checkVideoLengths } = await import("../site/upload-batch.mjs");
  assert.equal(await videoSeconds(real("IMG.MOV", "video/quicktime", camera)), 75);
  // 64-bit sizes and a version-1 header, as long recordings use.
  const largeMdat = Buffer.alloc(16);
  largeMdat.writeUInt32BE(1);
  largeMdat.write("mdat", 4, "ascii");
  largeMdat.writeBigUInt64BE(16n + 100n, 8);
  const long = Buffer.concat([
    mp4Box("ftyp", Buffer.from("isom")),
    largeMdat,
    randomBytes(100),
    mp4Box("moov", mp4Box("udta"), mvhd(90000, 90000 * 59.5, 1)),
  ]);
  assert.equal(await videoSeconds(real("PXL.mp4", "video/mp4", long)), 59.5);
  // Anything it cannot read is left to the server.
  for (const bytes of [Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]), randomBytes(64), Buffer.alloc(0), camera.subarray(0, 60)])
    assert.equal(await videoSeconds(real("x.webm", "video/webm", bytes)), null);
  const rows = createUploadBatch([
    real("long.MOV", "video/quicktime", camera),
    real("ok.mp4", "video/mp4", long),
    real("photo.jpg", "image/jpeg", randomBytes(10)),
  ]);
  await checkVideoLengths(rows);
  assert.deepEqual(rows.map((r) => r.problem), ["video-long", null, null]);
  assert.equal(rows[0].seconds, 75);
});

test("a server that keeps answering without taking bytes pauses the file instead of looping", async () => {
  const api = fakeApi();
  api.transport.put = async () => ({ received: 0, complete: false });
  const rows = createUploadBatch([real("stuck.mp4", "video/mp4", randomBytes(3 * MB))]);
  await sendUploadBatch(rows, api.transport, () => {}, quick);
  assert.equal(rows[0].state, "paused");
});
