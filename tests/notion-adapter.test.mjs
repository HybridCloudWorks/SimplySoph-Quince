import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInvitation,
  notionClient,
  notionRetryable,
} from "../server/notion.mjs";
const page = (kids) => ({
  id: "12345678-1234-1234-1234-123456789012",
  properties: {
    Guest: { title: [{ plain_text: "Sample" }] },
    "Adults/Teens": { number: 2 },
    Kids: { rich_text: [{ plain_text: kids }] },
  },
});
test("Notion child counts parse deliberately and blanks/nonnumeric values block readiness", () => {
  assert.equal(normalizeInvitation(page("0")).capacity.kids, 0);
  assert.equal(normalizeInvitation(page(" 2 ")).capacity.kids, 2);
  for (const value of ["", "maybe", "-1", "1.5", "100"])
    assert.equal(normalizeInvitation(page(value)).validCapacity, false);
});
test("Notion projection preserves original invitation counts and RSVP delivery status", async () => {
  const requests = [];
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(
        JSON.stringify(
          options.method === "GET"
            ? { ...page("1"), parent: { data_source_id: "source" } }
            : {},
        ),
        { status: 200 },
      );
    },
  });
  await client.project(page("1").id, {
    id: "receipt-1",
    submittedAt: "2026-10-01T00:00:00Z",
    contact: { email: "", phone: "", address: null },
    requests: "",
    attendance: {
      ceremony: { adultsTeens: 1, kids: 0 },
      dinner: { adultsTeens: 2, kids: 1 },
      dance: { adultsTeens: 0, kids: 0 },
    },
  });
  const payload = JSON.parse(requests.at(-1).options.body).properties;
  assert.ok(!("Kids" in payload));
  assert.ok(!("Adults/Teens" in payload));
  assert.ok(!("RSVP" in payload));
  assert.equal(payload["Dinner kids"].number, 1);
});

test("WhatsApp consent is channel-specific and missing fields never inherit SMS consent", () => {
  const record = page("1");
  record.properties["SMS Consent"] = { checkbox: true };
  record.properties["SMS Consent Date"] = {
    date: { start: "2026-09-28T12:00:00Z" },
  };
  const before = normalizeInvitation(record);
  assert.equal(before.whatsappConsent, false);
  assert.equal(before.whatsappPhone, "");
  assert.equal(before.whatsappConsentAt, null);
  Object.assign(record.properties, {
    "WhatsApp Phone": { phone_number: "+525512345678" },
    "WhatsApp Language": { select: { name: "es" } },
    "WhatsApp Consent": { checkbox: true },
    "WhatsApp Consent Date": { date: { start: "2026-09-28T13:00:00Z" } },
    "WhatsApp Consent Source": {
      rich_text: [{ plain_text: "Verified WhatsApp START" }],
    },
    "WhatsApp Consent Version": { rich_text: [{ plain_text: "2026-09-28" }] },
    "WhatsApp Opt Out": { checkbox: true },
  });
  const after = normalizeInvitation(record);
  assert.equal(after.whatsappPhone, "+525512345678");
  assert.equal(after.whatsappLanguage, "es");
  assert.equal(after.whatsappConsent, true);
  assert.equal(after.whatsappOptOut, true);
  assert.equal(after.whatsappConsentSource, "Verified WhatsApp START");
  assert.equal(after.whatsappConsentVersion, "2026-09-28");
});

test("WhatsApp projection writes consent evidence and opt-out without changing SMS or guest contact", async () => {
  const requests = [];
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(
        JSON.stringify(
          options.method === "GET"
            ? { ...page("1"), parent: { data_source_id: "source" } }
            : {},
        ),
        { status: 200 },
      );
    },
  });
  const at = Date.parse("2026-09-28T13:00:00Z");
  await client.projectWhatsappConsent(page("1").id, {
    phone: "+525512345678",
    at,
    language: "es",
    source: "Verified WhatsApp START",
    version: "2026-09-28",
  });
  let properties = JSON.parse(requests.at(-1).options.body).properties;
  assert.equal(properties["WhatsApp Phone"].phone_number, "+525512345678");
  assert.equal(properties["WhatsApp Consent"].checkbox, true);
  assert.equal(
    properties["WhatsApp Consent Date"].date.start,
    new Date(at).toISOString(),
  );
  assert.equal(
    properties["WhatsApp Consent Source"].rich_text[0].text.content,
    "Verified WhatsApp START",
  );
  assert.equal(
    properties["WhatsApp Consent Version"].rich_text[0].text.content,
    "2026-09-28",
  );
  assert.equal(properties["WhatsApp Opt Out"].checkbox, false);
  assert.ok(
    Object.keys(properties).every((key) => key.startsWith("WhatsApp ")),
  );
  await client.projectWhatsappOptOut(page("1").id);
  properties = JSON.parse(requests.at(-1).options.body).properties;
  assert.deepEqual(properties, { "WhatsApp Opt Out": { checkbox: true } });
});

test("WhatsApp projection refuses a page outside the invitations data source", async () => {
  let writes = 0;
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    fetchImpl: async (url, options) => {
      if (options.method !== "GET") writes++;
      return new Response(
        JSON.stringify({ ...page("1"), parent: { data_source_id: "other" } }),
        { status: 200 },
      );
    },
  });
  await assert.rejects(() =>
    client.projectWhatsappConsent(page("1").id, {
      phone: "+525512345678",
      at: Date.now(),
      language: "es",
      source: "Verified WhatsApp START",
      version: "2026-09-28",
    }),
  );
  await assert.rejects(() => client.projectWhatsappOptOut(page("1").id));
  assert.equal(writes, 0);
});

function pacedClient(responder) {
  let now = 0;
  const calls = [],
    waits = [];
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    clock: () => now,
    sleep: async (ms) => {
      waits.push(ms);
      now += ms;
    },
    fetchImpl: async (url, options) => {
      calls.push(options.method + " " + url.split("/v1/")[1]);
      return responder(url, options, calls.length);
    },
  });
  return { client, calls, waits, advance: (ms) => (now += ms) };
}
const okPage = () =>
  new Response(JSON.stringify({ ...page("1"), parent: { data_source_id: "source" } }), { status: 200 });
const id = page("1").id;

test("roster reads are paced, cached briefly and refreshed after a write or on demand", async () => {
  const t = pacedClient((url, options) =>
    options.method === "GET" ? okPage() : new Response("{}", { status: 200 }),
  );
  await t.client.read(id);
  await t.client.read(id);
  assert.equal(t.calls.length, 1, "second read served from cache");
  await t.client.read(id, { fresh: true });
  assert.equal(t.calls.length, 2, "fresh read bypasses cache");
  assert.deepEqual(t.waits, [400], "requests are spaced 400 ms apart");
  await t.client.projectSmsOptOut(id);
  const before = t.calls.length;
  await t.client.read(id);
  assert.equal(t.calls.length, before + 1, "a write clears the cache");
  t.advance(30001);
  await t.client.read(id);
  assert.equal(t.calls.length, before + 2, "cache expires");
});

test("429 is retried for any request; 5xx is never retried for page creates", async () => {
  assert.equal(notionRetryable("POST", "pages", 429), true);
  assert.equal(notionRetryable("POST", "pages", 502), false);
  assert.equal(notionRetryable("POST", "data_sources/x/query", 502), true);
  assert.equal(notionRetryable("PATCH", "pages/x", 503), true);
  assert.equal(notionRetryable("GET", "pages/x", 404), false);
  const limited = pacedClient((url, options, n) =>
    n === 1
      ? new Response("{}", { status: 429, headers: { "retry-after": "2" } })
      : okPage(),
  );
  await limited.client.read(id, { fresh: true });
  assert.equal(limited.calls.length, 2);
  assert.ok(limited.waits.includes(2000));
  // Long provider pauses fail fast instead of holding a guest request open.
  const paused = pacedClient(
    () => new Response("{}", { status: 429, headers: { "retry-after": "30" } }),
  );
  await assert.rejects(
    () => paused.client.read(id, { fresh: true }),
    (e) => e.code === "NOTION_429",
  );
  assert.equal(paused.calls.length, 1);
});
test("invitation projection writes only the website-owned status and invited-event columns", async () => {
  const requests = [];
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(
        JSON.stringify(options.method === "GET" ? { ...page("1"), parent: { data_source_id: "source" } } : {}),
        { status: 200 },
      );
    },
  });
  await client.projectInvitation(page("1").id, {
    status: "Opened",
    at: "2026-10-10T12:00:00.000Z",
    invited: { ceremony: true, dinner: true, dance: false },
  });
  const patch = requests.at(-1);
  assert.equal(patch.options.method, "PATCH");
  assert.deepEqual(JSON.parse(patch.options.body).properties, {
    "Website invitation": { select: { name: "Opened" } },
    "Website invitation at": { date: { start: "2026-10-10T12:00:00.000Z" } },
    "Invited Ceremony": { checkbox: true },
    "Invited Dinner": { checkbox: true },
    "Invited Dance": { checkbox: false },
  });
  await client.projectInvitation(page("1").id, { status: "Issued", at: null, invited: {} });
  assert.equal(JSON.parse(requests.at(-1).options.body).properties["Website invitation at"].date, null);
});
