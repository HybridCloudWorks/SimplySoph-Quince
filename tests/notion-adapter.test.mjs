import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeInvitation,
  notionClient,
  notionRetryable,
  projectionSchema,
} from "../server/notion.mjs";
import { planningSources } from "../server/planning-notion.mjs";
import { validatePlanning } from "../server/planning.mjs";
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
test("Notion projection preserves original invitation counts and writes the family's RSVP column", async () => {
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
  const response = {
    id: "receipt-1",
    submittedAt: "2026-10-01T00:00:00Z",
    contact: { email: "", phone: "", address: null },
    requests: "No nuts",
    attendance: {
      ceremony: { adultsTeens: 1, kids: 0 },
      dinner: { adultsTeens: 2, kids: 1 },
      dance: { adultsTeens: 0, kids: 0 },
    },
  };
  await client.project(page("1").id, response);
  const payload = JSON.parse(requests.at(-1).options.body).properties;
  assert.ok(!("Kids" in payload));
  assert.ok(!("Adults/Teens" in payload));
  // Owner decision (Oct 10, 2026): the family's own RSVP column gets Yes/No.
  assert.equal(payload.RSVP.select.name, "Yes");
  assert.ok(!("Website RSVP" in payload));
  assert.equal(payload["Dinner kids"].number, 1);
  // Held back (the family's own answer in Notion): Website columns only.
  await client.project(page("1").id, response, { answer: false });
  const held = JSON.parse(requests.at(-1).options.body).properties;
  assert.ok(!("RSVP" in held) && !("Dinner kids" in held) && !("Dinner adults" in held));
  assert.equal(held["Website requests"].rich_text[0].text.content, "No nuts");
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

test("Additional Emails parse into lowercase sign-in addresses", () => {
  const p = page("0");
  p.properties.Email = { email: " Main@Example.com " };
  p.properties["Additional Emails"] = { rich_text: [{ plain_text: "Grandma@example.com, not-an-email; aunt@example.org" }] };
  const row = normalizeInvitation(p);
  assert.equal(row.email, "main@example.com");
  assert.deepEqual(row.additionalEmails, ["grandma@example.com", "aunt@example.org"]);
  // Separators are commas, semicolons or whitespace; letters are never separators.
  p.properties["Additional Emails"] = { rich_text: [{ plain_text: "rosas.sisters@hotmail.com,jess@example.com\nsis s@x" }] };
  assert.deepEqual(normalizeInvitation(p).additionalEmails, ["rosas.sisters@hotmail.com", "jess@example.com"]);
});

test("a row says whether the admin columns exist, so a renamed column is not read as unticked (re-audit)", () => {
  const p = page("0");
  p.properties.Email = { email: null };
  p.properties["Administrator Eligible"] = { checkbox: false };
  assert.equal(normalizeInvitation(p).adminColumnsPresent, true, "empty values still count as present");
  delete p.properties["Administrator Eligible"];
  assert.equal(normalizeInvitation(p).adminColumnsPresent, false);
});

// ---- Planning import, schema preparation, guest import and contact projection (#74) ----
// Every request goes to an in-memory fake; `route` answers [status, body].
function recordingClient(route) {
  const requests = [];
  const client = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    sleep: async () => {},
    fetchImpl: async (url, options) => {
      const request = {
        method: options.method,
        path: url.split("/v1/")[1],
        body: options.body ? JSON.parse(options.body) : undefined,
      };
      requests.push(request);
      const [status, payload] = route(request, requests.length);
      return new Response(JSON.stringify(payload), { status });
    },
  });
  return { client, requests };
}
const title = (v) => ({ type: "title", title: [{ plain_text: v }] });
const rich = (v) => ({ type: "rich_text", rich_text: v ? [{ plain_text: v }] : [] });
const num = (v) => ({ type: "number", number: v });
const choice = (v) => ({ type: "select", select: v ? { name: v } : null });
const day = (v) => ({ type: "date", date: v ? { start: v } : null });
const fail = (status) => [status, { object: "error", status }];

test("planning import reads every page of the data source, skips archived rows and maps current and older column names (#74)", async () => {
  const sourceId = planningSources.costs;
  const current = {
    id: "aaaaaaaa-0000-4000-8000-000000000001",
    properties: {
      Item: title("Venue"),
      Category: choice("Venue"),
      Qty: num(2),
      "Unit price": num(1250),
      "Cost owner": choice("Family"),
      Sponsor: rich(""),
      Vendor: rich("Example Hall"),
      Contact: rich("Pat Example"),
      Email: { type: "email", email: "events@example.com" },
      Phone: { type: "phone_number", phone_number: "+1 555 555 0100" },
      "Estimated total": num(2500),
      "Final Cost": num(2400),
      Deposit: num(500),
      "Additional Paid": num(250),
      "Amount paid": num(750),
      "Payment due": day("2026-11-01T09:00:00.000-06:00"),
      "Website Status": rich("Booked"),
      Notes: rich("Synthetic fixture row"),
      "Website Record ID": rich("web-row-1"),
    },
  };
  // A row typed into Notion before the website's columns existed.
  const older = {
    id: "aaaaaaaa-0000-4000-8000-000000000004",
    properties: {
      Name: title("Cake"),
      Estimate: num(300),
      Cost: num(280),
      Deposit: num(null),
      "Additional Paid": num(null),
      "Amount paid": num(100),
      "Due Date": day(null),
      Status: { type: "status", status: { name: "Ordered" } },
    },
  };
  const gone = (id, flag) => ({ id, [flag]: true, properties: { Item: title("Removed") } });
  const { client, requests } = recordingClient(({ body }) =>
    body.start_cursor === "cursor-2"
      ? [200, { results: [older], has_more: false, next_cursor: null }]
      : [
          200,
          {
            results: [current, gone("aaaaaaaa-0000-4000-8000-000000000002", "archived"), gone("aaaaaaaa-0000-4000-8000-000000000003", "in_trash")],
            has_more: true,
            next_cursor: "cursor-2",
          },
        ],
  );
  const rows = await client.planning("costs", sourceId);
  // Read-only: two paged queries of the given data source and nothing else.
  assert.deepEqual(requests, [
    { method: "POST", path: `data_sources/${sourceId}/query`, body: { page_size: 100 } },
    { method: "POST", path: `data_sources/${sourceId}/query`, body: { page_size: 100, start_cursor: "cursor-2" } },
  ]);
  assert.deepEqual(
    rows.map((r) => r.id),
    [current.id, older.id],
  );
  assert.deepEqual(rows[0], {
    id: current.id,
    websiteId: "web-row-1",
    fields: {
      item: "Venue",
      category: "Venue",
      quantity: "2",
      unitPrice: 1250,
      costOwner: "Family",
      sponsor: "",
      vendor: "Example Hall",
      contact: "Pat Example",
      email: "events@example.com",
      phone: "+1 555 555 0100",
      estimated: 2500,
      finalCost: 2400,
      deposit: 500,
      additionalPaid: 250,
      dueDate: "2026-11-01",
      status: "Booked",
      notes: "Synthetic fixture row",
    },
  });
  const legacy = rows[1].fields;
  assert.equal(rows[1].websiteId, "");
  assert.equal(legacy.item, "Cake", "Name stands in for Item");
  assert.equal(legacy.estimated, 300, "Estimate stands in for Estimated total");
  assert.equal(legacy.finalCost, 280, "Cost stands in for Final Cost");
  assert.equal(legacy.additionalPaid, 100, "an empty Additional Paid falls back to Amount paid");
  assert.equal(legacy.status, "Ordered", "a Notion status column is read by name");
  assert.equal(legacy.dueDate, "");
  // The import route validates each row next; both must pass as they are.
  assert.equal(validatePlanning("costs", rows[0].fields).quantity, "2");
  const checked = validatePlanning("costs", legacy);
  assert.equal(checked.unitPrice, null);
  assert.equal(checked.deposit, null);
  assert.equal(checked.additionalPaid, 100);
});

test("padrino import reads the Contacted checkbox and its dates (#74)", async () => {
  const sourceId = planningSources.padrinos;
  const results = [
    {
      id: "bbbbbbbb-0000-4000-8000-000000000001",
      properties: {
        Role: title("Cake padrinos"),
        Text: rich("The Example Family"),
        Email: { type: "email", email: "family@example.com" },
        Phone: { type: "phone_number", phone_number: null },
        Gift: rich("Cake"),
        Pledged: num(300),
        Received: num(null),
        Contacted: { type: "checkbox", checkbox: true },
        "Contacted Date": day("2026-09-01"),
        "Follow Up": day(null),
        "Website Record ID": rich("web-padrino-1"),
      },
    },
    { id: "bbbbbbbb-0000-4000-8000-000000000002", properties: { Text: rich("Example Godparents") } },
  ];
  const { client } = recordingClient(() => [200, { results, has_more: false }]);
  const [first, second] = await client.planning("padrinos", sourceId);
  assert.deepEqual(first.fields, {
    name: "The Example Family",
    email: "family@example.com",
    phone: "",
    gift: "Cake",
    role: "Cake padrinos",
    pledged: 300,
    received: "",
    contacted: true,
    contactedAt: "2026-09-01",
    followUp: "",
    status: "",
    notes: "",
  });
  assert.equal(second.fields.contacted, false, "a missing checkbox is unticked, never undefined");
  assert.equal(validatePlanning("padrinos", first.fields).received, null);
});

test("planning import stops past 1,000 rows instead of loading an unbounded table (#74)", async () => {
  const page = (n) =>
    Array.from({ length: 100 }, (_, i) => ({
      id: `row-${n}-${i}`,
      properties: { Item: title(`Row ${n}-${i}`) },
    }));
  const { client, requests } = recordingClient((r, n) => [200, { results: page(n), has_more: true, next_cursor: `cursor-${n}` }]);
  await assert.rejects(
    () => client.planning("costs", planningSources.costs),
    (e) => e.status === 422 && e.code === "PLANNING_LIMIT",
  );
  assert.equal(requests.length, 11, "the eleventh page crosses the limit and nothing more is read");
});

test("schema preparation only adds the missing website columns and refuses a column of another type (#74)", async () => {
  const existing = {
    Guest: { type: "title" },
    "Adults/Teens": { type: "number" },
    Kids: { type: "rich_text" },
    Email: { type: "email" },
    Phone: { type: "phone_number" },
    RSVP: { type: "select" },
    "Administrator Eligible": { type: "checkbox" },
    "Website response ID": { type: "rich_text" },
    "Ceremony adults": { type: "number" },
  };
  let properties = structuredClone(existing);
  const { client, requests } = recordingClient(({ method, body }) => {
    if (method === "PATCH")
      for (const [name, spec] of Object.entries(body.properties)) properties[name] = { type: Object.keys(spec)[0] };
    return [200, method === "GET" ? { object: "data_source", properties } : {}];
  });
  const added = await client.prepareSchema();
  const missing = Object.keys(projectionSchema).filter((name) => !(name in existing));
  assert.deepEqual(added, missing);
  assert.deepEqual(
    requests.map((r) => r.method + " " + r.path),
    ["GET data_sources/source", "PATCH data_sources/source"],
  );
  const patch = requests[1].body.properties;
  assert.deepEqual(patch, Object.fromEntries(missing.map((name) => [name, projectionSchema[name]])));
  for (const name of Object.keys(existing)) assert.ok(!(name in patch), `${name} is left as the family set it`);
  for (const [name, spec] of Object.entries(patch)) {
    // Additive only: a Notion rename is { name }, a deletion is null.
    assert.ok(spec && typeof spec === "object" && !("name" in spec), name);
    assert.equal(Object.keys(spec).length, 1, name);
  }
  // Running it again changes nothing.
  requests.length = 0;
  assert.deepEqual(await client.prepareSchema(), []);
  assert.deepEqual(
    requests.map((r) => r.method),
    ["GET"],
  );
  // A column the family made with another type is never converted, and the
  // check runs before anything is written (here the last column conflicts).
  properties = { ...structuredClone(existing), "Website requests": { type: "select" } };
  requests.length = 0;
  await assert.rejects(
    () => client.prepareSchema(),
    (e) => e.status === 409 && e.code === "SCHEMA_CONFLICT",
  );
  assert.deepEqual(
    requests.map((r) => r.method),
    ["GET"],
  );
});

test("guest import creates one page with the invitation's column types (#74)", async () => {
  const created = {
    id: "cccccccc-0000-4000-8000-000000000001",
    parent: { data_source_id: "source" },
    properties: {
      Guest: title("Example Household"),
      "Adults/Teens": num(2),
      Kids: rich("1"),
      Email: { type: "email", email: "guest@example.com" },
      Phone: { type: "phone_number", phone_number: "+15555550123" },
    },
  };
  const { client, requests } = recordingClient(() => [200, created]);
  const row = await client.create({
    name: "Example Household",
    adultsTeens: 2,
    kids: 1,
    email: "guest@example.com",
    phone: "+15555550123",
  });
  assert.deepEqual(requests, [
    {
      method: "POST",
      path: "pages",
      body: {
        parent: { type: "data_source_id", data_source_id: "source" },
        properties: {
          Guest: { title: [{ text: { content: "Example Household" } }] },
          "Adults/Teens": { number: 2 },
          // Kids is a text column in the guest list (see normalizeInvitation).
          Kids: { rich_text: [{ text: { content: "1" } }] },
          Email: { email: "guest@example.com" },
          Phone: { phone_number: "+15555550123" },
        },
      },
    },
  ]);
  assert.equal(row.id, created.id);
  assert.deepEqual(row.capacity, { adultsTeens: 2, kids: 1 });
  assert.equal(row.validCapacity, true);
  // No children is "0", not an empty cell; a blank contact is cleared, not "".
  await client.create({ name: "Example Two", adultsTeens: 1, kids: 0, email: "", phone: "" });
  const properties = requests.at(-1).body.properties;
  assert.equal(properties.Kids.rich_text[0].text.content, "0");
  assert.equal(properties.Email.email, null);
  assert.equal(properties.Phone.phone_number, null);
});

test("a page create is sent once after an ambiguous failure; only a rate limit is retried (#74)", async () => {
  const guest = { name: "Example Household", adultsTeens: 1, kids: 0, email: "", phone: "" };
  const page = { id: "cccccccc-0000-4000-8000-000000000002", properties: {} };
  // A server error may have created the page: never send it again.
  const failed = recordingClient(() => fail(502));
  await assert.rejects(
    () => failed.client.create(guest),
    (e) => e.code === "NOTION_502",
  );
  assert.equal(failed.requests.length, 1);
  // So may a lost response.
  let sent = 0;
  const lost = notionClient({
    token: "fixture-secret",
    sourceId: "source",
    sleep: async () => {},
    fetchImpl: async () => {
      sent++;
      throw new TypeError("fetch failed");
    },
  });
  await assert.rejects(
    () => lost.create(guest),
    (e) => e.status === 503 && e.code === "NOTION_UNAVAILABLE",
  );
  assert.equal(sent, 1);
  // A read is safe to repeat: three tries, then the outage is reported.
  sent = 0;
  await assert.rejects(
    () => lost.read(id, { fresh: true }),
    (e) => e.code === "NOTION_UNAVAILABLE",
  );
  assert.equal(sent, 3);
  // A 429 means Notion did nothing, so the create is retried once and made once.
  const limited = recordingClient((r, n) => (n === 1 ? fail(429) : [200, page]));
  assert.equal((await limited.client.create(guest)).id, page.id);
  assert.deepEqual(
    limited.requests.map((r) => r.method + " " + r.path),
    ["POST pages", "POST pages"],
  );
});

test("contact projection writes only the three Website contact columns of a page in the guest list (#74)", async () => {
  const { client, requests } = recordingClient(({ method }) =>
    method === "GET" ? [200, { ...page("1"), parent: { data_source_id: "source" } }] : [200, {}],
  );
  await client.projectContact(id, {
    email: "new.address@example.com",
    phone: "+15555550199",
    address: "1 Example Way, Example City",
  });
  assert.deepEqual(
    requests.map((r) => r.method + " " + r.path),
    [`GET pages/${id}`, `PATCH pages/${id}`],
  );
  // Exactly these columns: the family's RSVP, head counts, Email and Phone stay untouched.
  assert.deepEqual(requests[1].body, {
    properties: {
      "Website contact email": { email: "new.address@example.com" },
      "Website phone": { phone_number: "+15555550199" },
      "Website address": { rich_text: [{ text: { content: "1 Example Way, Example City" } }] },
    },
  });
  await client.projectContact(id, { email: "", phone: "", address: "" });
  assert.deepEqual(requests.at(-1).body.properties, {
    "Website contact email": { email: null },
    "Website phone": { phone_number: null },
    "Website address": { rich_text: [] },
  });
});

test("contact projection refuses a page from another data source or a malformed id without writing (#74)", async () => {
  const other = recordingClient(({ method }) =>
    method === "GET" ? [200, { ...page("1"), parent: { data_source_id: "other" } }] : [200, {}],
  );
  await assert.rejects(
    () => other.client.projectContact(id, { email: "guest@example.com" }),
    (e) => e.status === 403 && e.code === "WRONG_DATA_SOURCE",
  );
  assert.deepEqual(
    other.requests.map((r) => r.method),
    ["GET"],
  );
  const none = recordingClient(() => [200, {}]);
  await assert.rejects(
    () => none.client.projectContact("../pages/other", { email: "guest@example.com" }),
    (e) => e.status === 404 && e.code === "INVITATION_NOT_FOUND",
  );
  assert.equal(none.requests.length, 0);
});
