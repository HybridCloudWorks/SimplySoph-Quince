import { Storage } from "@google-cloud/storage";
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
    } = {},
  ) {
    this.adapter = adapter;
    this.sleep = sleep;
    this.random = random;
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
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
      const result = await fn(state);
      try {
        // A timed-out save is NOT retried: it may still land, and re-running the
        // mutator would apply it twice. It surfaces as an unexpected (ERROR) 503.
        await within(
          this.adapter.save(state, generation),
          this.timeoutMs,
          "Ledger save",
        );
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
export function cloudAdapter(bucketName) {
  if (!/^misxv-[a-z0-9-]+$/.test(bucketName || ""))
    throw new Error("Dedicated event bucket required");
  const bucket = new Storage().bucket(bucketName),
    file = bucket.file("private/event-ledger.json");
  return {
    bucket,
    async load() {
      try {
        const [metadata] = await file.getMetadata();
        const [bytes] = await bucket
          .file(file.name, { generation: metadata.generation })
          .download();
        return {
          state: JSON.parse(bytes.toString()),
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
