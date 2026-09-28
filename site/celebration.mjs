export const celebration = {
  version: 0,
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
    end: null,
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
    end: null,
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
      en: "Childhood Memories",
      es: "Recuerdos de la infancia",
    },
    { id: "family", en: "Family Moments", es: "Momentos en familia" },
    { id: "faith", en: "Faith & Traditions", es: "Fe y tradiciones" },
    {
      id: "friends",
      en: "Friends & Celebrations",
      es: "Amigos y celebraciones",
    },
    {
      id: "portraits",
      en: "Quinceañera Portraits",
      es: "Retratos de quinceañera",
    },
    { id: "event", en: "Event Day Highlights", es: "Momentos del gran día" },
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
export const contactTopics = [
  "RSVP Questions",
  "Event Information",
  "Accommodations",
  "Transportation",
  "Photo Submissions",
  "Registry Questions",
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
export function maps(address, lang = "en") {
  const q = encodeURIComponent(address),
    e = escapeHtml;
  return `<div class="venue-actions"><a class="button burgundy" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&amp;query=${q}">${label("Open in Google Maps", "Abrir en Google Maps", lang)}</a><a class="button outline" target="_blank" rel="noopener noreferrer" href="https://maps.apple.com/?q=${q}">${label("Open in Apple Maps", "Abrir en Apple Maps", lang)}</a><button class="plain-button" type="button" data-copy-address="${e(address)}">${label("Copy Address", "Copiar dirección", lang)}</button></div>`;
}
export function calendarLink(kind, c = celebration, lang = "en", live = false) {
  const item = c[kind],
    e = escapeHtml;
  if (!item.end)
    return `<p class="hint">${label("Calendar download will be available once the end time is confirmed.", "La descarga del calendario estará disponible cuando se confirme la hora de finalización.", lang)}</p>`;
  return `<a class="calendar-link" href="${live ? "/api/calendar/" : "/calendar/"}${e(kind)}.ics" download>${label("Add to calendar", "Agregar al calendario", lang)} ↗</a>`;
}
export function venueSection(kind, c = celebration, lang = "en", live = false) {
  const v = c[kind],
    e = escapeHtml;
  const image = `<figure class="venue-image"><img src="${e(v.image)}" width="980" height="650" alt="${e(v.name)}" loading="lazy"><figcaption>${e(v.name)}</figcaption></figure>`;
  const details = `<article class="venue-details"><p class="eyebrow">${e(localDate(v.start, lang))}</p><h2>${e(v.name)}</h2><address>${e(v.address)}</address>${kind === "reception" ? `<dl class="venue-schedule"><dt>${label("Dinner", "Cena", lang)}</dt><dd>${e(localTime(c.dinner.start, lang))} – ${e(localTime(c.dinner.end, lang))}</dd><dt>${label("Reception & dance", "Recepción y baile", lang)}</dt><dd>${e(localTime(v.start, lang))}${v.end ? " – " + e(localTime(v.end, lang)) : ""}</dd></dl>` : `<p class="lead">${e(localTime(v.start, lang))}${v.end ? " – " + e(localTime(v.end, lang)) : ""}</p>`}${maps(v.address, lang)}<p>${e(v.notes[lang])}</p><div class="calendar-actions">${kind === "reception" ? `<div><strong>${label("Dinner", "Cena", lang)}</strong>${calendarLink("dinner", c, lang, live)}</div>` : ""}<div><strong>${label(kind === "ceremony" ? "Ceremony" : "Reception", kind === "ceremony" ? "Ceremonia" : "Recepción", lang)}</strong>${calendarLink(kind, c, lang, live)}</div></div></article>`;
  return `<div class="venue-layout">${kind === "ceremony" ? image + details : details + image}</div>`;
}
export function albumCards(c = celebration, lang = "en") {
  return `<div class="album-grid">${c.albums.map((a, i) => `<button type="button" class="album-card album-${i % 3}" data-album="${escapeHtml(a.id)}"><span class="album-art" aria-hidden="true">${["✦", "♡", "✧", "❀", "♕", "✶"][i % 6]}</span><span class="album-title">${escapeHtml(a[lang])}</span><span class="album-overlay">${label("Explore this album", "Explora este álbum", lang)} ↗</span></button>`).join("")}</div>`;
}
export function registryCards(items, lang = "en") {
  return `<div class="registry-grid">${items.map((r) => `<article class="registry-card">${r.logo ? `<img src="${escapeHtml(r.logo)}" width="72" height="72" alt="${escapeHtml(r.name)}">` : ""}<h2>${escapeHtml(r.name)}</h2><p>${escapeHtml(r.description[lang])}</p>${r.url ? `<a class="button burgundy" href="${escapeHtml(r.url)}" target="_blank" rel="noopener noreferrer">${label("Visit Registry", "Visitar registro", lang)} ↗</a>` : `<p class="hint">${label("Registry link coming soon.", "El enlace estará disponible pronto.", lang)}</p>`}</article>`).join("")}</div>`;
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
export function calendar(kind, c = celebration) {
  if (!["ceremony", "dinner", "reception"].includes(kind))
    throw new Error("Unknown calendar");
  const item = c[kind],
    venue = kind === "dinner" ? c.reception : item;
  if (!item.end || Date.parse(item.end) <= Date.parse(item.start))
    throw new Error("Confirmed end time required");
  const utc = (value) =>
    new Date(value).toISOString().replace(/[-:]/g, "").replace(".000", "");
  const title = {
    ceremony: "Religious Ceremony",
    dinner: "Dinner",
    reception: "Reception & Dance",
  }[kind];
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SimplySoph//Mis Quinceanera//EN",
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
    `DESCRIPTION:${icsEscape(venue.notes.en + "\nAll times shown on the website are Central Time.\nhttps://misxv.simplysoph.com/" + (kind === "ceremony" ? "ceremony" : "reception") + "/")}`,
    `URL:https://misxv.simplysoph.com/${kind === "ceremony" ? "ceremony" : "reception"}/`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
