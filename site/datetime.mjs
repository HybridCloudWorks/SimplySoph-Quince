// The one place dates and times are written, for the pages, the browser
// scripts, the emails, the calendar files and the WhatsApp/SMS replies.
//
// Intl is used only to read the numeric wall-clock parts in Fort Worth time;
// the words come from the tables below. So the output is identical in Node,
// Chromium, WebKit and Firefox (no locale data needed, no narrow no-break
// spaces that some engines insert) and matches the formats the family chose:
//   English  "Friday, January 15, 2027"     "4:00 PM"     "(Jan 16)"
//   Spanish  "viernes 15 de enero de 2027"  "4:00 p. m."  "(16 de enero)"
// Spanish day and month names are lowercase; a date that starts a line or a
// sentence goes through capitalize().
//
// Plain text (emails, calendar files, SMS) uses ordinary spaces. Web pages pass
// { nbsp: true } so a time never splits from its "PM" and "(Jan 16)" never
// wraps across lines.
export const TIME_ZONE = "America/Chicago";
const NAMES = {
  en: {
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    months: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
    short: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  es: {
    weekdays: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    months: [
      "enero",
      "febrero",
      "marzo",
      "abril",
      "mayo",
      "junio",
      "julio",
      "agosto",
      "septiembre",
      "octubre",
      "noviembre",
      "diciembre",
    ],
  },
};
const NBSP = " ";
const reader = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});
// Wall-clock parts of an instant (ISO string, Date or ms) in Fort Worth time.
export function parts(value) {
  const p = Object.fromEntries(
    reader
      .formatToParts(new Date(value))
      .filter((x) => x.type !== "literal")
      .map((x) => [x.type, Number(x.value)]),
  );
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { year: p.year, month: p.month, day: p.day, weekday, hour: p.hour % 24, minute: p.minute };
}
const lang = (l) => (l === "es" ? "es" : "en");
const space = (nbsp) => (nbsp ? NBSP : " ");

// "Friday, January 15, 2027" · "viernes 15 de enero de 2027".
// { weekday: false } and { year: false } leave those parts out.
export function date(value, l = "en", { weekday = true, year = true } = {}) {
  const p = parts(value),
    n = NAMES[lang(l)];
  if (lang(l) === "es")
    return `${weekday ? n.weekdays[p.weekday] + " " : ""}${p.day} de ${n.months[p.month - 1]}${year ? " de " + p.year : ""}`;
  return `${weekday ? n.weekdays[p.weekday] + ", " : ""}${n.months[p.month - 1]} ${p.day}${year ? ", " + p.year : ""}`;
}
// "October 16" · "16 de octubre"
export const dayMonth = (value, l = "en") => date(value, l, { weekday: false, year: false });
// "4:00 PM" · "4:00 p. m."
export function time(value, l = "en", { nbsp = false } = {}) {
  const { hour, minute } = parts(value),
    pm = hour >= 12,
    h = hour % 12 || 12,
    s = space(nbsp);
  const suffix = lang(l) === "es" ? (pm ? `p.${s}m.` : `a.${s}m.`) : pm ? "PM" : "AM";
  return `${h}:${String(minute).padStart(2, "0")}${s}${suffix}`;
}
// "at 4:00 PM" · "a las 4:00 p. m." ("a la 1:00 p. m." for one o'clock)
export function at(value, l = "en", options) {
  if (lang(l) === "en") return "at " + time(value, l, options);
  return (parts(value).hour % 12 === 1 ? "a la " : "a las ") + time(value, l, options);
}
// The day an evening ends on, in parentheses: "(Jan 16)" · "(16 de enero)".
export function nextDayNote(value, l = "en", { nbsp = false } = {}) {
  const p = parts(value),
    s = space(nbsp);
  return lang(l) === "es"
    ? `(${p.day}${s}de${s}${NAMES.es.months[p.month - 1]})`
    : `(${NAMES.en.short[p.month - 1]}${s}${p.day})`;
}
const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day;
// "4:00 PM – 5:00 PM" · "7:30 PM – 12:30 AM (Jan 16)" · "7:30 p. m. – 12:30 a. m. (16 de enero)".
// { prose: true }: "from 6:30 PM to 7:30 PM" · "de 6:30 p. m. a 7:30 p. m.".
export function timeRange(start, end, l = "en", { prose = false, nbsp = false } = {}) {
  if (!end) return time(start, l, { nbsp });
  const es = lang(l) === "es",
    s = space(nbsp),
    day = sameDay(parts(start), parts(end)) ? "" : s + nextDayNote(end, l, { nbsp });
  if (prose)
    return (es ? `de ${time(start, l, { nbsp })} a ${time(end, l, { nbsp })}` : `from ${time(start, l, { nbsp })} to ${time(end, l, { nbsp })}`) + day;
  return `${time(start, l, { nbsp })} – ${time(end, l, { nbsp })}${day}`;
}
// Only for text that starts a line or a sentence.
export const capitalize = (s) => s.charAt(0).toLocaleUpperCase("es") + s.slice(1);
