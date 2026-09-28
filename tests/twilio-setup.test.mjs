import test from "node:test";
import assert from "node:assert/strict";
import { twilioSetupReport } from "../scripts/twilio-setup.mjs";

test("Twilio setup stays disabled with missing or populated credentials", () => {
  const empty = twilioSetupReport();
  assert.equal(empty.credentialFormatsComplete, false);
  assert.equal(empty.sendingEnabled, false);
  assert.ok(empty.configuration.every((x) => x.status === "missing"));
  const env = {
    TWILIO_ACCOUNT_SID: "AC" + "a".repeat(32),
    TWILIO_MESSAGING_SERVICE_SID: "MG" + "b".repeat(32),
    TWILIO_API_KEY_SID: "SK" + "c".repeat(32),
    TWILIO_API_KEY_SECRET: "fixture-api-secret-only",
    TWILIO_AUTH_TOKEN: "fixture-auth-token-only",
    SMS_ENABLED: "true",
  };
  const report = twilioSetupReport(env);
  assert.equal(report.credentialFormatsComplete, true);
  assert.equal(report.credentialsVerified, false);
  assert.equal(report.sendingEnabled, false);
  for (const name of Object.keys(env).filter((x) => x.startsWith("TWILIO_")))
    assert.equal(JSON.stringify(report).includes(env[name]), false);
});

test("Twilio setup rejects malformed identifiers without echoing their values", () => {
  const report = twilioSetupReport({
    TWILIO_ACCOUNT_SID: "private-invalid-account-value",
    TWILIO_API_KEY_SECRET: " ",
  });
  assert.equal(report.credentialFormatsComplete, false);
  assert.equal(report.configuration[0].status, "invalid-format");
  assert.equal(report.configuration[3].status, "invalid-format");
  assert.equal(
    JSON.stringify(report).includes("private-invalid-account-value"),
    false,
  );
});
