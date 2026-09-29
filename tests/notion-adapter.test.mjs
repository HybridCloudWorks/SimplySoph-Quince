import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInvitation, notionClient } from "../server/notion.mjs";
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
