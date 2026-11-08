// "Share by text" on Admin → Invitations: a text the family sends from their
// OWN phone, person to person, asking a household to text the keyword and so
// opt in to the SMS program. The website sends nothing and
// changes no status: this only builds the words and the phone's `sms:` link.
// (Admin → Invitations notes that a row's link was opened: its Texted mark.)
// The registered campaign allows program texts only to people who texted the
// keyword first (docs/twilio-setup.md), so an invitation to join must come
// from a personal phone, never from the program number.
import { dayMonth } from "./datetime.mjs";

// A US or Canadian number as E.164, or null when it cannot be read that way:
// "+1 (817) 555-0123", "817-555-0123" and "1 817 555 0123" all give
// "+18175550123". Other countries are not textable by the program anyway.
export function shareNumber(value) {
  const digits = String(value ?? "").replace(/[\s().-]/g, "");
  const m = /^(?:\+?1)?([2-9]\d{2}[2-9]\d{6})$/.exec(digits);
  return m ? "+1" + m[1] : null;
}

// The program number as the guest would type it: "+1 682-786-8002" shown as
// "682-786-8002" (the family's spelling), any other form left as it is.
export const displayNumber = (number) =>
  String(number ?? "")
    .trim()
    .replace(/^\+1[\s-]?/, "");

// The words, by the household's language: the invitation's locale when a link
// exists, else the row's WhatsApp Language, else English.
export function shareLanguage(row) {
  const l = row?.locale || row?.whatsappLanguage || "en";
  return l === "es" ? "es" : "en";
}

export function shareText({ lang = "en", keyword, number, startsAt, name = "Sophia" }) {
  const when = dayMonth(startsAt, lang),
    to = displayNumber(number);
  // Texting the keyword brings the registered welcome text only; the
  // invitation link comes in the SMS batch the family sends afterwards, so
  // the words promise exactly that order.
  return lang === "es"
    ? `¡Estás invitado a los XV de ${name} el ${when}! Manda ${keyword} al ${to} para unirte a los avisos por texto. Tu enlace de invitación te llegará después por texto.`
    : `You're invited to ${name}'s quinceañera on ${when}! Text ${keyword} to ${to} to join her event texts. Your invitation link will follow by text.`;
}

// The body as a URL component with nothing left to chance: encodeURIComponent
// keeps ' ! ( ) * (RFC 3986 "unreserved" in JavaScript's older reading), and
// some messaging apps cut a body at the apostrophe.
const encode = (text) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

// `sms:<E.164>?&body=<text>`: the `?&body=` form opens prefilled on both iOS
// and Android. null when the phone cannot be read as a US/Canada number.
export function shareLink(phone, text) {
  const to = shareNumber(phone);
  return to ? `sms:${to}?&body=${encode(text)}` : null;
}

// Everything the page needs for one household.
export function shareByText(row, { keyword, number, startsAt }) {
  const lang = shareLanguage(row),
    text = shareText({ lang, keyword, number, startsAt });
  return { lang, text, to: shareNumber(row?.phone), link: shareLink(row?.phone, text) };
}
