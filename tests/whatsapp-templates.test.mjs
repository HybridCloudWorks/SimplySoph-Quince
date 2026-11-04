import test from "node:test";
import assert from "node:assert/strict";
import {
  templateDrafts,
  nameSuffix,
  credentials,
  contentClient,
  submitTemplates,
  templateStatus,
  catalogEntry,
  main,
} from "../scripts/whatsapp-templates.mjs";
import { deadlineText } from "../server/whatsapp.mjs";
import { event } from "../site/content.mjs";

const sid = (n) => "HX" + String(n).repeat(32);

test("the four drafts carry the site's deadline the way the server checks it", () => {
  const drafts = templateDrafts();
  assert.deepEqual(
    drafts.map((d) => d.key),
    ["invitation_en", "invitation_es", "reminder_en", "reminder_es"],
  );
  for (const d of drafts) {
    assert.ok(d.body.includes(deadlineText(event.deadline, d.language)), d.key);
    assert.ok(d.body.startsWith("Simply Soph Media: "), d.key);
    assert.ok(d.body.includes("{{1}}"), d.key);
    assert.ok(/STOP/.test(d.body) && /HELP/.test(d.body), d.key);
    assert.match(d.name, /^[a-z0-9_]+$/);
    assert.equal(d.category, "MARKETING");
    assert.deepEqual(d.variables, { 1: "https://misxv.simplysoph.com/rsvp/" });
    assert.equal(d.body.includes("#"), false);
    assert.equal(/private link/i.test(d.body), false);
  }
  const es = drafts.filter((d) => d.language === "es");
  assert.ok(es.every((d) => d.body.includes("a más tardar el")));
  assert.ok(es.every((d) => !d.body.includes("antes del")));
  assert.equal(nameSuffix("2026-12-01T23:59:00-06:00"), "dec");
  assert.ok(drafts.every((d) => d.name.endsWith("_" + nameSuffix(event.deadline))));
  assert.throws(() => templateDrafts({ suffix: "Dec 1" }));
});

test("a catalog entry has exactly the shape server/whatsapp.mjs validates", () => {
  const [d] = templateDrafts();
  const entry = catalogEntry(d, { contentSid: sid("a"), status: "approved" });
  assert.deepEqual(Object.keys(entry).sort(), ["body", "category", "contentSid", "key", "language", "status", "variables"]);
  assert.match(entry.contentSid, /^HX[0-9a-f]{32}$/);
  assert.match(entry.key, /^(invitation|reminder)_(en|es)$/);
  assert.equal(JSON.stringify(entry.variables), '["1"]');
});

test("credentials prefer an API key, accept the account token, and refuse incomplete pairs", () => {
  assert.throws(() => credentials({}));
  assert.throws(() => credentials({ TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32) }));
  assert.deepEqual(credentials({ TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "fixture-token-value-only" }), {
    user: "AC" + "a".repeat(32),
    secret: "fixture-token-value-only",
  });
  const both = credentials({
    TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
    TWILIO_AUTH_TOKEN: "fixture-token-value-only",
    TWILIO_API_KEY_SID: "SK" + "b".repeat(32),
    TWILIO_API_KEY_SECRET: "fixture-key-secret-only",
  });
  assert.equal(both.user, "SK" + "b".repeat(32));
});

// A fake Content API: remembers what was created and which approvals were asked for.
function fakeContentApi(seed = {}) {
  const contents = new Map(Object.entries(seed.contents || {}));
  const approvals = new Map(Object.entries(seed.approvals || {}));
  const calls = [];
  let n = 0;
  const fetchImpl = async (url, init) => {
    const path = url.replace("https://content.twilio.com/v1/", "");
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path, method: init.method, body, auth: init.headers.Authorization });
    const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
    if (path.startsWith("Content?")) return json(200, { contents: [...contents.values()] });
    if (path === "Content" && init.method === "POST") {
      const id = sid(++n);
      contents.set(body.friendly_name, { sid: id, friendly_name: body.friendly_name, language: body.language });
      return json(201, { sid: id });
    }
    const m = path.match(/^Content\/(HX[0-9a-f]+)\/ApprovalRequests(\/whatsapp)?$/);
    if (m && !m[2]) return json(200, approvals.has(m[1]) ? { sid: m[1], whatsapp: approvals.get(m[1]) } : { sid: m[1] });
    if (m && m[2] && init.method === "POST") {
      approvals.set(m[1], { status: "received", rejection_reason: "", name: body.name, category: body.category });
      return json(201, { status: "received", name: body.name, category: body.category });
    }
    return json(404, { message: "not found" });
  };
  return { fetchImpl, calls, contents, approvals };
}

test("submit creates what is missing, requests approval once, and is idempotent", async () => {
  const api = fakeContentApi();
  const call = contentClient({ user: "AC" + "a".repeat(32), secret: "fixture-token-value-only" }, api.fetchImpl);
  const drafts = templateDrafts();
  const first = await submitTemplates({ drafts, call });
  assert.equal(first.length, 4);
  assert.ok(first.every((r) => r.created && r.requested && r.status === "received"));
  assert.equal(api.calls.filter((c) => c.path === "Content" && c.method === "POST").length, 4);
  const create = api.calls.find((c) => c.path === "Content" && c.method === "POST");
  assert.deepEqual(Object.keys(create.body).sort(), ["friendly_name", "language", "types", "variables"]);
  assert.equal(create.body.types["twilio/text"].body, drafts[0].body);
  assert.deepEqual(create.body.variables, { 1: "https://misxv.simplysoph.com/rsvp/" });
  const approve = api.calls.find((c) => c.path.endsWith("/ApprovalRequests/whatsapp"));
  assert.deepEqual(approve.body, { name: drafts[0].name, category: "MARKETING" });
  assert.ok(api.calls.every((c) => c.auth.startsWith("Basic ")));
  assert.equal(JSON.stringify(api.calls).includes("fixture-token-value-only"), false);

  const before = api.calls.length;
  const second = await submitTemplates({ drafts, call });
  assert.ok(second.every((r) => !r.created && !r.requested && r.status === "received"));
  assert.equal(api.calls.slice(before).filter((c) => c.method === "POST").length, 0);
});

test("status reports each draft and builds a catalog of the submitted ones", async () => {
  const drafts = templateDrafts();
  const api = fakeContentApi({
    contents: { [drafts[0].name]: { sid: sid("c"), friendly_name: drafts[0].name } },
    approvals: { [sid("c")]: { status: "approved", rejection_reason: "" } },
  });
  const call = contentClient({ user: "AC" + "a".repeat(32), secret: "fixture-token-value-only" }, api.fetchImpl);
  const rows = await templateStatus({ drafts, call });
  assert.equal(rows[0].status, "approved");
  assert.ok(rows.slice(1).every((r) => r.status === "not-created" && r.contentSid === null));
  const lines = [];
  const code = await main(
    ["status"],
    { TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32), TWILIO_AUTH_TOKEN: "fixture-token-value-only" },
    api.fetchImpl,
    (l) => lines.push(l),
  );
  assert.equal(code, 1, "not every template is approved yet");
  const report = JSON.parse(lines.join("\n"));
  const catalog = JSON.parse(report.WHATSAPP_TEMPLATES_JSON);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].contentSid, sid("c"));
  assert.equal(catalog[0].status, "approved");
  assert.equal(lines.join("\n").includes("fixture-token-value-only"), false);
});

test("plan prints the drafts without calling anything, and a bad command explains usage", async () => {
  const lines = [];
  const code = await main(["plan"], {}, () => assert.fail("no network"), (l) => lines.push(l));
  assert.equal(code, 0);
  const plan = JSON.parse(lines.join("\n"));
  assert.equal(plan.drafts.length, 4);
  assert.equal(plan.deadline, event.deadline);
  const usage = [];
  assert.equal(await main(["bogus"], {}, () => assert.fail("no network"), (l) => usage.push(l)), 2);
  assert.match(usage[0], /Usage/);
});

test("a refused call surfaces Twilio's message, not the request", async () => {
  const call = contentClient({ user: "AC" + "a".repeat(32), secret: "fixture-token-value-only" }, async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ message: "Authentication Error - invalid username" }),
  }));
  await assert.rejects(() => call("Content?PageSize=100"), /Authentication Error - invalid username/);
});
