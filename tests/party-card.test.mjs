// The printed table card (R-021, R-022): anyone at the party can share photos
// and videos from its QR code without signing in, while viewing stays with
// signed-in guests. It ships dormant: until an administrator creates the
// card, no code exists and every exchange is refused. Only the hash of the
// 256-bit code is kept; the exchange works only inside the party upload
// window; a card session can upload (and follow or withdraw its own pending
// files) and nothing else; each phone and the card have their own caps; files
// land in the same moderation queue, labelled. All data is made up.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fixture, photo, CEREMONY, WINDOW_END, DAY } from "./upload-fixture.mjs";
import { token } from "../server/auth.mjs";

const quota = { perDay: 3, perDayInUploadWindow: 7, perPartyDevice: 2, perPartyCard: 3 };
const PARTY_NIGHT = Date.parse("2027-01-15T21:15:00-06:00");
const setup = (options = {}) => fixture({ at: PARTY_NIGHT, uploadQuota: quota, ...options });
const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const codeOf = (url) => /#party=([A-Za-z0-9_-]{43})$/.exec(url)[1];
const createCard = (f) => f.request("admin", "admin/party-card", { action: "create" });
// The page's exchange: the code for a session cookie and its CSRF token.
async function exchange(f, code) {
  const r = await f.request(null, "party-session", { token: code });
  return { cookie: r.setCookie.split(";")[0], csrf: r.csrf, closesAt: r.closesAt };
}

test("dormant by default: with no card every exchange is refused, inside the window too", async () => {
  const f = await setup();
  assert.equal((await f.request("admin", "admin/party-card")).state, "off");
  for (const code of [token(), "", "x".repeat(43), null, 12])
    await assert.rejects(f.request(null, "party-session", { token: code }), (e) => e.status === 401 && e.code === "PARTY_CARD_INVALID");
  assert.equal((await f.state()).partyCard, undefined);
  assert.equal(Object.values((await f.state()).sessions).filter((s) => s.kind === "party").length, 0);
});

test("creating the card makes a 256-bit code shown once; only its hash is stored, and Admin never shows it again", async () => {
  const f = await setup();
  const made = await createCard(f);
  assert.equal(made.state, "open");
  assert.match(made.url, /^https:\/\/misxv\.simplysoph\.com\/share\/#party=[A-Za-z0-9_-]{43}$/);
  const code = codeOf(made.url);
  assert.equal(Buffer.from(code, "base64url").length, 32, "256 bits");
  assert.match(made.card, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(made.card, /Share your photos/);
  assert.match(made.card, /Compartir fotos/);
  const s = await f.state();
  assert.equal(s.partyCard.tokenHash, sha256(code));
  assert.ok(!JSON.stringify(s).includes(code), "the code itself is stored nowhere");
  const status = await f.request("admin", "admin/party-card");
  assert.ok(!JSON.stringify(status).includes(code));
  assert.equal(status.url, undefined);
  assert.deepEqual(
    [status.opensAt, status.closesAt, status.inWindow],
    [new Date(CEREMONY).toISOString(), new Date(WINDOW_END).toISOString(), true],
  );
  // A second card while one is on is refused; guests and phones cannot make one.
  await assert.rejects(createCard(f), (e) => e.code === "PARTY_CARD_OPEN");
  await assert.rejects(f.request("guest", "admin/party-card", { action: "create" }), (e) => e.status === 401);
  // Admin's audit names the action, never the code.
  assert.ok(s.audit.some((a) => a.action === "party-card-create"));
});

test("the exchange works only inside the party upload window, to the millisecond", async () => {
  const f = await setup({ at: CEREMONY - DAY });
  const code = codeOf((await createCard(f)).url);
  for (const [at, ok, refusal] of [
    [CEREMONY - 1, false, "PARTY_NOT_OPEN"],
    [CEREMONY, true],
    [CEREMONY + 1, true],
    [WINDOW_END - 1, true],
    [WINDOW_END, false, "PARTY_CLOSED"],
    [WINDOW_END + 1, false, "PARTY_CLOSED"],
  ]) {
    f.setNow(at);
    if (ok) assert.ok((await exchange(f, code)).csrf, new Date(at).toISOString());
    else
      await assert.rejects(
        f.request(null, "party-session", { token: code }),
        (e) =>
          e.status === 403 &&
          e.code === refusal &&
          e.details.opensAt === new Date(CEREMONY).toISOString() &&
          e.details.closesAt === new Date(WINDOW_END).toISOString(),
        new Date(at).toISOString(),
      );
  }
});

test("a session from the card ends with the window, and its renewals never go past it", async () => {
  const f = await setup({ at: WINDOW_END - 20 * 60000 });
  const phone = await exchange(f, codeOf((await createCard(f)).url));
  const row = Object.values((await f.state()).sessions).find((s) => s.kind === "party");
  assert.ok(row.expiresAt <= WINDOW_END);
  assert.deepEqual(Object.keys(row).sort(), ["cardVersion", "csrf", "deviceId", "expiresAt", "kind", "scope", "startedAt"]);
  assert.equal((await f.request(phone, "session")).kind, "party");
  f.setNow(WINDOW_END - 1);
  assert.ok(await f.request(phone, "uploads/quota"));
  f.setNow(WINDOW_END);
  await assert.rejects(f.request(phone, "uploads/quota"), (e) => e.status === 401);
  assert.equal((await f.request(phone, "session")).kind, null);
});

test("a rotated code and a closed card are refused, and their phones lose the session on their next request", async () => {
  const f = await setup();
  const first = codeOf((await createCard(f)).url);
  const phone = await exchange(f, first);
  assert.equal(await f.app.canUpload(phone.cookie), "party:" + Object.values((await f.state()).sessions).find((s) => s.kind === "party").deviceId);
  const second = codeOf((await f.request("admin", "admin/party-card", { action: "rotate" })).url);
  assert.notEqual(second, first);
  await assert.rejects(f.request(null, "party-session", { token: first }), (e) => e.code === "PARTY_CARD_INVALID");
  await assert.rejects(f.request(phone, "uploads/quota"), (e) => e.status === 401);
  assert.equal(await f.app.canUpload(phone.cookie), null, "no upload slot for the old card");
  const again = await exchange(f, second);
  assert.ok((await f.request(again, "uploads/quota")).limit);
  await f.request("admin", "admin/party-card", { action: "close" });
  assert.equal((await f.request("admin", "admin/party-card")).state, "closed");
  await assert.rejects(f.request(null, "party-session", { token: second }), (e) => e.status === 403 && e.code === "PARTY_CLOSED");
  await assert.rejects(f.request(again, "uploads", f.startBody(await photo())), (e) => e.status === 401);
  // Turned on again: a new code; the closed one still does not work.
  const third = codeOf((await createCard(f)).url);
  assert.ok((await exchange(f, third)).csrf);
  await assert.rejects(f.request(null, "party-session", { token: second }), (e) => e.code === "PARTY_CARD_INVALID");
});

test("a card session can only upload: the gallery, photos, My account, messages, the invitation and Admin answer as signed out", async () => {
  const f = await setup();
  const phone = await exchange(f, codeOf((await createCard(f)).url));
  // An approved photo exists; the phone still cannot see it or its bytes.
  const approved = await f.upload("guest", await photo());
  await f.request("admin", "admin/moderation", { id: approved.id, collection: "photos", state: "approved" });
  for (const p of ["gallery", "photo/" + approved.id, "account", "messages", "invitation", "profile", "admin/moderation", "admin/party-card"])
    await assert.rejects(f.request(phone, p), (e) => e.status === 401 && e.code === "SIGN_IN_REQUIRED", p);
  for (const [p, body] of [
    ["messages", { kind: "guestbook", name: "A", text: "Hi", consent: true }],
    ["rsvp", {}],
    ["profile", {}],
    ["admin/party-card", { action: "close" }],
    ["logout-all", {}],
  ])
    await assert.rejects(f.request(phone, p, body), (e) => e.status === 401, p);
  // Without its CSRF token it cannot even upload.
  await assert.rejects(
    f.request({ cookie: phone.cookie, csrf: "wrong" }, "uploads", f.startBody(await photo())),
    (e) => e.status === 403 && e.code === "CSRF_REJECTED",
  );
});

test("a file from the card lands in the same review queue, labelled, with the optional name and a reference; consent is required", async () => {
  const f = await setup();
  const phone = await exchange(f, codeOf((await createCard(f)).url));
  const bytes = await photo();
  await assert.rejects(f.request(phone, "uploads", f.startBody(bytes, { consent: false })), (e) => e.code === "CONSENT_REQUIRED");
  await assert.rejects(f.request(phone, "uploads", f.startBody(bytes, { name: "x".repeat(61) })), (e) => e.code === "INVALID_TEXT");
  const sentBefore = f.sent.length;
  const done = await f.upload(phone, bytes, { name: "Mia", caption: "First dance" });
  assert.deepEqual(done, { id: done.id, received: bytes.length, complete: true, state: "review" });
  const row = (await f.state()).photos[done.id];
  assert.deepEqual(
    [row.state, row.source, row.uploaderName, row.caption, row.householdId, row.accountId],
    ["pending", "party", "Mia", "First dance", undefined, undefined],
  );
  assert.ok((await f.state()).notifications[done.id], "the family sees it in Admin");
  assert.equal(f.sent.length, sentBefore, "no email per table-card photo");
  const listed = (await f.request("admin", "admin/moderation")).photos.find((p) => p.id === done.id);
  assert.equal(listed.source, "party");
  assert.equal(listed.uploaderName, "Mia");
  assert.match(listed.ref, /^[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(listed.deviceId, undefined, "the phone's random name stays on the server");
  // Its own list, with the same reference the guest was shown.
  assert.deepEqual(await f.request(phone, "uploads/mine"), {
    pending: 1,
    files: [{ id: done.id, ref: listed.ref, kind: "photo", state: "review" }],
  });
  // The family approves it like any other; viewing still needs sign-in.
  await f.request("admin", "admin/moderation", { id: done.id, collection: "photos", state: "approved" });
  assert.ok((await f.request("guest", "gallery")).media.some((m) => m.id === done.id));
  await assert.rejects(f.request(null, "gallery"), (e) => e.status === 401);
});

test("each phone has its own cap and the card a total, with the refusal saying which", async () => {
  const f = await setup();
  const code = codeOf((await createCard(f)).url);
  const one = await exchange(f, code),
    two = await exchange(f, code);
  for (let i = 0; i < quota.perPartyDevice; i++) await f.request(one, "uploads", f.startBody(await photo()));
  const refused = await f.request(one, "uploads", f.startBody(await photo())).catch((e) => e);
  assert.equal(refused.status, 429);
  assert.equal(refused.code, "PARTY_DEVICE_LIMIT");
  assert.deepEqual(refused.details, {
    reason: "quota",
    scope: "device",
    limit: quota.perPartyDevice,
    used: quota.perPartyDevice,
    retryAt: null,
    now: new Date(f.now()).toISOString(),
  });
  assert.equal(refused.retryAfter, undefined, "no Retry-After: this count does not reset during the party");
  assert.deepEqual((await f.request(one, "uploads/quota")).remaining, 0);
  // Another phone still can, until the card's total is reached.
  assert.ok((await f.request(two, "uploads", f.startBody(await photo()))).id);
  const full = await f.request(two, "uploads", f.startBody(await photo())).catch((e) => e);
  assert.deepEqual([full.status, full.code, full.details.scope, full.details.limit], [429, "PARTY_CARD_FULL", "card", quota.perPartyCard]);
  // Families are not affected by the card's total.
  assert.ok((await f.request("guest", "uploads", f.startBody(await photo()))).id);
  assert.equal((await f.state()).partyCard.begun, quota.perPartyCard);
});

test("a phone can take back its own pending file, not anyone else's, and not after the review", async () => {
  const f = await setup();
  const code = codeOf((await createCard(f)).url);
  const mine = await exchange(f, code),
    theirs = await exchange(f, code);
  const kept = await f.upload(mine, await photo()),
    gone = await f.upload(mine, await photo());
  await assert.rejects(f.request(theirs, "uploads/withdraw", { id: gone.id }), (e) => e.code === "NOT_FOUND");
  await assert.rejects(f.request("guest", "uploads/withdraw", { id: gone.id }), (e) => e.code === "NOT_FOUND");
  await assert.rejects(f.request(theirs, "uploads/" + gone.id), (e) => e.code === "NOT_FOUND", "nor follow it");
  assert.deepEqual(await f.request(mine, "uploads/withdraw", { id: gone.id }), { withdrawn: true });
  const s = await f.state();
  assert.equal(s.photos[gone.id], undefined);
  assert.equal(f.media.objects.get(`private/photos/${gone.id}.jpg`), undefined, "the stored photo is deleted");
  await f.request("admin", "admin/moderation", { id: kept.id, collection: "photos", state: "approved" });
  await assert.rejects(f.request(mine, "uploads/withdraw", { id: kept.id }), (e) => e.code === "NOT_FOUND");
  assert.equal((await f.request(mine, "uploads/mine")).pending, 0);
});

test("nothing that identifies the card or the guest reaches the logs; the phone's counts are forgotten a week after the window", async () => {
  const f = await setup();
  const made = await createCard(f),
    code = codeOf(made.url);
  const phone = await exchange(f, code);
  await f.upload(phone, await photo(), { name: "Mia Example" });
  await f.request(null, "party-session", { token: token() }).catch(() => {});
  const deviceId = Object.values((await f.state()).sessions).find((s) => s.kind === "party").deviceId;
  const written = JSON.stringify(f.logs) + JSON.stringify((await f.state()).audit);
  for (const secret of [code, "Mia Example", deviceId, phone.cookie.slice(10)])
    assert.ok(!written.includes(secret), "not logged: " + secret.slice(0, 6));
  // A week after the window, the per-phone counts and the phone names go;
  // the file and the name the guest typed stay for the family's keepsakes.
  f.setNow(WINDOW_END + 7 * DAY);
  await f.app.processMedia();
  const s = await f.state();
  assert.equal(s.partyDevices, undefined);
  const row = Object.values(s.photos).find((r) => r.source === "party");
  assert.equal(row.deviceId, undefined);
  assert.equal(row.uploaderName, "Mia Example");
});

test("a family uploading during the party is unaffected by the card, and its upload is not labelled", async () => {
  const f = await setup();
  await createCard(f);
  const done = await f.upload("guest", await photo());
  const row = (await f.state()).photos[done.id];
  assert.equal(row.source, undefined);
  assert.ok(row.accountId);
  assert.equal((await f.request("guest", "uploads/quota")).limit, quota.perDayInUploadWindow);
});
