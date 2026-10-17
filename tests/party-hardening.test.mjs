// Hardening of the table card and the upload path (security review round 5):
// a card session is a signed cookie, so scanning the card costs the ledger
// nothing and locks no one out (P5-03); opening uploads without sending them
// costs the card nothing, and each new code counts from zero (P5-01); an
// upload slot goes only to a session's own open upload, and table card
// phones share at most half of them (P5-02); the removal reference is random
// and only for its uploader (P5-09). Every name and file is made up.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createHmac, hkdfSync, randomUUID } from "node:crypto";
import { fixture, photo, origin, key, WINDOW_END } from "./upload-fixture.mjs";
import { createHttpServer } from "../server/http.mjs";
import { cookie as sessionCookie, hash, token } from "../server/auth.mjs";
import { referenceCode } from "../site/upload-batch.mjs";
import { UPLOAD_UNIT } from "../server/store.mjs";

const PARTY_NIGHT = Date.parse("2027-01-15T21:15:00-06:00");
const codeOf = (url) => /#party=([A-Za-z0-9_-]{43})$/.exec(url)[1];
async function cardFixture(options = {}) {
  const f = await fixture({ at: PARTY_NIGHT, ...options });
  const made = await f.request("admin", "admin/party-card", { action: "create" });
  return { f, code: codeOf(made.url) };
}
async function exchange(f, code, extra) {
  const r = await f.request(null, "party-session", { token: code }, extra);
  return { cookie: r.setCookie.split(";")[0], csrf: r.csrf, setCookie: r.setCookie };
}
const payloadOf = (cookie) => JSON.parse(Buffer.from(cookie.slice(10).split(".")[1], "base64url").toString());
// Counts the ledger's saves from here on.
function countWrites(f) {
  const save = f.ledger.adapter.save.bind(f.ledger.adapter);
  const counter = { writes: 0 };
  f.ledger.adapter.save = (...a) => (counter.writes++, save(...a));
  return counter;
}
const REF = /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;

// ---- P5-03: the session is a signed cookie --------------------------------

test("a thousand scans of the card write nothing to the ledger, spend no shared budget and lock no guest out", async () => {
  const { f, code } = await cardFixture();
  const counted = countWrites(f);
  for (let i = 0; i < 1000; i++) await exchange(f, code);
  assert.equal(counted.writes, 0, "no ledger write per scan");
  assert.equal(Object.values((await f.state()).sessions).filter((s) => s.kind === "party").length, 0);
  // A real guest scanning now, and an hour on, gets in and can upload.
  const guest = await exchange(f, code);
  assert.ok((await f.upload(guest, await photo())).complete);
  f.advance(59 * 60000);
  assert.ok((await exchange(f, code)).csrf);
});

test("40 scans at once, then 40 card uploads opened at once, never make a family's write BUSY", async () => {
  const { f, code } = await cardFixture();
  // A storage write that takes 150 ms, as on Cloud Storage.
  const save = f.ledger.adapter.save.bind(f.ledger.adapter);
  f.ledger.adapter.save = async (...a) => {
    await new Promise((r) => setTimeout(r, 150));
    return save(...a);
  };
  const familyWrite = () =>
    f.request("guest", "uploads", { kind: "photo", type: "image/jpeg", size: 10, album: "event", caption: "", consent: true });
  const scans = Array.from({ length: 40 }, () => exchange(f, code).catch((e) => e));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok((await familyWrite()).id, "the family's write goes through");
  const phones = await Promise.all(scans);
  assert.equal(phones.filter((p) => p.csrf).length, 40, "every scan worked");
  // Phones are free to make, so the writes they can cause wait their turn.
  const opens = phones.map((p) => f.request(p, "uploads", f.startBody(Buffer.alloc(10))).catch((e) => e));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok((await familyWrite()).id, "still goes through while 40 phones open uploads");
  const results = await Promise.all(opens);
  assert.equal(results.filter((r) => r.code === "BUSY").length, 0, "the ledger's queue never filled");
  assert.ok(results.filter((r) => r.id).length >= 4);
  assert.deepEqual(new Set(results.filter((r) => !r.id).map((r) => r.status + " " + r.code)), new Set(["503 UPLOAD_BUSY"]));
});

test("wrong codes can turn more wrong codes into 429, never the card's real code", async () => {
  const { f, code } = await cardFixture();
  for (let i = 0; i < 300; i++)
    await assert.rejects(f.request(null, "party-session", { token: token() }), { status: 401, code: "PARTY_CARD_INVALID" });
  await assert.rejects(f.request(null, "party-session", { token: token() }), { status: 429, code: "TOO_MANY_REQUESTS" });
  for (let i = 0; i < 5; i++) assert.ok((await exchange(f, code)).csrf);
});

test("the cookie: today's attributes, signed with a key of its own, refused when changed, expired or for an old code", async () => {
  const { f, code } = await cardFixture();
  const phone = await exchange(f, code);
  const value = phone.cookie.slice(10);
  assert.equal(phone.setCookie, sessionCookie(value), "Path=/api, HttpOnly, Secure, SameSite=Strict, as for every session");
  assert.match(value, /^p\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  const p = payloadOf(phone.cookie);
  assert.deepEqual(Object.keys(p).sort(), ["cardVersion", "deviceId", "expiresAt", "issuedAt", "kind"]);
  assert.equal(p.kind, "party");
  assert.equal(Buffer.from(p.deviceId, "base64url").length, 16, "128 random bits");
  assert.equal(p.expiresAt, PARTY_NIGHT + 30 * 60000);
  assert.equal((await f.request(phone, "session")).kind, "party");
  // The page's CSRF token is the session's.
  assert.equal((await f.request(phone, "session")).csrf, phone.csrf);
  await assert.rejects(
    f.request({ cookie: phone.cookie, csrf: phone.csrf.replace(/^./, (c) => (c === "A" ? "B" : "A")) }, "uploads", f.startBody(Buffer.alloc(10))),
    { status: 403, code: "CSRF_REJECTED" },
  );
  // How the MAC is made: HMAC-SHA256 under a key derived from the app key
  // with its own label. A cookie made with the app key itself, or with the
  // right key over a changed payload, is a stranger.
  const sign = (k, payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return { cookie: "__session=p." + body + "." + createHmac("sha256", k).update("cookie\n" + body).digest("base64url"), csrf: phone.csrf };
  };
  const derived = Buffer.from(hkdfSync("sha256", key, Buffer.alloc(0), "misxv/party-session/v1", 32));
  assert.equal(sign(derived, p).cookie, phone.cookie, "the documented derivation");
  const kind = async (c) => (await f.request(c, "session")).kind;
  assert.equal(await kind(sign(key, p)), null, "the app key itself does not sign sessions");
  const [head, body] = value.split(".").slice(0, 2);
  const changed = { ...p, deviceId: "A".repeat(22) };
  const forged = "__session=" + head + "." + Buffer.from(JSON.stringify(changed)).toString("base64url") + "." + value.split(".")[2];
  assert.equal(await kind({ cookie: forged, csrf: phone.csrf }), null, "a changed payload");
  assert.equal(await kind({ cookie: "__session=" + head + "." + body + "." + "A".repeat(43), csrf: phone.csrf }), null, "a changed MAC");
  // Expired.
  f.advance(30 * 60000);
  assert.equal(await kind(phone), null);
  // A session row of the old kind in the ledger no longer counts.
  const legacy = { cookie: "__session=" + token(), csrf: token() };
  await f.ledger.transaction((s) => {
    s.sessions[hash(legacy.cookie.slice(10))] = { kind: "party", scope: "upload", deviceId: randomUUID(), cardVersion: s.partyCard.version, csrf: legacy.csrf, startedAt: f.now(), expiresAt: f.now() + 600000 };
  });
  assert.equal(await kind(legacy), null);
});

test("renewing a card session writes nothing, keeps the phone's name and CSRF token, and never passes the window", async () => {
  const { f, code } = await cardFixture({ at: WINDOW_END - 50 * 60000 });
  const phone = await exchange(f, code);
  const first = payloadOf(phone.cookie);
  const counted = countWrites(f);
  f.advance(20 * 60000); // 10 minutes left
  const answer = await f.request(phone, "uploads/quota");
  assert.ok(answer.setCookie, "renewed");
  const renewed = { cookie: answer.setCookie.split(";")[0], csrf: phone.csrf };
  const next = payloadOf(renewed.cookie);
  assert.deepEqual([next.deviceId, next.issuedAt, next.cardVersion], [first.deviceId, first.issuedAt, first.cardVersion]);
  assert.equal(next.expiresAt, WINDOW_END, "capped at the window's end");
  assert.equal(counted.writes, 0);
  assert.equal((await f.request(renewed, "session")).csrf, phone.csrf);
  assert.ok((await f.request(renewed, "uploads", f.startBody(Buffer.alloc(10)))).id, "the page's token still works");
  // Scanning again keeps the phone's name (and so its count); a new code does not.
  const again = await exchange(f, code, { headers: { cookie: renewed.cookie } });
  assert.equal(payloadOf(again.cookie).deviceId, first.deviceId);
  const rotated = codeOf((await f.request("admin", "admin/party-card", { action: "rotate" })).url);
  const fresh = await exchange(f, rotated, { headers: { cookie: again.cookie } });
  assert.notEqual(payloadOf(fresh.cookie).deviceId, first.deviceId);
  assert.equal((await f.request(again, "session")).kind, null, "the old code's session ended");
});

test("signing out of a card session writes nothing and clears the cookie", async () => {
  const { f, code } = await cardFixture();
  const phone = await exchange(f, code);
  const counted = countWrites(f);
  const out = await f.request(phone, "logout", {});
  assert.match(out.setCookie, /^__session=; Path=\/api;.*Max-Age=0$/);
  assert.equal(counted.writes, 0);
});

// ---- P5-01: only stored files count; each code counts from zero ----------

test("opening uploads without sending a byte costs the card and the phone nothing", async () => {
  const { f, code } = await cardFixture({ uploadQuota: { perPartyDevice: 2, perPartyCard: 3 } });
  // One holder of the card: many phones, many uploads opened, nothing sent.
  const bytes = await photo();
  let opened = 0;
  for (let i = 0; i < 20; i++) {
    const phone = await exchange(f, code);
    for (let j = 0; j < 6; j++) {
      await f.request(phone, "uploads", f.startBody(bytes));
      opened++;
    }
  }
  assert.equal(opened, 120);
  const s = await f.state();
  assert.equal(s.partyCard.received, 0);
  assert.equal(Object.keys(s.partyDevices || {}).length, 0, "no phone was counted");
  // Unfinished table card uploads are bounded (here by the card's 3).
  assert.ok(Object.values(s.uploads).filter((u) => u.source === "party" && u.state === "receiving").length <= 3);
  // A real guest shares; a phone that opened and abandoned uploads still has its whole count.
  const guest = await exchange(f, code);
  for (let j = 0; j < 5; j++) await f.request(guest, "uploads", f.startBody(bytes));
  assert.ok((await f.upload(guest, bytes)).complete);
  assert.ok((await f.upload(guest, bytes)).complete);
  const refused = await f.request(guest, "uploads", f.startBody(bytes)).catch((e) => e);
  assert.deepEqual([refused.status, refused.code], [429, "PARTY_DEVICE_LIMIT"]);
  assert.equal((await f.state()).partyCard.received, 2);
});

test("a phone keeps at most 10 unfinished uploads: opening an 11th gives up its oldest", async () => {
  const { f, code } = await cardFixture();
  const phone = await exchange(f, code);
  const ids = [];
  for (let i = 0; i < 12; i++) ids.push((await f.request(phone, "uploads", f.startBody(await photo()))).id);
  const open = Object.values((await f.state()).uploads).filter((u) => u.source === "party" && u.state === "receiving");
  assert.equal(open.length, 10);
  assert.deepEqual(new Set(open.map((u) => u.id)), new Set(ids.slice(2)));
  await assert.rejects(f.request(phone, "uploads/" + ids[0], null, { bytes: Buffer.alloc(10), query: { offset: "0" } }), { status: 404 });
});

test("a new code counts from zero, and Admin still shows every file the card brought", async () => {
  const { f, code } = await cardFixture({ uploadQuota: { perPartyDevice: 2, perPartyCard: 3 } });
  const one = await exchange(f, code),
    two = await exchange(f, code);
  await f.upload(one, await photo());
  await f.upload(one, await photo());
  await f.upload(two, await photo());
  const three = await exchange(f, code);
  await assert.rejects(f.request(three, "uploads", f.startBody(await photo())), { status: 429, code: "PARTY_CARD_FULL" });
  const rotated = codeOf((await f.request("admin", "admin/party-card", { action: "rotate" })).url);
  const four = await exchange(f, rotated);
  assert.ok((await f.upload(four, await photo())).complete, "the new code has its own total");
  const status = await f.request("admin", "admin/party-card");
  assert.deepEqual([status.files, status.filesThisCode, status.perCard], [4, 1, 3]);
  // Turned off and on again: a new code, counting from zero too.
  await f.request("admin", "admin/party-card", { action: "close" });
  const again = codeOf((await f.request("admin", "admin/party-card", { action: "create" })).url);
  assert.ok((await f.upload(await exchange(f, again), await photo())).complete);
  const later = await f.request("admin", "admin/party-card");
  assert.deepEqual([later.files, later.filesThisCode], [5, 1]);
});

test("a file that arrives after its phone's count is used up is refused, and nothing of it is kept", async () => {
  const { f, code } = await cardFixture({ uploadQuota: { perPartyDevice: 2, perPartyCard: 1500 } });
  const phone = await exchange(f, code);
  const bytes = await photo();
  // A script opens three at once, before any is stored.
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await f.request(phone, "uploads", f.startBody(bytes))).id);
  const send = (id) => f.request(phone, "uploads/" + id, null, { bytes, query: { offset: "0" } }).catch((e) => e);
  assert.ok((await send(ids[0])).complete);
  assert.ok((await send(ids[1])).complete);
  const third = await send(ids[2]);
  assert.deepEqual([third.status, third.code, third.details.scope, third.details.limit], [429, "PARTY_DEVICE_LIMIT", "device", 2]);
  const s = await f.state();
  assert.equal(s.photos[ids[2]], undefined);
  assert.equal(f.media.objects.get(`private/photos/${ids[2]}.jpg`), undefined, "no stored photo");
  assert.equal(f.media.objects.get(`private/uploads/${ids[2]}`), undefined, "no stored upload");
  assert.equal(s.partyDevices[payloadOf(phone.cookie).deviceId].length, 2);
  // Sent again, the same refusal.
  assert.equal((await send(ids[2])).code, "PARTY_DEVICE_LIMIT");
});

test("the card's total holds exactly when more files are under way than it has room for", async () => {
  const { f, code } = await cardFixture({ uploadQuota: { perPartyDevice: 30, perPartyCard: 3 } });
  const bytes = await photo();
  const first = await exchange(f, code);
  await f.upload(first, bytes);
  await f.upload(first, bytes);
  // Two phones open one each while there is room for one more.
  const b = await exchange(f, code),
    c = await exchange(f, code);
  const idB = (await f.request(b, "uploads", f.startBody(bytes))).id,
    idC = (await f.request(c, "uploads", f.startBody(bytes))).id;
  assert.ok((await f.request(b, "uploads/" + idB, null, { bytes, query: { offset: "0" } })).complete);
  const late = await f.request(c, "uploads/" + idC, null, { bytes, query: { offset: "0" } }).catch((e) => e);
  assert.deepEqual([late.status, late.code, late.details.scope], [429, "PARTY_CARD_FULL", "card"]);
  const s = await f.state();
  assert.equal(s.partyCard.received, 3);
  assert.equal(s.photos[idC], undefined);
  assert.equal(f.media.objects.get(`private/photos/${idC}.jpg`), undefined);
});

// ---- P5-09: the removal reference -----------------------------------------

test("the removal reference is random, shown to its phone and to Admin, and never in the gallery", async () => {
  const { f, code } = await cardFixture();
  const phone = await exchange(f, code),
    other = await exchange(f, code);
  const bytes = await photo();
  const done = await f.upload(phone, bytes, { name: "Mia" });
  assert.match(done.ref, REF);
  assert.notEqual(done.ref, referenceCode(done.id), "not taken from the id, which signed-in guests can see");
  assert.equal((await f.state()).photos[done.id].ref, done.ref);
  // The last piece sent again (its answer lost): the same answer, same reference.
  const again = await f.request(phone, "uploads/" + done.id, null, { bytes, query: { offset: "0" } });
  assert.equal(again.ref, done.ref);
  assert.deepEqual((await f.request(phone, "uploads/mine")).files.map((x) => x.ref), [done.ref]);
  assert.deepEqual((await f.request(other, "uploads/mine")).files, []);
  const admin = (await f.request("admin", "admin/moderation")).photos.find((p) => p.id === done.id);
  assert.equal(admin.ref, done.ref);
  await f.request("admin", "admin/moderation", { id: done.id, collection: "photos", state: "approved" });
  const gallery = JSON.stringify(await f.request("guest", "gallery"));
  assert.ok(gallery.includes(done.id));
  assert.ok(!gallery.includes(done.ref), "the gallery never carries it");
  const manifest = JSON.stringify(await f.request("guest", "gallery/archive"));
  assert.ok(!manifest.includes(done.ref));
  // A family's own upload has none.
  assert.equal((await f.upload("guest", bytes)).ref, undefined);
  // A file stored before references were random keeps its old one in Admin.
  const old = "33333333-3333-4333-8333-333333333333";
  await f.ledger.transaction((s) => {
    s.photos[old] = { id: old, kind: "photo", album: "event", caption: "", state: "pending", source: "party" };
  });
  assert.equal((await f.request("admin", "admin/moderation")).photos.find((p) => p.id === old).ref, "3333-3333");
});

// ---- P5-02: an upload slot only for the session's own open upload --------

async function serve(t, f, options = {}) {
  const server = createHttpServer({ app: f.app, root: process.cwd(), origin, ...options });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  });
  return server.address().port;
}
// A piece whose body arrives slowly: 1 KB now, the rest never (until stopped).
function trickle(port, who, id) {
  const req = http.request({
    host: "127.0.0.1",
    port,
    method: "POST",
    path: `/api/uploads/${id}?offset=0`,
    headers: { origin, "content-type": "application/octet-stream", cookie: who.cookie, "x-csrf-token": who.csrf, "transfer-encoding": "chunked" },
  });
  const answered = new Promise((resolve) => {
    req.on("response", (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, error: text ? JSON.parse(text).error : null }));
    });
    req.on("error", () => resolve({ status: 0, error: "connection closed" }));
  });
  req.write(Buffer.alloc(1024));
  return { req, answered };
}
const send = async (port, who, id, bytes, offset = 0) => {
  const r = await fetch(`http://127.0.0.1:${port}/api/uploads/${id}?offset=${offset}`, {
    method: "POST",
    headers: { origin, "content-type": "application/octet-stream", cookie: who.cookie, "x-csrf-token": who.csrf },
    body: bytes,
  });
  return { status: r.status, ...(await r.json()) };
};
const settle = () => new Promise((r) => setTimeout(r, 150));

test("over HTTP: phones sending slow bodies to made-up uploads hold no slot, and a family's piece goes through", async (t) => {
  const { f, code } = await cardFixture();
  const port = await serve(t, f);
  const phones = [];
  for (let i = 0; i < 8; i++) phones.push(await exchange(f, code));
  const slow = phones.map((p) => trickle(port, p, randomUUID()));
  t.after(() => slow.forEach((s) => s.req.destroy()));
  await settle();
  const bytes = await photo();
  const { id } = await f.request("guest", "uploads", f.startBody(bytes));
  const family = await send(port, f.cookies.guest, id, bytes);
  assert.equal(family.status, 200, "not UPLOAD_BUSY");
  assert.equal(family.complete, true);
  // Each was refused at once, before its body was read.
  assert.deepEqual(
    (await Promise.all(slow.map((s) => s.answered))).map((a) => a.status + " " + a.error),
    Array(8).fill("404 NOT_FOUND"),
  );
});

test("over HTTP: table card phones with uploads of their own hold at most 4 of the 8 slots", async (t) => {
  const { f, code } = await cardFixture();
  const port = await serve(t, f);
  const bytes = await photo();
  const slow = [];
  for (let i = 0; i < 6; i++) {
    const phone = await exchange(f, code);
    const { id } = await f.request(phone, "uploads", f.startBody(bytes));
    slow.push(trickle(port, phone, id));
    await settle();
  }
  t.after(() => slow.forEach((s) => s.req.destroy()));
  const busy = await Promise.race([
    Promise.all(slow.slice(4).map((s) => s.answered)),
    new Promise((r) => setTimeout(() => r("still reading"), 2000)),
  ]);
  assert.deepEqual(busy, [
    { status: 503, error: "UPLOAD_BUSY" },
    { status: 503, error: "UPLOAD_BUSY" },
  ]);
  for (const who of ["guest", "other"]) {
    const { id } = await f.request(who, "uploads", f.startBody(bytes));
    assert.equal((await send(port, f.cookies[who], id, bytes)).status, 200, who + " still gets a slot");
  }
});

test("over HTTP: a slot is given back after an answer, a refusal, a client that goes away and a body that stalls", async (t) => {
  const { f, code } = await cardFixture();
  // The slow body's second write comes 300 ms in: well past slowAfterMs, and
  // far enough inside idleMs that a busy machine can't turn the 408 into an
  // idle drop. A slot kept until the idle time would also fail "goes away".
  const port = await serve(t, f, { idleMs: 2000, slowAfterMs: 200 });
  const bytes = await photo();
  const phone = await exchange(f, code);
  const open = async () => (await f.request(phone, "uploads", f.startBody(bytes))).id;
  // One slot per person: if a slot were kept, this phone's next piece would
  // be UPLOAD_BUSY.
  const works = async () => {
    const id = await open();
    const r = await send(port, phone, id, bytes);
    assert.deepEqual([r.status, r.complete], [200, true]);
  };
  await works(); // answered
  const bad = await send(port, phone, await open(), bytes.subarray(0, 100), UPLOAD_UNIT / 2);
  assert.deepEqual([bad.status, bad.error], [422, "INVALID_PIECE"]); // refused after reading
  await works();
  const gone = trickle(port, phone, await open()); // the client goes away
  await settle();
  gone.req.destroy();
  await settle();
  await works();
  const stalled = trickle(port, phone, await open()); // nothing more arrives
  assert.equal((await stalled.answered).status, 0, "dropped after the idle time");
  await works();
  const slowly = trickle(port, phone, await open()); // too slow on average
  await new Promise((r) => setTimeout(r, 300));
  slowly.req.write(Buffer.alloc(1));
  assert.deepEqual(await slowly.answered, { status: 408, error: "UPLOAD_TOO_SLOW" });
  slowly.req.destroy();
  await works();
});

test("over HTTP: a finished upload's last piece sent again is answered without a slot or its body", async (t) => {
  const { f, code } = await cardFixture();
  const port = await serve(t, f);
  const bytes = await photo();
  const phone = await exchange(f, code);
  const { id } = await f.request(phone, "uploads", f.startBody(bytes));
  const first = await send(port, phone, id, bytes);
  // The same phone is busy sending another file.
  const other = (await f.request(phone, "uploads", f.startBody(bytes))).id;
  const slow = trickle(port, phone, other);
  t.after(() => slow.req.destroy());
  await settle();
  const again = await send(port, phone, id, bytes);
  assert.deepEqual(again, first);
  // A stranger's guess at the same id is refused before its body is read.
  const stranger = await exchange(f, code);
  assert.deepEqual(await send(port, stranger, id, bytes), { status: 404, error: "NOT_FOUND" });
});

// ---- QA-01, QA-02, a11y-01: when a card session ends ----------------------

test("a card phone whose session ended is told why (expired, replaced, closed), never to sign in, and its page learns how long a live one has left", async () => {
  const { f, code } = await cardFixture();
  const phone = await exchange(f, code);
  const session = (who = phone, query) => f.request(who, "session", null, { query });
  const refused = (who) => f.request(who, "uploads", f.startBody(Buffer.alloc(10))).then(() => null, (e) => e);
  // Live: how long it has left; a check-in in its last 15 minutes renews it.
  assert.equal((await session()).expiresIn, 30 * 60000);
  f.advance(20 * 60000);
  assert.equal((await session(phone, { poll: "1" })).expiresIn, 10 * 60000, "a background check renews nothing");
  assert.equal((await session()).expiresIn, 30 * 60000, "the reply counts its own renewal");
  // Idle past the end (this phone never stored the renewed cookie).
  f.advance(10 * 60000 + 1);
  assert.deepEqual(await session(), { kind: null, csrf: null, verified: false, scope: null, owner: false, partyEnded: "expired" });
  const expired = await refused(phone);
  assert.equal(expired.status, 401);
  assert.equal(expired.code, "PARTY_SESSION_ENDED");
  assert.deepEqual(expired.details, { reason: "expired", closesAt: new Date(WINDOW_END).toISOString() });
  // Replaced: the family makes a new code.
  const second = await exchange(f, code);
  const { url } = await f.request("admin", "admin/party-card", { action: "rotate" });
  assert.equal((await refused(second)).details.reason, "rotated");
  assert.equal((await session(second)).partyEnded, "rotated");
  // Closed: the upload window ends between two requests.
  f.setNow(WINDOW_END - 60000);
  const late = await exchange(f, codeOf(url));
  assert.equal((await session(late)).kind, "party");
  f.setNow(WINDOW_END);
  assert.equal((await refused(late)).details.reason, "closed");
  assert.equal((await session(late)).partyEnded, "closed");
  // A cookie that is not a genuine card cookie is simply signed out.
  const forged = { cookie: phone.cookie.slice(0, -2) + (phone.cookie.endsWith("AA") ? "BB" : "AA"), csrf: phone.csrf };
  assert.equal((await refused(forged)).code, "SIGN_IN_REQUIRED");
  assert.equal((await session(forged)).partyEnded, undefined);
});
