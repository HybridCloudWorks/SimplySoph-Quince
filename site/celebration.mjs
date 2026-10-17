export const celebration = {
  version: 1,
  name: "Sophia Isabel",
  quote: {
    en: "Turning 15 is such a special moment in my life, and I can’t imagine celebrating it without the people who have helped shape who I am. This day is about my faith, my family, and the friendships that mean so much to me. Whether you’ve been by my side for years or become part of my story more recently, I’d be honored to have you there as I begin this new chapter.",
    es: "Cumplir 15 años es un momento muy especial en mi vida, y no me imagino celebrarlo sin las personas que me han ayudado a ser quien soy. Este día es para celebrar mi fe, mi familia y las amistades que significan tanto para mí. Ya sea que me hayas acompañado durante años o que hayas llegado a mi vida hace poco, sería un honor tenerte a mi lado al comenzar este nuevo capítulo.",
  },
  countdownAt: "2027-01-15T16:00:00-06:00",
  ceremony: {
    name: "Our Lady of Guadalupe Church",
    address: "4100 Blue Mound Rd, Fort Worth, TX 76106",
    image: "/assets/church.png",
    start: "2027-01-15T16:00:00-06:00",
    end: "2027-01-15T17:00:00-06:00",
    notes: {
      en: "Please silence your phone and follow the church’s guidance during the ceremony. Parking and arrival details will be shared here.",
      es: "Silencia tu teléfono y sigue las indicaciones de la iglesia durante la ceremonia. Compartiremos aquí los detalles de llegada y estacionamiento.",
    },
  },
  reception: {
    name: "The AMZ Event Center",
    address: "5103 Azle Ave, Unit 200, Fort Worth, TX 76114",
    image: "/assets/reception.png",
    start: "2027-01-15T19:30:00-06:00",
    end: "2027-01-16T00:30:00-06:00",
    notes: {
      en: "Dinner and the reception take place at the same venue. Entrance, parking and accessibility details will be shared here.",
      es: "La cena y la recepción serán en el mismo lugar. Compartiremos los detalles de entrada, estacionamiento y accesibilidad.",
    },
  },
  dinner: {
    start: "2027-01-15T18:30:00-06:00",
    end: "2027-01-15T19:30:00-06:00",
  },
  albums: [
    {
      id: "childhood",
      en: "Childhood memories",
      es: "Recuerdos de la infancia",
    },
    { id: "family", en: "Family moments", es: "Momentos en familia" },
    { id: "faith", en: "Faith & traditions", es: "Fe y tradiciones" },
    {
      id: "friends",
      en: "Friends & celebrations",
      es: "Amigos y celebraciones",
    },
    {
      id: "portraits",
      en: "Quinceañera portraits",
      es: "Retratos de quinceañera",
    },
    { id: "event", en: "Event day highlights", es: "Momentos del gran día" },
  ],
  registries: [
    {
      id: "target",
      name: "Target",
      description: {
        en: "A few wishes for Sophia’s next chapter.",
        es: "Algunos deseos para el próximo capítulo de Sophia.",
      },
      url: "",
      logo: "/assets/target.svg",
    },
  ],
};
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// The stored topic values the server checks; guests see the labels below.
export const contactTopics = [
  "RSVP Questions",
  "Event Information",
  "Accommodations",
  "Transportation",
  "Photo Submissions",
  "Registry Questions",
  "Other",
];
export const contactTopicsEn = [
  "RSVP questions",
  "Event information",
  "Accommodations",
  "Transportation",
  "Photo submissions",
  "Registry questions",
  "Other",
];
export const contactTopicsEs = [
  "Preguntas sobre RSVP",
  "Información del evento",
  "Hospedaje",
  "Transporte",
  "Envío de fotos",
  "Registro de regalos",
  "Otro",
];
const label = (en, es, lang) => (lang === "es" ? es : en);
export const localTime = (value, lang = "en") =>
  new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/Chicago",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export const localDate = (value, lang = "en") =>
  new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
export function timeRange(item, lang = "en") {
  if (!item.end) return localTime(item.start, lang);
  const next = localDate(item.start, lang) !== localDate(item.end, lang);
  const day = new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
  }).format(new Date(item.end));
  return (
    localTime(item.start, lang) +
    " – " +
    localTime(item.end, lang) +
    (next ? " (" + day + ")" : "")
  );
}
// Link affordances, one meaning each: → goes to another page of this site, ↗
// opens another site in a new tab (and says so to screen readers), and the
// calendar mark downloads an .ics file. The marks themselves are decoration.
export const pageHref = (route, lang = "en") =>
  `${lang === "es" ? "/es" : ""}/${route ? route + "/" : ""}`;
export const arrow = '<span class="arrow" aria-hidden="true">→</span>';
export const newTab = (lang = "en") =>
  `<span class="ext" aria-hidden="true">↗</span><span class="visually-hidden"> ${label("(opens in a new tab)", "(se abre en otra pestaña)", lang)}</span>`;
const calendarMark =
  '<svg class="icon" aria-hidden="true" viewBox="0 0 16 16" width="16" height="16"><path d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 1.5v3M10.5 1.5v3" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
// Directions to an address in Google Maps, Apple Maps and Waze (the venue
// pages and the home page on the day itself).
export function mapLinks(address) {
  const q = encodeURIComponent(address);
  return {
    google: `https://www.google.com/maps/search/?api=1&query=${q}`,
    apple: `https://maps.apple.com/?q=${q}`,
    waze: `https://waze.com/ul?q=${q}&navigate=yes`,
  };
}
export function maps(address, lang = "en") {
  const links = mapLinks(address),
    e = escapeHtml;
  return `<div class="venue-actions"><a class="button burgundy" target="_blank" rel="noopener noreferrer" href="${e(links.google)}">${label("Open in Google Maps", "Abrir en Google Maps", lang)}${newTab(lang)}</a><a class="button outline" target="_blank" rel="noopener noreferrer" href="${e(links.apple)}">${label("Open in Apple Maps", "Abrir en Apple Maps", lang)}${newTab(lang)}</a><a class="button outline" target="_blank" rel="noopener noreferrer" href="${e(links.waze)}">${label("Open in Waze", "Abrir en Waze", lang)}${newTab(lang)}</a><button class="plain-button" type="button" data-copy-address="${e(address)}">${label("Copy address", "Copiar dirección", lang)}</button></div>`;
}
// Spanish pages download Spanish calendars. Both languages share each event's
// UID, so whichever one a guest saved is updated in place.
export function calendarLink(kind, c = celebration, lang = "en", live = false) {
  const item = c[kind],
    e = escapeHtml;
  if (!item.end)
    return `<p class="hint">${label("Calendar download will be available once the end time is confirmed.", "La descarga del calendario estará disponible cuando se confirme la hora de finalización.", lang)}</p>`;
  return `<a class="calendar-link" href="${live ? "/api/calendar/" : "/calendar/"}${lang === "es" ? "es/" : ""}${e(kind)}.ics" download>${calendarMark}${label("Add to calendar", "Agregar al calendario", lang)}</a>`;
}
// A venue page's facts. The photo beside it is built once with the page
// (scripts/build-pages.mjs); live settings re-render only these facts.
export function venueSection(kind, c = celebration, lang = "en", live = false) {
  const v = c[kind],
    e = escapeHtml;
  return `<article class="venue-details"><p class="eyebrow">${e(localDate(v.start, lang))}</p><h2>${e(v.name)}</h2><address>${e(v.address)}</address>${kind === "reception" ? `<dl class="venue-schedule"><dt>${label("Dinner", "Cena", lang)}</dt><dd>${e(localTime(c.dinner.start, lang))} – ${e(localTime(c.dinner.end, lang))}</dd><dt>${label("Reception & dance", "Recepción y baile", lang)}</dt><dd>${e(timeRange(v, lang))}</dd></dl>` : `<p class="lead">${e(localTime(v.start, lang))}${v.end ? " – " + e(localTime(v.end, lang)) : ""}</p>`}${maps(v.address, lang)}<p>${e(v.notes[lang])}</p><div class="calendar-actions">${kind === "reception" ? `<div><strong>${label("Dinner", "Cena", lang)}</strong>${calendarLink("dinner", c, lang, live)}</div>` : ""}<div><strong>${label(kind === "ceremony" ? "Ceremony" : "Reception", kind === "ceremony" ? "Ceremonia" : "Recepción", lang)}</strong>${calendarLink(kind, c, lang, live)}</div></div></article>`;
}
// The day at a glance, from the confirmed schedule: the church, then dinner and
// the dance at the reception venue, each linking to its venue page.
export function scheduleStrip(c = celebration, lang = "en") {
  const e = escapeHtml,
    at = (item) => `<b>${e(localTime(item.start, lang))}</b>`;
  return `<ul class="schedule-strip"><li><a href="${pageHref("ceremony", lang)}"><span class="strip-times">${at(c.ceremony)} ${label("Ceremony", "Ceremonia", lang)}</span><span class="strip-venue">${e(c.ceremony.name)}</span>${arrow}</a></li><li><a href="${pageHref("reception", lang)}"><span class="strip-times">${at(c.dinner)} ${label("Dinner", "Cena", lang)} · ${at(c.reception)} ${label("Reception & dance", "Recepción y baile", lang)}</span><span class="strip-venue">${e(c.reception.name)}</span>${arrow}</a></li></ul>`;
}
// The Schedule page: each part of the day with its time, venue, address, a map
// and its calendar file.
export function scheduleList(c = celebration, lang = "en", live = false) {
  const e = escapeHtml;
  return `<ol class="schedule-list">${[
    ["ceremony", "ceremony", label("Religious ceremony", "Ceremonia religiosa", lang)],
    ["dinner", "reception", label("Dinner", "Cena", lang)],
    ["reception", "reception", label("Reception & dance", "Recepción y baile", lang)],
  ]
    .map(([kind, place, name]) => {
      const venue = c[place];
      return `<li class="schedule-item"><p class="schedule-time">${e(timeRange(c[kind], lang))}</p><div><h2>${name}</h2><p class="schedule-venue"><a href="${pageHref(place, lang)}">${e(venue.name)}${arrow}</a></p><address>${e(venue.address)}</address><p class="schedule-actions"><a href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(venue.address)}" target="_blank" rel="noopener noreferrer">${label("Map", "Mapa", lang)}${newTab(lang)}</a>${calendarLink(kind, c, lang, live)}</p></div></li>`;
    })
    .join("")}</ol>`;
}
// The invitation's words and schedule for people who can't see the artwork.
export function invitationAlt(c = celebration, lang = "en") {
  const t = (v) => localTime(v, lang);
  return label(
    `Sophia’s invitation: “Today begins a new chapter… join me to celebrate it.” Religious ceremony on ${localDate(c.ceremony.start, "en")} at ${t(c.ceremony.start)} at ${c.ceremony.name}; dinner ${t(c.dinner.start)} to ${t(c.dinner.end)}; reception and dance from ${t(c.reception.start)} at ${c.reception.name}, ${c.reception.address}. With love, Sophia.`,
    `Invitación de Sophia: “Hoy comienza un nuevo capítulo… acompáñame a celebrarlo.” Ceremonia religiosa el ${localDate(c.ceremony.start, "es").replace(",", "")} a las ${t(c.ceremony.start)} en ${c.ceremony.name}; cena de ${t(c.dinner.start)} a ${t(c.dinner.end)}; recepción y baile desde las ${t(c.reception.start)} en ${c.reception.name}, ${c.reception.address}. Con cariño, Sophia.`,
    lang,
  );
}
export function registryCards(items, lang = "en") {
  return `<div class="registry-grid">${items.map((r) => `<article class="registry-card">${r.logo ? `<img src="${escapeHtml(r.logo)}" width="72" height="72" alt="${escapeHtml(r.name)}">` : ""}<h2>${escapeHtml(r.name)}</h2><p>${escapeHtml(r.description[lang])}</p>${r.url ? `<a class="button burgundy" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${label("See the registry", "Ver mesa de regalos", lang)}${newTab(lang)}</a>` : `<p class="hint">${label("Registry link coming soon.", "El enlace estará disponible pronto.", lang)}</p>`}</article>`).join("")}</div>`;
}
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
// One event per file, in English or Spanish. A saved event lives in a guest's
// calendar for good, so the description holds only confirmed facts and the
// venue page, where parking and arrival details appear once they're known;
// the venue notes (which can say "will be shared here") stay on the website.
// The UID is the same in both languages and SEQUENCE follows the content
// version, so a changed time replaces the saved event instead of adding one.
export function calendar(kind, c = celebration, lang = "en") {
  if (!["ceremony", "dinner", "reception"].includes(kind))
    throw new Error("Unknown calendar");
  const item = c[kind],
    venue = kind === "dinner" ? c.reception : item;
  if (!item.end || Date.parse(item.end) <= Date.parse(item.start))
    throw new Error("Confirmed end time required");
  const utc = (value) =>
    new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const title = {
    ceremony: label("Religious ceremony", "Ceremonia religiosa", lang),
    dinner: label("Dinner", "Cena", lang),
    reception: label("Reception & dance", "Recepción y baile", lang),
  }[kind];
  const page =
    "https://misxv.simplysoph.com" +
    pageHref(kind === "ceremony" ? "ceremony" : "reception", lang);
  const description = label(
    `${c.name}’s quinceañera. ${venue.name}, ${venue.address}. Times are Central Time. Latest details: ${page}`,
    `Quinceañera de ${c.name}. ${venue.name}, ${venue.address}. Horarios en hora del centro. Detalles actualizados: ${page}`,
    lang,
  );
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
    `DTSTART:${utc(item.start)}`,
    `DTEND:${utc(item.end)}`,
    `SUMMARY:${icsEscape(c.name + " — " + title)}`,
    `LOCATION:${icsEscape(venue.name + ", " + venue.address)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    `URL:${page}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
