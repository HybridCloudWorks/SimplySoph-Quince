import test from "node:test";
import assert from "node:assert/strict";
import { graphMailer } from "../server/mail.mjs";
const configuration = {
  tenant: "fixture-tenant",
  clientId: "fixture-client",
  clientSecret: "fixture-secret",
  sender: "misxv@simplysoph.com",
};
const message = {
  to: "fixture@example.com",
  subject: "Test",
  html: "<p>Test</p>",
  id: "test-intent",
};
test("Graph acceptance is recorded without claiming delivery; sender stays fixed", async () => {
  const calls = [];
  const mail = graphMailer({
    ...configuration,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1
        ? Response.json({ access_token: "fixture-access" })
        : new Response(null, { status: 202 });
    },
  });
  assert.deepEqual(await mail.send(message), { state: "accepted" });
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1].url,
    "https://graph.microsoft.com/v1.0/users/misxv%40simplysoph.com/sendMail",
  );
  assert.equal(JSON.parse(calls[1].init.body).saveToSentItems, true);
});
test("ambiguous send timeout is never retried or exposed with provider secrets", async () => {
  let calls = 0;
  const mail = graphMailer({
    ...configuration,
    fetchImpl: async () => {
      if (++calls === 1)
        return Response.json({ access_token: "fixture-access" });
      throw new Error("transport error with fixture-secret");
    },
  });
  await assert.rejects(
    () => mail.send(message),
    (e) =>
      e.code === "MAIL_DELIVERY_UNKNOWN" &&
      !e.message.includes("fixture-secret"),
  );
  assert.equal(calls, 2);
});
test("failed Microsoft authentication never submits a message", async () => {
  let calls = 0;
  const mail = graphMailer({
    ...configuration,
    fetchImpl: async () => {
      calls++;
      return new Response(null, { status: 403 });
    },
  });
  await assert.rejects(
    () => mail.send(message),
    (e) => e.code === "MAIL_AUTH_FAILED",
  );
  assert.equal(calls, 1);
});
