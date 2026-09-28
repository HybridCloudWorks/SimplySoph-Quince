import test from "node:test";
import assert from "node:assert/strict";
import twilio from "twilio";
import {
  smsDestination,
  twilioTransport,
  validTwilioWebhook,
} from "../server/twilio.mjs";
const cfg = {
  accountSid: "AC" + "1".repeat(32),
  serviceSid: "MG" + "2".repeat(32),
  apiKeySid: "SK" + "3".repeat(32),
  apiKeySecret: "fixture-secret",
  statusCallback: "https://example.com/api/twilio/status",
};
test("SMS countries use phone metadata, not just the +1 prefix", () => {
  assert.equal(smsDestination("+14155552671"), "+14155552671");
  assert.equal(smsDestination("+14165552671"), "+14165552671");
  for (const value of ["+12425552671", "+5215512345678", "4155552671"])
    assert.throws(() => smsDestination(value));
});
test("Twilio stays disabled by default even with credentials", async () => {
  const sms = twilioTransport({
    ...cfg,
    fetchImpl: () => assert.fail("network must not be called"),
  });
  await assert.rejects(
    () => sms.send({ to: "+14155552671", text: "Hello" }),
    (e) => e.code === "SMS_NOT_ENABLED",
  );
});
test("Twilio accepted message is not represented as delivered", async () => {
  const sms = twilioTransport({
    ...cfg,
    enabled: true,
    fetchImpl: async (url, init) => {
      assert.equal(init.body.get("MessagingServiceSid"), cfg.serviceSid);
      assert.equal(init.body.get("StatusCallback"), cfg.statusCallback);
      return Response.json(
        { sid: "SM" + "4".repeat(32), account_sid: cfg.accountSid },
        { status: 201 },
      );
    },
  });
  assert.equal(
    (await sms.send({ to: "+14155552671", text: "Hello" })).state,
    "accepted",
  );
});
test("ambiguous SMS responses do not retry or leak secrets", async () => {
  let calls = 0;
  const sms = twilioTransport({
    ...cfg,
    enabled: true,
    fetchImpl: async () => {
      calls++;
      throw new Error(cfg.apiKeySecret);
    },
  });
  await assert.rejects(
    () => sms.send({ to: "+14155552671", text: "Hello" }),
    (e) =>
      e.code === "SMS_DELIVERY_UNKNOWN" &&
      !e.message.includes(cfg.apiKeySecret),
  );
  assert.equal(calls, 1);
});
test("webhook signature includes exact public URL and account/service identity", () => {
  const params = {
    AccountSid: cfg.accountSid,
    MessagingServiceSid: cfg.serviceSid,
    MessageSid: "SM" + "4".repeat(32),
    MessageStatus: "delivered",
  };
  const signature = twilio.getExpectedTwilioSignature(
    "fixture-token",
    cfg.statusCallback,
    params,
  );
  const args = {
    authToken: "fixture-token",
    signature,
    url: cfg.statusCallback,
    params,
    accountSid: cfg.accountSid,
    serviceSid: cfg.serviceSid,
  };
  assert.equal(validTwilioWebhook(args), true);
  assert.equal(
    validTwilioWebhook({ ...args, url: cfg.statusCallback + "/" }),
    false,
  );
  assert.equal(
    validTwilioWebhook({ ...args, serviceSid: "MG" + "5".repeat(32) }),
    false,
  );
  assert.equal(
    validTwilioWebhook({
      ...args,
      params: { ...params, MessageStatus: "failed" },
    }),
    false,
  );
});
