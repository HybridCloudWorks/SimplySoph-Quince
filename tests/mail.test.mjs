import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { graphMailer } from "../server/mail.mjs";
import { renderEmail, renderSignInEmail } from "../emails/templates.mjs";
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
  assert.deepEqual(await mail.send(message), {
    state: "accepted",
    provider: "m365",
  });
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

test("sign-in link emails are not kept in the shared mailbox's Sent Items (re-audit)", async () => {
  const bodies = [];
  const mail = graphMailer({
    ...configuration,
    fetchImpl: async (url, init) => {
      if (init?.body && typeof init.body === "string") bodies.push(JSON.parse(init.body));
      return url.includes("oauth2") ? Response.json({ access_token: "fixture-access" }) : new Response(null, { status: 202 });
    },
  });
  await mail.send({ ...message, secret: true });
  await mail.send(message);
  assert.deepEqual(bodies.map((b) => b.saveToSentItems), [false, true]);
});

// R-122: the text version every template builds is sent next to the HTML.
// The MIME message is checked with Python's email package, an independent
// parser, rather than with the code that wrote it.
const python = spawnSync("python3", ["-I", "-c", ""], { stdio: "ignore" }).status === 0;
const PARSE = `
import email, json, sys
from email import policy
m = email.message_from_bytes(sys.stdin.buffer.read(), policy=policy.default)
parts = list(m.iter_parts())
sender = m["From"].addresses[0]
print(json.dumps({
  "type": m.get_content_type(),
  "subject": str(m["Subject"]),
  "fromName": sender.display_name,
  "from": sender.addr_spec,
  "to": str(m["To"]),
  "date": m["Date"].datetime.isoformat(),
  "mimeVersion": str(m["MIME-Version"]),
  "id": str(m["x-misxv-message-id"]),
  "defects": [type(d).__name__ for d in [*m.defects, *(d for p in parts for d in p.defects)]],
  "parts": [{"type": p.get_content_type(), "charset": p.get_content_charset(),
             "encoding": str(p["Content-Transfer-Encoding"]),
             "content": p.get_payload(decode=True).decode("utf-8")} for p in parts],
}))
`;
function parseMime(raw) {
  const parsed = spawnSync("python3", ["-I", "-c", PARSE], { input: raw });
  assert.equal(parsed.status, 0, String(parsed.stderr));
  return JSON.parse(parsed.stdout);
}
// Sends one message through Graph and returns the sendMail request.
async function graphRequest(sent, options = {}) {
  const requests = [];
  const mail = graphMailer({
    ...configuration,
    now: () => Date.parse("2026-10-17T15:04:05Z"),
    ...options,
    fetchImpl: async (url, init) => {
      if (url.includes("oauth2")) return Response.json({ access_token: "fixture-access" });
      requests.push(init);
      return new Response(null, { status: 202 });
    },
  });
  assert.deepEqual(await mail.send(sent), { state: "accepted", provider: "m365" });
  assert.equal(requests.length, 1);
  return requests[0];
}
const mimeOf = (request) => {
  assert.equal(request.headers["Content-Type"], "text/plain");
  assert.match(request.body, /^[A-Za-z0-9+/]+={0,2}$/);
  return Buffer.from(request.body, "base64");
};
const subjectLines = (raw) => {
  const lines = raw.toString("utf8").split("\r\n\r\n")[0].split("\r\n");
  const start = lines.findIndex((l) => l.startsWith("Subject: "));
  let end = start + 1;
  while (lines[end]?.startsWith(" ")) end++;
  return lines.slice(start, end);
};
const es = renderEmail({
  type: "update",
  locale: "es",
  household: "Familia Ejemplo",
  url: "https://misxv.example/es/details/",
  attendance: { ceremony: { adultsTeens: 2, kids: 1 }, dinner: { adultsTeens: 2, kids: 0 }, dance: { adultsTeens: 0, kids: 0 } },
  invited: { ceremony: true, dinner: true, dance: false },
  rsvpDeadline: "domingo 15 de noviembre de 2026",
});

test("Graph sends the text and HTML versions as one MIME message, Spanish subject intact (R-122)", { skip: !python && "python3 is not installed" }, async () => {
  assert.equal(es.subject, "Su respuesta se actualizó · Los XV de Sophia");
  assert.ok(es.text.includes("¿Preguntas?") && !es.html.includes("\n"));
  const raw = mimeOf(
    await graphRequest({ to: "guest@example.com", subject: es.subject, html: es.html, text: es.text, id: "intent-es" }),
  );
  const m = parseMime(raw);
  assert.deepEqual(m.defects, []);
  assert.equal(m.type, "multipart/alternative");
  assert.deepEqual(
    m.parts.map((p) => [p.type, p.charset, p.encoding]),
    [
      ["text/plain", "utf-8", "base64"],
      ["text/html", "utf-8", "base64"],
    ],
  );
  // Text travels in canonical form, CRLF line breaks (RFC 2045 §6.8).
  assert.equal(m.parts[0].content, es.text.replaceAll("\n", "\r\n"));
  assert.equal(m.parts[1].content, es.html);
  assert.equal(m.subject, es.subject);
  assert.equal(m.id, "intent-es");
  assert.equal(m.to, "guest@example.com");
  assert.equal(m.from, configuration.sender);
  assert.equal(m.fromName, "Sophia's Quinceañera");
  assert.equal(m.date, "2026-10-17T15:04:05+00:00");
  assert.equal(m.mimeVersion, "1.0");
  assert.ok(!/(?<!\r)\n|\r(?!\n)/.test(raw.toString("utf8")), "CRLF line endings only");
  // Lines within the 78 characters RFC 5322 §2.1.1 recommends.
  assert.ok(raw.toString("utf8").split("\r\n").every((line) => line.length <= 78));
});

test("a sign-in link email keeps the JSON HTML send and stays out of Sent Items, text or not (R-122)", async () => {
  const signIn = renderSignInEmail({ locale: "es", household: "Familia Ejemplo", url: "https://misxv.example/es/account/#sample" });
  const request = await graphRequest({
    to: "guest@example.com",
    subject: signIn.subject,
    html: signIn.html,
    text: signIn.text,
    id: "intent-sign-in",
    secret: true,
  });
  assert.equal(request.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(request.body), {
    message: {
      subject: signIn.subject,
      body: { contentType: "HTML", content: signIn.html },
      toRecipients: [{ emailAddress: { address: "guest@example.com" } }],
      internetMessageHeaders: [{ name: "x-misxv-message-id", value: "intent-sign-in" }],
    },
    saveToSentItems: false,
  });
});

test("the MIME boundary never occurs inside either part, even when the content contains it (R-122)", { skip: !python && "python3 is not installed" }, async () => {
  const boundary = "=_misxv_" + "ab".repeat(24);
  const lookalikes = `--${boundary}\n--${boundary}--\n--=_misxv_\n------=_Part_0\n`;
  const text = `Línea uno\n${lookalikes}Línea dos`,
    html = `<p>Uno</p>\r\n${lookalikes.replaceAll("\n", "\r\n")}<p>Dos</p>`;
  const raw = mimeOf(
    await graphRequest(
      { to: "guest@example.com", subject: "Event update", html, text, id: "intent-boundary" },
      { random: (n) => Buffer.alloc(n, 0xab) },
    ),
  );
  const source = raw.toString("utf8");
  assert.ok(source.includes(` boundary="${boundary}"`));
  // Two delimiters and the closing one, nothing else.
  assert.equal(source.split(`--${boundary}`).length - 1, 3);
  const m = parseMime(raw);
  assert.deepEqual(m.defects, []);
  assert.deepEqual(m.parts.map((p) => p.type), ["text/plain", "text/html"]);
  assert.equal(m.parts[0].content, text.replaceAll("\n", "\r\n"));
  assert.equal(m.parts[1].content, html);
  assert.ok(subjectLines(raw)[0] === "Subject: Event update", "a short ASCII subject is written as it is");
});

test("long subjects fold into encoded-words that never split a character; a 4-byte emoji round-trips (R-122)", { skip: !python && "python3 is not installed" }, async () => {
  for (const subject of [
    "¿Nos acompañarán? Un pequeño recordatorio · Los XV de Sophia · " + "🎉".repeat(12) + " fin",
    "A very long English subject line that goes on well past the seventy-eight character line limit",
    "=?UTF-8?B?not-encoded?= stays literal",
  ]) {
    const raw = mimeOf(
      await graphRequest({ to: "guest@example.com", subject, html: "<p>Hola</p>", text: "Hola", id: "intent-subject" }),
    );
    const lines = subjectLines(raw);
    assert.ok(lines.length > 1 || subject.length < 40, subject);
    for (const [i, line] of lines.entries()) {
      assert.ok(line.length <= 76, line);
      const word = i === 0 ? line.slice("Subject: ".length) : line.slice(1);
      assert.match(word, /^=\?UTF-8\?B\?[A-Za-z0-9+/]+={0,2}\?=$/);
      assert.ok(word.length <= 75, word);
      // Each word decodes to whole UTF-8 characters on its own.
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.from(word.slice(10, -2), "base64"));
    }
    const m = parseMime(raw);
    assert.deepEqual(m.defects, []);
    assert.equal(m.subject, subject);
  }
});
