// WhatsApp templates for the current RSVP deadline: plan them, submit them to
// Meta through Twilio's Content API, and read their approval status.
//
//   node scripts/whatsapp-templates.mjs plan            prints the four drafts, calls nothing
//   node scripts/whatsapp-templates.mjs submit          creates missing templates and requests approval
//   node scripts/whatsapp-templates.mjs status          prints the catalog for WHATSAPP_TEMPLATES_JSON
//
// Credentials come from the environment (TWILIO_ACCOUNT_SID and
// TWILIO_AUTH_TOKEN, or TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET with the
// Content permission). They are never printed. Nothing here sends a message.
//
// The texts are the ones Meta approved on October 11, 2026, with only the RSVP
// deadline changed (and "antes del" -> "a más tardar el" in Spanish): see
// docs/whatsapp-activation.md. The deadline is read from site/content.mjs and
// written the way server/whatsapp.mjs checks it, so the catalog this prints
// always passes the server's date check for the deadline the site shows.
import { pathToFileURL } from "node:url";
import { event } from "../site/content.mjs";
import { deadlineText } from "../server/whatsapp.mjs";

export const contentOrigin = "https://content.twilio.com/v1/";
export const sample = "https://misxv.simplysoph.com/rsvp/";
export const category = "MARKETING";

// Meta allows lowercase letters, digits and underscores in a template name,
// and a rejected or deleted name cannot be reused for up to 30 days, so each
// resubmission gets its own suffix (default: the deadline's month).
export function nameSuffix(deadline) {
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"][
    new Date(deadline).getUTCMonth()
  ];
}

const wording = {
  en: {
    invitation: (by) =>
      `Simply Soph Media: You're invited to Sophia Isabel's quinceañera on January 15, 2027 in Fort Worth! We would love to celebrate with your family. Please RSVP by ${by} here: {{1}} Reply STOP to unsubscribe or HELP for help.`,
    reminder: (by) =>
      `Simply Soph Media: A friendly reminder about Sophia Isabel's quinceañera on January 15, 2027. We hope to see your family there! Please RSVP by ${by} here: {{1}} Reply STOP to unsubscribe or HELP for help.`,
  },
  es: {
    invitation: (by) =>
      `Simply Soph Media: ¡Te invitamos a los quince años de Sophia Isabel el 15 de enero de 2027 en Fort Worth! Nos encantaría celebrar con tu familia. Confirma tu asistencia a más tardar el ${by} aquí: {{1}} Responde STOP para darte de baja o HELP para ayuda.`,
    reminder: (by) =>
      `Simply Soph Media: Un recordatorio de la fiesta de quince años de Sophia Isabel el 15 de enero de 2027. ¡Esperamos ver a tu familia ahí! Confirma tu asistencia a más tardar el ${by} aquí: {{1}} Responde STOP para darte de baja o HELP para ayuda.`,
  },
};

// The four drafts, in the catalog's key order. Pure.
export function templateDrafts({ deadline = event.deadline, suffix = nameSuffix(deadline) } = {}) {
  if (!/^[a-z0-9_]{1,20}$/.test(suffix)) throw new Error("Suffix must be lowercase letters, digits or underscores");
  const drafts = [];
  for (const kind of ["invitation", "reminder"])
    for (const language of ["en", "es"]) {
      const by = deadlineText(deadline, language);
      drafts.push({
        key: `${kind}_${language}`,
        name: `sophia_rsvp_${kind === "invitation" ? "invite" : "reminder"}_${language}_${suffix}`,
        language,
        category,
        body: wording[language][kind](by),
        variables: { 1: sample },
      });
    }
  return drafts;
}

export function credentials(env = process.env) {
  const pairs = [
    [env.TWILIO_API_KEY_SID, env.TWILIO_API_KEY_SECRET, /^SK[0-9a-f]{32}$/i],
    [env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, /^AC[0-9a-f]{32}$/i],
  ];
  for (const [user, secret, pattern] of pairs)
    if (user && secret && pattern.test(user) && /^\S{16,}$/.test(secret)) return { user, secret };
  throw new Error(
    "Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (or TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET) in the environment",
  );
}

export function contentClient({ user, secret }, fetchImpl = fetch) {
  const authorization = "Basic " + Buffer.from(`${user}:${secret}`).toString("base64");
  return async function call(path, method = "GET", body) {
    const res = await fetchImpl(contentOrigin + path, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(20000),
      headers: {
        Authorization: authorization,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    if (!res.ok) {
      // Twilio's error message is safe to show; the request body is not repeated.
      const reason = data?.message || `HTTP ${res.status}`;
      throw new Error(`${method} ${path}: ${reason}`);
    }
    return data;
  };
}

// Every Content resource on the account, by friendly name (first page of 100
// covers this event many times over).
async function existingByName(call) {
  const page = await call("Content?PageSize=100");
  const map = new Map();
  for (const c of page?.contents || []) map.set(c.friendly_name, c);
  return map;
}

// A template's approval record: Twilio answers with a `whatsapp` object once
// an approval was requested, and with none before that.
async function approvalOf(call, sid) {
  const data = await call(`Content/${sid}/ApprovalRequests`);
  const w = data?.whatsapp;
  if (!w || !w.status) return null;
  return {
    status: String(w.status).toLowerCase(),
    rejectionReason: w.rejection_reason || "",
    name: w.name || "",
    category: w.category || "",
  };
}

// Creates each draft that does not exist yet (by friendly name), then requests
// WhatsApp approval for each one that has no approval request. Running it
// twice changes nothing the second time.
export async function submitTemplates({ drafts, call, log = () => {} }) {
  const existing = await existingByName(call);
  const results = [];
  for (const d of drafts) {
    let content = existing.get(d.name);
    let created = false;
    if (!content) {
      content = await call("Content", "POST", {
        friendly_name: d.name,
        language: d.language,
        variables: d.variables,
        types: { "twilio/text": { body: d.body } },
      });
      created = true;
    }
    const sid = content.sid;
    let approval = await approvalOf(call, sid);
    let requested = false;
    if (!approval) {
      const a = await call(`Content/${sid}/ApprovalRequests/whatsapp`, "POST", {
        name: d.name,
        category: d.category,
      });
      requested = true;
      approval = {
        status: String(a?.status || "received").toLowerCase(),
        rejectionReason: a?.rejection_reason || "",
        name: a?.name || d.name,
        category: a?.category || d.category,
      };
    }
    results.push({ key: d.key, name: d.name, contentSid: sid, created, requested, ...approval });
    log(`${d.key}: ${created ? "created" : "already existed"} ${sid}; approval ${requested ? "requested" : "already " + approval.status}`);
  }
  return results;
}

// The catalog entry server/whatsapp.mjs expects, for WHATSAPP_TEMPLATES_JSON.
export function catalogEntry(draft, { contentSid, status }) {
  return {
    key: draft.key,
    contentSid,
    language: draft.language,
    body: draft.body,
    status,
    category: draft.category,
    variables: ["1"],
  };
}

// The current approval status of each draft that exists on the account.
export async function templateStatus({ drafts, call }) {
  const existing = await existingByName(call);
  const rows = [];
  for (const d of drafts) {
    const content = existing.get(d.name);
    if (!content) {
      rows.push({ key: d.key, name: d.name, contentSid: null, status: "not-created" });
      continue;
    }
    const approval = await approvalOf(call, content.sid);
    rows.push({
      key: d.key,
      name: d.name,
      contentSid: content.sid,
      status: approval?.status || "not-requested",
      rejectionReason: approval?.rejectionReason || "",
    });
  }
  return rows;
}

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch, out = console.log) {
  const command = argv[0] || "plan";
  const suffixArg = argv.find((a) => a.startsWith("--suffix="))?.slice("--suffix=".length);
  const drafts = templateDrafts(suffixArg ? { suffix: suffixArg } : {});
  if (command === "plan") {
    out(JSON.stringify({ deadline: event.deadline, category, sample, drafts }, null, 2));
    return 0;
  }
  if (!["submit", "status"].includes(command)) {
    out("Usage: node scripts/whatsapp-templates.mjs plan|submit|status [--suffix=dec]");
    return 2;
  }
  const call = contentClient(credentials(env), fetchImpl);
  if (command === "submit") {
    const results = await submitTemplates({ drafts, call, log: out });
    out(JSON.stringify(results, null, 2));
    return 0;
  }
  const rows = await templateStatus({ drafts, call });
  const catalog = rows
    .filter((r) => r.contentSid && r.status !== "not-requested")
    .map((r) => catalogEntry(drafts.find((d) => d.key === r.key), r));
  out(JSON.stringify({ templates: rows, WHATSAPP_TEMPLATES_JSON: JSON.stringify(catalog) }, null, 2));
  return rows.some((r) => r.status !== "approved") ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().then(
    (code) => process.exit(code),
    (e) => {
      console.error(e.message);
      process.exit(1);
    },
  );
