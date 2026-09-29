import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import { createHttpServer } from "../server/http.mjs";
import { createSms } from "../server/sms.mjs";
import { Ledger, memoryAdapter } from "../server/store.mjs";
test("only exact signed Twilio form callbacks bypass browser origin rules", async (t) => {
  const origin = "https://example.com";
  const config = {
    origin,
    accountSid: "AC" + "1".repeat(32),
    serviceSid: "MG" + "2".repeat(32),
    authToken: "fixture-token",
  };
  const sms = createSms({
    ledger: new Ledger(memoryAdapter()),
    notion: { list: async () => [] },
    webhook: config,
  });
  const server = createHttpServer({
    origin,
    root: process.cwd(),
    app: {
      dispatch: async (req) =>
        sms.callback("inbound", req.body, req.headers["x-twilio-signature"]),
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const params = {
    AccountSid: config.accountSid,
    MessagingServiceSid: config.serviceSid,
    MessageSid: "SM" + "4".repeat(32),
    From: "+14155552671",
    OptOutType: "STOP",
  };
  const signature = twilio.getExpectedTwilioSignature(
    config.authToken,
    origin + "/api/twilio/inbound",
    params,
  );
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": signature,
    },
    body: new URLSearchParams(params).toString(),
  };
  const good = await fetch(base + "/api/twilio/inbound", options);
  assert.equal(good.status, 200);
  assert.match(await good.text(), /<Response\/>/);
  const forged = await fetch(base + "/api/twilio/inbound", {
    ...options,
    headers: { ...options.headers, "X-Twilio-Signature": "wrong" },
  });
  assert.equal(forged.status, 403);
  const duplicate = await fetch(base + "/api/twilio/inbound", {
    ...options,
    body: options.body + "&From=%2B14165552671",
  });
  assert.equal(duplicate.status, 400);
  const admin = await fetch(base + "/api/admin/sms/send", options);
  assert.equal(admin.status, 403);
});
