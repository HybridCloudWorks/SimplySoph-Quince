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

test("during a Notion outage, cached reads serve the last good answer; fresh reads fail (NOTION-6)", async () => {
  let clock = 0,
    down = false;
  const client = notionClient({
    token: "t",
    sourceId: "source",
    sleep: async () => {},
    clock: () => clock,
    minIntervalMs: 0,
    fetchImpl: async () =>
      down
        ? new Response("{}", { status: 503 })
        : new Response(JSON.stringify({ results: [], has_more: false }), { status: 200 }),
  });
  assert.deepEqual(await client.list(), []);
  down = true;
  clock += 60000; // past the 30-second cache
  assert.deepEqual(await client.list(), [], "guest pages keep working");
  await assert.rejects(() => client.list({ fresh: true }), (e) => notionOutage(e));
  clock += 3600001; // past the one-hour fallback
  await assert.rejects(() => client.list(), (e) => notionOutage(e));
  assert.equal(notionOutage({ code: "NOTION_400" }), false, "a refusal is an answer, not an outage");
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

test("Google guest sign-in accepts any verified email, not only Gmail or Workspace (AUTHN-11)", async () => {
  const { OAuth2Client } = await import("google-auth-library");
  const { googleIdentityVerifier } = await import("../server/auth.mjs");
  const original = OAuth2Client.prototype.verifyIdToken;
  let payload;
  OAuth2Client.prototype.verifyIdToken = async () => ({ getPayload: () => payload });
  try {
    const verify = googleIdentityVerifier("client-id");
    payload = { sub: "g-1", email: "Aunt@Hotmail.com", email_verified: true, nonce: "n-1" };
    assert.deepEqual(await verify("token", "n-1"), {
      provider: "google",
      subject: "g-1",
      email: "aunt@hotmail.com",
      mfa: false,
    });
    payload = { ...payload, email_verified: false };
    await assert.rejects(() => verify("token", "n-1"), (e) => e.code === "SSO_EMAIL_NOT_VERIFIED");
    payload = { ...payload, email_verified: true, nonce: "other" };
    await assert.rejects(() => verify("token", "n-1"), (e) => e.code === "SIGN_IN_FAILED");
  } finally {
    OAuth2Client.prototype.verifyIdToken = original;
  }
});
