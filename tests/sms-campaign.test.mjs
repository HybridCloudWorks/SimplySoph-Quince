import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { smsProgram } from "../site/sms-program.mjs";

// Twilio rejects campaigns (30909) when the registered text and live behavior diverge.
// Normalize line endings so Windows (CRLF) checkouts parse the same as CI.
const doc = (
  await readFile(
    new URL("../docs/sms-campaign-registration.md", import.meta.url),
    "utf8",
  )
).replace(/\r\n/g, "\n");
const flow = doc.match(/## message_flow\s+```\n([\s\S]*?)\n```/)[1];

test("registered campaign replies match the program the code and pages use", () => {
  for (const reply of [smsProgram.confirmation, smsProgram.help, smsProgram.stop])
    assert.ok(doc.includes("`" + reply + "`"), reply);
  assert.ok(doc.includes("`" + smsProgram.keywords.join(", ") + "`"));
  assert.ok(doc.includes("`" + smsProgram.stopKeywords.join(", ") + "`"));
});

test("message_flow is within limits and quotes keyword, number, confirmation and links", () => {
  assert.ok(flow.length >= 40 && flow.length <= 2048, String(flow.length));
  for (const part of [
    smsProgram.name,
    `Text ${smsProgram.keyword} to ${smsProgram.phoneDisplay}`,
    smsProgram.confirmation,
    "https://misxv.simplysoph.com/sms/",
    "https://misxv.simplysoph.com/sms-terms/",
    "https://misxv.simplysoph.com/privacy/",
  ])
    assert.ok(flow.includes(part), part);
});

test("sample messages carry the brand prefix and opt-out language", () => {
  const samples = [...doc.matchAll(/^\d\. `(.+)`$/gm)].map((m) => m[1]);
  assert.equal(samples.length, 2);
  for (const s of samples) {
    assert.ok(s.startsWith(smsProgram.name + ":"), s);
    assert.match(s, /\bSTOP\b/);
  }
});
