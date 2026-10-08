// Single source for the registered A2P campaign text. Every value here must match
// the Twilio campaign fields and Advanced Opt-Out configuration word for word
// (see docs/sms-campaign-registration.md). Changing any text requires a campaign update.
export const smsProgram = {
  name: "Simply Soph Media",
  version: "2026-10-08",
  phone: "+16827868002",
  phoneDisplay: "+1 682-786-8002",
  // SOPHIA is the program opt-in keyword; START/UNSTOP remain carrier re-subscribe keywords.
  keyword: "SOPHIA",
  keywords: ["SOPHIA", "START", "UNSTOP"],
  helpKeywords: ["HELP", "INFO"],
  stopKeywords: ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT"],
  confirmation:
    "Simply Soph Media: You're subscribed to Sophia's event texts (invites, RSVP reminders, updates). Msg frequency varies. Msg & data rates may apply. Reply HELP for help, STOP to cancel.",
  help: "Simply Soph Media: Help for Sophia's event texts: misxv@simplysoph.com or https://misxv.simplysoph.com/sms/. Msg frequency varies. Msg & data rates may apply. Reply STOP to cancel.",
  stop: "Simply Soph Media: You are unsubscribed from Sophia's event texts. No more messages will be sent. Reply SOPHIA or START to re-subscribe.",
};
