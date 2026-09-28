import twilio from "twilio";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { error } from "./auth.mjs";

export function smsDestination(value) {
  if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value))
    throw error(422, "SMS_DESTINATION_INVALID");
  const phone = parsePhoneNumberFromString(value);
  if (!phone?.isValid() || !["US", "CA"].includes(phone.country))
    throw error(422, "SMS_COUNTRY_NOT_ALLOWED");
  return phone.number;
}

// Transport only. The application must persist an attempt and recheck consent
// before calling it; production dispatch remains disabled until callbacks and
// sender verification have been acceptance-tested.
export function twilioTransport({
  accountSid,
  serviceSid,
  apiKeySid,
  apiKeySecret,
  statusCallback,
  enabled = false,
  fetchImpl = fetch,
}) {
  const configured =
    /^AC[0-9a-f]{32}$/i.test(accountSid || "") &&
    /^MG[0-9a-f]{32}$/i.test(serviceSid || "") &&
    /^SK[0-9a-f]{32}$/i.test(apiKeySid || "") &&
    !!apiKeySecret &&
    /^https:\/\/[^?#]+$/.test(statusCallback || "");
  return {
    configured,
    enabled: enabled && configured,
    async send({ to, text }) {
      if (!enabled || !configured) throw error(503, "SMS_NOT_ENABLED");
      const destination = smsDestination(to);
      if (typeof text !== "string" || !text.trim() || text.length > 1600)
        throw error(422, "SMS_MESSAGE_INVALID");
      let response;
      try {
        response = await fetchImpl(
          `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
          {
            method: "POST",
            signal: AbortSignal.timeout(15000),
            headers: {
              Authorization: `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: destination,
              Body: text,
              MessagingServiceSid: serviceSid,
              StatusCallback: statusCallback,
            }),
          },
        );
      } catch {
        throw error(503, "SMS_DELIVERY_UNKNOWN");
      }
      if (response.status !== 201)
        throw error(
          503,
          response.status >= 500 ? "SMS_DELIVERY_UNKNOWN" : "SMS_REJECTED",
        );
      let result;
      try {
        result = await response.json();
      } catch {
        throw error(503, "SMS_DELIVERY_UNKNOWN");
      }
      if (
        !/^SM[0-9a-f]{32}$/i.test(result.sid || "") ||
        result.account_sid !== accountSid
      )
        throw error(503, "SMS_DELIVERY_UNKNOWN");
      return { state: "accepted", provider: "twilio", providerId: result.sid };
    },
  };
}

export function validTwilioWebhook({
  authToken,
  signature,
  url,
  params,
  accountSid,
  serviceSid,
}) {
  if (
    !authToken ||
    !signature ||
    !/^https:\/\//.test(url || "") ||
    params?.AccountSid !== accountSid ||
    params?.MessagingServiceSid !== serviceSid
  )
    return false;
  try {
    return twilio.validateRequest(authToken, signature, url, params);
  } catch {
    return false;
  }
}
