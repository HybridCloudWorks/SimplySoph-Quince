import { error } from "./auth.mjs";
// Failover is allowed only before Microsoft submits a message. Never retry an
// ambiguous provider acceptance through a second provider.
export function sendgridMailer({ apiKey, sender, fetchImpl = fetch }) {
  const configured = !!(apiKey && sender);
  return {
    configured,
    async send({ to, subject, html, id }) {
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
            from: { email: sender, name: "SimplySoph Mis XV" },
            subject,
            content: [{ type: "text/html", value: html }],
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
export function graphMailer({
  tenant,
  clientId,
  clientSecret,
  sender,
  fetchImpl = fetch,
}) {
  const configured = !!(tenant && clientId && clientSecret && sender);
  return {
    configured,
    async send({ to, subject, html, id }) {
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
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                subject,
                body: { contentType: "HTML", content: html },
                toRecipients: [{ emailAddress: { address: to } }],
                internetMessageHeaders: [
                  { name: "x-misxv-message-id", value: id },
                ],
              },
              saveToSentItems: true,
            }),
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
