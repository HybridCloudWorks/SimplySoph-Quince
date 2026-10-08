import { planningNotion } from "./planning-notion.mjs";
import { planningFields } from "./planning.mjs";
import { error } from "./auth.mjs";
const version = "2025-09-03";
const text = (p) =>
  (p?.title || p?.rich_text || [])
    .map((t) => t.plain_text ?? t.text?.content ?? "")
    .join("");
export function normalizeInvitation(page) {
  const p = page.properties ?? {},
    adults = p["Adults/Teens"]?.number,
    kidsText = text(p.Kids).trim();
  const kids = /^\d{1,2}$/.test(kidsText) ? Number(kidsText) : null;
  const valid =
    Number.isInteger(adults) &&
    adults >= 0 &&
    kids !== null &&
    adults + kids > 0 &&
    adults + kids <= 50;
  return {
    id: page.id,
    name: text(p.Guest),
    capacity: { adultsTeens: adults ?? null, kids },
    email: p.Email?.email ?? "",
    phone: p.Phone?.phone_number ?? "",
    administratorEligible: p["Administrator Eligible"]?.checkbox === true,
    role: p.Role?.select?.name ?? "",
    firstName: text(p["First Name"]),
    lastName: text(p["Last Name"]),
    distributionGroups: (p["Distribution Groups"]?.multi_select || []).map(
      (x) => x.name,
    ),
    smsConsent: p["SMS Consent"]?.checkbox === true,
    smsConsentAt: p["SMS Consent Date"]?.date?.start || null,
    smsOptOut: p["SMS Opt Out"]?.checkbox === true,
    whatsappPhone: p["WhatsApp Phone"]?.phone_number ?? "",
    whatsappLanguage: p["WhatsApp Language"]?.select?.name ?? "en",
    whatsappConsent: p["WhatsApp Consent"]?.checkbox === true,
    whatsappConsentAt: p["WhatsApp Consent Date"]?.date?.start || null,
    whatsappConsentSource: text(p["WhatsApp Consent Source"]),
    whatsappConsentVersion: text(p["WhatsApp Consent Version"]),
    whatsappOptOut: p["WhatsApp Opt Out"]?.checkbox === true,
    invitationStatus: p.RSVP?.select?.name ?? "",
    archived: page.archived || page.in_trash || false,
    validCapacity: valid,
    lastEdited: page.last_edited_time,
  };
}
export const projectionSchema = {
  "Administrator Eligible": { checkbox: {} },
  "WhatsApp Phone": { phone_number: {} },
  "WhatsApp Language": {
    select: { options: [{ name: "en" }, { name: "es" }] },
  },
  "WhatsApp Consent": { checkbox: {} },
  "WhatsApp Consent Date": { date: {} },
  "WhatsApp Consent Source": { rich_text: {} },
  "WhatsApp Consent Version": { rich_text: {} },
  "WhatsApp Opt Out": { checkbox: {} },
  "Distribution Groups": { multi_select: {} },
  "First Name": { rich_text: {} },
  "Last Name": { rich_text: {} },
  "SMS Consent": { checkbox: {} },
  "SMS Consent Date": { date: {} },
  "SMS Opt Out": { checkbox: {} },
  "Website RSVP": {
    select: {
      options: [
        { name: "Attending", color: "green" },
        { name: "Declined", color: "red" },
      ],
    },
  },
  "Website response ID": { rich_text: {} },
  "Website response at": { date: {} },
  "Ceremony adults": { number: {} },
  "Ceremony kids": { number: {} },
  "Dinner adults": { number: {} },
  "Dinner kids": { number: {} },
  "Dance adults": { number: {} },
  "Dance kids": { number: {} },
  "Website contact email": { email: {} },
  "Website phone": { phone_number: {} },
  "Website address": { rich_text: {} },
  "Website requests": { rich_text: {} },
  "Website account": { rich_text: {} },
};
// 429 means Notion did nothing, so every request may retry it. Other transient
// failures retry only for reads, queries and idempotent PATCHes: a retried page
// create could duplicate a row.
export function notionRetryable(method, path, status) {
  if (status === 429) return true;
  const idempotent =
    method === "GET" || method === "PATCH" || path.endsWith("/query");
  return idempotent && [500, 502, 503, 504].includes(status);
}
export function notionClient({
  token,
  sourceId,
  fetchImpl = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  clock = Date.now,
  minIntervalMs = 400,
  cacheMs = 30000,
}) {
  // Notion allows ~3 requests/s per connection. Requests from this instance are
  // paced below that, and roster reads are cached briefly so a burst of guest
  // page views does not turn into NOTION_429 errors.
  let nextSlot = 0;
  async function pace() {
    const at = clock(),
      wait = nextSlot - at;
    nextSlot = Math.max(at, nextSlot) + minIntervalMs;
    if (wait > 0) await sleep(wait);
  }
  const cache = new Map();
  function cached(key, load) {
    const hit = cache.get(key);
    if (hit && hit.until > clock()) return hit.value;
    const value = load();
    cache.set(key, { value, until: clock() + cacheMs });
    value.catch(() => cache.delete(key));
    return value;
  }
  async function call(path, method = "GET", body) {
    if (!token || !sourceId) throw error(503, "NOTION_NOT_CONFIGURED");
    // Any write may change what later reads should see; clear before and after
    // so a read that overlaps the write cannot cache the old row.
    const write =
      method === "PATCH" || (method === "POST" && !path.endsWith("/query"));
    if (write) cache.clear();
    try {
      return await send(path, method, body);
    } finally {
      if (write) cache.clear();
    }
  }
  async function send(path, method, body) {
    for (let attempt = 0; ; attempt++) {
      await pace();
      let r;
      try {
        r = await fetchImpl("https://api.notion.com/v1/" + path, {
          method,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Notion-Version": version,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch {
        if (method === "GET" && attempt < 2) continue;
        throw error(503, "NOTION_UNAVAILABLE");
      }
      if (r.ok) return r.json();
      const raw = r.headers?.get?.("retry-after"),
        retryAfter = raw && /^\d+$/.test(raw) ? Number(raw) : null,
        retryable = notionRetryable(method, path, r.status);
      // Long provider pauses are not worth holding a guest's request open.
      if (!retryable || attempt === 2 || (retryAfter ?? 0) > 10)
        throw error(503, `NOTION_${r.status}`);
      await sleep(Math.max(retryAfter ?? 0, 2 ** attempt) * 1000);
    }
  }
  return {
    ...planningNotion(call),
    async projectWhatsappConsent(id, { phone, at, language, source, version }) {
      await this.read(id);
      await call(`pages/${id}`, "PATCH", {
        properties: {
          "WhatsApp Phone": { phone_number: phone },
          "WhatsApp Language": { select: { name: language } },
          "WhatsApp Consent": { checkbox: true },
          "WhatsApp Consent Date": {
            date: { start: new Date(at).toISOString() },
          },
          "WhatsApp Consent Source": {
            rich_text: [{ text: { content: source } }],
          },
          "WhatsApp Consent Version": {
            rich_text: [{ text: { content: version } }],
          },
          "WhatsApp Opt Out": { checkbox: false },
        },
      });
    },
    async projectWhatsappOptOut(id) {
      await this.read(id);
      await call(`pages/${id}`, "PATCH", {
        properties: { "WhatsApp Opt Out": { checkbox: true } },
      });
    },
    async projectSmsConsent(id, at) {
      await call(`pages/${id}`, "PATCH", {
        properties: {
          "SMS Consent": { checkbox: true },
          "SMS Consent Date": { date: { start: new Date(at).toISOString() } },
          "SMS Opt Out": { checkbox: false },
        },
      });
    },
    async projectSmsOptOut(id) {
      await call(`pages/${id}`, "PATCH", {
        properties: { "SMS Opt Out": { checkbox: true } },
      });
    },
    async planning(kind, id) {
      const aliases = {
        item: ["Item", "Name", "Expense"],
        quantity: ["Qty"],
        unitPrice: ["Unit price"],
        costOwner: ["Cost owner"],
        sponsor: ["Sponsor"],
        name: ["Name", "Text"],
        category: ["Category"],
        vendor: ["Vendor"],
        contact: ["Contact"],
        email: ["Email"],
        phone: ["Phone"],
        estimated: ["Estimated Cost", "Estimate", "Estimated total"],
        finalCost: ["Final Cost", "Cost"],
        deposit: ["Deposit"],
        additionalPaid: ["Additional Paid", "Amount paid"],
        dueDate: ["Due Date", "Payment due"],
        status: ["Website Status", "Status"],
        notes: ["Notes"],
        firstName: ["First Name"],
        lastName: ["Last Name"],
        gift: ["Gift"],
        role: ["Role"],
        pledged: ["Pledged"],
        received: ["Received"],
        contacted: ["Contacted"],
        contactedAt: ["Contacted Date"],
        followUp: ["Follow Up"],
      };
      let cursor,
        rows = [];
      do {
        const r = await call(`data_sources/${id}/query`, "POST", {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        for (const page of r.results.filter(
          (p) => !p.archived && !p.in_trash,
        )) {
          const fields = {};
          for (const key of planningFields[kind]) {
            const p = (aliases[key] || [key])
              .map((n) => page.properties[n])
              .find(Boolean);
            fields[key] =
              key === "contacted"
                ? !!p?.checkbox
                : ((key === "quantity" && p?.number != null
                    ? String(p.number)
                    : undefined) ??
                  p?.number ??
                  p?.email ??
                  p?.phone_number ??
                  p?.date?.start?.slice(0, 10) ??
                  p?.select?.name ??
                  p?.status?.name ??
                  text(p));
          }
          if (
            kind === "costs" &&
            page.properties["Additional Paid"]?.number == null
          )
            fields.additionalPaid =
              page.properties["Amount paid"]?.number ?? "";
          rows.push({
            id: page.id,
            websiteId: text(page.properties["Website Record ID"]),
            fields,
          });
        }
        if (rows.length > 1000) throw error(422, "PLANNING_LIMIT");
        cursor = r.has_more ? r.next_cursor : null;
      } while (cursor);
      return rows;
    },
    async list() {
      return structuredClone(await cached("list", () => this.listFresh()));
    },
    async listFresh() {
      let cursor,
        rows = [];
      do {
        const r = await call(`data_sources/${sourceId}/query`, "POST", {
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        rows.push(...r.results.map(normalizeInvitation));
        cursor = r.has_more ? r.next_cursor : null;
        if (rows.length > 2000) throw error(422, "GUEST_LIMIT");
      } while (cursor);
      return rows;
    },
    // Pass { fresh: true } where a decision must reflect the latest Notion edit:
    // RSVP submit, invitation exchange, sign-in and every outbound send.
    async read(id, { fresh = false } = {}) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw error(404, "INVITATION_NOT_FOUND");
      const load = async () => {
        const p = await call("pages/" + id);
        if (p.parent?.data_source_id !== sourceId)
          throw error(403, "WRONG_DATA_SOURCE");
        return normalizeInvitation(p);
      };
      const row = await (fresh ? load() : cached("page:" + id, load));
      return structuredClone(row);
    },
    async schema() {
      return call("data_sources/" + sourceId);
    },
    async prepareSchema() {
      const current = await call("data_sources/" + sourceId);
      const properties = {};
      for (const [name, spec] of Object.entries(projectionSchema)) {
        if (
          current.properties[name] &&
          current.properties[name].type !== Object.keys(spec)[0]
        )
          throw error(409, "SCHEMA_CONFLICT");
        if (!current.properties[name]) properties[name] = spec;
      }
      if (Object.keys(properties).length)
        await call("data_sources/" + sourceId, "PATCH", { properties });
      return Object.keys(properties);
    },
    async project(id, response) {
      await this.read(id);
      const a = response.attendance,
        r = (value) => ({
          rich_text: value ? [{ text: { content: value } }] : [],
        });
      const properties = {
        "Website RSVP": {
          select: {
            name: Object.values(a).some((v) => v.adultsTeens + v.kids > 0)
              ? "Attending"
              : "Declined",
          },
        },
        "Website response ID": r(response.id),
        "Website response at": { date: { start: response.submittedAt } },
        "Website contact email": { email: response.contact.email || null },
        "Website phone": { phone_number: response.contact.phone || null },
        "Website address": r(response.contact.address),
        "Website requests": r(response.requests),
      };
      for (const event of ["ceremony", "dinner", "dance"]) {
        const name = event[0].toUpperCase() + event.slice(1);
        properties[name + " adults"] = { number: a[event].adultsTeens };
        properties[name + " kids"] = { number: a[event].kids };
      }
      await call("pages/" + id, "PATCH", { properties });
    },
    async create(row) {
      const kids = String(row.kids);
      const result = await call("pages", "POST", {
        parent: { type: "data_source_id", data_source_id: sourceId },
        properties: {
          Guest: { title: [{ text: { content: row.name } }] },
          "Adults/Teens": { number: row.adultsTeens },
          Kids: { rich_text: [{ text: { content: kids } }] },
          Email: { email: row.email || null },
          Phone: { phone_number: row.phone || null },
        },
      });
      return normalizeInvitation(result);
    },
    async projectContact(id, contact) {
      await this.read(id);
      await call("pages/" + id, "PATCH", {
        properties: {
          "Website contact email": { email: contact.email || null },
          "Website phone": { phone_number: contact.phone || null },
          "Website address": {
            rich_text: contact.address
              ? [{ text: { content: contact.address } }]
              : [],
          },
        },
      });
    },
    async projectAccount(id, account) {
      await this.read(id);
      const content = JSON.stringify({
        name: account.name,
        email: account.email,
        active: account.active,
        deletedAt: account.deletedAt || null,
        permissions: account.permissions,
        verifiedAt: new Date(account.verifiedAt).toISOString(),
      });
      await call("pages/" + id, "PATCH", {
        properties: {
          "Website account": { rich_text: [{ text: { content } }] },
        },
      });
    },
  };
}
