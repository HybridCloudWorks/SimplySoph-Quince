import { randomBytes } from "node:crypto";
import { error } from "./auth.mjs";
// The name guests see as the sender, from either provider.
const SENDER_NAME = "Sophia's Quinceañera";
// Every email the site builds has a plain-text version next to its HTML
// (emails/templates.mjs). An empty one is never sent as an empty part.
const hasText = (text) => typeof text === "string" && text.trim() !== "";
// Failover is allowed only before Microsoft submits a message. Never retry an
// ambiguous provider acceptance through a second provider.
export function sendgridMailer({ apiKey, sender, fetchImpl = fetch }) {
  const configured = !!(apiKey && sender);
  return {
    configured,
    async send({ to, subject, html, text, id }) {
      if (!configured) throw error(503, "MAIL_NOT_CONFIGURED");
      let response;
      try {
        response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: to }] }],
            from: { email: sender, name: SENDER_NAME },
            subject,
            // SendGrid requires text/plain before text/html.
            content: [
              ...(hasText(text) ? [{ type: "text/plain", value: text }] : []),
              { type: "text/html", value: html },
            ],
            custom_args: { misxv_message_id: id },
            tracking_settings: {
              click_tracking: { enable: false, enable_text: false },
              open_tracking: { enable: false },
              subscription_tracking: { enable: false },
            },
          }),
        });
      } catch {
        throw error(503, "MAIL_DELIVERY_UNKNOWN");
      }
      if (response.status !== 202)
        throw error(
          503,
          response.status >= 500 ? "MAIL_DELIVERY_UNKNOWN" : "MAIL_REJECTED",
        );
      return { state: "accepted", provider: "sendgrid" };
    },
  };
}

export function eventMailer({
  microsoft,
  sendgrid,
  provider = "m365",
  fallback = false,
}) {
  if (!["m365", "sendgrid"].includes(provider))
    throw new Error("Invalid MAIL_PROVIDER");
  const primary = provider === "m365" ? microsoft : sendgrid;
  return {
    configured: !!primary?.configured,
    async send(message) {
      if (!primary?.configured) throw error(503, "MAIL_NOT_CONFIGURED");
      try {
        return await primary.send(message);
      } catch (failure) {
        if (
          provider === "m365" &&
          fallback &&
          sendgrid?.configured &&
          ["MAIL_AUTH_UNAVAILABLE", "MAIL_AUTH_FAILED"].includes(failure.code)
        )
          return sendgrid.send(message);
        throw failure;
      }
    },
  };
}
const CRLF = "\r\n";
// RFC 2047 encoded-words for header text that is not plain ASCII (Spanish
// subjects have accents and "¿"). Each word holds whole characters, never part
// of a UTF-8 sequence, and at most 39 bytes: a word is then at most 64
// characters (the limit is 75), and "Subject: " plus a word stays within the
// 76-character line limit. Words are folded onto continuation lines.
function headerText(name, value) {
  const s = String(value ?? "");
  if (/^[\x20-\x7e]*$/.test(s) && !s.includes("=?") && name.length + 2 + s.length <= 78)
    return s;
  const words = [];
  let word = "";
  for (const character of s) {
    if (word && Buffer.byteLength(word + character) > 39) {
      words.push(word);
      word = "";
    }
    word += character;
  }
  if (word) words.push(word);
  return words
    .map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`)
    .join(CRLF + " ");
}
// Text in canonical form (CRLF line breaks, RFC 2045 §6.8), base64 in lines of 76.
const base64Lines = (content) =>
  (
    Buffer.from(String(content).replace(/\r\n|\r|\n/g, CRLF), "utf8")
      .toString("base64")
      .match(/.{1,76}/g) || []
  ).join(CRLF);
// A multipart/alternative message: the text version first, then the HTML.
// The boundary starts with "=_": "_" is not in the base64 alphabet and both
// parts are base64, so the boundary can never occur inside either part.
function mimeMessage({ from, to, subject, text, html, id, date, random }) {
  const boundary = `=_misxv_${random(24).toString("hex")}`;
  const part = (type, content) =>
    [
      `--${boundary}`,
      `Content-Type: ${type}; charset=utf-8`,
      "Content-Transfer-Encoding: base64",
      "",
      base64Lines(content),
    ].join(CRLF);
  return [
    `From: ${headerText("From", SENDER_NAME)} <${from}>`,
    `To: ${to}`,
    `Subject: ${headerText("Subject", subject)}`,
    `Date: ${date.toUTCString().replace(/GMT$/, "+0000")}`,
    "MIME-Version: 1.0",
    `x-misxv-message-id: ${id}`,
    `Content-Type: multipart/alternative;${CRLF} boundary="${boundary}"`,
    "",
    part("text/plain", text),
    part("text/html", html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}
// Values written into MIME headers as they are must be printable ASCII with
// no spaces, so nothing can start a new header line. Anything else (say, an
// address with accents) keeps the JSON HTML send.
const plainHeaderValue = (value) => /^[\x21-\x7e]+$/.test(String(value ?? ""));
export function graphMailer({
  tenant,
  clientId,
  clientSecret,
  sender,
  fetchImpl = fetch,
  now = Date.now,
  random = randomBytes,
}) {
  const configured = !!(tenant && clientId && clientSecret && sender);
  return {
    configured,
    // secret: a sign-in link. Not kept in the shared mailbox's Sent Items, where
    // anyone with access to the mailbox could use it (re-audit).
    async send({ to, subject, html, text, id, secret = false }) {
      if (!configured) throw error(503, "MAIL_NOT_CONFIGURED");
      let auth;
      try {
        auth = await fetchImpl(
          `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
          {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              scope: "https://graph.microsoft.com/.default",
              grant_type: "client_credentials",
            }),
          },
        );
      } catch {
        throw error(503, "MAIL_AUTH_UNAVAILABLE");
      }
      if (!auth.ok) throw error(503, "MAIL_AUTH_FAILED");
      const access = await auth.json();
      // Graph's JSON sendMail carries one body, HTML or text. Both versions
      // travel together only as a MIME message (Content-Type text/plain, the
      // message in base64), and a MIME send is always saved to Sent Items:
      // saveToSentItems exists only in the JSON form
      // (https://learn.microsoft.com/graph/api/user-sendmail). So a sign-in
      // link (secret) never goes through MIME: it keeps the JSON HTML send with
      // saveToSentItems false. Only emails that are saved to Sent Items anyway
      // use MIME, and only when there is a text version to add.
      const mime =
        !secret && hasText(text) && [to, id, sender].every(plainHeaderValue);
      const body = mime
        ? Buffer.from(
            mimeMessage({ from: sender, to, subject, text, html, id, date: new Date(now()), random }),
            "utf8",
          ).toString("base64")
        : JSON.stringify({
            message: {
              subject,
              body: { contentType: "HTML", content: html },
              toRecipients: [{ emailAddress: { address: to } }],
              internetMessageHeaders: [
                { name: "x-misxv-message-id", value: id },
              ],
            },
            saveToSentItems: !secret,
          });
      // A timeout after send begins is ambiguous. Caller records "unknown" and never blindly resends.
      let r;
      try {
        r = await fetchImpl(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
          {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              Authorization: `Bearer ${access.access_token}`,
              "Content-Type": mime ? "text/plain" : "application/json",
            },
            body,
          },
        );
      } catch {
        throw error(503, "MAIL_DELIVERY_UNKNOWN");
      }
      if (r.status !== 202)
        throw error(
          503,
          r.status >= 500 ? "MAIL_DELIVERY_UNKNOWN" : "MAIL_REJECTED",
        );
      return { state: "accepted", provider: "m365" };
    },
  };
}
