import { randomUUID } from "node:crypto";
import { error, seal } from "./auth.mjs";
import { escapeHtml } from "../site/celebration.mjs";
import { smsPreview } from "./sms.mjs";

const collections = {
  notifications: "notifications",
  email: "outbox",
  sms: "smsDrafts",
  whatsapp: "whatsappDrafts",
  announcements: "announcements",
};
const text = (value, max = 5000) => {
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw error(422, "INVALID_TEXT");
  return value.trim();
};
export function createAdminRecords({ ledger, key, now = Date.now }) {
  return async function records(req, session) {
    const kind = req.method === "GET" ? req.query?.kind : req.body?.kind;
    if (!Object.hasOwn(collections, kind))
      throw error(422, "INVALID_RECORD_KIND");
    const collection = collections[kind];
    if (req.method === "GET") {
      const s = await ledger.read();
      return {
        rows: Object.values(s[collection] || {})
          .map(({ content, variables, ...r }) => ({
            ...r,
            version: r.recordVersion || 0,
          }))
          .sort(
            (a, b) => (b.at || b.createdAt || 0) - (a.at || a.createdAt || 0),
          ),
      };
    }
    if (req.method !== "POST") throw error(405, "METHOD_NOT_ALLOWED");
    const { id, action, values = {}, version } = req.body;
    if (!values || typeof values !== "object" || Array.isArray(values))
      throw error(422, "INVALID_VALUE");
    if (!["create", "update", "archive", "restore"].includes(action))
      throw error(422, "INVALID_ACTION");
    return ledger.transaction((s) => {
      s[collection] ??= {};
      let row =
        typeof id === "string" && Object.hasOwn(s[collection], id)
          ? s[collection][id]
          : null;
      if (action === "create") {
        if (!["notifications", "announcements"].includes(kind))
          throw error(422, "USE_CHANNEL_DRAFT_FORM");
        row = {
          id: randomUUID(),
          at: now(),
          ...(kind === "notifications"
            ? { kind: "manual", read: false }
            : { published: false }),
        };
      } else {
        if (!row) throw error(404, "NOT_FOUND");
        if (version !== (row.recordVersion || 0))
          throw error(409, "RECORD_CHANGED");
        if (row.state === "sending" || row.emailState === "sending")
          throw error(409, "DELIVERY_IN_PROGRESS");
      }
      if (action === "archive" || action === "restore") {
        row.archived = action === "archive";
      } else {
        const message = ["email", "sms", "whatsapp"].includes(kind);
        const allowed = message
          ? [
              "notes",
              ...(row.state === "draft" && kind !== "whatsapp"
                ? ["subject", "text"]
                : []),
            ]
          : kind === "notifications"
            ? ["title", "text", "read", "notes"]
            : ["title", "text", "titleEs", "textEs", "published", "notes"];
        if (Object.keys(values).some((k) => !allowed.includes(k)))
          throw error(422, "IMMUTABLE_RECORD_FIELD");
        for (const [k, v] of Object.entries(values)) {
          if (["read", "published"].includes(k)) {
            if (typeof v !== "boolean") throw error(422, "INVALID_VALUE");
            row[k] = v;
          } else {
            const value = text(
              v,
              ["title", "titleEs", "subject"].includes(k) ? 140 : 5000,
            );
            if (k === "subject" && /[\r\n]/.test(value))
              throw error(422, "INVALID_SUBJECT");
            if (kind === "sms" && k === "text") smsPreview(value);
            if (k === "text" && kind === "email")
              row.content = seal(
                `<p>${escapeHtml(value).replaceAll("\n", "<br>")}</p>`,
                key,
              );
            else row[k] = value;
          }
        }
        if (action === "create" && (!row.title || !row.text))
          throw error(422, "MESSAGE_REQUIRED");
      }
      row.recordVersion = (row.recordVersion || 0) + 1;
      row.updatedAt = now();
      s[collection][row.id] = row;
      s.audit.push({
        actor: session.actor,
        action: `${kind}-${action}`,
        id: row.id,
        at: new Date(now()).toISOString(),
      });
      s.audit = s.audit.slice(-5000);
      return { saved: true, id: row.id, version: row.recordVersion };
    });
  };
}
