// The HTTP side of guest media (server/http.mjs): upload pieces travel as raw
// bytes (not base64 JSON), stored media is streamed with byte ranges, and a
// whole upload works end to end through the real server and application.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { createHttpServer } from "../server/http.mjs";
import { createApplication } from "../server/application.mjs";
import { Ledger, memoryAdapter, memoryMedia, UPLOAD_UNIT } from "../server/store.mjs";
import { hash, token } from "../server/auth.mjs";

const origin = "https://misxv.simplysoph.com",
  piecePath = "/api/uploads/12345678-1234-4234-8234-123456789012";

async function serve(t, app) {
  const server = createHttpServer({ app, root: process.cwd(), origin });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  return "http://127.0.0.1:" + server.address().port;
}
const pieceRequest = (body, type = "application/octet-stream") => ({
  method: "POST",
  headers: { origin, "content-type": type, cookie: "__session=someone" },
  body,
});

test("an upload piece is raw bytes: JSON is refused, the bytes reach the app as sent, and 8 MiB is the most", async (t) => {
  const seen = [];
  const base = await serve(t, {
    canUpload: async () => "account:someone",
    dispatch: async (req) => (seen.push(req), { received: req.bytes.length, complete: false }),
  });
  const bytes = randomBytes(UPLOAD_UNIT);
  const json = await fetch(base + piecePath + "?offset=0", pieceRequest(JSON.stringify({ base64: "eA==" }), "application/json"));
  assert.equal(json.status, 415);
  assert.equal(seen.length, 0);
  const ok = await fetch(base + piecePath + "?offset=262144", pieceRequest(bytes));
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { received: UPLOAD_UNIT, complete: false });
  assert.deepEqual(seen[0].bytes, bytes);
  assert.deepEqual(seen[0].body, {});
  assert.deepEqual(seen[0].query, { offset: "262144" });
  const big = await fetch(base + piecePath + "?offset=0", pieceRequest(Buffer.alloc(8 * 1024 * 1024 + 1)));
  assert.equal(big.status, 413);
  assert.equal((await big.json()).error, "BODY_TOO_LARGE");
  assert.equal(seen.length, 1);
  // Other routes keep the JSON rule, and their small body limit.
  const start = await fetch(base + "/api/uploads", pieceRequest(bytes));
  assert.equal(start.status, 415);
});

test("stored media streams with its length and byte range, and a storage failure mid-way cuts the response", async (t) => {
  let fail = false;
  const base = await serve(t, {
    dispatch: async () => ({
      stream: Readable.from(
        (async function* () {
          yield Buffer.from("23");
          if (fail) throw new Error("storage dropped");
          yield Buffer.from("45");
        })(),
      ),
      length: 4,
      contentType: "video/mp4",
      disposition: 'inline; filename="sophia-x.mp4"',
      acceptRanges: true,
      status: 206,
      contentRange: "bytes 2-5/10",
    }),
  });
  const r = await fetch(base + "/api/photo/x", { headers: { range: "bytes=2-5" } });
  assert.equal(r.status, 206);
  assert.equal(r.headers.get("content-length"), "4");
  assert.equal(r.headers.get("content-range"), "bytes 2-5/10");
  assert.equal(r.headers.get("accept-ranges"), "bytes");
  assert.equal(r.headers.get("content-type"), "video/mp4");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(await r.text(), "2345");
  fail = true;
  const cut = await fetch(base + "/api/photo/x");
  await assert.rejects(cut.text(), "the body ends early instead of looking complete");
});

test("a photo uploads end to end through the real server: opened, sent in pieces, finished and reported", async (t) => {
  const ledger = new Ledger(memoryAdapter()),
    media = memoryMedia(),
    key = Buffer.alloc(32, 9),
    household = "12345678-1234-1234-1234-123456789012",
    accountId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
  const app = createApplication({
    ledger,
    media,
    key,
    origin,
    notion: {
      read: async () => ({ id: household, name: "Example", email: "guest@example.com", validCapacity: true, archived: false }),
      list: async () => [],
    },
    mailer: { configured: false },
    verifyGoogle: async () => ({}),
    adminEmails: ["owner@example.com"],
    photoGate: (task) => task(),
  });
  const cookie = token(),
    csrf = token();
  await ledger.transaction((s) => {
    s.accounts = { [accountId]: { id: accountId, householdId: household, email: "guest@example.com", active: true } };
    s.sessions[hash(cookie)] = {
      kind: "guest",
      accountId,
      householdId: household,
      email: "guest@example.com",
      csrf,
      startedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    };
  });
  const base = await serve(t, app);
  const headers = { origin, cookie: "__session=" + cookie, "x-csrf-token": csrf };
  const sharp = (await import("sharp")).default;
  const photo = await sharp({ create: { width: 900, height: 700, channels: 3, noise: { type: "gaussian", mean: 120, sigma: 50 } } })
    .png()
    .toBuffer();
  assert.ok(photo.length > UPLOAD_UNIT);
  const opened = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ kind: "photo", type: "image/png", size: photo.length, album: "event", caption: "", consent: true }),
  });
  assert.equal(opened.status, 200);
  const { id } = await opened.json();
  let offset = 0,
    answer;
  do {
    const r = await fetch(`${base}/api/uploads/${id}?offset=${offset}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/octet-stream" },
      body: photo.subarray(offset, offset + UPLOAD_UNIT),
    });
    assert.equal(r.status, 200);
    answer = await r.json();
    offset = answer.received;
  } while (!answer.complete);
  assert.deepEqual(answer, { received: photo.length, complete: true, state: "review" });
  const status = await fetch(`${base}/api/uploads/${id}`, { headers });
  assert.deepEqual(await status.json(), { state: "review" });
  assert.equal((await ledger.read()).photos[id].state, "pending");
});
