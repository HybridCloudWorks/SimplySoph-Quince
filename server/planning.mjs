import { planningSources } from "./planning-notion.mjs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { error } from "./auth.mjs";

export const planningFields = {
  costs: [
    "item",
    "category",
    "quantity",
    "unitPrice",
    "costOwner",
    "sponsor",
    "vendor",
    "contact",
    "email",
    "phone",
    "estimated",
    "finalCost",
    "deposit",
    "additionalPaid",
    "dueDate",
    "status",
    "notes",
  ],
  padrinos: [
    "name",
    "email",
    "phone",
    "gift",
    "role",
    "pledged",
    "received",
    "contacted",
    "contactedAt",
    "followUp",
    "status",
    "notes",
  ],
};
const money = new Set([
  "unitPrice",
  "estimated",
  "finalCost",
  "deposit",
  "additionalPaid",
  "pledged",
  "received",
]);
const dates = new Set(["dueDate", "contactedAt", "followUp"]);
export function accountingSummary(rows) {
  const active = rows.filter((row) => !row.deleted);
  const cents = (value) => Math.round((value || 0) * 100);
  const pendingFinals = active.filter((row) => row.finalCost == null).length;
  const paidCents = active.reduce(
    (sum, row) => sum + cents(row.deposit) + cents(row.additionalPaid),
    0,
  );
  const finalCents = pendingFinals
    ? null
    : active.reduce((sum, row) => sum + cents(row.finalCost), 0);
  return {
    pendingFinals,
    paidCents,
    finalCents,
    owedCents: finalCents == null ? null : finalCents - paidCents,
  };
}
export function validatePlanning(kind, input) {
  if (!Object.hasOwn(planningFields, kind))
    throw error(422, "INVALID_PLANNING_TABLE");
  const row = {};
  for (const k of planningFields[kind]) {
    const value = input[k] ?? "";
    if (money.has(k)) {
      if (value === "") {
        row[k] = null;
        continue;
      }
      const n = Number(value);
      if (
        !Number.isFinite(n) ||
        n < 0 ||
        n > 10000000 ||
        Math.abs(n * 100 - Math.round(n * 100)) > 0.00001
      )
        throw error(422, "INVALID_AMOUNT");
      row[k] = n;
    } else if (k === "contacted") {
      if (typeof value !== "boolean") throw error(422, "INVALID_FIELDS");
      row[k] = value;
    } else {
      if (
        typeof value !== "string" ||
        value.length > (k === "notes" ? 4000 : 250) ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
      )
        throw error(422, "INVALID_FIELDS");
      row[k] = value.trim();
      if (
        k === "quantity" &&
        value &&
        (!/^\d+(\.\d+)?$/.test(value) || Number(value) > 10000000)
      )
        throw error(422, "INVALID_QUANTITY");
      if (
        dates.has(k) &&
        value &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          !Number.isFinite(Date.parse(value)) ||
          new Date(value).toISOString().slice(0, 10) !== value)
      )
        throw error(422, "INVALID_DATE");
      if (k === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
        throw error(422, "INVALID_EMAIL");
    }
  }
  if (kind === "costs" ? !row.item : !row.name)
    throw error(422, "NAME_REQUIRED");
  return row;
}
export async function validateDocument(body) {
  const name = String(body.name || "");
  if (!name || name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(name))
    throw error(422, "INVALID_DOCUMENT");
  const raw = body.data;
  if (
    typeof raw !== "string" ||
    raw.length > 11200000 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      raw,
    )
  )
    throw error(422, "INVALID_DOCUMENT");
  let bytes = Buffer.from(raw, "base64");
  if (!bytes.length || bytes.length > 8 * 1024 * 1024)
    throw error(422, "INVALID_DOCUMENT");
  const ext = name.split(".").pop().toLowerCase();
  let type,
    savedName = name;
  if (["jpg", "jpeg", "png", "webp"].includes(ext)) {
    try {
      const meta = await sharp(bytes, {
        limitInputPixels: 40000000,
      }).metadata();
      if (!["jpeg", "png", "webp"].includes(meta.format)) throw Error();
      bytes = await sharp(bytes, { limitInputPixels: 40000000 })
        .rotate()
        .png()
        .toBuffer();
      savedName = name.replace(/\.[^.]+$/, ".png");
      type = "image/png";
    } catch {
      throw error(422, "INVALID_DOCUMENT");
    }
  } else if (ext === "pdf" && bytes.subarray(0, 5).toString() === "%PDF-")
    type = "application/pdf";
  else if (ext === "txt" && !bytes.includes(0))
    type = "text/plain; charset=utf-8";
  else if (
    ["docx", "xlsx", "pptx"].includes(ext) &&
    bytes.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
  )
    type = "application/octet-stream";
  else throw error(422, "INVALID_DOCUMENT");
  if (bytes.length > 8 * 1024 * 1024) throw error(422, "INVALID_DOCUMENT");
  return { name: savedName, bytes, type };
}
export function createPlanning({ ledger, documents, notion, now }) {
  async function sync(kind, id) {
    const lock = randomUUID();
    const claimed = await ledger.transaction((s) => {
      const row = s.planning?.[kind]?.[id];
      if (!row) throw error(404, "NOT_FOUND");
      if (row.sync?.status === "synced" || !row.sync) return null;
      if (row.sync.lockUntil > now()) throw error(409, "PLANNING_SYNC_BUSY");
      row.sync = {
        ...row.sync,
        status: "syncing",
        lock,
        lockUntil: now() + 300000,
      };
      return structuredClone(row);
    });
    if (!claimed) return { row: (await ledger.read()).planning[kind][id] };
    try {
      const notionId =
        claimed.sync.operation === "state"
          ? await notion.setPlanningArchived(
              kind,
              planningSources[kind],
              claimed,
            )
          : await notion.writePlanning(
              kind,
              planningSources[kind],
              claimed,
              claimed.sync.fields,
              async () => {
                await ledger.transaction((s) => {
                  const r = s.planning[kind][id];
                  if (r.sync.lock !== lock)
                    throw error(409, "PLANNING_SYNC_BUSY");
                  r.sync.createAttempted = true;
                });
              },
            );
      await ledger.transaction((s) => {
        const row = s.planning[kind][id];
        if (row.sync.lock === lock) {
          row.notionId = notionId;
          row.sync = { status: "synced", at: now() };
        }
      });
    } catch (e) {
      await ledger.transaction((s) => {
        const row = s.planning[kind][id];
        if (row.sync.lock === lock)
          row.sync = {
            ...row.sync,
            status: "pending",
            lock: null,
            lockUntil: 0,
            error: [
              "NOTION_CREATE_UNCERTAIN",
              "NOTION_RECORD_UNAVAILABLE",
              "PLANNING_SCHEMA_CONFLICT",
              "NOTION_DUPLICATE_RECORD",
            ].includes(e.code)
              ? e.code
              : "NOTION_SYNC_PENDING",
          };
      });
    }
    return { row: (await ledger.read()).planning[kind][id] };
  }
  return async function handle(req, session) {
    const { path, method = "GET", body = {}, query = {} } = req;
    const kind = body.kind || query.kind;
    if (!Object.hasOwn(planningFields, kind))
      throw error(422, "INVALID_PLANNING_TABLE");
    if (path === "/api/admin/planning" && method === "GET") {
      const s = await ledger.read();
      return {
        rows: Object.values(s.planning?.[kind] || {}),
        sourceId: s.planningSources?.[kind] || planningSources[kind],
        syncAt: s.planningSync?.[kind] || null,
        ...(kind === "costs"
          ? {
              totals: accountingSummary(
                Object.values(s.planning?.[kind] || {}),
              ),
            }
          : {}),
      };
    }
    if (path === "/api/admin/planning" && method === "POST") {
      const fields = validatePlanning(kind, body.row || {});
      if (body.createId && !/^[a-f0-9-]{36}$/.test(body.createId))
        throw error(422, "INVALID_ID");
      const saved = await ledger.transaction((s) => {
        s.planning ??= {};
        s.planning[kind] ??= {};
        const id = body.id || body.createId || randomUUID(),
          previous = s.planning[kind][id];
        if (body.id && !previous) throw error(404, "NOT_FOUND");
        if (body.createId && previous) return { row: previous };
        if (previous && previous.version !== body.version)
          throw error(409, "SETTINGS_CHANGED");
        if (previous?.deleted) throw error(409, "PLANNING_RECORD_DELETED");
        if (previous?.sync && previous.sync.status !== "synced")
          throw error(409, "PLANNING_SYNC_PENDING");
        const changed = planningFields[kind].filter(
          (k) =>
            !previous ||
            JSON.stringify(previous[k] ?? "") !==
              JSON.stringify(fields[k] ?? ""),
        );
        const row = {
          ...previous,
          ...fields,
          id,
          version: (previous?.version || 0) + 1,
          updatedAt: now(),
          updatedBy: session.email,
          locallyEdited: true,
          sync: { status: "pending", fields: changed },
        };
        s.planning[kind][id] = row;
        return { row };
      });
      return sync(kind, saved.row.id);
    }
    if (path === "/api/admin/planning/state" && method === "POST") {
      if (
        typeof body.deleted !== "boolean" ||
        typeof body.id !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          body.id,
        )
      )
        throw error(422, "INVALID_FIELDS");
      const id = await ledger.transaction((s) => {
        const previous = s.planning?.[kind]?.[body.id];
        if (!previous) throw error(404, "NOT_FOUND");
        if (previous.version !== body.version)
          throw error(409, "SETTINGS_CHANGED");
        if (previous.sync && previous.sync.status !== "synced")
          throw error(409, "PLANNING_SYNC_PENDING");
        if (!!previous.deleted === body.deleted) return previous.id;
        previous.deleted = body.deleted;
        previous.version++;
        previous.updatedAt = now();
        previous.updatedBy = session.email;
        previous.sync = previous.notionId
          ? { status: "pending", operation: "state" }
          : { status: "synced", at: now() };
        return previous.id;
      });
      return sync(kind, id);
    }
    if (path === "/api/admin/planning/sync" && method === "POST")
      return sync(kind, body.id);
    if (path === "/api/admin/planning/import" && method === "POST") {
      if (
        typeof body.sourceId !== "string" ||
        !/^[a-f0-9-]{32,36}$/i.test(body.sourceId)
      )
        throw error(422, "INVALID_DATA_SOURCE");
      const sourceId = body.sourceId
        .replaceAll("-", "")
        .replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5");
      if (sourceId !== planningSources[kind])
        throw error(403, "WRONG_DATA_SOURCE");
      const imported = await notion.planning(kind, sourceId);
      const checked = imported.map((r) => ({
        ...r,
        fields: validatePlanning(kind, r.fields),
      }));
      return ledger.transaction((s) => {
        s.planning ??= {};
        s.planning[kind] ??= {};
        s.planningSources ??= {};
        s.planningSync ??= {};
        let added = 0,
          skipped = 0;
        for (const r of checked) {
          // Never overwrite organizer edits during a repeat import.
          if (
            Object.values(s.planning[kind]).some(
              (x) => x.notionId === r.id || x.id === r.websiteId,
            )
          ) {
            skipped++;
            continue;
          }
          const id = randomUUID();
          s.planning[kind][id] = {
            ...r.fields,
            id,
            notionId: r.id,
            version: 1,
            updatedAt: now(),
          };
          added++;
        }
        s.planningSources[kind] = sourceId;
        s.planningSync[kind] = now();
        return { added, skipped };
      });
    }
    const rowId = body.rowId || query.rowId;
    if (
      typeof rowId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        rowId,
      )
    )
      throw error(422, "INVALID_ID");
    const s = await ledger.read(),
      row = s.planning?.[kind]?.[body.rowId || query.rowId];
    if (!row) throw error(404, "NOT_FOUND");
    if (path === "/api/admin/documents" && method === "GET")
      return {
        row,
        documents: Object.values(s.documents || {}).filter(
          (d) => d.kind === kind && d.rowId === row.id,
        ),
      };
    if (path === "/api/admin/documents/upload" && method === "POST") {
      if (!documents) throw error(503, "DOCUMENT_STORAGE_UNAVAILABLE");
      const file = await validateDocument(body),
        id = randomUUID();
      await documents.put(id, file.bytes);
      await ledger.transaction((s) => {
        s.documents ??= {};
        s.documents[id] = {
          id,
          kind,
          rowId: row.id,
          name: file.name,
          type: file.type,
          size: file.bytes.length,
          at: now(),
          deleted: false,
        };
      });
      return { id };
    }
    const doc = s.documents?.[body.id || query.id];
    if (!doc || doc.rowId !== row.id || doc.kind !== kind)
      throw error(404, "NOT_FOUND");
    if (path === "/api/admin/documents/state" && method === "POST") {
      if (typeof body.deleted !== "boolean") throw error(422, "INVALID_FIELDS");
      await ledger.transaction((s) => {
        s.documents[doc.id].deleted = body.deleted;
        s.documents[doc.id].changedAt = now();
      });
      return { saved: true };
    }
    if (path === "/api/admin/documents/open" && method === "GET") {
      if (doc.deleted) throw error(404, "NOT_FOUND");
      const downloadable =
        query.download === "1" || doc.type === "application/octet-stream";
      return {
        binary: await documents.get(doc.id),
        contentType: doc.type,
        disposition: `${downloadable ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
      };
    }
    throw error(404, "NOT_FOUND");
  };
}
