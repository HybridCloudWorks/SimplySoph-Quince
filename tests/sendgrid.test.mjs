import test from "node:test";
import assert from "node:assert/strict";
import { sendgridMailer, eventMailer } from "../server/mail.mjs";
const message = {
  to: "owner@example.com",
  subject: "Sign In",
  html: '<a href="https://example.com/#private">Sign In</a>',
  id: "fixture-id",
};
test("SendGrid uses one recipient and disables tracking on private links", async () => {
  let payload;
  const mailer = sendgridMailer({
    apiKey: "fixture",
    sender: "misxv@simplysoph.com",
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://api.sendgrid.com/v3/mail/send");
      payload = JSON.parse(init.body);
      return new Response(null, { status: 202 });
    },
  });
  assert.deepEqual(await mailer.send(message), {
    state: "accepted",
    provider: "sendgrid",
  });
  assert.deepEqual(payload.personalizations, [{ to: [{ email: message.to }] }]);
  assert.equal(payload.tracking_settings.click_tracking.enable, false);
  assert.equal(payload.tracking_settings.open_tracking.enable, false);
  assert.equal(payload.content[0].value, message.html);
});
test("fallback only follows pre-submission Microsoft authentication failures", async () => {
  for (const code of [
    "MAIL_AUTH_FAILED",
    "MAIL_AUTH_UNAVAILABLE",
    "MAIL_DELIVERY_UNKNOWN",
    "MAIL_REJECTED",
  ]) {
    let fallbackCalls = 0;
    const mailer = eventMailer({
      microsoft: {
        configured: true,
        async send() {
          throw Object.assign(new Error(), { code });
        },
      },
      sendgrid: {
        configured: true,
        async send() {
          fallbackCalls++;
          return { state: "accepted" };
        },
      },
      fallback: true,
    });
    if (code.startsWith("MAIL_AUTH_")) await mailer.send(message);
    else
      await assert.rejects(
        () => mailer.send(message),
        (e) => e.code === code,
      );
    assert.equal(fallbackCalls, code.startsWith("MAIL_AUTH_") ? 1 : 0);
  }
});
test("fallback is opt-in and provider errors never expose keys", async () => {
  let calls = 0;
  const sendgrid = sendgridMailer({
    apiKey: "private-fixture",
    sender: "sender@example.com",
    fetchImpl: async () => {
      calls++;
      throw new Error("private-fixture");
    },
  });
  await assert.rejects(
    () => sendgrid.send(message),
    (e) =>
      e.code === "MAIL_DELIVERY_UNKNOWN" &&
      !e.message.includes("private-fixture"),
  );
  const mail = eventMailer({
    microsoft: {
      configured: true,
      async send() {
        throw Object.assign(new Error(), { code: "MAIL_AUTH_FAILED" });
      },
    },
    sendgrid,
  });
  await assert.rejects(() => mail.send(message));
  assert.equal(calls, 1);
});
