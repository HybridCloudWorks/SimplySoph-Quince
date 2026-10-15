import test from "node:test";
import assert from "node:assert/strict";
import {
  Ledger,
  memoryAdapter,
  initialState,
  Conflict,
} from "../server/store.mjs";

test("failed durable save never returns a committed result or changes stored state", async () => {
  const backend = memoryAdapter();
  const ledger = new Ledger({
    load: () => backend.load(),
    save: async () => {
      throw new Error("storage unavailable");
    },
  });
  await assert.rejects(
    () =>
      ledger.transaction((s) => {
        s.audit.push({ action: "test" });
        return { saved: true };
      }),
    /storage unavailable/,
  );
  assert.deepEqual((await backend.load()).state, initialState());
});
test("concurrent ledger transactions preserve both updates", async () => {
  const ledger = new Ledger(memoryAdapter());
  await Promise.all([
    ledger.transaction((s) => s.audit.push({ action: "one" })),
    ledger.transaction((s) => s.audit.push({ action: "two" })),
  ]);
  assert.deepEqual((await ledger.read()).audit.map((r) => r.action).sort(), [
    "one",
    "two",
  ]);
});
test("unresolved generation conflicts back off, then fail with a retryable error", async () => {
  const waits = [];
  const ledger = new Ledger(
    {
      load: async () => ({ state: initialState(), generation: 1 }),
      save: async () => {
        throw new Conflict();
      },
    },
    { sleep: async (ms) => waits.push(ms), random: () => 0.5 },
  );
  await assert.rejects(
    () => ledger.transaction(() => true),
    (e) => e.code === "BUSY",
  );
  assert.deepEqual(waits, [25, 50, 100, 200, 400, 400, 400]);
});
test("transactions on one instance are serialized and a failure does not block the next", async () => {
  const backend = memoryAdapter();
  let saves = 0,
    conflicts = 0;
  const ledger = new Ledger({
    load: () => backend.load(),
    save: async (state, generation) => {
      saves++;
      try {
        await backend.save(state, generation);
      } catch (e) {
        conflicts++;
        throw e;
      }
    },
  });
  await Promise.allSettled([
    ...Array.from({ length: 10 }, (_, i) =>
      ledger.transaction((s) => s.audit.push({ action: String(i) })),
    ),
    ledger.transaction(() => {
      throw new Error("mutator failed");
    }),
    ledger.transaction((s) => s.audit.push({ action: "after" })),
  ]);
  assert.equal(conflicts, 0);
  assert.equal(saves, 11);
  assert.equal((await ledger.read()).audit.length, 11);
});

const never = () => new Promise(() => {});

test("one slow ledger load is retried; a hung load fails fast instead of holding the queue", async () => {
  const backend = memoryAdapter();
  let loads = 0;
  const ledger = new Ledger(
    { load: () => (loads++ === 0 ? never() : backend.load()), save: (s, g) => backend.save(s, g) },
    { sleep: async () => {}, timeoutMs: 5 },
  );
  assert.equal(await ledger.transaction(() => "saved"), "saved");
  const stuck = new Ledger({ load: never, save: async () => {} }, { sleep: async () => {}, timeoutMs: 5 });
  await assert.rejects(() => stuck.transaction(() => true), /Ledger load timed out/);
  await assert.rejects(() => stuck.read(), /Ledger load timed out/);
});

test("a timed-out ledger save is never re-run and does not block the next transaction", async () => {
  const backend = memoryAdapter();
  let saves = 0,
    runs = 0;
  const ledger = new Ledger(
    {
      load: () => backend.load(),
      save: (s, g) => (saves++ === 0 ? never() : backend.save(s, g)),
    },
    { sleep: async () => {}, timeoutMs: 5 },
  );
  await assert.rejects(
    () => ledger.transaction((s) => (runs++, s.audit.push({ action: "uncertain" }))),
    /Ledger save timed out/,
  );
  assert.equal(runs, 1);
  await ledger.transaction((s) => s.audit.push({ action: "next" }));
  assert.deepEqual((await ledger.read()).audit.map((r) => r.action), ["next"]);
});

test("a ledger queue deeper than the limit sheds load with a retryable error", async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const backend = memoryAdapter();
  const ledger = new Ledger(
    { load: async () => (await gate, backend.load()), save: (s, g) => backend.save(s, g) },
    { maxQueue: 2, timeoutMs: 1000 },
  );
  const queued = [ledger.transaction(() => 1), ledger.transaction(() => 2)];
  await assert.rejects(() => ledger.transaction(() => 3), (e) => e.code === "BUSY" && e.status === 503);
  release();
  assert.deepEqual(await Promise.all(queued), [1, 2]);
  assert.equal(await ledger.transaction(() => 4), 4);
});

// Cloud Storage's resumable-upload protocol, as far as cloudMedia uses it: a
// PUT to the session URI with Content-Range "bytes A-B/*" (or "/TOTAL" for the
// last piece) answers 308 with the stored range, or 200 with the object; an
// empty PUT with "bytes */*" asks for the state; DELETE cancels (499).
function fakeResumableStorage() {
  const sessions = new Map(),
    requests = [];
  async function fetch(uri, { method, headers = {}, body, signal }) {
    assert.ok(signal, "every storage call has a timeout");
    requests.push({ uri, method, range: headers["Content-Range"], length: body?.length ?? 0 });
    const s = sessions.get(uri);
    if (!s || s.cancelled) return new Response(null, { status: s?.cancelled ? 499 : 404 });
    if (method === "DELETE") {
      s.cancelled = true;
      return new Response(null, { status: 499 });
    }
    const status = () =>
      s.done
        ? Response.json({ name: s.name, size: String(s.bytes.length) }, { status: 200 })
        : new Response(null, {
            status: 308,
            headers: s.bytes.length ? { Range: `bytes=0-${s.bytes.length - 1}` } : {},
          });
    if (headers["Content-Range"] === "bytes */*") return status();
    const [, from, to, total] = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(headers["Content-Range"]);
    assert.equal(Number(from), s.bytes.length, "pieces are written in order");
    assert.equal(Number(to) - Number(from) + 1, body.length);
    s.bytes = Buffer.concat([s.bytes, body]);
    if (total !== "*" && s.bytes.length === Number(total)) s.done = true;
    return status();
  }
  return { sessions, requests, fetch };
}
test("cloudMedia writes uploads through a resumable session the browser never sees, and streams ranges back", async () => {
  const { cloudMedia, UPLOAD_UNIT } = await import("../server/store.mjs");
  const storage = fakeResumableStorage(),
    calls = [];
  const id = "12345678-1234-4234-8234-123456789012";
  const bucket = {
    file: (name) => ({
      async createResumableUpload(options) {
        calls.push(["begin", name, options]);
        const uri = "https://storage.example/upload?upload_id=" + name.length;
        storage.sessions.set(uri, { name, bytes: Buffer.alloc(0) });
        return [uri];
      },
      async save(bytes, options) {
        calls.push(["save", name, bytes.toString(), options]);
      },
      async download(options) {
        calls.push(["download", name, options]);
        return [Buffer.from("stored")];
      },
      async getMetadata() {
        return [{ size: "123" }];
      },
      createReadStream(options) {
        calls.push(["stream", name, options]);
        return "a stream";
      },
      async delete(options) {
        calls.push(["delete", name, options]);
      },
    }),
    async upload(path, options) {
      calls.push(["upload", path, options]);
    },
  };
  const media = cloudMedia(bucket, { fetch: storage.fetch });
  const uri = await media.begin(id, "video/quicktime");
  assert.deepEqual(calls.at(-1), [
    "begin",
    `private/uploads/${id}`,
    { metadata: { contentType: "video/quicktime" }, preconditionOpts: { ifGenerationMatch: 0 } },
  ]);
  assert.deepEqual(await media.offset(uri), { received: 0, complete: false });
  const bytes = Buffer.alloc(2 * UPLOAD_UNIT + 10, 7);
  assert.deepEqual(await media.write(uri, 0, bytes.subarray(0, UPLOAD_UNIT)), { received: UPLOAD_UNIT, complete: false });
  assert.deepEqual(await media.offset(uri), { received: UPLOAD_UNIT, complete: false });
  assert.deepEqual(await media.write(uri, UPLOAD_UNIT, bytes.subarray(UPLOAD_UNIT), bytes.length), {
    received: bytes.length,
    complete: true,
  });
  assert.deepEqual(await media.offset(uri), { received: bytes.length, complete: true });
  assert.deepEqual(
    storage.requests.map((r) => [r.method, r.range, r.length]),
    [
      ["PUT", "bytes */*", 0],
      ["PUT", `bytes 0-${UPLOAD_UNIT - 1}/*`, UPLOAD_UNIT],
      ["PUT", "bytes */*", 0],
      ["PUT", `bytes ${UPLOAD_UNIT}-${bytes.length - 1}/${bytes.length}`, UPLOAD_UNIT + 10],
      ["PUT", "bytes */*", 0],
    ],
  );
  // A cancelled or expired session is "ended" (the API answers UPLOAD_EXPIRED).
  const second = await media.begin("22345678-1234-4234-8234-123456789012", "image/jpeg");
  await media.cancel(second);
  await assert.rejects(media.offset(second), (e) => e.code === 410);
  await assert.rejects(media.offset("https://storage.example/unknown"), (e) => e.code === 410);
  // Finished files: buffers are saved, converted videos streamed from disk,
  // never replacing an object; ranges are streamed back without validation.
  await media.put(id, Buffer.from("jpeg"), "photo");
  assert.deepEqual(calls.at(-1), [
    "save",
    `private/photos/${id}.jpg`,
    "jpeg",
    { resumable: false, contentType: "image/jpeg", preconditionOpts: { ifGenerationMatch: 0 } },
  ]);
  await media.put(id, { path: "/tmp/output.mp4" }, "video");
  assert.deepEqual(calls.at(-1), [
    "upload",
    "/tmp/output.mp4",
    {
      resumable: false,
      contentType: "video/mp4",
      preconditionOpts: { ifGenerationMatch: 0 },
      destination: `private/videos/${id}.mp4`,
    },
  ]);
  assert.equal(await media.size(id, "poster"), 123);
  assert.equal(await media.stream(id, "video", 5, 9), "a stream");
  assert.deepEqual(calls.at(-1), ["stream", `private/videos/${id}.mp4`, { start: 5, end: 9, validation: false }]);
  await media.download(id, "upload", "/tmp/input");
  assert.deepEqual(calls.at(-1), ["download", `private/uploads/${id}`, { destination: "/tmp/input" }]);
  await media.remove(id, "upload");
  assert.deepEqual(calls.at(-1), ["delete", `private/uploads/${id}`, { ignoreNotFound: true }]);
  // Only real media ids and kinds name an object.
  await assert.rejects(media.get("../private/event-ledger.json", "photo"), /Unknown media object/);
  await assert.rejects(media.get(id, "ledger"), /Unknown media object/);
});
test("memoryMedia keeps Cloud Storage's rules: pieces in order, whole 256 KiB units until the last", async () => {
  const { memoryMedia, UPLOAD_UNIT } = await import("../server/store.mjs");
  const media = memoryMedia(),
    id = "12345678-1234-4234-8234-123456789012";
  const uri = await media.begin(id, "image/jpeg");
  await assert.rejects(media.write(uri, 0, Buffer.alloc(100)), (e) => e.code === 400, "not a whole unit");
  await media.write(uri, 0, Buffer.alloc(UPLOAD_UNIT, 1));
  await assert.rejects(media.write(uri, 0, Buffer.alloc(UPLOAD_UNIT)), (e) => e.code === 400, "out of order");
  assert.deepEqual(await media.write(uri, UPLOAD_UNIT, Buffer.alloc(5, 2), UPLOAD_UNIT + 5), {
    received: UPLOAD_UNIT + 5,
    complete: true,
  });
  assert.equal((await media.get(id, "upload")).length, UPLOAD_UNIT + 5);
  await assert.rejects(media.put(id, Buffer.from("x"), "upload"), (e) => e.code === 412, "never replaces");
  await media.remove(id, "upload");
  await assert.rejects(media.size(id, "upload"), (e) => e.code === 404);
  await media.cancel(uri);
  await assert.rejects(media.offset(uri), (e) => e.code === 410);
});
