import { error } from "./auth.mjs";
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
      return { state: "accepted" };
    },
  };
}
