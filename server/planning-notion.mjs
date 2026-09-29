import { error } from "./auth.mjs";
export const planningSources = {
  costs: "5dbd1b32-9191-484b-85db-7b1d4663192e",
  padrinos: "8ad6b9ac-f2a4-4ee2-a9b6-958c41f7ecca",
};
const spec = {
  costs: {
    item: ["Item", "title"],
    category: ["Category", "select"],
    quantity: ["Qty", "number"],
    unitPrice: ["Unit price", "number"],
    costOwner: ["Cost owner", "select"],
    sponsor: ["Sponsor", "rich_text"],
    vendor: ["Vendor", "rich_text"],
    contact: ["Contact", "rich_text"],
    email: ["Email", "email"],
    phone: ["Phone", "phone_number"],
    estimated: ["Estimated total", "number"],
    finalCost: ["Final Cost", "number"],
    deposit: ["Deposit", "number"],
    additionalPaid: ["Additional Paid", "number"],
    dueDate: ["Payment due", "date"],
    status: ["Website Status", "rich_text"],
    notes: ["Notes", "rich_text"],
  },
  padrinos: {
    name: ["Text", "rich_text"],
    role: ["Role", "title"],
    email: ["Email", "email"],
    phone: ["Phone", "phone_number"],
    gift: ["Gift", "rich_text"],
    pledged: ["Pledged", "number"],
    received: ["Received", "number"],
    contacted: ["Contacted", "checkbox"],
    contactedAt: ["Contacted Date", "date"],
    followUp: ["Follow Up", "date"],
    status: ["Website Status", "rich_text"],
    notes: ["Notes", "rich_text"],
  },
};
const rich = (value) =>
  String(value || "")
    .match(/[\s\S]{1,2000}/g)
    ?.map((content) => ({ text: { content } })) || [];
export function planningProperties(kind, row, keys = Object.keys(spec[kind])) {
  const properties = {};
  for (const key of keys) {
    const [name, type] = spec[kind][key] || [];
    if (!name) continue;
    const value = row[key];
    properties[name] =
      type === "rich_text" || type === "title"
        ? { [type]: rich(value) }
        : type === "number"
          ? { number: value == null || value === "" ? null : Number(value) }
          : type === "checkbox"
            ? { checkbox: !!value }
            : type === "select"
              ? { select: value ? { name: value } : null }
              : type === "date"
                ? { date: value ? { start: value } : null }
                : { [type]: value || null };
  }
  if (
    kind === "costs" &&
    (keys.includes("deposit") || keys.includes("additionalPaid"))
  )
    properties["Amount paid"] = {
      number:
        (Math.round((row.deposit || 0) * 100) +
          Math.round((row.additionalPaid || 0) * 100)) /
        100,
    };
  if (
    kind === "costs" &&
    (keys.includes("deposit") || keys.includes("additionalPaid"))
  ) {
    properties["Deposit"] = { number: row.deposit ?? null };
    properties["Additional Paid"] = { number: row.additionalPaid ?? null };
  }
  properties["Website Record ID"] = { rich_text: rich(row.id) };
  properties["Website Version"] = { number: row.version };
  properties["Website Documents"] = {
    url: `https://misxv.simplysoph.com/admin/documents/?kind=${kind}&rowId=${row.id}`,
  };
  return properties;
}
export function planningNotion(call) {
  return {
    async setPlanningArchived(kind, sourceId, row) {
      if (
        !Object.hasOwn(planningSources, kind) ||
        sourceId !== planningSources[kind]
      )
        throw error(403, "WRONG_DATA_SOURCE");
      if (!row.notionId || typeof row.deleted !== "boolean")
        throw error(422, "INVALID_FIELDS");
      const page = await call("pages/" + row.notionId);
      if (page.parent?.data_source_id !== sourceId)
        throw error(409, "NOTION_RECORD_UNAVAILABLE");
      // Repeating the same desired state is safe after an ambiguous response.
      // Restore targets this exact linked page; no replacement record is created.
      await call("pages/" + row.notionId, "PATCH", { archived: row.deleted });
      return row.notionId;
    },
    async preparePlanningSchema(kind, sourceId) {
      if (sourceId !== planningSources[kind])
        throw error(403, "WRONG_DATA_SOURCE");
      const current = await call("data_sources/" + sourceId),
        properties = {};
      const fields = [
        ...Object.values(spec[kind]),
        ["Website Record ID", "rich_text"],
        ["Website Version", "number"],
        ["Website Documents", "url"],
        ...(kind === "costs" ? [["Amount paid", "number"]] : []),
      ];
      for (const [name, type] of fields) {
        const p = current.properties[name];
        if (p && p.type !== type) throw error(409, "PLANNING_SCHEMA_CONFLICT");
        if (!p) properties[name] = { [type]: {} };
      }
      if (Object.keys(properties).length)
        await call("data_sources/" + sourceId, "PATCH", { properties });
      return Object.keys(properties);
    },
    async writePlanning(kind, sourceId, row, keys, beforeCreate) {
      await this.preparePlanningSchema(kind, sourceId);
      let id = row.notionId;
      if (!id) {
        const matches = await call(`data_sources/${sourceId}/query`, "POST", {
          filter: {
            property: "Website Record ID",
            rich_text: { equals: row.id },
          },
          page_size: 2,
        });
        if (matches.results.length > 1)
          throw error(409, "NOTION_DUPLICATE_RECORD");
        id = matches.results[0]?.id;
        if (!id && row.sync.createAttempted)
          throw error(409, "NOTION_CREATE_UNCERTAIN");
      }
      if (id) {
        const page = await call("pages/" + id);
        if (
          page.parent?.data_source_id !== sourceId ||
          page.archived ||
          page.in_trash
        )
          throw error(409, "NOTION_RECORD_UNAVAILABLE");
        await call("pages/" + id, "PATCH", {
          properties: planningProperties(kind, row, keys),
        });
        return id;
      }
      await beforeCreate();
      const page = await call("pages", "POST", {
        parent: { type: "data_source_id", data_source_id: sourceId },
        properties: planningProperties(kind, row),
      });
      return page.id;
    },
  };
}
