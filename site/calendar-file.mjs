// The calendar files (.ics): written by the build (/calendar/…) and the API
// (/api/calendar/…), never by a browser, so guest pages don't load this.
// The facts come from site/celebration.mjs (calendarFacts), the same ones the
// Google Calendar links use.
import { celebration, calendarFacts } from "./celebration.mjs";

const icsEscape = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
function fold(line) {
  let rows = [],
    row = "";
  for (const char of line) {
    if (new TextEncoder().encode(row + char).length > 75) {
      rows.push(row);
      row = " ";
    }
    row += char;
  }
  return [...rows, row].join("\r\n");
}
// One event per file, in English or Spanish. The UID is the same in both
// languages and SEQUENCE follows the content version, so a changed time
// replaces the saved event instead of adding one.
export function calendar(kind, c = celebration, lang = "en") {
  const f = calendarFacts(kind, c, lang);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//SimplySoph//Mis Quinceanera//${lang === "es" ? "ES" : "EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:misxv-${kind}@simplysoph.com`,
    "DTSTAMP:20260927T000000Z",
    `SEQUENCE:${c.version || 0}`,
    `DTSTART:${f.start}`,
    `DTEND:${f.end}`,
    `SUMMARY:${icsEscape(f.title)}`,
    `LOCATION:${icsEscape(f.location)}`,
    `DESCRIPTION:${icsEscape(f.description)}`,
    `URL:${f.page}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
