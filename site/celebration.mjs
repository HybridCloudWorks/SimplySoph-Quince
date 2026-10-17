import { terms } from "./lexicon.mjs";
import { date, time, at, timeRange, capitalize } from "./datetime.mjs";
// The Target card names the list as Target's English page does. The live text
// is in the event settings (docs/publishing.md).
export const registryDescription = {
  en: "A few wishes for Sophia’s next chapter. On Target’s site the list is called “Sophia’s Birthday Wish List.”",
  es: "Algunos deseos para el próximo capítulo de Sophia. En Target, la lista aparece como “Sophia’s Birthday Wish List” (página en inglés).",
};
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
    // Venue facts only. Parking, and the promise to post it, come from the
    // family's content (site/promises.mjs), below these notes.
    notes: {
      en: "Please silence your phone and follow the church’s guidance during the ceremony.",
      es: "Silencia tu teléfono y sigue las indicaciones de la iglesia durante la ceremonia.",
    },
  },
  reception: {
    name: "The AMZ Event Center",
    address: "5103 Azle Ave, Unit 200, Fort Worth, TX 76114",
    image: "/assets/reception.png",
    start: "2027-01-15T19:30:00-06:00",
    end: "2027-01-16T00:30:00-06:00",
    notes: {
      en: "Dinner and the reception take place at the same venue.",
      es: "La cena y la recepción serán en el mismo lugar.",
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
      // The same words as server/registry-settings.mjs.
      description: registryDescription,
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
// The stored topic values the server checks (server/application.mjs); they
// never change, so saved messages keep theirs. People read the labels below.
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
  "Sharing photos and videos",
  "Gifts",
  "Other",
];
export const contactTopicsEs = [
  "Preguntas sobre tu respuesta",
  "Información del evento",
  "Hospedaje",
  "Transporte",
  "Compartir fotos y videos",
  "Mesa de regalos",
  "Otro",
];
const label = (en, es, lang) => (lang === "es" ? es : en);
// A term in a page's language (these pages' terms have one Spanish form).
const term = (entry, lang) => label(entry.en, entry.es, lang);
// Times on a page never split from their "PM" (site/datetime.mjs).
const nb = { nbsp: true };
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
// A link's subject for screen readers, after its visible words ("Add to
// calendar: Dinner"), so a page with several calendar or map links gives each
// a name of its own while the name still starts with what is shown.
const subject = (name) => `<span class="visually-hidden">: ${escapeHtml(name)}</span>`;
// The event each calendar file is for, as the confirmation names it.
const calendarNames = {
  ceremony: [terms.ceremony.en, terms.ceremony.es],
  dinner: [terms.dinner.en, terms.dinner.es],
  reception: [terms.receptionDance.en, terms.receptionDance.es],
};
export function maps(address, lang = "en", name = "") {
  const links = mapLinks(address),
    e = escapeHtml,
    about = name ? subject(name) : "";
  return `<div class="venue-actions"><a class="button burgundy" target="_blank" rel="noopener noreferrer" href="${e(links.google)}">${label("Open in Google Maps", "Abrir en Google Maps", lang)}${about}${newTab(lang)}</a><a class="button outline" target="_blank" rel="noopener noreferrer" href="${e(links.apple)}">${label("Open in Apple Maps", "Abrir en Apple Maps", lang)}${about}${newTab(lang)}</a><a class="button outline" target="_blank" rel="noopener noreferrer" href="${e(links.waze)}">${label("Open in Waze", "Abrir en Waze", lang)}${about}${newTab(lang)}</a><button class="plain-button" type="button" data-copy-address="${e(address)}">${label("Copy address", "Copiar dirección", lang)}</button></div>`;
}
// Spanish pages download Spanish calendars. Both languages share each event's
// UID, so whichever one a guest saved is updated in place.
export function calendarLink(kind, c = celebration, lang = "en", live = false) {
  const item = c[kind],
    e = escapeHtml;
  if (!item.end)
    return `<p class="hint">${label("Calendar download will be available once the end time is confirmed.", "La descarga del calendario estará disponible cuando se confirme la hora de finalización.", lang)}</p>`;
  return `<a class="calendar-link" href="${live ? "/api/calendar/" : "/calendar/"}${lang === "es" ? "es/" : ""}${e(kind)}.ics" download>${calendarMark}<span>${label("Add to calendar", "Agregar al calendario", lang)}${subject(label(...calendarNames[kind], lang))}</span></a>`;
}
// The same event in Google Calendar, which many Android phones use instead of
// opening a downloaded file: a prefilled event with the .ics file's facts.
export function googleCalendarUrl(kind, c = celebration, lang = "en") {
  const f = calendarFacts(kind, c, lang),
    q = encodeURIComponent;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${q(f.title)}&dates=${f.start}/${f.end}&location=${q(f.location)}&details=${q(f.description)}`;
}
// Every calendar action: the file, and Google Calendar beside it (a new tab).
export function calendarActions(kind, c = celebration, lang = "en", live = false) {
  if (!c[kind].end) return calendarLink(kind, c, lang, live);
  return `<span class="calendar-choices">${calendarLink(kind, c, lang, live)}<a class="target" href="${escapeHtml(googleCalendarUrl(kind, c, lang))}" target="_blank" rel="noopener noreferrer">Google Calendar${subject(label(...calendarNames[kind], lang))}${newTab(lang)}</a></span>`;
}
// A venue page's facts. The photo beside it is built once with the page
// (scripts/build-pages.mjs); live settings re-render only these facts.
// `parking` is the family's parking text, or the promise to post it
// (site/promises.mjs), which the page carries for the re-render.
// `promise`: the parking line is a promise to post it, which ends with the
// party (site/now.mjs hides [data-promise]).
export function venueSection(kind, c = celebration, lang = "en", live = false, parking = "", promise = false) {
  const v = c[kind],
    e = escapeHtml;
  return `<article class="venue-details"><p class="eyebrow">${e(date(v.start, lang))}</p><h2>${e(v.name)}</h2><address>${e(v.address)}</address>${kind === "reception" ? `<dl class="venue-schedule"><dt>${term(terms.dinner, lang)}</dt><dd>${e(timeRange(c.dinner.start, c.dinner.end, lang, nb))}</dd><dt>${term(terms.receptionDance, lang)}</dt><dd>${e(timeRange(v.start, v.end, lang, nb))}</dd></dl>` : `<p class="lead">${e(timeRange(v.start, v.end, lang, nb))}</p>`}${maps(v.address, lang, term(kind === "ceremony" ? terms.ceremonyLong : terms.dinnerAndReception, lang))}${v.notes[lang] ? `<p>${e(v.notes[lang])}</p>` : ""}${parking ? `<p class="venue-parking"${promise ? " data-promise" : ""}>${e(parking)}</p>` : ""}<div class="calendar-actions">${kind === "reception" ? `<div><strong>${term(terms.dinner, lang)}</strong>${calendarActions("dinner", c, lang, live)}</div>` : ""}<div><strong>${term(kind === "ceremony" ? terms.ceremony : terms.receptionDance, lang)}</strong>${calendarActions(kind, c, lang, live)}</div></div></article>`;
}
// The day at a glance, from the confirmed schedule: the church, then dinner and
// the dance at the reception venue, each linking to its venue page.
export function scheduleStrip(c = celebration, lang = "en") {
  const e = escapeHtml,
    when = (item) => `<b>${e(time(item.start, lang, nb))}</b>`;
  return `<ul class="schedule-strip"><li><a href="${pageHref("ceremony", lang)}"><span class="strip-times">${when(c.ceremony)} ${term(terms.ceremony, lang)}</span><span class="strip-venue">${e(c.ceremony.name)}</span>${arrow}</a></li><li><a href="${pageHref("reception", lang)}"><span class="strip-times">${when(c.dinner)} ${term(terms.dinner, lang)} · ${when(c.reception)} ${term(terms.receptionDance, lang)}</span><span class="strip-venue">${e(c.reception.name)}</span>${arrow}</a></li></ul>`;
}
// The Schedule page: each part of the day with its time, venue, address, its
// maps ("Map: Google · Apple · Waze", as on the venue pages; each link named
// for the part of the day too) and its calendar file.
export function scheduleList(c = celebration, lang = "en", live = false) {
  const e = escapeHtml;
  return `<ol class="schedule-list">${[
    ["ceremony", "ceremony", term(terms.ceremonyLong, lang)],
    ["dinner", "reception", term(terms.dinner, lang)],
    ["reception", "reception", term(terms.receptionDance, lang)],
  ]
    .map(([kind, place, name]) => {
      const venue = c[place],
        links = mapLinks(venue.address);
      return `<li class="schedule-item"><p class="schedule-time">${e(timeRange(c[kind].start, c[kind].end, lang, nb))}</p><div><h2>${name}</h2><p class="schedule-venue"><a href="${pageHref(place, lang)}">${e(venue.name)}${arrow}</a></p><address>${e(venue.address)}</address><p class="schedule-actions"><span>${label("Map:", "Mapa:", lang)} ${[
        ["google", "Google", " Maps"],
        ["apple", "Apple", " Maps"],
        ["waze", "Waze", ""],
      ]
        .map(
          ([key, app, maps]) =>
            `<a href="${e(links[key])}" target="_blank" rel="noopener noreferrer">${app}${maps && `<span class="visually-hidden">${maps}</span>`}${subject(name)}${newTab(lang)}</a>`,
        )
        .join(" · ")}</span>${calendarActions(kind, c, lang, live)}</p></div></li>`;
    })
    .join("")}</ol>`;
}
// The invitation's words and schedule for people who can't see the artwork.
export function invitationAlt(c = celebration, lang = "en") {
  const t = (v) => time(v, lang);
  return label(
    `Sophia’s invitation: “Today begins a new chapter… join me to celebrate it.” Religious ceremony on ${date(c.ceremony.start, "en")}, ${at(c.ceremony.start, "en")} at ${c.ceremony.name}; dinner ${timeRange(c.dinner.start, c.dinner.end, "en", { prose: true })}; reception and dance from ${t(c.reception.start)} at ${c.reception.name}, ${c.reception.address}. With love, Sophia.`,
    `Invitación de Sophia: “Hoy comienza un nuevo capítulo… acompáñame a celebrarlo.” Ceremonia religiosa el ${date(c.ceremony.start, "es")} ${at(c.ceremony.start, "es")} en ${c.ceremony.name}; cena ${timeRange(c.dinner.start, c.dinner.end, "es", { prose: true })}; recepción y baile desde ${at(c.reception.start, "es").replace(/^a /, "")} en ${c.reception.name}, ${c.reception.address}. Con cariño, Sophia.`,
    lang,
  );
}
export function registryCards(items, lang = "en") {
  return `<div class="registry-grid">${items.map((r) => `<article class="registry-card">${r.logo ? `<img src="${escapeHtml(r.logo)}" width="72" height="72" alt="${escapeHtml(r.name)}">` : ""}<h2>${escapeHtml(r.name)}</h2><p>${escapeHtml(r.description[lang])}</p>${r.url ? `<a class="button burgundy" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${label("See the gift registry", "Ver la mesa de regalos", lang)}${newTab(lang)}</a>` : `<p class="hint">${label("Registry link coming soon.", "El enlace estará disponible pronto.", lang)}</p>`}</article>`).join("")}</div>`;
}
// One event's facts, for its calendar file (site/calendar-file.mjs) and its
// Google Calendar link alike. A saved event lives in a calendar for good, so
// the description holds only confirmed facts and the venue page (the notes
// stay on the website). Times are UTC. "Sophia’s quinceañera — Religious
// ceremony" / "XV de Sophia — Ceremonia religiosa"; the description names the
// celebration and its time zone with the site's own words (site/lexicon.mjs).
const eventTitles = {
  ceremony: terms.ceremonyLong,
  dinner: terms.dinner,
  reception: terms.receptionDance,
};
export function calendarFacts(kind, c = celebration, lang = "en") {
  if (!eventTitles[kind]) throw new Error("Unknown calendar");
  const item = c[kind],
    venue = kind === "dinner" ? c.reception : item;
  if (!item.end || Date.parse(item.end) <= Date.parse(item.start))
    throw new Error("Confirmed end time required");
  const utc = (value) =>
    new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const say = (entry) => label(entry.en, entry.es, lang);
  const page =
    "https://misxv.simplysoph.com" +
    pageHref(kind === "ceremony" ? "ceremony" : "reception", lang);
  return {
    start: utc(item.start),
    end: utc(item.end),
    title: `${say(terms.calendarTitle)} — ${say(eventTitles[kind])}`,
    location: venue.name + ", " + venue.address,
    // No "all times are Fort Worth time": the event is stored in UTC, so a
    // calendar elsewhere shows it in its own time zone (L10N-20).
    description: `${capitalize(say(terms.eventProse))}. ${venue.name}, ${venue.address}. ${label("Latest details", "Detalles actualizados", lang)}: ${page}`,
    page,
  };
}
