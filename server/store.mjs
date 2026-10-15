import { Storage } from "@google-cloud/storage";
import { readFile, writeFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { eventsSince } from "./event-log.mjs";
export const initialState = () => ({
  version: 1,
  invitations: {},
  profiles: {},
  sessions: {},
  challenges: {},
  admins: {},
  responses: {},
  outbox: {},
  messages: {},
  photos: {},
  tables: {},
  announcements: {},
  limits: {},
  audit: [],
});
export class Conflict extends Error {}
class Timeout extends Error {}
// Rejects with Timeout if the operation does not settle in time. The operation
// itself is not cancelled; callers must treat a timed-out write as uncertain.
function within(promise, ms, what) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Timeout(what + " timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
// One small event ledger; GCS generation preconditions serialize transactions across instances.
// Mutators must have NO external side effects: a conflicting transaction is retried.
export class Ledger {
  constructor(
    adapter,
    {
      sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
      random = Math.random,
      // Storage normally answers in well under a second; a hung call must not
      // hold the queue until the request deadline (or Twilio's 15 s webhook limit).
      timeoutMs = 5000,
      // Concurrency 4 keeps the queue short; a deep queue means storage is stuck.
      maxQueue = 32,
      // Receives the event-log entries a transaction committed (never on retry).
      onEvents = null,
    } = {},
  ) {
    this.adapter = adapter;
    this.sleep = sleep;
    this.random = random;
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.onEvents = onEvents;
    this.queue = Promise.resolve();
    this.depth = 0;
  }
  async read() {
    return (await within(this.adapter.load(), this.timeoutMs, "Ledger load"))
      .state;
  }
  // Transactions on one instance run one at a time, so they never conflict with
  // each other; generation conflicts then only come from the other instance and
  // are retried with jittered exponential backoff instead of immediately.
  transaction(fn) {
    if (this.depth >= this.maxQueue)
      return Promise.reject(
        Object.assign(new Error("Please retry."), { status: 503, code: "BUSY" }),
      );
    this.depth++;
    const run = this.queue
      .then(() => this.attempt(fn))
      .finally(() => this.depth--);
    this.queue = run.catch(() => {});
    return run;
  }
  async attempt(fn) {
    let slowLoads = 0;
    for (let attempt = 0; attempt < 8; attempt++) {
      if (attempt)
        await this.sleep(
          Math.min(400, 25 * 2 ** (attempt - 1)) * (0.5 + this.random()),
        );
      let loaded;
      try {
        loaded = await within(this.adapter.load(), this.timeoutMs, "Ledger load");
      } catch (e) {
        // Reads have no side effects, so one slow load is retried; a second
        // means storage is unhealthy and the request should fail fast.
        if (e instanceof Timeout && ++slowLoads < 2 && attempt < 7) continue;
        throw e;
      }
      const { state, generation } = loaded;
      const startSeq = state.eventSeq || 0;
      const result = await fn(state);
      try {
        // A timed-out save is NOT retried: it may still land, and re-running the
        // mutator would apply it twice. It surfaces as an unexpected (ERROR) 503.
        await within(
          this.adapter.save(state, generation),
          this.timeoutMs,
          "Ledger save",
        );
        if (this.onEvents && (state.eventSeq || 0) > startSeq)
          try {
            this.onEvents(eventsSince(state, startSeq));
          } catch {
            // Logging must never turn a committed write into a reported failure.
          }
        return result;
      } catch (e) {
        if (!(e instanceof Conflict)) throw e;
      }
    }
    throw Object.assign(new Error("Please retry."), {
      status: 503,
      code: "BUSY",
    });
  }
}
export function memoryAdapter(seed = initialState()) {
  let value = structuredClone(seed),
    revision = 0;
  return {
    async load() {
      return { state: structuredClone(value), generation: revision };
    },
    async save(state, generation) {
      if (generation !== revision) throw new Conflict();
      value = structuredClone(state);
      revision++;
    },
  };
}
export function cloudAdapter(bucketName, { storage = null } = {}) {
  if (!/^misxv-[a-z0-9-]+$/.test(bucketName || ""))
    throw new Error("Dedicated event bucket required");
  const bucket = (storage || new Storage()).bucket(bucketName),
    file = bucket.file("private/event-ledger.json");
  // The last downloaded generation. Every request still checks the current
  // generation (a small metadata call), but the full ledger is downloaded only
  // when it has changed (SEC-13). Generations are immutable, so this is exact.
  let cached = null;
  return {
    bucket,
    async load() {
      try {
        const [metadata] = await file.getMetadata();
        if (cached?.generation !== metadata.generation) {
          const [bytes] = await bucket
            .file(file.name, { generation: metadata.generation })
            .download();
          cached = { generation: metadata.generation, text: bytes.toString() };
        }
        return {
          state: JSON.parse(cached.text),
          generation: metadata.generation,
        };
      } catch (e) {
        if (e.code === 404) return { state: initialState(), generation: 0 };
        throw e;
      }
    },
    async save(state, generation) {
      const bytes = Buffer.from(JSON.stringify(state));
      if (bytes.length > 20_000_000)
        throw new Error("Ledger size limit reached");
      try {
        await file.save(bytes, {
          resumable: false,
          contentType: "application/json",
          preconditionOpts: { ifGenerationMatch: generation },
          metadata: { cacheControl: "no-store" },
        });
      } catch (e) {
        // 412: another writer won. 429: GCS per-object write throttling, which
        // guarantees nothing was written, so a reload-and-retry is safe.
        if (e.code === 412 || e.code === 429) throw new Conflict();
        throw e;
      }
    },
  };
}
// Guest media, stored as private objects next to the ledger. A guest's file
// first arrives as an "upload" (exactly as sent, up to a few hundred MB), then
// becomes what the gallery serves: a re-encoded JPEG photo, or an H.264 MP4
// video plus a JPEG poster frame. The original is deleted once processed and
// never becomes a gallery object (its metadata, like location, stays out).
const mediaNames = {
  photo: (id) => `private/photos/${id}.jpg`,
  video: (id) => `private/videos/${id}.mp4`,
  poster: (id) => `private/posters/${id}.jpg`,
  upload: (id) => `private/uploads/${id}`,
};
const mediaTypes = {
  photo: "image/jpeg",
  video: "video/mp4",
  poster: "image/jpeg",
  upload: "application/octet-stream",
};
const mediaName = (id, kind) => {
  if (!mediaNames[kind] || !/^[a-f0-9-]{36}$/.test(id))
    throw new Error("Unknown media object");
  return mediaNames[kind](id);
};
const ended = () =>
  Object.assign(new Error("Upload session ended"), { code: 410 });
// An upload is written in order, in pieces that are whole multiples of 256 KiB
// except the last (Cloud Storage's rule for resumable uploads), and becomes an
// object when the last byte of the declared total arrives. offset() and
// write() both answer { received, complete }.
export const UPLOAD_UNIT = 256 * 1024;
// Media in memory with the same rules, for tests and the browser harness.
// put(id, { path }) reads a local file, as the cloud adapter streams one.
export function memoryMedia() {
  const objects = new Map(),
    sessions = new Map();
  const object = (id, kind) => {
    const bytes = objects.get(mediaName(id, kind));
    if (!bytes)
      throw Object.assign(new Error("No such media object"), { code: 404 });
    return bytes;
  };
  const session = (uri) => {
    const s = sessions.get(uri);
    if (!s || s.cancelled) throw ended();
    return s;
  };
  return {
    objects,
    async put(id, data, kind) {
      const name = mediaName(id, kind);
      if (objects.has(name))
        throw Object.assign(new Error("Already stored"), { code: 412 });
      objects.set(
        name,
        Buffer.from(Buffer.isBuffer(data) ? data : await readFile(data.path)),
      );
    },
    async get(id, kind) {
      return Buffer.from(object(id, kind));
    },
    async size(id, kind) {
      return object(id, kind).length;
    },
    async stream(id, kind, start, end) {
      return Readable.from([object(id, kind).subarray(start, end + 1)]);
    },
    async download(id, kind, path) {
      await writeFile(path, object(id, kind), { flag: "wx" });
    },
    async remove(id, kind) {
      objects.delete(mediaName(id, kind));
    },
    async begin(id) {
      const uri = "memory-upload:" + mediaName(id, "upload");
      sessions.set(uri, { id, parts: [], received: 0, complete: false });
      return uri;
    },
    async offset(uri) {
      const s = session(uri);
      return { received: s.received, complete: s.complete };
    },
    async write(uri, offset, bytes, total = null) {
      const s = session(uri);
      const last = total !== null && offset + bytes.length === total;
      if (s.complete || offset !== s.received || (!last && bytes.length % UPLOAD_UNIT))
        throw Object.assign(new Error("Invalid upload piece"), { code: 400 });
      s.parts.push(Buffer.from(bytes));
      s.received += bytes.length;
      if (last) {
        s.complete = true;
        objects.set(mediaName(s.id, "upload"), Buffer.concat(s.parts));
        s.parts = [];
      }
      return { received: s.received, complete: s.complete };
    },
    async cancel(uri) {
      const s = sessions.get(uri);
      if (s) s.cancelled = true;
    },
  };
}
// The same operations on the event bucket. An upload goes to a Cloud Storage
// resumable session that the API opens (ifGenerationMatch: 0, so it can never
// replace an object) and writes piece by piece. The session URI is the only
// credential a piece needs, so it stays on the server, sealed in the ledger:
// browsers reach storage only through the API, so there is no bucket CORS, no
// signed URL and no new IAM role (objectUser covers all of this). A session
// that is never finished stores no object and expires on its own after a week;
// the API cancels it after a day.
export function cloudMedia(
  bucket,
  { fetch: send = globalThis.fetch, timeoutMs = 30000 } = {},
) {
  const file = (id, kind) => bucket.file(mediaName(id, kind));
  async function session(uri, init) {
    const res = await send(uri, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 308) {
      await res.body?.cancel();
      // "bytes=0-N" once anything is stored; no Range header while nothing is.
      const range = /^bytes=0-(\d+)$/.exec(res.headers.get("range") || "");
      return { received: range ? Number(range[1]) + 1 : 0, complete: false };
    }
    if (res.status === 200 || res.status === 201) {
      const stored = await res.json();
      return { received: Number(stored.size), complete: true };
    }
    await res.body?.cancel();
    // 404 or 410: an unknown or expired session; 499: a cancelled one.
    if ([404, 410, 499].includes(res.status)) throw ended();
    throw Object.assign(new Error("Upload session error"), {
      code: res.status,
    });
  }
  return {
    async put(id, data, kind) {
      const options = {
        resumable: false,
        contentType: mediaTypes[kind],
        preconditionOpts: { ifGenerationMatch: 0 },
      };
      if (Buffer.isBuffer(data)) await file(id, kind).save(data, options);
      // A local file (a converted video) is streamed, never held in memory.
      else
        await bucket.upload(data.path, {
          ...options,
          destination: mediaName(id, kind),
        });
    },
    async get(id, kind) {
      return (await file(id, kind).download())[0];
    },
    async size(id, kind) {
      return Number((await file(id, kind).getMetadata())[0].size);
    },
    async stream(id, kind, start, end) {
      return file(id, kind).createReadStream({ start, end, validation: false });
    },
    async download(id, kind, path) {
      await file(id, kind).download({ destination: path });
    },
    async remove(id, kind) {
      await file(id, kind).delete({ ignoreNotFound: true });
    },
    async begin(id, contentType) {
      const [uri] = await file(id, "upload").createResumableUpload({
        metadata: { contentType },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
      return uri;
    },
    offset: (uri) =>
      session(uri, {
        method: "PUT",
        headers: { "Content-Range": "bytes */*" },
        body: "",
      }),
    write: (uri, offset, bytes, total = null) =>
      session(uri, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${total ?? "*"}`,
        },
        body: bytes,
      }),
    async cancel(uri) {
      try {
        const res = await send(uri, {
          method: "DELETE",
          signal: AbortSignal.timeout(timeoutMs),
        });
        await res.body?.cancel();
      } catch {
        // Best effort: an abandoned session expires on its own.
      }
    },
  };
}
