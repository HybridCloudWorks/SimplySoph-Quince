import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { smsProgram } from "../site/sms-program.mjs";

// Twilio rejects campaigns (30909) when the registered text and live behavior
// diverge. The doc lists each Console field as "### <label>" plus a code block.
// Normalize line endings so Windows (CRLF) checkouts parse the same as CI.
const doc = (
  await readFile(
    new URL("../docs/sms-campaign-registration.md", import.meta.url),
    "utf8",
  )
).replace(/\r\n/g, "\n");
function field(label) {
  const at = doc.indexOf("### " + label + "\n");
  assert.ok(at >= 0, "missing field: " + label);
  const block = doc.slice(at).match(/```\n([\s\S]*?)\n```/);
  return block[1];
}

test("registered replies and keywords match the program the code and pages use", () => {
  assert.equal(field("What is the opt-in message?"), smsProgram.confirmation);
  assert.equal(field("What is the opt-out message?"), smsProgram.stop);
  assert.equal(field("What is the help message?"), smsProgram.help);
  assert.equal(field("List all opt-in keywords"), smsProgram.keywords.join(","));
  assert.equal(field("List all opt-out keywords"), smsProgram.stopKeywords.join(","));
  assert.equal(field("List all help keywords"), smsProgram.helpKeywords.join(","));
  for (const reply of [smsProgram.confirmation, smsProgram.help, smsProgram.stop]) {
    assert.ok(reply.length >= 20 && reply.length <= 320, reply);
    assert.ok(reply.startsWith(smsProgram.name + ":"), reply);
  }
  // Twilio's keyword-campaign guide: the confirmation itself links Terms and Privacy.
  assert.match(smsProgram.confirmation, /sms-terms\/.*privacy\//);
});

test("message flow describes only the public keyword path, word for word", async () => {
  const flow = field("Message Flow: How do end-users consent to receive messages?");
  assert.ok(flow.length >= 40 && flow.length <= 2048, String(flow.length));
  for (const part of [
    smsProgram.name,
    `Text ${smsProgram.keyword} to ${smsProgram.phoneDisplay}`,
    smsProgram.confirmation,
    "https://misxv.simplysoph.com/sms/",
    "https://misxv.simplysoph.com/sms-terms/",
    "https://misxv.simplysoph.com/privacy/",
    "No login or invitation is needed",
  ])
    assert.ok(flow.includes(part), part);
  // The rejected submission described a private, invitation-based checkbox.
  assert.doesNotMatch(flow, /checkbox|through their invitation/i);
  // The call to action and confirmation quoted in the flow are exactly what the
  // public pages show (reviewers compare them). Built by `npm run check`.
  const cta = flow.match(/It reads: "([^"]+)"/)[1];
  for (const page of ["sms", "sms-terms"]) {
    const text = (await readFile(new URL(`../dist/${page}/index.html`, import.meta.url), "utf8"))
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&#39;|&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ");
    if (page === "sms") assert.ok(text.includes(cta), "CTA wording differs from /sms/");
    assert.ok(text.includes(smsProgram.confirmation), `confirmation missing on /${page}/`);
  }
  assert.equal(field("Provide link to the Campaign's privacy policy"), "https://misxv.simplysoph.com/privacy/");
  assert.equal(field("Provide link to Campaign's terms of service"), "https://misxv.simplysoph.com/sms-terms/");
});

test("sample messages and description name the brand; samples carry opt-out language", () => {
  assert.ok(field("Campaign description").startsWith("Messages are sent by " + smsProgram.name));
  for (const n of [1, 2, 3, 4]) {
    const s = field("Sample message #" + n);
    assert.ok(s.length >= 20 && s.length <= 1024, s);
    assert.ok(s.startsWith(smsProgram.name + ":"), s);
    assert.match(s, /\bSTOP\b/);
  }
});
