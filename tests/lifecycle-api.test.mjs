// What the API tells browsers about time (site/now.mjs, site/lifecycle.mjs):
// its own clock, whether the session's household replied, dated
// announcements newest first, and no invitation or reminder once the RSVP
// deadline has passed (they would still ask for an answer "by November 15").
import test from "node:test";
import assert from "node:assert/strict";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { createAdminRecords } from "../server/admin-records.mjs";
import { createWhatsapp } from "../server/whatsapp.mjs";
import { hash, token } from "../server/auth.mjs";
import { event } from "../site/content.mjs";

const origin = "https://misxv.simplysoph.com";
const DEADLINE = Date.parse(event.deadline);
const households = {
  a: "12345678-1234-4234-8234-12345678900a",
  b: "12345678-1234-4234-8234-12345678900b",
};
const batchId = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");

// The real application with an in-memory ledger and guest list. Every clock
// is the test's: `at` moves it, and nothing reads the real date.
async function fixture({ now = Date.parse("2026-10-01T18:00:00Z") } = {}) {
  let clock = now;
  const ledger = new Ledger(memoryAdapter()),
    adminToken = token(),
    links = {},
    sent = [];
  const rows = Object.fromEntries(
    Object.entries(households).map(([k, id]) => [
      id,
      {
        id,
        name: `Family ${k.toUpperCase()}`,
        capacity: { adultsTeens: 2, kids: 1 },
        email: `family-${k}@example.com`,
        phone: "",
        validCapacity: true,
        archived: false,
      },
    ]),
  );
  const notion = {
    read: async (id) => structuredClone(rows[id]),
    list: async () => structuredClone(Object.values(rows)),
    project: async () => {},
    projectContact: async () => {},
    projectAccount: async () => {},
    prepareSchema: async () => [],
  };
  const app = createApplication({
    ledger,
    notion,
    mailer: { configured: true, send: async (m) => sent.push(m) },
    verifyGoogle: async () => ({ id: "organizer", email: "organizer@gmail.com" }),
    key: Buffer.alloc(32, 4),
    origin,
    adminEmails: ["organizer@gmail.com"],
    now: () => clock,
    mailSleep: async () => {},
  });
  await ledger.transaction((s) => {
    s.sessions[hash(adminToken)] = {
      kind: "admin",
      actor: "organizer",
      email: "organizer@gmail.com",
      csrf: "admin-csrf",
      expiresAt: clock + 400 * 86400000,
    };
    for (const id of Object.values(households)) {
      links[id] = token();
      s.invitations[id] = {
        id,
        name: rows[id].name,
        active: true,
        generation: 1,
        tokenHash: hash(links[id]),
        invited: { ceremony: true, dinner: true, dance: true },
      };
    }
  });
  const call = (path, { body, cookie, csrf } = {}) =>
    app.dispatch({
      path: "/api/" + path.split("?")[0],
      query: Object.fromEntries(new URLSearchParams(path.split("?")[1] || "")),
      method: body ? "POST" : "GET",
      body,
      headers: { origin, ...(cookie && { cookie }), ...(csrf && { "x-csrf-token": csrf }) },
      ip: "test",
    });
  const admin = (path, body, query) =>
    app.dispatch({
      path: "/api/admin/" + path,
      query,
      method: body ? "POST" : "GET",
      body,
      headers: { origin, cookie: "__session=" + adminToken, "x-csrf-token": "admin-csrf" },
      ip: "admin",
    });
  // A household opening its private invitation link (an RSVP-only session).
  async function openLink(id) {
    const r = await call("invitation-session", { body: { token: links[id] } });
    return { cookie: r.setCookie.split(";")[0], csrf: r.csrf };
  }
  return {
    app,
    ledger,
    call,
    admin,
    openLink,
    reply: (session, coming) =>
      app.dispatch({
        path: "/api/rsvp",
        method: "POST",
        body: {
          previousSubmissionId: null,
          attendance: {
            ceremony: { adultsTeens: coming, kids: 0 },
            dinner: { adultsTeens: coming, kids: 0 },
            dance: { adultsTeens: 0, kids: 0 },
          },
          contact: { email: "", phone: "", address: null },
          requests: "",
        },
        headers: { origin, cookie: session.cookie, "x-csrf-token": session.csrf, "idempotency-key": token() },
        ip: "guest",
      }),
    sent,
    at: (ms) => (clock = ms),
    now: () => clock,
    adminCookie: "__session=" + adminToken,
  };
}

test("GET /api/config and GET /api/site carry the server's own clock", async () => {
  // A server clock nowhere near the real date: the field is the injected now(),
  // not the wall clock, so tests and browsers can rely on it.
  const f = await fixture({ now: Date.parse("2027-01-15T21:15:00-06:00") });
  const config = await f.call("config"),
    site = await f.call("site");
  assert.equal(config.now, "2027-01-16T03:15:00.000Z");
  assert.equal(site.now, "2027-01-16T03:15:00.000Z");
  assert.equal(config.deadline, event.deadline);
  assert.ok(site.site.ceremony.start);
  f.at(f.now() + 1234);
  assert.equal((await f.call("config")).now, "2027-01-16T03:15:01.234Z");
});

test("GET /api/session says only whether the session's own household replied", async () => {
  const f = await fixture();
  // Signed out: nothing about any household.
  const signedOut = await f.call("session");
  assert.equal(signedOut.kind, null);
  assert.equal("household" in signedOut, false);
  // An administrator is not a household.
  assert.equal("household" in (await f.call("session", { cookie: f.adminCookie })), false);
  assert.equal((await f.call("session", { cookie: f.adminCookie })).kind, "admin");

  const a = await f.openLink(households.a),
    b = await f.openLink(households.b);
  const household = async (s) => (await f.call("session", s)).household;
  assert.deepEqual(await household(a), { answered: false, answeredAt: null, answer: null });

  const saved = await f.reply(a, 2);
  assert.deepEqual(await household(a), { answered: true, answeredAt: saved.submittedAt, answer: "yes" });
  // Exactly these three facts: no name, counts, contact or household id.
  assert.deepEqual(Object.keys(await household(a)).sort(), ["answer", "answered", "answeredAt"]);
  assert.ok(!JSON.stringify(await f.call("session", a)).includes("Family"));
  // The other household's session sees its own state, not A's.
  assert.deepEqual(await household(b), { answered: false, answeredAt: null, answer: null });
  f.at(f.now() + 60_000);
  const declined = await f.reply(b, 0);
  assert.deepEqual(await household(b), { answered: true, answeredAt: declined.submittedAt, answer: "no" });
  assert.equal((await household(a)).answer, "yes");
  // A background check (?poll=1) answers the same and does not renew the session.
  const before = Object.values((await f.ledger.read()).sessions).find((x) => x.householdId === households.a).expiresAt;
  f.at(f.now() + 20 * 60_000);
  assert.equal((await f.call("session?poll=1", a)).household.answered, true);
  const after = Object.values((await f.ledger.read()).sessions).find((x) => x.householdId === households.a).expiresAt;
  assert.equal(after, before);
});

test("announcements: newest first by the moment each was published, dated, both languages for new ones", async () => {
  const f = await fixture();
  const t0 = f.now();
  // Saved unpublished first, published a day later (Record history).
  const records = createAdminRecords({ ledger: f.ledger, key: Buffer.alloc(32, 4), now: f.now });
  const draft = await records(
    {
      method: "POST",
      body: {
        kind: "announcements",
        action: "create",
        values: { title: "Dress code", text: "Formal", titleEs: "Vestimenta", textEs: "Formal" },
      },
    },
    { actor: "organizer" },
  );
  f.at(t0 + 3600_000);
  await f.admin("updates", { title: "Parking", text: "North lot", titleEs: "Estacionamiento", textEs: "Lote norte" });
  f.at(t0 + 86400_000);
  await records(
    { method: "POST", body: { kind: "announcements", action: "update", id: draft.id, version: 1, values: { published: true } } },
    { actor: "organizer" },
  );
  // An announcement from before publishedAt existed: dated by when it was made.
  await f.ledger.transaction((s) => {
    s.announcements.legacy = { id: "legacy", title: "Welcome", text: "Hello", titleEs: "", textEs: "", published: true, at: t0 - 86400_000 };
    s.announcements.hidden = { id: "hidden", title: "Hidden", text: "x", published: false, at: t0 + 2 * 86400_000 };
    s.announcements.gone = { id: "gone", title: "Gone", text: "x", published: true, archived: true, at: t0 + 2 * 86400_000, publishedAt: t0 + 2 * 86400_000 };
  });
  const { announcements } = await f.call("public");
  assert.deepEqual(
    announcements.map((a) => [a.title, a.publishedAt]),
    [
      ["Dress code", new Date(t0 + 86400_000).toISOString()],
      ["Parking", new Date(t0 + 3600_000).toISOString()],
      ["Welcome", new Date(t0 - 86400_000).toISOString()],
    ],
  );
  // Hidden and shown again, it is dated (and ordered) by its new publication.
  const parking = Object.values((await f.ledger.read()).announcements).find((a) => a.title === "Parking");
  assert.equal(parking.publishedAt, t0 + 3600_000);
  const edit = (values, version) =>
    records(
      { method: "POST", body: { kind: "announcements", action: "update", id: parking.id, version, values } },
      { actor: "organizer" },
    );
  await edit({ published: false }, 0);
  f.at(t0 + 2 * 86400_000);
  await edit({ published: true }, 1);
  assert.deepEqual(
    (await f.call("public")).announcements.map((a) => [a.title, a.publishedAt]).slice(0, 2),
    [
      ["Parking", new Date(t0 + 2 * 86400_000).toISOString()],
      ["Dress code", new Date(t0 + 86400_000).toISOString()],
    ],
  );

  // New announcements need Spanish too, by either form.
  await assert.rejects(
    () => f.admin("updates", { title: "Only English", text: "Hello" }),
    (e) => e.code === "SPANISH_REQUIRED" && e.status === 422,
  );
  await assert.rejects(
    () =>
      records(
        { method: "POST", body: { kind: "announcements", action: "create", values: { title: "Only English", text: "Hello" } } },
        { actor: "organizer" },
      ),
    (e) => e.code === "SPANISH_REQUIRED",
  );
  // Editing an existing English-only one still works.
  await records(
    { method: "POST", body: { kind: "announcements", action: "update", id: "legacy", version: 0, values: { notes: "kept" } } },
    { actor: "organizer" },
  );
});

test("after the RSVP deadline no invitation or reminder can be drafted, confirmed or sent", async () => {
  const f = await fixture({ now: DEADLINE - 120_000 });
  const a = households.a;
  // Drafted and confirmed before the deadline...
  const early = await f.admin("mail/invitation-batch", { requestId: batchId(1), type: "invitation", ids: [a] });
  assert.equal(early.total, 1);
  await f.admin("mail/batch/confirm", { id: batchId(1), count: 1 });
  const late = await f.admin("mail/invitation-batch", { requestId: batchId(2), type: "reminder", ids: [households.b] });
  assert.equal(late.total, 1);
  const single = await f.admin("mail/draft", { id: households.b, type: "invitation" });

  // ...and the deadline passes, exactly at its instant.
  f.at(DEADLINE);
  const closed = (e) => e.code === "INVITATIONS_CLOSED" && e.status === 409;
  await assert.rejects(() => f.admin("mail/invitation-batch", { requestId: batchId(3), type: "invitation", ids: [a] }), closed);
  await assert.rejects(() => f.admin("mail/invitation-batch", { requestId: batchId(4), type: "reminder", ids: [a] }), closed);
  await assert.rejects(() => f.admin("mail/batch/send", { id: batchId(1) }), closed);
  await assert.rejects(() => f.admin("mail/batch/confirm", { id: batchId(2), count: 1 }), closed);
  await assert.rejects(() => f.admin("mail/draft", { id: a, type: "reminder" }), closed);
  await assert.rejects(() => f.admin("mail/send", { id: single.id, confirm: true }), closed);
  assert.deepEqual(f.sent, []);
  // The drafts stay, to be cancelled; nothing was archived behind the family's back.
  const outbox = Object.values((await f.ledger.read()).outbox);
  assert.ok(outbox.every((j) => j.state === "draft" && !j.archived));
  await f.admin("mail/batch/cancel", { id: batchId(1) });
  // Other emails are not about replying, and still work.
  const details = await f.admin("mail/draft", { id: a, type: "details" });
  await f.admin("mail/send", { id: details.id, confirm: true });
  assert.equal(f.sent.length, 1);
});

test("one millisecond before the deadline invitations still go out", async () => {
  const f = await fixture({ now: DEADLINE - 60_000 });
  await f.admin("mail/invitation-batch", { requestId: batchId(5), type: "invitation", ids: [households.a] });
  await f.admin("mail/batch/confirm", { id: batchId(5), count: 1 });
  f.at(DEADLINE - 1);
  const r = await f.admin("mail/batch/send", { id: batchId(5) });
  assert.equal(r.accepted, 1);
});

test("WhatsApp invitation and reminder campaigns stop at the deadline too", async () => {
  let open = false;
  const whatsapp = createWhatsapp({
    ledger: null,
    notion: null,
    transport: { enabled: true },
    templates: [],
    invitationsOpen: () => open,
  });
  await assert.rejects(
    () => whatsapp.draft({ requestId: "campaign-1", ids: [], groups: [], templateKey: "invitation_en" }),
    (e) => e.code === "INVITATIONS_CLOSED",
  );
  await assert.rejects(() => whatsapp.send("draft-1", "token", "organizer"), (e) => e.code === "INVITATIONS_CLOSED");
  open = true;
  // Open again: the request reaches the usual checks (no such template here).
  await assert.rejects(
    () => whatsapp.draft({ requestId: "campaign-1", ids: [], groups: [], templateKey: "invitation_en" }),
    (e) => e.code === "WHATSAPP_TEMPLATE_UNAVAILABLE",
  );
});
