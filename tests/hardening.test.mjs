import test from "node:test";
import assert from "node:assert/strict";
import { rateLimit, atLeast, verifyTotp } from "../server/auth.mjs";
import { redactForLog } from "../server/event-log.mjs";
import { createGate } from "../server/gate.mjs";
import { notionClient, notionOutage } from "../server/notion.mjs";
import { createAdminAccess } from "../server/admin-access.mjs";

test("flooding the counter table never resets a live limit (SEC-6)", async () => {
  const ledger = {}; // counters are keyed per ledger object
  const now = 1_000_000;
  for (let i = 0; i < 3; i++) await rateLimit(ledger, "victim", 3, 900000, now);
  await assert.rejects(() => rateLimit(ledger, "victim", 3, 900000, now), (e) => e.status === 429);
  // 20,000 junk keys used to evict the oldest counters and reset them.
  let refused = 0;
  for (let i = 0; i < 20005; i++)
    await rateLimit(ledger, "junk-" + i, 1, 900000, now).catch(() => refused++);
  assert.ok(refused > 0, "a full table refuses new keys instead of evicting");
  await assert.rejects(() => rateLimit(ledger, "victim", 3, 900000, now), (e) => e.status === 429);
  // Expired counters are pruned, so the table recovers by itself.
  await rateLimit(ledger, "after", 3, 900000, now + 900001);
});

// QA-06: each table card scan without a cookie mints a new phone name, so
// 20,000 scripted phones used to fill the table and silently stop sign-in
// emails and invitation links for an hour.
test("keys anyone can mint fill only their own table, which drops its least recently used; bounded keys and the key being counted never fail open", async () => {
  const ledger = {};
  const now = 1_000_000;
  // A guest-list address at its limit stays limited throughout.
  for (let i = 0; i < 3; i++) await rateLimit(ledger, "email-to:abuela", 3, 900000, now);
  // A phone at its limit, then 25,000 scripted phones.
  for (let i = 0; i < 2; i++) await rateLimit(ledger, "party:busy-phone", 2, 900000, now, { minted: true });
  for (let i = 0; i < 25000; i++) {
    if (i % 1000 === 0)
      // The busy phone keeps sending, so it stays recently used and limited.
      await assert.rejects(() => rateLimit(ledger, "party:busy-phone", 2, 900000, now, { minted: true }), (e) => e.status === 429);
    await rateLimit(ledger, "party:phone-" + i, 120, 3600000, now, { minted: true });
  }
  // Nothing they did touches the other table: new guests and links still get budgets...
  await rateLimit(ledger, "email-to:new-guest", 3, 900000, now);
  await rateLimit(ledger, "invite:household", 20, 900000, now);
  // ...and a key at its limit is still refused.
  await assert.rejects(() => rateLimit(ledger, "email-to:abuela", 3, 900000, now), (e) => e.status === 429);
  await assert.rejects(() => rateLimit(ledger, "party:busy-phone", 2, 900000, now, { minted: true }), (e) => e.status === 429);
  // The minted table dropped the phones nobody used since, not the busy one.
  await rateLimit(ledger, "party:phone-24999", 120, 3600000, now, { minted: true });
});

test("sign-in requests take at least the floor, whatever happens inside (SEC-8)", async () => {
  const started = Date.now();
  assert.equal(await atLeast(120, async () => "quick"), "quick");
  assert.ok(Date.now() - started >= 115);
  const failed = Date.now();
  await assert.rejects(() => atLeast(80, async () => { throw new Error("x"); }));
  assert.ok(Date.now() - failed >= 75, "errors wait too, so they reveal nothing");
});

test("a non-string authenticator code is just a wrong code (SEC-14)", () => {
  assert.equal(verifyTotp("JBSWY3DPEHPK3PXP", 123456, Date.now()), null);
  assert.equal(verifyTotp("JBSWY3DPEHPK3PXP", ["123456"], Date.now()), null);
});

test("the Cloud Logging copy carries no email address or reversible phone hash (SEC-12)", () => {
  const key = Buffer.alloc(32, 7);
  const entry = {
    type: "role.authenticator-reset",
    actor: "admin:Diana@Example.com",
    data: { target: "guest@example.org", phoneHash: "9f86d081884c7d65", nested: ["x@y.co"] },
    householdId: "12345678-1234-1234-1234-123456789012",
  };
  const out = redactForLog(entry, key);
  assert.ok(!JSON.stringify(out).includes("@"));
  assert.notEqual(out.data.phoneHash, entry.data.phoneHash);
  assert.equal(out.householdId, entry.householdId, "ids are kept");
  assert.equal(redactForLog(entry, key).actor, out.actor, "tags are stable for correlation");
  assert.equal(redactForLog({ actor: "admin:diana@example.com" }, key).actor, out.actor, "case-insensitive");
  assert.notEqual(redactForLog(entry, Buffer.alloc(32, 8)).actor, out.actor, "keyed");
});

test("image work runs two at a time, queues a few and refuses the rest (SEC-13)", async () => {
  const run = createGate({ max: 2, queue: 1 });
  let active = 0,
    peak = 0;
  const release = [];
  const task = () =>
    run(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => release.push(r));
      active--;
    });
  const jobs = [task(), task(), task()];
  await assert.rejects(() => run(async () => {}), (e) => e.status === 503 && e.code === "PHOTO_BUSY");
  while (release.length) {
    release.shift()();
    await new Promise((r) => setImmediate(r));
  }
  await Promise.all(jobs);
  assert.equal(peak, 2);
  assert.equal(await run(async () => "free again"), "free again");
});

test("during a Notion outage only read-only views that opt in get the last good answer (NOTION-6)", async () => {
  let clock = 0,
    status = 200;
  const pageId = "12345678-1234-1234-1234-123456789012";
  const client = notionClient({
    token: "t",
    sourceId: "source",
    sleep: async () => {},
    clock: () => clock,
    minIntervalMs: 0,
    fetchImpl: async (url) =>
      status !== 200
        ? new Response("{}", { status })
        : new Response(
            JSON.stringify(
              url.includes("/query")
                ? { results: [], has_more: false }
                : { id: pageId, parent: { data_source_id: "source" }, properties: {} },
            ),
            { status: 200 },
          ),
  });
  assert.deepEqual(await client.list(), []);
  assert.equal((await client.read(pageId)).id, pageId);
  status = 503;
  clock += 60000; // past the 30-second cache
  assert.deepEqual(await client.list({ allowStale: true }), [], "page views keep working");
  assert.equal((await client.read(pageId, { allowStale: true })).id, pageId);
  // Without opting in (guest writes) the outage is reported, and the stale
  // answer handed out above was never cached for them.
  await assert.rejects(() => client.list(), (e) => notionOutage(e));
  await assert.rejects(() => client.read(pageId), (e) => notionOutage(e));
  await assert.rejects(() => client.list({ fresh: true }), (e) => notionOutage(e));
  // A refusal is an answer, not an outage: never covered by old data.
  status = 400;
  await assert.rejects(() => client.list({ allowStale: true }), (e) => e.code === "NOTION_400");
  status = 503;
  clock += 3600001; // past the one-hour fallback
  await assert.rejects(() => client.list({ allowStale: true }), (e) => notionOutage(e));
});

test("the Cloud Logging mirror writes one redacted line per event (SEC-12)", async () => {
  const { eventMirror } = await import("../server/event-log.mjs");
  const lines = [];
  eventMirror((line) => lines.push(line), Buffer.alloc(32, 3))([
    { type: "role.authenticator-reset", actor: "owner:me@example.com", data: { target: "a@b.co" } },
    { type: "rsvp.submitted", householdId: "h1" },
  ]);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].message, "event role.authenticator-reset");
  assert.ok(!JSON.stringify(lines).includes("@"));
  assert.equal(lines[1].event.householdId, "h1");
});

test("the ledger is downloaded again only when its generation changes (SEC-13)", async () => {
  const { cloudAdapter } = await import("../server/store.mjs");
  let generation = 1,
    downloads = 0;
  const text = () => JSON.stringify({ version: 1, generation });
  const storage = {
    bucket: () => ({
      file: () => ({
        name: "private/event-ledger.json",
        getMetadata: async () => [{ generation }],
        download: async () => {
          downloads++;
          return [Buffer.from(text())];
        },
      }),
    }),
  };
  const adapter = cloudAdapter("misxv-test", { storage });
  const a = await adapter.load(),
    b = await adapter.load();
  assert.equal(downloads, 1);
  a.state.mutated = true;
  assert.equal(b.state.mutated, undefined, "every load is its own copy");
  assert.equal((await adapter.load()).state.mutated, undefined);
  generation = 2;
  assert.equal((await adapter.load()).state.generation, 2);
  assert.equal(downloads, 2);
});

test("an admin Notion confirmed recently keeps working through an outage, briefly (NOTION-6)", async () => {
  let clock = 0,
    down = false;
  const row = { id: "row-1", email: "admin@example.com", administratorEligible: true, archived: false };
  const admins = createAdminAccess({
    notion: {
      list: async () => {
        if (down) throw Object.assign(new Error(), { status: 503, code: "NOTION_UNAVAILABLE" });
        return [row];
      },
    },
    adminEmails: [],
    now: () => clock,
  });
  const session = { email: "admin@example.com", rowId: "row-1" };
  assert.equal(await admins.stillAdmin(session), true);
  down = true;
  clock += 60000;
  assert.equal(await admins.stillAdmin(session), true, "confirmed a minute ago");
  clock += 900000;
  await assert.rejects(() => admins.stillAdmin(session), (e) => e.code === "NOTION_UNAVAILABLE");
  // A refusal is applied at once, outage or not.
  down = false;
  row.administratorEligible = false;
  assert.equal(await admins.stillAdmin(session), false);
  down = true;
  await assert.rejects(() => admins.stillAdmin(session), (e) => e.code === "NOTION_UNAVAILABLE");
});

test("Google guest sign-in vouches only for Gmail and Workspace addresses (AUTHN-11 review)", async () => {
  const { OAuth2Client } = await import("google-auth-library");
  const { googleIdentityVerifier } = await import("../server/auth.mjs");
  const original = OAuth2Client.prototype.verifyIdToken;
  let payload;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => payload });
  try {
    const verify = googleIdentityVerifier("client-id");
    payload = { sub: "g-1", email: "Aunt@Gmail.com", email_verified: true, nonce: "n-1" };
    assert.deepEqual(await verify("token", "n-1"), {
      provider: "google",
      subject: "g-1",
      email: "aunt@gmail.com",
      mfa: false,
    });
    payload = { ...payload, email: "aunt@family.example", hd: "family.example" };
    assert.equal((await verify("token", "n-1")).email, "aunt@family.example", "Workspace domain");
    // A Google account registered with someone else's mail provider: Google
    // checked the address once and does not vouch for who owns it now.
    payload = { sub: "g-2", email: "aunt@hotmail.com", email_verified: true, nonce: "n-1" };
    await assert.rejects(() => verify("token", "n-1"), (e) => e.code === "SSO_EMAIL_NOT_VERIFIED");
    payload = { ...payload, email: "aunt@gmail.com", email_verified: false };
    await assert.rejects(() => verify("token", "n-1"), (e) => e.code === "SSO_EMAIL_NOT_VERIFIED");
    payload = { ...payload, email_verified: true, nonce: "other" };
    await assert.rejects(() => verify("token", "n-1"), (e) => e.code === "SIGN_IN_FAILED");
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
  }
});

test("an upload without a session cookie is refused before its body is read (re-audit)", async () => {
  const { createHttpServer } = await import("../server/http.mjs");
  let dispatched = 0;
  const server = createHttpServer({
    app: { dispatch: async () => (dispatched++, { ok: true }) },
    root: process.cwd(),
    origin: "https://misxv.simplysoph.com",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url =
    "http://127.0.0.1:" + server.address().port + "/api/uploads/12345678-1234-4234-8234-123456789012?offset=0";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { origin: "https://misxv.simplysoph.com", "content-type": "application/octet-stream" },
      body: Buffer.alloc(2_000_000),
    });
    assert.equal(r.status, 401);
    assert.equal((await r.json()).error, "SIGN_IN_REQUIRED");
    assert.equal(dispatched, 0, "the app never saw it");
    assert.equal(r.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  } finally {
    server.close();
  }
});

test("a made-up or RSVP-only session is refused before an upload is read; 8 uploads at once, 1 per session (re-audit)", async () => {
  const { createHttpServer } = await import("../server/http.mjs");
  let dispatched = 0,
    release;
  const held = new Promise((r) => (release = r));
  const people = Array.from({ length: 9 }, (_, i) => "good" + i);
  const server = createHttpServer({
    app: {
      // Like the app: the resolved session's key, whatever the spacing.
      canUpload: async (cookie) => {
        const value = cookie.split("=")[1].split(";")[0].trim();
        return people.includes(value) ? "key-" + value : null;
      },
      dispatch: async () => (dispatched++, await held, { ok: true }),
    },
    root: process.cwd(),
    origin: "https://misxv.simplysoph.com",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const upload = (cookie) =>
    fetch(
      "http://127.0.0.1:" + server.address().port + "/api/uploads/12345678-1234-4234-8234-123456789012?offset=0",
      {
        method: "POST",
        headers: { origin: "https://misxv.simplysoph.com", "content-type": "application/octet-stream", cookie },
        body: Buffer.alloc(100_000),
      },
    );
  try {
    const forged = await upload("__session=made-up");
    assert.equal(forged.status, 401);
    assert.equal(dispatched, 0);
    const running = [upload("__session=good0")];
    while (dispatched < 1) await new Promise((r) => setTimeout(r, 5));
    const same = await upload("__session=good0  ;a=1");
    assert.equal(same.status, 503, "one upload at a time per session, however the cookie is spelled");
    assert.equal((await same.json()).error, "UPLOAD_BUSY");
    for (const person of people.slice(1, 8)) running.push(upload("__session=" + person));
    while (dispatched < 8) await new Promise((r) => setTimeout(r, 5));
    const busy = await upload("__session=good8");
    assert.equal(busy.status, 503, "at most 8 per server");
    assert.equal((await busy.json()).error, "UPLOAD_BUSY");
    release();
    assert.deepEqual((await Promise.all(running)).map((r) => r.status), Array(8).fill(200));
    assert.equal((await upload("__session=good0")).status, 200, "slots are released after each upload");
  } finally {
    release();
    server.close();
  }
});
