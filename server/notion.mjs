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
    role: p.Role?.select?.name ?? "",
    firstName: text(p["First Name"]),
    lastName: text(p["Last Name"]),
    distributionGroups: (p["Distribution Groups"]?.multi_select || []).map(
      (x) => x.name,
    ),
    smsConsent: p["SMS Consent"]?.checkbox === true,
    smsConsentAt: p["SMS Consent Date"]?.date?.start || null,
    smsOptOut: p["SMS Opt Out"]?.checkbox === true,
    invitationStatus: p.RSVP?.select?.name ?? "",
    archived: page.archived || page.in_trash || false,
    validCapacity: valid,
    lastEdited: page.last_edited_time,
  };
}
export const projectionSchema = {
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
export function notionClient({ token, sourceId, fetchImpl = fetch }) {
  async function call(path, method = "GET", body) {
    if (!token || !sourceId) throw error(503, "NOTION_NOT_CONFIGURED");
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
      throw error(503, "NOTION_UNAVAILABLE");
    }
    if (!r.ok) throw error(503, `NOTION_${r.status}`);
    return r.json();
  }
  return {
    ...planningNotion(call),
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
    async read(id) {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw error(404, "INVITATION_NOT_FOUND");
      const p = await call("pages/" + id);
      if (p.parent?.data_source_id !== sourceId)
        throw error(403, "WRONG_DATA_SOURCE");
      return normalizeInvitation(p);
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
