import { registryDefaults } from "../server/registry-settings.mjs";
import { smsProgram } from "../site/sms-program.mjs";
import { policies } from "../site/policies.mjs";
import {
  celebration,
  timeRange,
  venueSection,
  registryCards,
  calendar,
  pageHref,
  arrow,
  newTab,
  scheduleStrip,
  scheduleList,
  invitationAlt,
} from "../site/celebration.mjs";
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import { buildImages, picture, iconSvg } from "./images.mjs";
import {
  event,
  family as approvedFamily,
  padrinoTraditions,
  routes,
  adminRoutes,
  copy,
  textContent,
  ready,
  sections,
} from "../site/content.mjs";
import { exampleFamily, previewRoutes } from "../site/preview-content.mjs";
import { milestones, phaseAt, previewKey } from "../site/lifecycle.mjs";
import { date as longDate, capitalize } from "../site/datetime.mjs";
import { terms, say as sayTerm, registerFor } from "../site/lexicon.mjs";
// The celebration's phase at the time of the build (--now=<ISO>, default the
// real time). Only what a crawler reads depends on it: link previews and the
// misxv-phase marker a release check can compare. The pages themselves are
// built in their RSVP-open state and follow the phase in the browser
// (site/now.mjs). Tests pin --now so the calendar never changes their output.
const option = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const buildNow = option("now") ? Date.parse(option("now")) : Date.now();
if (!Number.isFinite(buildNow)) throw new Error("--now must be an ISO date and time");
const phase = phaseAt(buildNow, milestones({ deadline: event.deadline, site: celebration }));
// The public build uses the family's approved content; the admin preview swaps
// in the idea-book examples (see the end of this file).
let family = approvedFamily;
// --out=<name> builds into .cache/builds/<name>/ instead of dist/ (tests that
// compare phases build there, so they never touch the dist/ other tests read).
const outName = option("out");
if (outName !== undefined && !/^[a-z0-9-]{1,40}$/.test(outName))
  throw new Error("--out must be a short lowercase name");
const outBase = outName ? `../.cache/builds/${outName}/` : "../";
const root = new URL(outBase + "dist/", import.meta.url),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const href = pageHref;
// Link previews need absolute URLs; the site is private (noindex) but its link
// is shared in WhatsApp and text messages.
const origin = "https://misxv.simplysoph.com";
// The wordmark's gold S, inline (the CSP allows data: images), the same drawing
// as the generated PNG icons.
const favicon = "data:image/svg+xml," + encodeURIComponent(iconSvg());
const routeTitle = (route, lang) =>
  routes.find((r) => r[0] === route)?.[lang === "es" ? 2 : 1] || "";
// Sections that have a page with content, and each section's own pages.
const sectionOf = (route) => sections.find((s) => s.pages.includes(route));
const readyPages = (section) => section.pages.filter((r) => ready(r, family));
const sectionName = (section, lang) =>
  section.name?.[lang === "es" ? 1 : 0] || routeTitle(section.pages[0], lang);
// Filled in by buildImages() before any page is written.
let images;
function contents(route, lang) {
  const es = lang === "es",
    t = copy[lang],
    say = (a, b) => (es ? b : a),
    link = (r, label) =>
      `<a class="button burgundy" href="${href(r, lang)}">${label}</a>`;
  // Where a guest goes next from a page that has nothing more to show yet.
  const nextSteps = `<p class="actions next-steps">${link("rsvp", t.rsvp)}<a href="${href("details", lang)}">${t.all}${arrow}</a></p>`;
  // The home page in its RSVP-open state; site/home.mjs redraws it for the
  // phase (answered, closed, the day itself, the evening, after) and puts the
  // newest announcement under the status line. On wide screens the written
  // schedule sits right under the actions, as on phones, above Sophia's words.
  if (route === "") {
    const by = esc(longDate(event.deadline, lang, { year: false }));
    return `<section class="hero" data-home><div class="hero-copy"><p class="eyebrow">MIS QUINCEAÑERA</p><h1>Sophia</h1><p class="hero-line" data-hero-line>${t.tagline}</p><p class="date" data-event-date>${t.date}</p><div class="actions" data-home-actions>${link("rsvp", t.rsvp)}<a href="${href("details", lang)}">${t.all}${arrow}</a></div><p class="hero-deadline" data-reply-by>${say(`Please RSVP by ${by}`, `Por favor, confirmen a más tardar el ${by}`)}</p><div class="countdown" data-countdown hidden></div><div class="home-status" data-home-status hidden></div><div class="home-latest" data-latest-update hidden></div></div><div class="hero-schedule" data-home-schedule><h2 class="strip-heading">${routeTitle("details", lang)}</h2><div data-schedule-strip>${scheduleStrip(celebration, lang)}</div></div><blockquote class="sophia-quote" data-home-quote><p>“${esc(celebration.quote[lang])}”</p><cite>— ${esc(celebration.name)}</cite></blockquote><p class="home-note" data-home-note><a href="${href("guestbook", lang)}">${esc(sayTerm(terms.leaveNote, lang, registerFor("")))}${arrow}</a></p><figure class="invitation" data-home-invitation>${picture(images.invitation, { alt: esc(invitationAlt(celebration, lang)), sizes: "(max-width: 760px) 290px, 365px", loading: "eager", priority: "high" })}<figcaption><a href="${images.invitation.jpeg.at(-1)[1]}" target="_blank" rel="noopener">${t.invitationCaption}${newTab(lang)}</a></figcaption></figure></section><div class="home-updates" data-announcements></div>`;
  }
  // The page title; pages that belong to a larger section also name it above
  // the title and list its other pages with content underneath.
  const section = sectionOf(route),
    siblings = section && ready(route, family) ? readyPages(section) : [];
  const heading = `<div class="page-heading">${siblings.length && siblings[0] !== route ? `<p class="eyebrow">${esc(sectionName(section, lang))}</p>` : ""}<h1>${esc(routeTitle(route, lang) || "Sophia")}</h1>${
    siblings.length > 1
      ? `<nav class="section-nav" aria-label="${esc(sectionName(section, lang))}"><ul>${siblings.map((r) => `<li><a href="${href(r, lang)}"${r === route ? ' aria-current="page"' : ""}>${esc(routeTitle(r, lang))}</a></li>`).join("")}</ul></nav>`
      : ""
  }</div>`;
  if (route === "registry")
    return `<section class="page section">${heading}<p class="lead">${say("Your presence is the best gift. If you’d like to give Sophia something, here is her gift registry.", "Tu presencia es nuestro mejor regalo. Si quieres darle algo a Sophia, aquí está su mesa de regalos.")}</p><div data-public-registries>${registryCards(registryDefaults, lang)}</div></section>`;
  // Administrators sign in at /admin/login/ directly; guests never need it.
  if (route === "account")
    return `<section class="page section">${heading}<div class="portal" id="portal" data-view="${route}"><p role="status">${t.loading}</p></div></section>`;
  let body = "";
  if (textContent[route]) {
    const c = textContent[route];
    body = `<div class="editorial"><span class="ornament" aria-hidden="true">✦</span><h2>${c[0][es ? 1 : 0]}</h2><p class="lead">${c[1][es ? 1 : 0]}</p><p>${c[2][es ? 1 : 0]}</p>${nextSteps}</div>`;
  }
  const localized = (value) =>
    typeof value === "string" ? value : value?.[lang] || value?.en || "";
  const safeLink = (value) => {
    if (typeof value !== "string") throw new Error("Content URL must be text");
    if (value.startsWith("/assets/") && !value.includes(".."))
      return esc(value);
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Content links must use HTTPS");
    return esc(url.href);
  };
  // Initials stand in for photos so pages can go live before portraits arrive.
  const monogram = (person) =>
    person.photo
      ? `<img class="monogram" loading="lazy" src="${safeLink(person.photo)}" alt="">`
      : `<span class="monogram" aria-hidden="true">${esc(person.name.trim()[0] || "")}</span>`;
  const courtRole = {
    escort: say("Chambelán de honor", "Chambelán de honor"),
    dama: "Dama",
    chambelan: "Chambelán",
  };
  // Names are the court page's only headings, so they follow its h1 directly.
  const person = (p) =>
    `<div class="person">${monogram(p)}<div><p class="person-role">${esc(courtRole[p.role] || localized(p.role))}</p><h2>${esc(p.name)}</h2>${p.line ? `<p>${esc(localized(p.line))}</p>` : ""}</div></div>`;
  if (
    route === "sophia" &&
    (family.bio || family.parentsMessage || family.moments.length)
  )
    body = `<article class="sophia-page">${
      family.bio
        ? `<div class="bio-split${family.portrait ? "" : " no-portrait"}">${family.portrait ? `<img class="bio-portrait" src="${safeLink(family.portrait)}" alt="Sophia">` : ""}<p class="lead">${esc(localized(family.bio))}</p></div>`
        : ""
    }${
      family.moments.length
        ? `<ol class="moments" aria-label="${say("Fifteen years in moments", "Quince años en momentos")}">${family.moments.map((m) => `<li><span>${say("Age", "Edad")}</span><b>${esc(m.age)}</b><p>${esc(localized(m.text))}</p></li>`).join("")}</ol>`
        : ""
    }${
      family.parentsMessage
        ? `<div class="letter"><p class="eyebrow">${say("A letter from her parents", "Una carta de sus papás")}</p><p class="letter-text">${esc(localized(family.parentsMessage))}</p>${family.parentsSignature ? `<p class="signature">${esc(localized(family.parentsSignature))}</p>` : ""}</div>`
        : ""
    }</article>`;
  if (route === "court" && family.court.length) {
    const escorts = family.court.filter((p) => p.role === "escort"),
      paired = new Map();
    for (const p of family.court.filter((p) => p.role !== "escort" && p.pair))
      paired.set(p.pair, [...(paired.get(p.pair) || []), p]);
    const single = family.court.filter((p) => p.role !== "escort" && !p.pair);
    body = `${escorts.map((p) => `<div class="court-escort">${person(p)}</div>`).join("")}<div class="court-pairs">${[
      ...paired.values(),
    ]
      .map(
        (pair) =>
          `<div class="pair">${pair
            .sort((a, b) => (a.role === "dama" ? -1 : b.role === "dama" ? 1 : 0))
            .map(person)
            .join(`<span class="amp" aria-hidden="true">&amp;</span>`)}</div>`,
      )
      .join("")}${single.map((p) => `<div class="pair">${person(p)}</div>`).join("")}</div>`;
  }
  // Public thank-you cards: who gave each tradition and what it means. Gratitude
  // only, so the admin planning list's amounts and status never appear here.
  if (route === "padrinos" && family.padrinos.length)
    body = `<p class="lead">${say("With deep gratitude to the padrinos and madrinas whose generosity made Sophia’s celebration possible.", "Con profunda gratitud a los padrinos y madrinas cuya generosidad hizo posible la celebración de Sophia.")}</p><div class="padrino-cards">${family.padrinos
      .map((p) => {
        const t = padrinoTraditions[p.gift];
        if (!t) throw new Error("Unknown padrino tradition: " + p.gift);
        return `<article class="padrino-card"><h2 class="padrino-name" lang="es">${esc(t.es)}</h2>${es ? "" : `<p class="padrino-en">${esc(t.en)}</p>`}<p>${esc(localized(t.meaning))}</p><p class="padrino-thanks">${say("With gratitude to", "Con gratitud a")} <strong>${esc(p.names)}</strong></p></article>`;
      })
      .join("")}</div>`;
  // The day at a glance: church, then dinner, from the confirmed schedule.
  if (route === "travel") {
    const drive = family.driveMinutes
      ? `<p class="route-drive">${say(`about ${esc(family.driveMinutes)} min`, `unos ${esc(family.driveMinutes)} min`)}</p>`
      : "";
    const stay = family.hotels.map(
      (item) =>
        `<article class="card">${item.where ? `<p class="person-role">${esc(localized(item.where))}</p>` : ""}<h2>${esc(item.name)}</h2><p>${esc(localized(item.notes))}</p><a class="button burgundy" href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">${say("Hotel information", "Información del hotel")}${newTab(lang)}</a></article>`,
    );
    if (family.airport)
      stay.push(
        `<article class="card airport-card"><p class="person-role">${say("Flying in", "Si llegas en avión")}</p><h2>${esc(family.airport.name)}</h2><p>${esc(localized(family.airport.notes))}</p></article>`,
      );
    body =
      `<div class="route-strip${drive ? " has-drive" : ""}"><div><b>${timeRange({ start: celebration.ceremony.start }, lang)} · ${say("Ceremony", "Ceremonia")}</b><span><a href="${href("ceremony", lang)}">${esc(celebration.ceremony.name)}${arrow}</a><br>${esc(celebration.ceremony.address)}</span></div>${drive}<div><b>${timeRange({ start: celebration.dinner.start }, lang)} · ${say("Dinner", "Cena")}</b><span><a href="${href("reception", lang)}">${esc(celebration.reception.name)}${arrow}</a><br>${esc(celebration.reception.address)}</span></div></div>` +
      (stay.length ? `<div class="cards">${stay.join("")}</div>` : body);
  }
  if (route === "thank-you" && (family.thanksNote || family.highlightVideo))
    body = `<div class="thanks-note"><p class="thanks-script">Gracias</p>${family.thanksNote ? `<p>${esc(localized(family.thanksNote))}</p>` : ""}<p class="actions">${family.highlightVideo ? `<a class="button burgundy" href="${safeLink(family.highlightVideo)}" target="_blank" rel="noopener noreferrer">${say("Watch the highlights", "Ver los mejores momentos")}${newTab(lang)}</a>` : ""}<a href="${href("share", lang)}">${say("Share your photos", "Comparte tus fotos")}${arrow}</a></p></div>`;
  // Each part of the day carries its own time, place, map and calendar file;
  // practical notes follow in a small box, with a neutral line until the
  // family decides the dress code.
  if (route === "details") {
    const notes = [
      [say("Dress code", "Código de vestimenta"), family.dressCode ? esc(localized(family.dressCode)) : say("We’ll share the dress code here soon.", "Pronto compartiremos aquí el código de vestimenta.")],
      family.parking && [say("Parking", "Estacionamiento"), esc(localized(family.parking))],
      family.children && [say("Children", "Niños"), esc(localized(family.children))],
    ].filter(Boolean);
    body = `<p class="lead" data-event-date>${t.date}</p><p class="hint">${t.time}</p><div data-schedule>${scheduleList(celebration, lang)}</div><aside class="good-to-know" aria-labelledby="good-to-know"><h2 id="good-to-know">${say("Good to know", "Lo que debes saber")}</h2><dl>${notes.map(([term, text]) => `<dt>${term}</dt><dd>${text}</dd>`).join("")}</dl><p><a href="${href("faq", lang)}">${say("More answers in Questions", "Más respuestas en Preguntas")}${arrow}</a></p></aside>`;
  }
  // The photo is built here once; live settings re-render only the facts.
  if (route === "ceremony" || route === "reception") {
    const v = celebration[route];
    body = `<div class="venue-layout venue-${route}"><div data-venue="${route}">${venueSection(route, celebration, lang)}</div><figure class="venue-image">${picture(images[route === "ceremony" ? "church" : "reception"], { alt: esc((route === "ceremony" ? say("Front of ", "Fachada de ") : say("Entrance of ", "Entrada de ")) + v.name), sizes: "(max-width: 760px) calc(100vw - 32px), 600px" })}<figcaption>${esc(v.name)}</figcaption></figure></div>`;
  }
  // The deadline is shown inside the RSVP itself (site/guest.js).
  if (route === "rsvp" || route === "rsvp/confirmed")
    body = `<div class="portal" id="portal" data-view="${route}"><p role="status">${t.loading}</p></div>`;
  if (route === "gallery")
    body =
      // Guests' photos and videos are private (signed-in guests only), so the
      // page starts with one panel that site/guest.js fills: sign in, nothing
      // yet, or the albums and sections that actually have something in them
      // (data-gallery-albums: a card per album with media, when there is more
      // than one to choose between).
      '<div class="gallery-state" data-gallery-state><p role="status">' +
      say("Opening the gallery…", "Abriendo la galería…") +
      '</p></div><div data-gallery-albums hidden></div><section class="gallery-section" data-photos-section hidden><h2>' +
      say("Photographs", "Fotografías") +
      '</h2><p data-album-label></p><div data-gallery class="media-grid"></div></section><section class="gallery-section" data-videos-section hidden><h2>' +
      say("The video collection", "La colección de videos") +
      '</h2><div data-videos class="media-grid"></div></section><p data-gallery-share hidden>' +
      link("share", say("Share your photos", "Comparte tus fotos")) +
      "</p>";
  // The printed table QR opens this page in English (/share/#media-upload),
  // so before sign-in it explains itself in both languages on one screen.
  // #media-upload sits above that explanation, so the QR lands on it.
  if (route === "share") {
    const other = es ? "en" : "es";
    body = `<div class="share-intro"><p class="lead">${say("Share the photos and videos you took.", "Comparte las fotos y los videos que tomaste.")}</p><p>${say("Send us your favorite photos and videos straight from your phone. We review each one before it appears in the gallery for our guests.", "Envíanos tus fotos y videos favoritos directamente desde tu teléfono. Revisamos cada uno antes de que aparezca en la galería para nuestros invitados.")}</p></div><div id="media-upload" tabindex="-1"></div><section class="share-steps" data-share-steps aria-labelledby="share-steps-title"><h2 id="share-steps-title">${say("How to share", "Cómo compartir")}</h2><ol><li>${say("Sign in below with the email where you received your invitation. We email you a link; no password needed.", "Entra abajo con el correo donde recibiste tu invitación. Te enviamos un enlace; no necesitas contraseña.")}</li><li>${say("Choose photos and videos of up to 60 seconds, straight from your phone.", "Elige fotos y videos de hasta 60 segundos, directamente de tu teléfono.")}</li><li>${say("We review them, and then they appear in the gallery for our guests.", "Los revisamos y luego aparecen en la galería para nuestros invitados.")}</li></ol><p lang="${other}">${
      es
        ? `<strong>In English:</strong> sign in with the email where you received your invitation, then choose your photos and videos. <a href="${href("share", "en")}" hreflang="en">Open this page in English</a>`
        : `<strong>En español:</strong> entra con el correo donde recibiste tu invitación y luego elige tus fotos y videos. <a href="${href("share", "es")}" hreflang="es">Ver esta página en español</a>`
    }</p></section><div class="portal share-portal" id="portal" data-view="share"></div><div class="media-reminder" role="note"><p><strong>${say("A little reminder", "Un pequeño recordatorio")}</strong></p><p>${say("Only share photos and videos you have permission to share, including a parent’s or guardian’s permission for children. Once we approve them, they are visible to our signed-in guests.", "Comparte solo fotos y videos que tengas permiso de compartir, incluido el permiso de un padre, madre o tutor para los menores. Cuando los aprobamos, los pueden ver nuestros invitados que inician sesión.")} <a href="${href("terms", lang)}">${say("Photo & video policy", "Uso de fotos y videos")}</a></p></div>`;
  }
  if (route === "guestbook" || route === "contact")
    body = `<p class="lead">${route === "guestbook" ? say("Leave Sophia a wish for the years ahead.", "Deja a Sophia un deseo para los años que vienen.") : say("Questions about your invitation, your RSVP or the day? Write to us and we’ll get back to you.", "¿Tienes preguntas sobre tu invitación, tu respuesta o el día de la fiesta? Escríbenos y te contestamos.")}</p>${route === "contact" ? `<p><a href="mailto:${event.sender}">${event.sender}</a></p>` : ""}<div class="portal" id="portal" data-view="${route}"></div>${route === "guestbook" ? '<div data-guestbook class="cards"></div>' : ""}`;
  if (route === "faq")
    body =
      [
        [
          say("When do I need to RSVP?", "¿Hasta cuándo puedo confirmar?"),
          say(
            `By ${t.deadline}. Use the invitation link we sent your family.`,
            `A más tardar el ${t.deadline}. Usa el enlace de invitación que le enviamos a tu familia.`,
          ),
        ],
        [
          say(
            "Can I bring a guest or children?",
            "¿Puedo llevar acompañantes o niños?",
          ),
          say(
            "Your invitation shows the seats we saved for your family: adults and teens, and children. If something doesn’t look right, please let us know.",
            "Tu invitación muestra los lugares que apartamos para tu familia: adultos y jóvenes, y niños. Si algo no está bien, avísanos.",
          ),
        ],
        family.children && [
          say("Are children welcome?", "¿Los niños son bienvenidos?"),
          esc(localized(family.children)),
        ],
        family.parking && [
          say("Where do I park?", "¿Dónde me estaciono?"),
          esc(localized(family.parking)),
        ],
        [
          say(
            "What happens between the ceremony and dinner?",
            "¿Qué pasa entre la ceremonia y la cena?",
          ),
          esc(
            say(
              `The ceremony ends around ${timeRange({ start: celebration.ceremony.end }, lang)} and dinner starts at ${timeRange({ start: celebration.dinner.start }, lang)} at ${celebration.reception.name}.`,
              `La ceremonia termina alrededor de las ${timeRange({ start: celebration.ceremony.end }, lang)} y la cena empieza a las ${timeRange({ start: celebration.dinner.start }, lang)} en ${celebration.reception.name}.`,
            ),
          ),
        ],
        [
          say(
            "Can I take photos during the ceremony?",
            "¿Puedo tomar fotos durante la ceremonia?",
          ),
          say(
            `Please keep phones put away during the ceremony. You can share your reception photos on <a href="${href("share", lang)}">Share your photos</a>.`,
            `Por favor, guarda tu teléfono durante la ceremonia. Puedes compartir tus fotos de la recepción en <a href="${href("share", lang)}">Comparte tus fotos</a>.`,
          ),
        ],
        [
          say("Can I change my response?", "¿Puedo cambiar mi respuesta?"),
          say(
            "Yes, until the RSVP deadline. Open your invitation link again, or sign in with your email, and change your answer. We go by the last answer you save.",
            "Sí, hasta la fecha límite. Abre otra vez tu enlace de invitación, o entra con tu correo, y cambia tu respuesta. Tomamos en cuenta la última respuesta que guardes.",
          ),
        ],
        [
          say("What should I wear?", "¿Cómo debo vestirme?"),
          esc(localized(family.dressCode)) || t.pending,
        ],
        [
          say("Do I need to bring a gift?", "¿Tengo que llevar regalo?"),
          say(
            `Your presence is the best gift. If you’d like to give Sophia something, see <a href="${href("registry", lang)}">Gifts</a>.`,
            `Tu presencia es nuestro mejor regalo. Si quieres darle algo a Sophia, consulta la <a href="${href("registry", lang)}">Mesa de regalos</a>.`,
          ),
        ],
        [
          say("Can I share photos?", "¿Puedo compartir fotos?"),
          say(
            `Yes. Sign in and use <a href="${href("share", lang)}">Share your photos</a>. We look at every photo and video first, and only guests who sign in can see the ones we approve. See our <a href="${href("terms", lang)}">Photo &amp; video policy</a>.`,
            `Sí. Entra al sitio y usa <a href="${href("share", lang)}">Comparte tus fotos</a>. Revisamos cada foto y video primero, y solo los invitados que entran al sitio pueden ver los que aprobamos. Consulta <a href="${href("terms", lang)}">Uso de fotos y videos</a>.`,
          ),
        ],
      ]
        .filter(Boolean)
        .reduce(
          (list, [q, a]) =>
            list + `<details><summary>${q}</summary><p>${a}</p></details>`,
          '<div class="faq-list">',
        ) + `</div><p>${link("contact", t.contact)}</p>`;
  if (route === "privacy")
    body = `<article class="editorial"><h2>${say("What we collect and why", "Qué guardamos y para qué")}</h2><p>${say("Our guest list has each family’s names, contact details and the seats we saved for them. When you RSVP, we save who is coming to each part of the day, plus any contact corrections or requests you add. When you sign in, we also keep the photos and videos you upload, your notes for Sophia and the messages you send us. We use all of this only to plan the celebration and to keep in touch with you about it.", "Nuestra lista de invitados tiene los nombres y datos de contacto de cada familia y los lugares que apartamos para ella. Cuando confirmas tu asistencia, guardamos quién viene a cada parte del día y las correcciones de contacto o solicitudes que agregues. Cuando entras al sitio, también guardamos las fotos y los videos que subas, tus mensajes para Sophia y lo que nos escribas. Usamos todo esto solo para organizar la celebración y para estar en contacto contigo sobre ella.")}</p><p>${say("Services that help us run the site: Firebase Hosting (Google) serves these pages. Google Cloud privately stores RSVPs, sign-in records, messages, photos and videos. Our guest list is kept in Notion. Our email comes from misxv@simplysoph.com through Microsoft 365; if Microsoft 365 is unavailable, our backup service, SendGrid, sends it instead. Twilio sends our text messages, and Twilio and Meta deliver our WhatsApp messages. Google Fonts provides the lettering and receives normal network information, like your IP address, when a page loads. If you choose to sign in with Google or Microsoft, they confirm your email address to us. We share information with these services only so they can do their part.", "Servicios que nos ayudan con el sitio: Firebase Hosting (de Google) publica estas páginas. Google Cloud guarda en privado las respuestas, los registros de acceso, los mensajes, las fotos y los videos. Nuestra lista de invitados está en Notion. Nuestros correos salen de misxv@simplysoph.com a través de Microsoft 365; si Microsoft 365 no está disponible, los envía nuestro servicio de respaldo, SendGrid. Twilio envía nuestros mensajes de texto, y Twilio y Meta entregan nuestros mensajes de WhatsApp. Google Fonts proporciona los tipos de letra y recibe información normal de conexión, como tu dirección IP, al cargar una página. Si decides entrar con Google o Microsoft, ellos nos confirman tu correo. Solo compartimos información con estos servicios para que hagan su parte.")}</p><p>${say("Like most websites, our servers keep short-term technical logs, such as IP address and browser type, to keep the site working and safe.", "Como la mayoría de los sitios web, nuestros servidores guardan por poco tiempo registros técnicos, como la dirección IP y el tipo de navegador, para que el sitio funcione bien y de forma segura.")}</p><h3>${say("Your choices", "Tus opciones")}</h3><p>${say("Mailing addresses, requests, messages, photos, videos and phone numbers are all optional. Please keep your invitation link within your family: anyone who has it can open and change your RSVP. To see, correct or delete your information, email us:", "Las direcciones postales, solicitudes, mensajes, fotos, videos y teléfonos son opcionales. Por favor, comparte tu enlace de invitación solo con tu familia: cualquier persona que lo tenga puede abrir y cambiar tu respuesta. Para ver, corregir o borrar tu información, escríbenos:")}</p><a href="mailto:${event.sender}">${event.sender}</a></article>`;
  if (route === "terms") body = "";
  if (route === "whatsapp")
    body += `<article class="editorial"><h2>${say("Stay in touch on WhatsApp", "Mantente en contacto por WhatsApp")}</h2><p>${say(`WhatsApp updates are for family and friends outside the US. If you have a US or Canadian mobile number, you can get text messages instead: see <a href="${href("sms", lang)}">SMS Updates</a>. ${esc(policies.host.en)} On WhatsApp we send your invitation link, RSVP reminders and news about the celebration. How often depends on the news. Internet and data charges may apply. WhatsApp is optional: email still works, and you don’t need WhatsApp to RSVP or to attend.`, `Las actualizaciones por WhatsApp son para familiares y amigos fuera de Estados Unidos. Si tienes un celular de Estados Unidos o Canadá, puedes recibir mensajes de texto: consulta <a href="${href("sms", lang)}">Mensajes SMS</a>. ${esc(policies.host.es)} Por WhatsApp te enviamos tu enlace de invitación, recordatorios para confirmar y novedades de la celebración. La frecuencia depende de las novedades. Pueden aplicarse cargos de internet y datos. WhatsApp es opcional: el correo sigue funcionando y no necesitas WhatsApp para confirmar ni para asistir.`)}</p><h3>${say("How to sign up", "Cómo suscribirte")}</h3><p>${say("Sign in with the email we have for your family. On your account page, enter your WhatsApp number with its country code, choose English or Spanish, and agree to WhatsApp messages. Then follow the WhatsApp link and send START from that same number to confirm it. Your updates start once your number is confirmed. If you haven’t received your invitation yet, please contact us first.", "Entra al sitio con el correo que tenemos de tu familia. En tu cuenta, escribe tu número de WhatsApp con el código de país, elige inglés o español y acepta los mensajes de WhatsApp. Luego sigue el enlace a WhatsApp y envía START desde ese mismo número para confirmarlo. Las actualizaciones empiezan cuando tu número quede confirmado. Si todavía no recibes tu invitación, escríbenos primero.")}</p><p><a class="button burgundy" href="${href("account", lang)}">${say("Sign in", "Entrar")}</a></p><h3>${say("Need help or want to stop?", "¿Necesitas ayuda o quieres cancelar?")}</h3><p>${say("Reply STOP or BAJA to stop WhatsApp messages, or unsubscribe on your account page. Reply HELP or AYUDA for help, or email misxv@simplysoph.com. Sending START doesn’t RSVP for you; please answer on the website with your invitation link.", "Responde STOP o BAJA para dejar de recibir mensajes de WhatsApp, o cancela tu suscripción en tu cuenta. Responde HELP o AYUDA para recibir ayuda, o escribe a misxv@simplysoph.com. Enviar START no confirma tu asistencia; responde en el sitio con tu enlace de invitación.")}</p><p>${say(`WhatsApp is separate from text messages (SMS). We keep a private record of your number, language, consent and any opt-out with our guest list, and Twilio and Meta process the messages to deliver them. We never sell this information or share it for marketing. ${esc(policies.retention.en)}`, `WhatsApp es independiente de los mensajes de texto (SMS). Guardamos en privado tu número, idioma, consentimiento y cancelación junto con nuestra lista de invitados, y Twilio y Meta procesan los mensajes para entregarlos. Nunca vendemos esta información ni la compartimos para publicidad. ${esc(policies.retention.es)}`)}</p><a href="${href("privacy", lang)}">${say("Privacy policy", "Política de privacidad")}</a></article>`;
  if (route === "privacy")
    body += `<article class="editorial"><h2>${say("Optional WhatsApp messages", "Mensajes de WhatsApp opcionales")}</h2><p>${say("WhatsApp updates are optional and separate from text messages and email. If you sign up, we keep your WhatsApp number, your language, when and how you agreed, any opt-out, and whether each message was delivered. These details stay in our private records and on our guest list, and we share them with our messaging services only to send you messages about the celebration. Reply STOP or BAJA to stop; we keep a short note of your opt-out so we don’t message you again by mistake.", "Las actualizaciones por WhatsApp son opcionales e independientes de los mensajes de texto y del correo. Si te suscribes, guardamos tu número de WhatsApp, tu idioma, cuándo y cómo aceptaste, si cancelaste y si cada mensaje se entregó. Estos datos se quedan en nuestros registros privados y en nuestra lista de invitados, y solo los compartimos con nuestros servicios de mensajería para enviarte mensajes sobre la celebración. Responde STOP o BAJA para cancelar; guardamos una nota breve de tu cancelación para no volver a escribirte por error.")}</p><a href="${href("whatsapp", lang)}">${say("How WhatsApp updates work", "Cómo funcionan los mensajes de WhatsApp")}</a></article>`;
  // Twilio campaign reviewers verify this public call to action against the
  // registered message_flow; keep both in sync with site/sms-program.mjs.
  const smsCta = say(
    `Text <strong>${smsProgram.keyword}</strong> to <a class="nowrap" href="sms:${smsProgram.phone}?body=${smsProgram.keyword}">${smsProgram.phoneDisplay}</a> to receive ${smsProgram.name} event texts: invitation links, RSVP reminders and schedule/venue updates. Msg frequency varies. Msg &amp; data rates may apply. Reply HELP for help, STOP to cancel. Consent is not required to RSVP or attend.`,
    `Envía <strong>${smsProgram.keyword}</strong> al <a class="nowrap" href="sms:${smsProgram.phone}?body=${smsProgram.keyword}">${smsProgram.phoneDisplay}</a> para recibir mensajes de ${smsProgram.name} sobre el evento: enlaces de invitación, recordatorios de confirmación y cambios de horario o lugar. La frecuencia varía. Pueden aplicarse tarifas de mensajes y datos. Responde HELP para ayuda o STOP para cancelar. El consentimiento no es necesario para confirmar ni asistir.`,
  );
  const smsReplies = `<dl class="sms-replies"><dt>${say("After you subscribe, you receive", "Al suscribirte recibirás")}</dt><dd><q>${esc(smsProgram.confirmation)}</q></dd><dt>${say("Reply HELP or INFO", "Responde HELP o INFO")}</dt><dd><q>${esc(smsProgram.help)}</q></dd><dt>${say("Reply STOP (or STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT)", "Responde STOP (o STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT)")}</dt><dd><q>${esc(smsProgram.stop)}</q></dd></dl>`;
  const smsLinks = `<p><a href="${href("sms-terms", lang)}">${say("SMS Terms", "Términos SMS")}</a> · <a href="${href("privacy", lang)}">${say("Privacy Policy", "Política de Privacidad")}</a></p>`;
  if (route === "sms")
    body = `<article class="editorial sms-page"><h2>${smsProgram.name} — ${say("Sophia’s Event Texts", "Mensajes del Evento de Sophia")}</h2>
    <p>${say("Optional text messages about Sophia’s January 15, 2027 quinceañera, operated by Simply Soph Media.", "Mensajes opcionales sobre la quinceañera de Sophia del 15 de enero de 2027, operados por Simply Soph Media.")}</p>
    <h3>${say("How To Subscribe", "Cómo Suscribirte")}</h3><p class="sms-cta">${smsCta}</p>
    <p>${say("Texting the keyword from your own phone is the only way to join, and joining is optional. No number is ever added from a list or a form. START or UNSTOP also re-subscribes you. US and Canadian mobile numbers only.", "Enviar la palabra clave desde tu propio teléfono es la única forma de unirte, y es opcional. Nunca agregamos números desde una lista o un formulario. START o UNSTOP también reactivan la suscripción. Solo números móviles de EE. UU. y Canadá.")}</p>
    ${smsReplies}${smsLinks}</article>`;
  if (route === "sms-terms")
    body = `<article class="editorial sms-page"><h2>${smsProgram.name} — ${say("SMS Terms", "Términos SMS")}</h2>
    <ol>
    <li>${say(`<strong>Program.</strong> ${smsProgram.name} event texts about Sophia’s quinceañera (January 15, 2027): invitation links, RSVP reminders and schedule or venue updates. No unrelated promotions.`, `<strong>Programa.</strong> Mensajes de ${smsProgram.name} sobre la quinceañera de Sophia (15 de enero de 2027): enlaces de invitación, recordatorios y cambios de horario o lugar. Sin promociones ajenas.`)}</li>
    <li>${say(`<strong>Opt-in.</strong> Text ${smsProgram.keyword} to <span class="nowrap">${smsProgram.phoneDisplay}</span>. By texting the keyword you agree to receive recurring automated texts from ${smsProgram.name} at that number. Consent is not a condition of purchase, RSVP or attendance.`, `<strong>Suscripción.</strong> Envía ${smsProgram.keyword} al <span class="nowrap">${smsProgram.phoneDisplay}</span>. Al enviar la palabra clave aceptas recibir mensajes automatizados recurrentes de ${smsProgram.name} en ese número. El consentimiento no es condición de compra, confirmación ni asistencia.`)}</li>
    <li>${say("<strong>Frequency and cost.</strong> Message frequency varies, typically a few messages per month before the event. Message and data rates may apply.", "<strong>Frecuencia y costo.</strong> La frecuencia varía, normalmente pocos mensajes al mes antes del evento. Pueden aplicarse tarifas de mensajes y datos.")}</li>
    <li>${say("<strong>Cancel.</strong> Reply <strong>STOP</strong> at any time. You will receive one confirmation and no further program messages unless you text the keyword again.", "<strong>Cancelar.</strong> Responde <strong>STOP</strong> en cualquier momento. Recibirás una confirmación y ningún otro mensaje del programa, salvo que vuelvas a enviar la palabra clave.")}</li>
    <li>${say(`<strong>Help.</strong> Reply <strong>HELP</strong> or email <a href="mailto:misxv@simplysoph.com">misxv@simplysoph.com</a>.`, `<strong>Ayuda.</strong> Responde <strong>HELP</strong> o escribe a <a href="mailto:misxv@simplysoph.com">misxv@simplysoph.com</a>.`)}</li>
    <li>${say("<strong>Coverage.</strong> US and Canadian mobile numbers. Carriers are not liable for any delayed or undelivered messages. Use a number you control and tell us if it changes.", "<strong>Cobertura.</strong> Números móviles de EE. UU. y Canadá. Los operadores no son responsables de ningún mensaje demorado o no entregado. Usa un número que controles y avísanos si cambia.")}</li>
    <li>${say("<strong>Privacy.</strong> We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties.", "<strong>Privacidad.</strong> No vendemos ni compartimos tus datos de suscripción SMS ni tu información personal con terceros para fines de mercadeo. No compartiremos información móvil con terceros ni afiliados para fines de mercadeo o promoción. Los datos de suscripción y consentimiento de mensajes no se compartirán con ningún tercero.")}</li>
    </ol>${smsReplies}${smsLinks}</article>`;
  if (route === "privacy")
    body += `<article class="editorial"><h2>${say("Optional SMS messages", "Mensajes SMS opcionales")}</h2><p>${say("Simply Soph Media text messages are optional. If you text our keyword to join, we keep your mobile number, the keywords you send, when you agreed, and whether each text was delivered, and we note your choice on our guest list. Our text-message service processes the texts only to deliver them. We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties. Using the website or answering by email does not sign you up for texts.", "Los mensajes de texto de Simply Soph Media son opcionales. Si envías nuestra palabra clave para suscribirte, guardamos tu número de celular, las palabras clave que envías, cuándo aceptaste y si cada mensaje se entregó, y anotamos tu preferencia en nuestra lista de invitados. Nuestro servicio de mensajes de texto los procesa solo para entregarlos. No vendemos ni compartimos con terceros tus datos de suscripción SMS ni tu información personal para fines de publicidad. No compartiremos información móvil con terceros ni afiliados para fines de publicidad o promoción. Los datos de suscripción y consentimiento de mensajes de texto no se compartirán con ningún tercero. Usar el sitio o responder por correo no te suscribe a los mensajes de texto.")}</p><p>${say("Reply STOP at any time to stop texts. We keep a short note of your opt-out so we don’t text you again by mistake. To see, correct or delete your information, email misxv@simplysoph.com.", "Responde STOP en cualquier momento para dejar de recibir mensajes. Guardamos una nota breve de tu cancelación para no volver a escribirte por error. Para ver, corregir o borrar tu información, escribe a misxv@simplysoph.com.")}</p><a href="${href("sms-terms", lang)}">${say("SMS Terms", "Términos SMS")}</a></article>`;
  // Policy paragraphs; a run of "- " items becomes a real list.
  if (["privacy", "terms"].includes(route)) {
    const notice =
      '<article class="editorial">' +
      policies[route][lang]
        .map((p, i, all) => {
          if (!p.startsWith("- ")) return "<p>" + esc(p) + "</p>";
          const open = all[i - 1]?.startsWith("- ") ? "" : "<ul>",
            close = all[i + 1]?.startsWith("- ") ? "" : "</ul>";
          return open + "<li>" + esc(p.slice(2)) + "</li>" + close;
        })
        .join("") +
      "</article>";
    body = notice + body;
  }
  if (route === "terms")
    body +=
      '<article class="editorial"><h2>' +
      say("Downloads", "Descargas") +
      "</h2><p>" +
      say(
        "You’re welcome to download the photos and videos in the gallery and keep them as personal keepsakes. For any other use, please ask us first.",
        "Puedes descargar las fotos y los videos de la galería y guardarlos como recuerdo personal. Para cualquier otro uso, pregúntanos primero.",
      ) +
      '</p><a href="' +
      href("contact", lang) +
      '">' +
      say("Contact us", "Escríbenos") +
      "</a></article>";
  if (route === "404")
    body = `<p class="lead">${say("Let’s get you back to the celebration.", "Volvamos a la celebración.")}</p><p class="actions next-steps">${link("rsvp", t.rsvp)}<a href="${href("details", lang)}">${routeTitle("details", lang)}${arrow}</a><a href="${href("", lang)}">${t.home}${arrow}</a></p>`;
  // Chapters: one album at a time, oldest photos first, captions in Sophia's words.
  if (route === "gallery" && family.portraits.length) {
    for (const photo of family.portraits)
      if (!celebration.albums.some((a) => a.id === photo.album))
        throw new Error("Unknown gallery album: " + photo.album);
    const chapters = celebration.albums
        .map((album) => {
          const photos = family.portraits
            .filter((p) => p.album === album.id)
            .sort((a, b) => (a.age ?? 99) - (b.age ?? 99));
          return photos.length
            ? `<section class="chapter"><h2>${esc(album[lang])}</h2><div class="chapter-photos">${photos
                .map(
                  (photo) =>
                    `<figure>${photo.src ? `<img loading="lazy" src="${safeLink(photo.src)}" alt="${esc(localized(photo.caption))}">` : `<div class="photo-placeholder" aria-hidden="true"><b>${esc(photo.age ?? "")}</b>${say("Photo", "Foto")}</div>`}<figcaption>${esc(localized(photo.caption))}</figcaption></figure>`,
                )
                .join("")}</div></section>`
            : "";
        })
        .join("");
    // Above the guests' gallery panel: the family's portraits need no sign-in.
    // A gallery without that panel stops the build rather than drop them.
    const panel = '<div class="gallery-state"';
    if (!body.includes(panel))
      throw new Error("The gallery has no place for the family's portraits");
    body = body.replace(panel, chapters + panel);
  }

  if (route === "privacy")
    body += `<article class="editorial"><h2>${say("Signing in", "Cómo entrar al sitio")}</h2><p>${say("You sign in with an email address that’s on our guest list for your family. We confirm it with a one-time link, or Google or Microsoft confirms it for us. To make your account work, we keep a record of which email signed in and when, plus your contact details, your RSVP and your messages. Your RSVP and head count also go on our private guest list. Changing your contact email doesn’t change the email you sign in with.", "Entras al sitio con un correo que está en nuestra lista de invitados para tu familia. Lo confirmamos con un enlace de un solo uso, o Google o Microsoft nos lo confirman. Para que tu cuenta funcione, guardamos qué correo entró y cuándo, además de tus datos de contacto, tu respuesta y tus mensajes. Tu respuesta y el número de personas que vienen también se anotan en nuestra lista privada de invitados. Cambiar tu correo de contacto no cambia el correo con el que entras.")}</p></article>`;
  return `<section class="page section">${heading}${body}</section>`;
}
// One row on every screen: the wordmark, then a flat link per section (behind
// the Menu button on narrow screens, site/nav.js), the language switch, RSVP.
function navigation(lang, current) {
  const t = copy[lang],
    es = lang === "es",
    here = sectionOf(current),
    // "page" on the page itself, "true" on its section's link.
    mark = (page, section) =>
      page === current
        ? ' aria-current="page"'
        : section && section === here
          ? ' aria-current="true"'
          : "";
  const links = sections
    .map((section) => [section, readyPages(section)])
    .filter(([, pages]) => pages.length)
    .map(
      ([section, pages]) =>
        `<li><a href="${href(pages[0], lang)}"${mark(pages[0], section)}>${esc(sectionName(section, lang))}</a></li>`,
    )
    .join("");
  // The other language's version of this page; a missing page has none, so
  // the 404 switches to the other language's home.
  const other = es ? "en" : "es",
    switchTo = href(current === "404" ? "" : current, other);
  return `<header class="site-header"><div class="header-bar"><a class="wordmark" href="${href("", lang)}">S<span class="wordmark-tag"><span aria-hidden="true"> · </span>MIS XV</span></a><nav class="site-nav" id="site-nav" aria-label="${es ? "Navegación principal" : "Main navigation"}"><ul>${links}<li class="nav-signin"><a href="${href("account", lang)}"${mark("account")}>${t.signIn}</a></li></ul></nav><div class="header-actions"><a class="lang-switch" href="${switchTo}" lang="${other}" hreflang="${other}"><span class="lang-short" aria-hidden="true">${t.languageShort}</span><span class="lang-full">${t.language}</span></a><a class="nav-rsvp" href="${href("rsvp", lang)}"${current.startsWith("rsvp") ? ' aria-current="page"' : ""}>RSVP</a><button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav"><svg class="icon" aria-hidden="true" viewBox="0 0 20 20" width="20" height="20"><path d="M3 5.5h14M3 10h14M3 14.5h14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span class="menu-label">${t.menu}</span></button></div></div></header>`;
}
// Fonts: the weights the stylesheets use, fetched in parallel with them.
const fonts =
  "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&amp;family=Great+Vibes&amp;family=Manrope:wght@400;600;700&amp;display=swap";
// Title, description, link-preview card and icons. What a link preview says
// depends on the page and on the phase at build time (lifecycle previewKey):
// before the deadline home and RSVP invite and give the deadline; after it the
// event line; after the party a thank-you. Pages about photos and notes say
// the same thing in every phase, since a preview, once sent, never updates.
const eventLine = (lang) =>
  lang === "es"
    ? `${capitalize(longDate(event.startsAt, "es"))} en Fort Worth, Texas.`
    : `${longDate(event.startsAt, "en")} in Fort Worth, Texas.`;
const previews = {
  invite: (lang) =>
    lang === "es"
      ? `${eventLine(lang)} Por favor, confirmen su asistencia a más tardar el ${longDate(event.deadline, "es")}.`
      : `${eventLine(lang)} Please RSVP by ${longDate(event.deadline, "en")}.`,
  event: eventLine,
  thanks: (lang) =>
    lang === "es"
      ? `Gracias por celebrar con nosotros el ${longDate(event.startsAt, "es")}.`
      : `Thank you for celebrating with us on ${longDate(event.startsAt, "en")}.`,
  share: (lang) =>
    lang === "es"
      ? "Comparte las fotos y los videos que tomaste en los XV de Sophia."
      : "Share the photos and videos you took at Sophia’s quinceañera.",
  gallery: (lang) =>
    lang === "es"
      ? "Fotos y videos de los XV de Sophia, para nuestros invitados."
      : "Photos and videos from Sophia’s quinceañera, for our guests.",
  guestbook: (lang) => sayTerm(terms.leaveNote, lang, registerFor("guestbook")) + ".",
  "thank-you": (lang) =>
    lang === "es" ? "Un agradecimiento de Sophia y su familia." : "A thank-you from Sophia and her family.",
};
const dateFree = ["share", "gallery", "guestbook", "thank-you"];
function head({ route, title, lang, admin }) {
  const t = copy[lang],
    es = lang === "es",
    key = previewKey(admin ? "admin" : route, phase),
    description = previews[key](lang),
    ogTitle = dateFree.includes(key)
      ? `${routeTitle(route, lang)} · ${t.site}`
      : es
        ? "Los XV de Sophia · 15 de enero de 2027"
        : "Sophia’s Quinceañera · January 15, 2027",
    url = origin + (admin ? `/${route}/` : href(route === "404" ? "" : route, lang));
  return `<title>${esc(route === "" && !admin ? t.site : `${title} · ${t.site}`)}</title><meta name="description" content="${esc(description)}"><meta name="misxv-phase" content="${phase}"><meta name="misxv-deadline" content="${esc(event.deadline)}"><meta name="theme-color" content="#360d16" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#070c15" media="(prefers-color-scheme: dark)"><meta property="og:type" content="website"><meta property="og:site_name" content="${esc(t.site)}"><meta property="og:title" content="${esc(ogTitle)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${origin}${images.og}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(es ? "Invitación a los XV de Sophia en dorado y borgoña" : "Sophia’s gold and burgundy quinceañera invitation")}"><meta property="og:locale" content="${es ? "es_US" : "en_US"}"><meta property="og:locale:alternate" content="${es ? "en_US" : "es_US"}"><meta name="twitter:card" content="summary_large_image"><link rel="icon" type="image/svg+xml" href="${favicon}"><link rel="icon" type="image/png" sizes="32x32" href="${images.favicon}"><link rel="apple-touch-icon" href="${images.touchIcon}"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts}">`;
}
function document({ route, title, lang = "en", admin = false }) {
  const t = copy[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="strict-origin-when-cross-origin">${head({ route, title, lang, admin })}<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/pages.css">${route === "404" ? '<script type="module" src="/not-found.js"></script>' : ""}<script type="module" src="/nav.js"></script><script type="module" src="/${admin ? "admin" : "guest"}.js"></script></head><body data-route="${route}"><a class="skip" href="#main">${lang === "es" ? "Ir al contenido" : "Skip to content"}</a>${navigation(lang, admin ? "" : route)}<main id="main">${
    admin
      ? `<section class="section admin-shell"><aside aria-label="Administration" hidden>${adminRoutes
          .filter(
            ([r]) =>
              !["admin/login", "admin/documents", "admin/history"].includes(r),
          )
          .map(
            ([r, t]) =>
              `<a href="/${r}/"${r === route ? ' aria-current="page"' : ""}>${t}</a>`,
          )
          .join(
            "",
          )}<button class="plain-button" id="logout">Sign out</button><button class="plain-button" id="logout-all">Sign out everywhere</button></aside><div><p class="eyebrow">SOPHIA · MIS XV</p><h1 class="page-title">${title}</h1><div id="admin-app" data-view="${route}"><p role="status">Loading secure workspace…</p></div></div></section>`
      : contents(route, lang)
  }</main><footer class="site-footer"><nav class="footer-nav" aria-label="${lang === "es" ? "Políticas y avisos" : "Policies and updates"}"><ul>${["privacy", "terms", "whatsapp", "sms", "contact"].map((r) => `<li><a href="${href(r, lang)}"${r === route && !admin ? ' aria-current="page"' : ""}>${esc(routeTitle(r, lang))}</a></li>`).join("")}</ul></nav><p class="copyright">© 2026 Simply Soph Media (${lang === "es" ? "la familia de Sophia" : "Sophia’s family"})</p></footer><div id="status" role="status" aria-live="polite"></div></body></html>`;
}
// Only remove the known generated directory inside this checkout, never a supplied path.
const checkout = fileURLToPath(new URL("../", import.meta.url)),
  outDir = outName ? path.join(checkout, ".cache", "builds", outName) : checkout;
if (path.resolve(fileURLToPath(root)) !== path.join(outDir, "dist"))
  throw new Error("Invalid build output");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
images = await buildImages({
  assets: new URL("../site/assets/", import.meta.url),
  out: root,
  cache: new URL("../.cache/images/", import.meta.url),
});
let count = 0;
const notFound = {};
for (const lang of ["en", "es"])
  for (const [route, en, es] of routes) {
    const folder = new URL(
      (lang === "es" ? "es/" : "") + (route ? route + "/" : ""),
      root,
    );
    await mkdir(folder, { recursive: true });
    const html = document({ route, title: lang === "es" ? es : en, lang });
    await writeFile(new URL("index.html", folder), html);
    if (route === "404") notFound[lang] = html;
    count++;
  }
// Hosting answers every missing address with this one file and a real 404
// status. It carries the Spanish page in a <template>; site/not-found.js shows
// it for addresses under /es/, keeping the status and the typed address.
const spanish = notFound.es.match(/<title>(.*?)<\/title>[\s\S]*<body[^>]*>([\s\S]*)<\/body>/);
await writeFile(
  new URL("404.html", root),
  notFound.en.replace(
    "</body>",
    `<template data-lang="es" data-title="${spanish[1]}">${spanish[2]}</template></body>`,
  ),
);
for (const [route, title] of adminRoutes) {
  const folder = new URL(route + "/", root);
  await mkdir(folder, { recursive: true });
  await writeFile(
    new URL("index.html", folder),
    document({ route, title, admin: true }),
  );
  count++;
}
await mkdir(new URL("assets/", root), { recursive: true });
await writeFile(
  new URL("assets/photo-upload-qr.svg", root),
  await QRCode.toString("https://misxv.simplysoph.com/share/#media-upload", {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
  }),
);
for (const file of [
  "styles.css",
  "pages.css",
  "guest.js",
  "media-upload.js",
  "upload-batch.mjs",
  "admin.js",
  "client.js",
  "assets/target.svg",
  "celebration.mjs",
  "lifecycle.mjs",
  "datetime.mjs",
  "lexicon.mjs",
  "now.mjs",
  "home.mjs",
  "experience.js",
  "nav.js",
  "not-found.js",
  "admin-experience.js",
  "admin-planning.js",
  "admin-audience.js",
  "admin-sms.js",
  "admin-batches.js",
  "admin-pulse.js",
  "sso.js",
  "admin-history.js",
  "admin-whatsapp.js",
  "guest-whatsapp.js",
])
  await copyFile(
    new URL("../site/" + file, import.meta.url),
    new URL(file, root),
  );
// English calendars at /calendar/, Spanish ones at /calendar/es/.
await mkdir(new URL("calendar/es/", root), { recursive: true });
for (const kind of ["ceremony", "dinner", "reception"]) {
  if (celebration[kind].end)
    for (const lang of ["en", "es"])
      await writeFile(
        new URL(`calendar/${lang === "es" ? "es/" : ""}${kind}.ics`, root),
        calendar(kind, celebration, lang),
      );
}

await writeFile(new URL("robots.txt", root), "User-agent: *\nDisallow: /\n");

// Admin-only preview: the approved page layouts filled with the idea-book
// examples, so the family can review wording live without guests seeing made-up
// names. Written outside dist/ so Hosting never publishes it; the API serves it
// to administrators at /api/admin/preview (server/application.mjs).
const previewRoot = new URL(outBase + "dist-preview/", import.meta.url);
if (path.resolve(fileURLToPath(previewRoot)) !== path.join(outDir, "dist-preview"))
  throw new Error("Invalid preview output");
await rm(previewRoot, { recursive: true, force: true });
family = exampleFamily;
for (const lang of ["en", "es"]) {
  await mkdir(new URL(lang + "/", previewRoot), { recursive: true });
  for (const route of previewRoutes) {
    const [, en, es] = routes.find((r) => r[0] === route);
    const other = lang === "es" ? "en" : "es",
      preview = (r, l) => `/api/admin/preview?page=${r}&amp;lang=${l}`;
    const banner = `<aside class="preview-banner" role="note"><p><strong>${lang === "es" ? "Vista previa con texto de ejemplo." : "Preview with example text."}</strong> ${lang === "es" ? "Los invitados no ven esta página. Los nombres, fotos y enlaces son ejemplos hasta que la familia los confirme." : "Guests can’t see this page. Names, photos and links are examples until the family confirms them."}</p><p>${previewRoutes.map((r) => `<a href="${preview(r, lang)}"${r === route ? ' aria-current="page"' : ""}>${esc(routes.find((x) => x[0] === r)[lang === "es" ? 2 : 1])}</a>`).join(" · ")}</p><p><a href="${preview(route, other)}" lang="${other}">${lang === "es" ? "View in English" : "Ver en español"}</a> · <a href="/admin/site/">${lang === "es" ? "Volver a la administración" : "Back to admin"}</a></p></aside>`;
    const html = document({ route, title: lang === "es" ? es : en, lang })
      .replace("<title>", `<title>${lang === "es" ? "Vista previa" : "Preview"} · `)
      .replace('<main id="main">', `<main id="main">${banner}`);
    await writeFile(new URL(`${lang}/${route}.html`, previewRoot), html);
  }
}
family = approvedFamily;
console.log(
  `Built ${count} pages, English/Spanish guest routes, private admin shells and calendar, plus ${previewRoutes.length * 2} admin preview pages, with ${phase} link previews${outName ? ` in .cache/builds/${outName}/` : ""}. Runtime features require the configured API.`,
);
