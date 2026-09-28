import { pathToFileURL } from "node:url";

// Offline handoff only. Never calls Twilio, prints values, or enables sending.
export function twilioSetupReport(env = {}) {
  const fields = [
    ["TWILIO_ACCOUNT_SID", /^AC[0-9a-f]{32}$/i],
    ["TWILIO_MESSAGING_SERVICE_SID", /^MG[0-9a-f]{32}$/i],
    ["TWILIO_API_KEY_SID", /^SK[0-9a-f]{32}$/i],
    ["TWILIO_API_KEY_SECRET", /^\S{16,}$/],
    ["TWILIO_AUTH_TOKEN", /^\S{16,}$/],
  ];
  const configuration = fields.map(([name, pattern]) => ({
    name,
    status: !env[name]
      ? "missing"
      : typeof env[name] === "string" && pattern.test(env[name])
        ? "present-format-only"
        : "invalid-format",
  }));
  return {
    provider: "Twilio",
    mode: "offline-setup-review",
    sendingEnabled: false,
    credentialFormatsComplete: configuration.every(
      ({ status }) => status === "present-format-only",
    ),
    credentialsVerified: false,
    configuration,
    remainingGates: [
      "Owner completes account, billing and truthful sender registration",
      "Twilio approves sender verification",
      "Store dedicated credentials in Secret Manager and verify account access",
      "Implement authenticated sending and signed opt-out/delivery callbacks",
      "Enforce US/Canada destinations and fresh Notion consent before dispatch",
      "Test opt-out, duplicates and uncertain delivery before approved test sends",
    ],
    guide: "docs/twilio-setup.md",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(twilioSetupReport(process.env), null, 2));
