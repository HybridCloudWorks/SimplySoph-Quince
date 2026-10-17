// The per-family upload limit: a rolling 24 hours (not a calendar day), with
// a higher limit inside the party upload window (site/lifecycle.mjs
// inUploadWindow), enforced by the API, and a refusal that says the limit, how
// many were used and when the next file fits, so the page can tell the guest
// the truth instead of "check your connection". The limits come from one
// server setting (server/upload-quota.mjs); these tests inject their own
// values instead of assuming the defaults. All data is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { createHttpServer } from "../server/http.mjs";
import { uploadQuota } from "../server/upload-quota.mjs";
import { fixture, household, origin, CEREMONY, WINDOW_END, HOUR, DAY } from "./upload-fixture.mjs";

// Small numbers, unlike any default, so nothing here can pass by assuming 20 or 60.
const quota = { perDay: 3, perDayInUploadWindow: 7, perPartyDevice: 2, perPartyCard: 5 };
const setup = (options = {}) => fixture({ uploadQuota: quota, ...options });
const ask = (f, who = "guest") =>
  f.request(who, "uploads", { kind: "photo", type: "image/jpeg", size: 10, album: "event", caption: "", consent: true });
const seed = (f, times) => f.ledger.transaction((s) => (s.uploadsBegun = { [household]: times }));
const iso = (ms) => new Date(ms).toISOString();

test("the limits are one server setting: 20 a day, 60 in the party window, 30 per table-card phone", () => {
  assert.equal(uploadQuota.perDay, 20);
  assert.equal(uploadQuota.perDayInUploadWindow, 60);
  assert.equal(uploadQuota.perPartyDevice, 30);
  assert.ok(uploadQuota.perPartyCard >= uploadQuota.perPartyDevice);
  assert.ok(Object.isFrozen(uploadQuota));
});

test("a refused upload names the limit, how many were used and when the next one fits", async () => {
  const f = await setup();
  const first = f.now() - 23 * HOUR;
  await seed(f, Array.from({ length: quota.perDay }, (_, i) => first + i * 60000));
  const refused = await ask(f).catch((e) => e);
  assert.equal(refused.status, 429);
  assert.equal(refused.code, "DAILY_UPLOAD_LIMIT");
  assert.deepEqual(refused.details, {
    reason: "quota",
    scope: "family",
    limit: quota.perDay,
    used: quota.perDay,
    retryAt: iso(first + DAY),
    now: iso(f.now()),
  });
  assert.equal(refused.retryAfter, 3600, "one hour, in whole seconds");
  // The page can ask before choosing files.
  assert.deepEqual(await f.request("guest", "uploads/quota"), {
    scope: "family",
    limit: quota.perDay,
    used: quota.perDay,
    remaining: 0,
    retryAt: iso(first + DAY),
    now: iso(f.now()),
  });
  f.setNow(first + DAY);
  assert.deepEqual(await f.request("guest", "uploads/quota"), {
    scope: "family",
    limit: quota.perDay,
    used: quota.perDay - 1,
    remaining: 1,
    retryAt: null,
    now: iso(first + DAY),
  });
});

test("the refusal reaches the browser as JSON with a Retry-After header, through the real HTTP server", async (t) => {
  // The fixture's own instant (December 1, 2026: outside the party upload
  // window, so the ordinary limit and a one-hour wait), like every test here.
  // The real HTTP server needs no real time: it reads the wall clock only to
  // time how fast a body arrives (server/http.mjs), while the sessions, the
  // limit and Retry-After all come from the app's injected clock. On the real
  // clock this test failed inside the window (R-008).
  const f = await setup();
  const first = f.now() - 23 * HOUR;
  await seed(f, Array.from({ length: quota.perDay }, (_, i) => first + i));
  const server = createHttpServer({ app: f.app, root: process.cwd(), origin });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => new Promise((r) => server.close(r)));
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/uploads`, {
    method: "POST",
    headers: { origin, "content-type": "application/json", cookie: f.cookies.guest.cookie, "x-csrf-token": f.cookies.guest.csrf },
    body: JSON.stringify({ kind: "photo", type: "image/jpeg", size: 10, album: "event", caption: "", consent: true }),
  });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "3600");
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["error", "limit", "now", "reason", "retryAt", "scope", "used"]);
  assert.deepEqual(
    [body.error, body.reason, body.scope, body.limit, body.used, body.retryAt],
    ["DAILY_UPLOAD_LIMIT", "quota", "family", quota.perDay, quota.perDay, iso(first + DAY)],
  );
});

test("the 24 hours roll: a new calendar day does not reset them, the first upload's 24th hour does", async () => {
  // 11:00 PM in Fort Worth; the next morning is another calendar day.
  const start = Date.parse("2026-12-01T23:00:00-06:00");
  const f = await setup({ at: start });
  for (let i = 0; i < quota.perDay; i++) {
    await ask(f);
    f.advance(60000);
  }
  await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT");
  f.setNow(start + 11 * HOUR); // 10:00 AM the next day
  await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT" && e.details.retryAt === iso(start + DAY));
  f.setNow(start + DAY - 1);
  await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT");
  f.setNow(start + DAY);
  assert.ok((await ask(f)).id, "the first upload's place is free again");
  await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT" && e.details.retryAt === iso(start + 60000 + DAY));
});

test("the higher limit applies inside the party upload window and the ordinary one outside it, to the millisecond", async () => {
  for (const [at, inside] of [
    [CEREMONY - 1, false],
    [CEREMONY, true],
    [CEREMONY + 1, true],
    [WINDOW_END - 1, true],
    [WINDOW_END, false],
    [WINDOW_END + 1, false],
  ]) {
    const f = await setup({ at });
    // The ordinary limit was reached in the last hour.
    await seed(f, Array.from({ length: quota.perDay }, (_, i) => at - HOUR + i));
    const limit = inside ? quota.perDayInUploadWindow : quota.perDay;
    assert.equal((await f.request("guest", "uploads/quota")).limit, limit, iso(at));
    if (inside) assert.ok((await ask(f)).id, iso(at));
    else await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT" && e.details.limit === limit, iso(at));
  }
});

test("a family full just before the window gets room at the ceremony; when the window ends the reset time follows the lower limit", async () => {
  // Full at the ordinary limit an hour before the ceremony: the next place
  // opens when the higher limit starts, not 24 hours later.
  const f = await setup({ at: CEREMONY - HOUR });
  await seed(f, Array.from({ length: quota.perDay }, (_, i) => CEREMONY - 2 * HOUR + i));
  await assert.rejects(ask(f), (e) => e.details.retryAt === iso(CEREMONY));
  // Inside the window the higher limit is reached too.
  f.setNow(CEREMONY + 5 * HOUR);
  await seed(f, Array.from({ length: quota.perDayInUploadWindow - 1 }, (_, i) => CEREMONY + i * 60000));
  assert.ok((await ask(f)).id, "the last place inside the window");
  await assert.rejects(ask(f), (e) => e.details.limit === quota.perDayInUploadWindow && e.details.used === quota.perDayInUploadWindow);
  // Six begun in the last hours of the window: fine at 7, too many at 3.
  const late = Array.from({ length: 6 }, (_, i) => WINDOW_END - 2 * HOUR + i * 60000);
  await seed(f, late);
  f.setNow(WINDOW_END - HOUR);
  assert.equal((await f.request("guest", "uploads/quota")).remaining, 1);
  f.setNow(WINDOW_END);
  const refused = await ask(f).catch((e) => e);
  assert.deepEqual([refused.details.limit, refused.details.used], [quota.perDay, 6]);
  // Room for one more once 4 of the 6 have rolled off: 24 hours after the 4th.
  assert.equal(refused.details.retryAt, iso(late[3] + DAY));
});

test("each family has its own count; an invitation link (RSVP only) or no session gets no upload answer at all", async () => {
  const f = await setup();
  await seed(f, Array.from({ length: quota.perDay }, () => f.now() - HOUR));
  await assert.rejects(ask(f), (e) => e.code === "DAILY_UPLOAD_LIMIT");
  assert.ok((await ask(f, "other")).id, "another household is not affected");
  await assert.rejects(f.request("link", "uploads/quota"), (e) => e.status === 401);
  await assert.rejects(f.request(null, "uploads/quota"), (e) => e.status === 401);
});

// The deployment guide states the same rule as the code: a rolling 24 hours,
// with the party window's higher limit, never "20 a day".
import { readFile as readDoc } from "node:fs/promises";
test("docs/deployment.md gives the upload limits server/upload-quota.mjs enforces", async () => {
  const doc = await readDoc(new URL("../docs/deployment.md", import.meta.url), "utf8");
  assert.doesNotMatch(doc, /\b20 (?:uploads )?(?:begun )?a day\b|a day per household/);
  assert.ok(doc.includes(`${uploadQuota.perDay} in any rolling 24 hours`));
  assert.ok(doc.includes(`or ${uploadQuota.perDayInUploadWindow} inside the party upload window`));
  assert.ok(doc.includes(`a table-card phone may send ${uploadQuota.perPartyDevice} per visit and the card ${uploadQuota.perPartyCard.toLocaleString("en-US")} in all`));
});
