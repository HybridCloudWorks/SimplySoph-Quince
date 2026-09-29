import twilio from "twilio";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { error } from "./auth.mjs";
export function whatsappDestination(value) {
  if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value))
    throw error(422, "WHATSAPP_PHONE_INVALID");
  const phone = parsePhoneNumberFromString(value);
  if (!phone?.isValid()) throw error(422, "WHATSAPP_PHONE_INVALID");
  return phone.number;
}
export function whatsappTransport({
  accountSid,
  from,
  apiKeySid,
  apiKeySecret,
  statusCallback,
  enabled = false,
  fetchImpl = fetch,
}) {
  const configured =
    /^AC[0-9a-f]{32}$/i.test(accountSid || "") &&
    /^SK[0-9a-f]{32}$/i.test(apiKeySid || "") &&
    !!apiKeySecret &&
    /^\+[1-9]\d{7,14}$/.test(from || "") &&
    /^https:\/\/[^?#]+$/.test(statusCallback || "");
  const headers = {
    Authorization: `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64")}`,
  };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages`;
  return {
    configured,
    enabled: enabled && configured,
    async inboundTime(params) {
      try {
        if (!configured || !/^SM[0-9a-f]{32}$/i.test(params.MessageSid || ""))
          throw Error();
        const response = await fetchImpl(`${base}/${params.MessageSid}.json`, {
          headers,
          redirect: "error",
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) throw Error();
        const m = await response.json(),
          at = Date.parse(m.date_created);
        if (
          m.sid !== params.MessageSid ||
          m.account_sid !== accountSid ||
          m.direction !== "inbound" ||
          m.from !== params.From ||
          m.to !== `whatsapp:${from}` ||
          m.body !== params.Body ||
          !Number.isFinite(at)
        )
          throw Error();
        return at;
      } catch {
        throw error(503, "WHATSAPP_CONSENT_UNVERIFIED");
      }
    },
    async send({ to, contentSid, variables }) {
      if (!enabled || !configured) throw error(503, "WHATSAPP_NOT_ENABLED");
      whatsappDestination(to);
      if (!/^HX[0-9a-f]{32}$/i.test(contentSid || ""))
        throw error(422, "WHATSAPP_TEMPLATE_INVALID");
      let response;
      try {
        response = await fetchImpl(`${base}.json`, {
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(15000),
          headers: {
            ...headers,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: `whatsapp:${to}`,
            From: `whatsapp:${from}`,
            ContentSid: contentSid,
            ContentVariables: JSON.stringify(variables),
            StatusCallback: statusCallback,
          }),
        });
      } catch {
        throw error(503, "WHATSAPP_DELIVERY_UNKNOWN");
      }
      if (response.status !== 201)
        throw error(
          503,
          response.status >= 500
            ? "WHATSAPP_DELIVERY_UNKNOWN"
            : "WHATSAPP_REJECTED",
        );
      try {
        const result = await response.json();
        if (
          !/^SM[0-9a-f]{32}$/i.test(result.sid || "") ||
          result.account_sid !== accountSid
        )
          throw Error();
        return {
          state: "accepted",
          provider: "twilio",
          providerId: result.sid,
        };
      } catch {
        throw error(503, "WHATSAPP_DELIVERY_UNKNOWN");
      }
    },
  };
}
export function validWhatsappWebhook(
  { authToken, accountSid, from, origin },
  kind,
  params,
  signature,
) {
  if (
    !authToken ||
    !signature ||
    !/^https:\/\//.test(origin || "") ||
    params.AccountSid !== accountSid ||
    (kind === "inbound" ? params.To : params.From) !== `whatsapp:${from}`
  )
    return false;
  try {
    return twilio.validateRequest(
      authToken,
      signature,
      origin + "/api/whatsapp/" + kind,
      params,
    );
  } catch {
    return false;
  }
}
