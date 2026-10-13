// Browser-test harness: serves the built dist/ and the real API on 127.0.0.1
// with a random port, so a browser runs the guest and admin journeys through
// the same code as production (server/http.mjs in front of
// server/application.mjs). Only the outside services are replaced, with the same
// kind of in-memory fakes the unit tests use:
//   - the ledger is the real Ledger over memoryAdapter (tests/store.test.mjs);
//   - Notion is the real notionClient talking to an in-memory Notion API through
//     fetchImpl (tests/notion-adapter.test.mjs), so an RSVP lands in the same
//     page properties the family reads in Notion;
//   - email goes to an array (tests/application.test.mjs). There is no SMS,
//     WhatsApp or real mail transport here, so nothing can reach a guest;
//   - Google ID tokens are checked by verifyGoogle below, which keeps the
//     checks googleVerifier (server/auth.mjs) makes after Google's signature.
// All names, emails and phone numbers are synthetic.
import http from "node:http";
import path from "node:path";
import { stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Ledger, memoryAdapter } from "../../server/store.mjs";
import { createApplication } from "../../server/application.mjs";
import { createHttpServer } from "../../server/http.mjs";
import { notionClient } from "../../server/notion.mjs";
import { error, hash, sameNonce, token } from "../../server/auth.mjs";
import { event } from "../../site/content.mjs";

const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../dist",
);
const SOURCE_ID = "harness-guest-list";
export const OWNER_EMAIL = "owner@example.com";
export const DEADLINE = Date.parse(event.deadline);
// Six weeks before the RSVP deadline, and one minute after it.
export const BEFORE_DEADLINE = Date.parse("2026-10-01T18:00:00Z");
export const AFTER_DEADLINE = DEADLINE + 60_000;

// Synthetic households, written as Notion rows (see normalizeInvitation).
export const households = {
  rivera: {
    id: "0a1b2c3d-1111-4111-8111-000000000001",
    name: "Rivera Family",
    adultsTeens: 2,
    kids: 1,
    email: "rivera.family@example.com",
    phone: "+18175550101",
  },
  morales: {
    id: "0a1b2c3d-2222-4222-8222-000000000002",
    name: "Familia Morales",
    adultsTeens: 2,
    kids: 2,
    email: "familia.morales@example.com",
    phone: "+18175550102",
  },
  // A helper the family made an administrator in Notion.
  planner: {
    id: "0a1b2c3d-3333-4333-8333-000000000003",
    name: "Garcia Family",
    adultsTeens: 1,
    kids: 0,
    email: "planner@example.com",
    phone: "+18175550103",
    administrator: true,
  },
};

const richText = (value) => (value ? [{ plain_text: value }] : []);
function notionPage(row) {
  return {
    object: "page",
    id: row.id,
    archived: false,
    in_trash: false,
    last_edited_time: "2026-09-15T12:00:00.000Z",
    parent: { type: "data_source_id", data_source_id: SOURCE_ID },
    properties: {
      Guest: { type: "title", title: richText(row.name) },
      "Adults/Teens": { type: "number", number: row.adultsTeens },
      Kids: { type: "rich_text", rich_text: richText(String(row.kids)) },
      Email: { type: "email", email: row.email },
      Phone: { type: "phone_number", phone_number: row.phone },
      "Additional Emails": { type: "rich_text", rich_text: [] },
      "Administrator Eligible": {
        type: "checkbox",
        checkbox: !!row.administrator,
      },
      RSVP: { type: "select", select: null },
    },
  };
}

// The part of the Notion API that notionClient uses for the guest list.
// Anything else answers 404 and is recorded, so a test can show it.
function fakeNotionApi(rows) {
  const pages = new Map(rows.map((row) => [row.id, notionPage(row)])),
    patches = [],
    unexpected = [];
  const json = (status, value) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  async function fetchImpl(url, { method = "GET", body } = {}) {
    const route = String(url).replace("https://api.notion.com/v1/", "");
    const [kind, id, action] = route.split("/");
    if (kind === "pages" && pages.has(id) && !action) {
      const page = pages.get(id);
      if (method === "GET") return json(200, page);
      if (method === "PATCH") {
        const { properties } = JSON.parse(body);
        patches.push({ id, properties: structuredClone(properties) });
        Object.assign(page.properties, structuredClone(properties));
        return json(200, page);
      }
    }
    if (
      kind === "data_sources" &&
      id === SOURCE_ID &&
      action === "query" &&
      method === "POST"
    )
      return json(200, {
        object: "list",
        results: [...pages.values()],
        has_more: false,
        next_cursor: null,
      });
    unexpected.push(`${method} ${route}`);
    return json(404, {
      object: "error",
      status: 404,
      code: "object_not_found",
    });
  }
  return {
    fetchImpl,
    patches,
    unexpected,
    // What the family would see on the household's Notion row.
    page: (id) => structuredClone(pages.get(id).properties),
    setAdministrator(id, value) {
      pages.get(id).properties["Administrator Eligible"].checkbox = value;
    },
  };
}

// Stands in for googleVerifier (server/auth.mjs): Google's signature check
// cannot run offline, so the harness credential carries the ID token payload as
// base64url JSON, and every check made after the signature is kept as is.
export const googleCredential = (payload) =>
  "harness." + Buffer.from(JSON.stringify(payload)).toString("base64url");
async function verifyGoogle(credential, expectedNonce) {
  let p;
  try {
    if (!credential.startsWith("harness.")) throw new Error();
    p = JSON.parse(Buffer.from(credential.slice(8), "base64url").toString());
  } catch {
    throw error(401, "SIGN_IN_FAILED");
  }
  if (!sameNonce(p.nonce, expectedNonce)) throw error(401, "SIGN_IN_FAILED");
  if (!p.email_verified || (!p.email?.endsWith("@gmail.com") && !p.hd))
    throw error(403, "ADMIN_NOT_ALLOWED");
  return { id: p.sub, email: p.email.toLowerCase() };
}

export async function startHarness({ now = BEFORE_DEADLINE } = {}) {
  try {
    await stat(path.join(dist, "rsvp", "index.html"));
  } catch {
    throw new Error("dist/ is missing: run `npm run build` first.");
  }
  let clock = now;
  const notionApi = fakeNotionApi(Object.values(households)),
    sent = [],
    logs = [];
  const mailer = {
    configured: true,
    async send(message) {
      sent.push(structuredClone(message));
      return { provider: "harness" };
    },
  };
  const ledger = new Ledger(memoryAdapter());
  // The API compares each POST's Origin with its configured origin, so the port
  // must be known before the application is built: this server takes the port,
  // and the production handler from createHttpServer answers every request.
  //
  // Production is HTTPS only, and the API refuses to put a non-HTTPS link in an
  // email (emails/templates.mjs). The browser talks plain HTTP to 127.0.0.1, so
  // this server stands in for the TLS front end: the API is configured with
  // https://127.0.0.1:<port> (siteOrigin), the browser's own Origin header is
  // presented to it as that, and links the API hands out are opened with
  // forBrowser(). No other header or body is touched.
  let handler, origin, siteOrigin;
  const server = http.createServer((req, res) => {
    if (req.headers.origin === origin) req.headers.origin = siteOrigin;
    handler.emit("request", req, res);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  siteOrigin = `https://127.0.0.1:${server.address().port}`;
  const app = createApplication({
    ledger,
    notion: notionClient({
      token: "harness-notion-token",
      sourceId: SOURCE_ID,
      fetchImpl: notionApi.fetchImpl,
      clock: () => clock,
      minIntervalMs: 0,
      sleep: async () => {},
    }),
    mailer,
    verifyGoogle,
    // Shows the Microsoft button; its sign-in is not exercised.
    microsoftClientId: "00000000-0000-4000-8000-00000000c1d0",
    clientId: "harness-client.apps.googleusercontent.com",
    media: { put: async () => {}, get: async () => Buffer.alloc(0) },
    key: Buffer.alloc(32, 7),
    origin: siteOrigin,
    adminEmails: [OWNER_EMAIL],
    now: () => clock,
    log: (entry) => logs.push(entry),
  });
  handler = createHttpServer({
    app,
    root: dist,
    origin: siteOrigin,
    log: (entry) => logs.push(entry),
  });
  // An owner session that never reaches the browser: the harness issues
  // invitations through the same admin route the family uses.
  const ownerToken = token(),
    ownerCsrf = token();
  await ledger.transaction((s) => {
    s.sessions[hash(ownerToken)] = {
      kind: "admin",
      actor: "owner:" + OWNER_EMAIL,
      email: OWNER_EMAIL,
      csrf: ownerCsrf,
      expiresAt: clock + 3_600_000 * 24 * 90,
    };
  });
  return {
    // Where the browser connects, and the HTTPS origin the API puts in links.
    origin,
    siteOrigin,
    url: (p) => origin + p,
    forBrowser(link) {
      if (!link.startsWith(siteOrigin + "/"))
        throw new Error(`Not a link to this site: ${link}`);
      return origin + link.slice(siteOrigin.length);
    },
    ledger,
    notion: notionApi,
    sent,
    logs,
    now: () => clock,
    setNow(value) {
      clock = value;
    },
    // POST /api/admin/invitation, as the Invitations page does; returns the
    // private link ({siteOrigin}/rsvp/#token, or /es/rsvp/ for Spanish).
    async issueInvitation(household, { locale = "en", invited } = {}) {
      return app.dispatch({
        path: "/api/admin/invitation",
        method: "POST",
        headers: {
          origin: siteOrigin,
          cookie: "__session=" + ownerToken,
          "x-csrf-token": ownerCsrf,
        },
        body: {
          id: household.id,
          locale,
          invited: invited ?? { ceremony: true, dinner: true, dance: true },
        },
        ip: "harness",
      });
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
