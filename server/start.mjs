import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ledger, cloudAdapter } from "./store.mjs";
import {
  googleVerifier,
  googleIdentityVerifier,
  microsoftVerifier,
} from "./auth.mjs";
import { notionClient } from "./notion.mjs";
import { graphMailer, sendgridMailer, eventMailer } from "./mail.mjs";
import { createApplication } from "./application.mjs";
import { createHttpServer } from "./http.mjs";
import { whatsappTransport as createWhatsappTransport } from "./whatsapp-transport.mjs";
import { twilioTransport } from "./twilio.mjs";
const env = process.env,
  origin = env.PUBLIC_ORIGIN || "https://misxv.simplysoph.com";
let app = null;
if (env.EVENT_BUCKET) {
  const key = Buffer.from(env.APP_KEY || "", "base64");
  if (
    key.length !== 32 ||
    !env.NOTION_TOKEN ||
    !env.NOTION_SOURCE_ID ||
    !env.ADMIN_GOOGLE_CLIENT_ID ||
    !env.ADMIN_EMAILS ||
    !env.M365_TENANT_ID ||
    !env.M365_CLIENT_ID ||
    !env.M365_CLIENT_SECRET ||
    !env.DATA_RETENTION_DATE ||
    env.SCOPED_NOTION_CONNECTION_CONFIRMED !== "true" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(env.DATA_RETENTION_DATE) ||
    !Number.isFinite(Date.parse(env.DATA_RETENTION_DATE))
  )
    throw new Error(
      "Missing required production configuration; consult DEPLOYMENT.md",
    );
  if (!/^https:\/\/[^/]+$/.test(origin))
    throw new Error("HTTPS origin required");
  if (
    (env.MAIL_PROVIDER === "sendgrid" ||
      env.SENDGRID_FALLBACK_ENABLED === "true") &&
    !env.SENDGRID_API_KEY
  )
    throw new Error("SendGrid selected without SENDGRID_API_KEY");
  const adapter = cloudAdapter(env.EVENT_BUCKET),
    adminEmails = env.ADMIN_EMAILS.split(",").map((s) =>
      s.trim().toLowerCase(),
    );
  const smsTransport = twilioTransport({
    accountSid: env.TWILIO_ACCOUNT_SID,
    serviceSid: env.TWILIO_MESSAGING_SERVICE_SID,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    statusCallback: origin + "/api/twilio/status",
    enabled:
      env.SMS_ENABLED === "true" &&
      env.SMS_ACTIVATION_REVIEWED === "true" &&
      !!env.TWILIO_AUTH_TOKEN,
  });
  if (env.SMS_ENABLED === "true" && !smsTransport.enabled)
    throw new Error(
      "SMS activation requires configured credentials and completed activation review",
    );
  const whatsappTransport = createWhatsappTransport({
    accountSid: env.TWILIO_ACCOUNT_SID,
    from: env.WHATSAPP_FROM,
    apiKeySid: env.TWILIO_API_KEY_SID,
    apiKeySecret: env.TWILIO_API_KEY_SECRET,
    statusCallback: origin + "/api/whatsapp/status",
    enabled:
      env.WHATSAPP_ENABLED === "true" &&
      env.WHATSAPP_ACTIVATION_REVIEWED === "true" &&
      !!env.TWILIO_AUTH_TOKEN,
  });
  if (env.WHATSAPP_ENABLED === "true" && !whatsappTransport.enabled)
    throw new Error(
      "WhatsApp activation requires configured credentials and completed review",
    );
  app = createApplication({
    adminDelegateEmails: (env.ADMIN_DELEGATE_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    whatsappTransport,
    whatsappTemplates: JSON.parse(env.WHATSAPP_TEMPLATES_JSON || "[]"),
    whatsappWebhook: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      from: env.WHATSAPP_FROM,
      authToken: env.TWILIO_AUTH_TOKEN,
      origin,
    },
    notificationEmails: (env.NOTIFICATION_EMAILS || env.ADMIN_EMAILS)
      .split(",")
      .map((s) => s.trim().toLowerCase()),
    ledger: new Ledger(adapter),
    smsTransport,
    smsWebhook: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      serviceSid: env.TWILIO_MESSAGING_SERVICE_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      origin,
    },
    notion: notionClient({
      token: env.NOTION_TOKEN,
      sourceId: env.NOTION_SOURCE_ID,
    }),
    mailer: eventMailer({
      microsoft: graphMailer({
        tenant: env.M365_TENANT_ID,
        clientId: env.M365_CLIENT_ID,
        clientSecret: env.M365_CLIENT_SECRET,
        sender: "misxv@simplysoph.com",
      }),
      sendgrid: sendgridMailer({
        apiKey: env.SENDGRID_API_KEY,
        sender: "misxv@simplysoph.com",
      }),
      provider: env.MAIL_PROVIDER || "m365",
      fallback: env.SENDGRID_FALLBACK_ENABLED === "true",
    }),
    verifyGoogle: googleVerifier(env.ADMIN_GOOGLE_CLIENT_ID, adminEmails),
    // Optional: Microsoft sign-in appears only when MICROSOFT_CLIENT_ID is set.
    verifyMicrosoft: microsoftVerifier({
      clientId: env.MICROSOFT_CLIENT_ID,
      tenantId: env.MICROSOFT_TENANT_ID,
    }),
    verifyGoogleIdentity: googleIdentityVerifier(env.ADMIN_GOOGLE_CLIENT_ID),
    microsoftClientId: env.MICROSOFT_CLIENT_ID || "",
    documents: {
      async put(id, bytes) {
        await adapter.bucket.file("private/documents/" + id).save(bytes, {
          resumable: false,
          contentType: "application/octet-stream",
          preconditionOpts: { ifGenerationMatch: 0 },
        });
      },
      async get(id) {
        return (
          await adapter.bucket.file("private/documents/" + id).download()
        )[0];
      },
    },
    media: {
      async put(id, bytes, kind = "photo") {
        await adapter.bucket
          .file(
            (kind === "video" ? "private/videos/" : "private/photos/") +
              id +
              (kind === "video" ? ".mp4" : ".jpg"),
          )
          .save(bytes, {
            resumable: false,
            contentType: kind === "video" ? "video/mp4" : "image/jpeg",
            preconditionOpts: { ifGenerationMatch: 0 },
          });
      },
      async get(id, kind = "photo") {
        return (
          await adapter.bucket
            .file(
              (kind === "video" ? "private/videos/" : "private/photos/") +
                id +
                (kind === "video" ? ".mp4" : ".jpg"),
            )
            .download()
        )[0];
      },
    },
    key,
    origin,
    clientId: env.ADMIN_GOOGLE_CLIENT_ID,
    adminEmails,
  });
}
const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist",
  ),
  port = Number(env.PORT ?? 4173),
  host = env.HOST ?? (env.K_SERVICE ? "0.0.0.0" : "127.0.0.1");
if (!Number.isInteger(port) || port < 0 || port > 65535)
  throw new Error("Invalid port");
// Cloud Logging parses one JSON object per stdout line (severity, httpRequest).
const log = (entry) =>
  process.stdout.write(
    JSON.stringify({ time: new Date().toISOString(), ...entry }) + "\n",
  );
const server = createHttpServer({ app, root, origin, log });
server.requestTimeout = 120000;
server.headersTimeout = 15000;
server.listen(port, host, () =>
  log({
    severity: "NOTICE",
    message: `Sophia ${app ? "service" : "preview"}: http://${host}:${server.address().port}/`,
  }),
);
// Log, then exit so Cloud Run replaces the instance (Node's default crash).
process.on("unhandledRejection", (e) => {
  log({
    severity: "ERROR",
    message: "Unhandled rejection",
    stack_trace: String(e?.stack || e).slice(0, 4000),
  });
  process.exit(1);
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 8000).unref();
  });
