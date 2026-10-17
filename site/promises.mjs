// What the website has promised to post and hasn't yet: the dress code, hotel
// and airport suggestions, and parking. Every place that makes one of these
// promises says it through here, so a date the family adds once
// (site/content.mjs family.promises, each { by: "YYYY-MM-DD" | null }) shows
// the same in every place and in both languages:
//   - no date: the place's own wording, as it reads today;
//   - a date:  "We’ll post … here by Tuesday, December 1, 2026." /
//              "Publicaremos aquí … a más tardar el martes 1 de diciembre de 2026.";
//   - content: the content itself, and the promise is gone.
// A date whose day is over (on the build's clock, or the server's in the
// browser) is never repeated: the place goes back to its own wording.
// Nothing here invents a date; only the family's data gives one.
import { date } from "./datetime.mjs";
import { localDay } from "./lifecycle.mjs";
import { escapeHtml as esc, pageHref } from "./celebration.mjs";
import { say } from "./lexicon.mjs";

// Whether the family has posted each promised thing (site/content.mjs family).
export const posted = {
  dressCode: (f) => Boolean(f.dressCode),
  hotels: (f) => f.hotels.length > 0 || Boolean(f.airport),
  parking: (f) => Boolean(f.parking),
};
// The five places that promise something, with what each promises and its
// wording without a date (unchanged from before dates existed).
export const places = {
  // The Schedule's "Good to know" box.
  details: {
    kind: "dressCode",
    what: { en: "the dress code", es: "el código de vestimenta" },
    today: {
      en: "We’ll share the dress code here soon.",
      es: "Pronto compartiremos aquí el código de vestimenta.",
    },
  },
  // Questions: "What should I wear?"
  faq: {
    kind: "dressCode",
    what: { en: "the dress code", es: "el código de vestimenta" },
    today: { en: "We’ll share this here soon.", es: "Lo compartiremos aquí pronto." },
  },
  travel: {
    kind: "hotels",
    what: {
      en: "hotel and airport suggestions",
      es: "sugerencias de hoteles y de cómo llegar desde el aeropuerto",
    },
    today: {
      en: "We’ll share hotel and airport suggestions here soon.",
      es: "Pronto compartiremos aquí sugerencias de hoteles y de cómo llegar desde el aeropuerto.",
    },
  },
  // The venue pages. These sentences used to end the venue notes in the event
  // settings (server/site-settings.mjs drops them from saved notes).
  ceremony: {
    kind: "parking",
    what: { en: "parking and arrival details", es: "los detalles de llegada y estacionamiento" },
    today: {
      en: "Parking and arrival details will be shared here.",
      es: "Compartiremos aquí los detalles de llegada y estacionamiento.",
    },
  },
  reception: {
    kind: "parking",
    what: {
      en: "entrance, parking and accessibility details",
      es: "los detalles de entrada, estacionamiento y accesibilidad",
    },
    today: {
      en: "Entrance, parking and accessibility details will be shared here.",
      es: "Compartiremos los detalles de entrada, estacionamiento y accesibilidad.",
    },
  },
};
const day = /^\d{4}-\d{2}-\d{2}$/;
// A `by` date that still holds at `now` (ms; omitted, any well-formed date).
export const holds = (by, now) =>
  typeof by === "string" && day.test(by) && (now === undefined || localDay(now) <= by);
// Noon UTC is the same calendar day in Fort Worth.
const written = (by, lang) => date(Date.parse(by + "T12:00:00Z"), lang);
const text = (value, lang) => (typeof value === "string" ? value : value?.[lang] || value?.en || "");
// The sentence for one place, as plain text (escape it for HTML): the content
// once it exists, otherwise the promise, dated while its date holds.
export function promised(place, lang, { content = null, by = null, now } = {}) {
  const p = places[place];
  if (!p) throw new Error("Unknown promise: " + place);
  if (content) return text(content, lang);
  if (!holds(by, now)) return p.today[lang === "es" ? "es" : "en"];
  return lang === "es"
    ? `Publicaremos aquí ${p.what.es} a más tardar el ${written(by, "es")}.`
    : `We’ll post ${p.what.en} here by ${written(by, "en")}.`;
}
// What is still to come, for the confirmation and My account: each kind the
// family has not posted, with its date or null. The build checks the dates.
export function coming(f) {
  const out = {};
  for (const kind of Object.keys(posted))
    if (!posted[kind](f)) {
      const by = f.promises?.[kind]?.by ?? null;
      if (by !== null && !holds(by)) throw new Error(`family.promises.${kind}.by must be YYYY-MM-DD`);
      out[kind] = by;
    }
  return out;
}

// "What's next" on the RSVP confirmation and on My account: what is still to
// come and by when, then how a household hears about it, offering only the
// channels the server reports live (GET /api/config `channels`):
//   - SMS (US and Canadian numbers): "Text SOPHIA to …", no sign-in needed,
//     in the registered program's own terms (event texts such as schedule or
//     venue updates, docs/sms-campaign-registration.md): no text is sent when
//     something is posted, so the line promises none;
//   - WhatsApp (everyone else): from an invitation-link session, a pointer to
//     the email sign-in on My account, where the choice is; signed in, the
//     WhatsApp card that follows this block;
//   - for a household that is not coming (`photos`), where the photos will
//     be after the celebration, in place of what to bring or wear;
//   - the home page, where news is posted, always.
// `register` is the page's Spanish form of address (site/lexicon.mjs); the
// Spanish is a string or { tu, ustedes }, as in site/client.js tr().
const short = {
  dressCode: { en: "the dress code", es: "el código de vestimenta" },
  parking: { en: "parking details", es: "los detalles de estacionamiento" },
  hotels: { en: "hotel suggestions", es: "las sugerencias de hoteles" },
};
const list = (items, lang) =>
  items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ${lang === "es" ? "y" : "and"} ${items.at(-1)}`;
export function whatsNext({ coming: next = {}, channels = {}, linkSession = false, photos = false, lang = "en", register = "tu", now } = {}) {
  const es = lang === "es",
    tr = (en, spanish) => say({ en, es: spanish }, lang, register);
  // Kinds that share a date share a sentence; undated ones come last.
  const groups = new Map();
  for (const kind of Object.keys(short)) {
    if (!(kind in next)) continue;
    const key = holds(next[kind], now) ? next[kind] : "";
    groups.set(key, [...(groups.get(key) || []), short[kind][es ? "es" : "en"]]);
  }
  const lines = [...groups]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a < b ? -1 : 1))
    .map(([by, items]) =>
      by
        ? tr(`We’ll post ${list(items, "en")} on this website by ${written(by, "en")}.`, `Publicaremos en este sitio ${list(items, "es")} a más tardar el ${written(by, "es")}.`)
        : tr(`We’ll post ${list(items, "en")} on this website soon.`, `Pronto publicaremos en este sitio ${list(items, "es")}.`),
    )
    .map(esc);
  if (channels.sms && channels.smsKeyword && channels.smsNumber) {
    const keyword = `<strong>${esc(channels.smsKeyword)}</strong>`,
      number = `<a class="nowrap" href="sms:${esc(channels.smsNumber.replace(/[^+\d]/g, ""))}?body=${encodeURIComponent(channels.smsKeyword)}">${esc(channels.smsNumber)}</a>`;
    lines.push(
      tr(`Text ${keyword} to ${number} to get our event texts, such as schedule or venue updates.`, {
        tu: `Envía ${keyword} al ${number} para recibir nuestros mensajes del evento, como cambios de horario o lugar.`,
        ustedes: `Envíen ${keyword} al ${number} para recibir nuestros mensajes del evento, como cambios de horario o lugar.`,
      }),
    );
    lines.push(tr("Texts go to US and Canadian mobile numbers.", "Los mensajes de texto llegan a números móviles de Estados Unidos y Canadá."));
  }
  if (channels.whatsapp)
    lines.push(
      linkSession
        ? tr(`Outside the US and Canada? <a href="${pageHref("account", lang)}">Sign in with your email</a> to get WhatsApp updates.`, {
            tu: `¿Fuera de Estados Unidos y Canadá? <a href="${pageHref("account", lang)}">Entra con tu correo</a> para recibir avisos por WhatsApp.`,
            ustedes: `¿Fuera de Estados Unidos y Canadá? <a href="${pageHref("account", lang)}">Entren con su correo</a> para recibir avisos por WhatsApp.`,
          })
        : tr("Outside the US and Canada? You can sign up for WhatsApp updates below.", {
            tu: "¿Fuera de Estados Unidos y Canadá? Puedes suscribirte a los avisos por WhatsApp aquí abajo.",
            ustedes: "¿Fuera de Estados Unidos y Canadá? Pueden suscribirse a los avisos por WhatsApp aquí abajo.",
          }),
    );
  if (photos)
    lines.push(
      tr(
        `After the celebration, we’ll share our guests’ photos on the <a href="${pageHref("gallery", lang)}">Photos</a> page${linkSession ? "; sign in with your email to see them" : ""}.`,
        {
          tu: `Después de la celebración, compartiremos las fotos de nuestros invitados en la página <a href="${pageHref("gallery", lang)}">Fotos</a>${linkSession ? "; entra con tu correo para verlas" : ""}.`,
          ustedes: `Después de la celebración, compartiremos las fotos de nuestros invitados en la página <a href="${pageHref("gallery", lang)}">Fotos</a>${linkSession ? "; entren con su correo para verlas" : ""}.`,
        },
      ),
    );
  lines.push(
    tr(
      `News about the celebration is also posted on the <a href="${pageHref("", lang)}">home page</a>.`,
      `Las novedades de la celebración también se publican en la <a href="${pageHref("", lang)}">página de inicio</a>.`,
    ),
  );
  return `<section class="card whats-next" data-whats-next><h3>${tr("What’s next", "Lo que sigue")}</h3>${lines.map((l) => `<p>${l}</p>`).join("")}</section>`;
}
