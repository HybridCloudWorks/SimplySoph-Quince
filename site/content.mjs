import { terms } from "./lexicon.mjs";
import { posted } from "./promises.mjs";
import { date, capitalize } from "./datetime.mjs";
export const event = {
  name: "Sophia",
  date: "2027-01-15",
  startsAt: "2027-01-15T16:00:00-06:00",
  deadline: "2026-11-15T23:59:00-06:00",
  timezone: "America/Chicago",
  sender: "misxv@simplysoph.com",
};
// Null/empty content awaits the family; never invent names, endorsements or payment links.
// Text values are { en, es } or a plain string. Layouts follow the family-approved idea book:
//   portrait: "/assets/…" photo beside the bio
//   moments: [{ age: 0, text: { en, es } }] — "fifteen years in six moments", oldest first
//   court, padrinos: stay EMPTY here. They would hold people's names, and this
//     repository is public: names come only from the runtime event settings
//     (server/site-settings.mjs, GET /api/site; docs/publishing.md). The
//     layouts that would show them are court: [{ name, role: "escort" | "dama"
//     | "chambelan", pair, line, photo }] and padrinos: [{ gift: "misa" (a key
//     of padrinoTraditions), names }]; tests/family-slots.test.mjs fails if
//     either ever has an entry.
//   parentsSignature: { en, es } — signed in script under the parents' letter
//   hotels: [{ name, where: { en, es }, notes: { en, es }, url }]
//   airport: { name, notes: { en, es } } — the "Flying in" card on Travel
//   driveMinutes: 15 — church to reception, shown on the route strip and in the
//     Schedule's "Good to know" box (no minutes are stated until it is set)
//   portraits: [{ album: "childhood" (a celebration album id), age, caption: { en, es }, src }]
//     — gallery chapters, oldest first; a missing src shows the age as a placeholder
//   dressCode, parking, children: { en, es } — answers on Questions and in the
//     Schedule's "Good to know" box; parking also on both venue pages
//   thanksNote: { en, es } — the thank-you page message, after the event
//   thankYou: { en, es } — the home page's line after the party, in place of
//     "Thank you for celebrating with us." / "Gracias por celebrar con
//     nosotros." (and the link previews then); null keeps that default
//   promises: { dressCode, hotels, parking: { by: "2026-12-01" | null } } — the
//     day each promised item will be posted by. Every page that promises one
//     (and the RSVP confirmation and My account) says "by <date>" until the
//     content above exists (site/promises.mjs); null keeps today's wording.
//   childAgeCutoff: 12 — guests younger than this count as children; the RSVP
//     labels and Questions say so. null leaves the labels as they are.
//   traditions: ["corona", "zapatos"] — keys of padrinoTraditions below that are
//     part of Sophia's day, explained on the Schedule under "What to expect".
//     Empty shows nothing.
export const family = {
  bio: null,
  portrait: null,
  moments: [],
  parentsMessage: null,
  parentsSignature: null,
  court: [],
  padrinos: [],
  registry: [],
  hotels: [],
  airport: null,
  driveMinutes: null,
  portraits: [],
  dressCode: null,
  parking: null,
  children: null,
  highlightVideo: null,
  thanksNote: null,
  thankYou: null,
  promises: { dressCode: { by: null }, hotels: { by: null }, parking: { by: null } },
  childAgeCutoff: null,
  traditions: [],
};
// Padrino traditions for the public thank-you cards: the Spanish name in script,
// the English name underneath, and a one-line meaning (from the approved idea book).
export const padrinoTraditions = {
  misa: { es: "de Misa", en: "Mass", meaning: { en: "The Mass of thanksgiving that opens the day.", es: "La Misa de acción de gracias con la que empieza el día." } },
  vestido: { es: "de Vestido", en: "Gown", meaning: { en: "The gown Sophia wears into her new chapter.", es: "El vestido con el que Sophia empieza su nueva etapa." } },
  corona: { es: "de Corona", en: "Tiara", meaning: { en: "A sign that she is a princess before God and her family.", es: "Señal de que es una princesa ante Dios y su familia." } },
  zapatos: { es: "de Zapatos", en: "Shoes", meaning: { en: "Flats become heels at the reception: the step into young womanhood.", es: "En la recepción, sus zapatos de piso se cambian por sus primeras zapatillas: el paso de niña a señorita." } },
  medalla: { es: "de Medalla", en: "Medal", meaning: { en: "A religious medal blessed during the ceremony, a sign of her faith.", es: "Una medalla bendecida durante la ceremonia, señal de su fe." } },
  biblia: { es: "de Biblia y Rosario", en: "Bible & rosary", meaning: { en: "To keep God’s word and prayer close as she grows.", es: "Para que la palabra de Dios y la oración la acompañen mientras crece." } },
  anillo: { es: "de Anillo", en: "Ring", meaning: { en: "A circle with no end: her commitment to God, family and community.", es: "Un círculo sin fin: su compromiso con Dios, su familia y su comunidad." } },
  cojin: { es: "de Cojín", en: "Kneeler", meaning: { en: "The cushion Sophia kneels on at the altar.", es: "El cojín en el que Sophia se arrodilla ante el altar." } },
  ramo: { es: "de Ramo", en: "Bouquet", meaning: { en: "The flowers Sophia offers to Our Lady of Guadalupe.", es: "Las flores que Sophia ofrece a la Virgen de Guadalupe." } },
  muneca: { es: "de Última Muñeca", en: "Last doll", meaning: { en: "The last doll, passed on as she leaves childhood behind.", es: "La última muñeca, que entrega al dejar atrás la infancia." } },
  pastel: { es: "de Pastel", en: "Cake", meaning: { en: "The cake for the celebration.", es: "El pastel de la celebración." } },
  brindis: { es: "de Brindis", en: "Toast", meaning: { en: "The glasses for the family toast.", es: "Las copas para el brindis de la familia." } },
};
// One name per page: the header, section links and page titles all use these
// (the shared names from site/lexicon.mjs). Titles are chrome, so the Spanish
// is a noun or an infinitive, except the confirmation's, which names the
// household's answer the way that page speaks to them ("Su respuesta").
const named = (entry, es = entry.es) => [entry.en, es];
export const routes = [
  ["", "Home", "Inicio"],
  ["sophia", "Meet Sophia", "Conoce a Sophia"],
  ["details", ...named(terms.schedule)],
  ["ceremony", ...named(terms.ceremonyLong)],
  ["reception", ...named(terms.dinnerAndReception)],
  ["rsvp", ...named(terms.rsvpAction)],
  ["rsvp/confirmed", ...named(terms.yourRsvp, terms.yourRsvp.es.ustedes)],
  // Built as "Sign in", which is what a signed-out guest finds there; a
  // signed-in guest's page and header item read "My account" (site/guest.js).
  ["account", terms.signIn.en, terms.signIn.es],
  ["court", "Court of honor", "Corte de honor"],
  ["padrinos", "Padrinos", "Padrinos"],
  ["gallery", ...named(terms.photos)],
  ["share", ...named(terms.sharePhotos)],
  ["registry", ...named(terms.gifts)],
  ["travel", "Travel", "Hospedaje y transporte"],
  ["faq", "Questions", "Preguntas"],
  ["guestbook", ...named(terms.noteTitle)],
  ["contact", "Contact", "Contacto"],
  ["privacy", "Privacy policy", "Política de privacidad"],
  ["terms", "Photo & video policy", "Uso de fotos y videos"],
  ["whatsapp", terms.whatsappProgram.en, terms.whatsappProgram.es],
  // English in Title Case on purpose: the registered SMS campaign quotes these
  // word for word. The Spanish names are not part of the registration.
  ["sms", terms.smsProgram.en, terms.smsProgram.es],
  ["sms-terms", terms.smsTerms.en, terms.smsTerms.es],
  ["thank-you", "Thank you", "Gracias"],
  ["404", "Page not found", "Página no encontrada"],
];
// Pages that wait for the family's words. Until one has content it still builds
// for a direct visit, but nothing links to it: not the header, the home page or
// another page. The links appear by themselves on the next build after the
// family fills it in above.
export const waitsFor = {
  sophia: (f) => Boolean(f.bio || f.parentsMessage || f.moments.length),
  court: (f) => f.court.length > 0,
  padrinos: (f) => f.padrinos.length > 0,
  // Hotels or the airport note; until then Travel only repeats the Schedule.
  travel: posted.hotels,
  "thank-you": (f) => Boolean(f.thanksNote || f.highlightVideo),
};
export const ready = (route, f = family) => !waitsFor[route] || waitsFor[route](f);
// The header, in order: one link per section, to its first page with content.
// A section's other pages are linked from a row under each of its page titles.
// RSVP, sign-in and the language switch sit beside these; the policies and
// message programs are in the footer.
export const sections = [
  { pages: ["thank-you"] },
  { name: ["Sophia", "Sophia"], pages: ["sophia", "court", "padrinos"] },
  { pages: ["details", "ceremony", "reception"] },
  { pages: ["travel"] },
  // Named for both, so the note for Sophia is found from the header.
  { name: [terms.photosAndNotes.en, terms.photosAndNotes.es], pages: ["gallery", "share", "guestbook"] },
  { pages: ["registry"] },
  { pages: ["faq"] },
  { pages: ["contact"] },
];
export const adminRoutes = [
  ["admin/login", "Administrator sign-in"],
  ["admin", "Overview"],
  ["admin/guests", "Invitations"],
  ["admin/access", "Guest access"],
  ["admin/content", "Accounting & godparents"],
  ["admin/documents", "Documents"],
  ["admin/site", "Website & event"],
  ["admin/notifications", "Notifications"],
  ["admin/seating", "Seating"],
  ["admin/photos", "Photo & video review"],
  ["admin/guestbook", "Messages"],
  ["admin/updates", "Communications"],
  ["admin/history", "Record history"],
];
// The date lines come from site/datetime.mjs: "Friday, January 15, 2027" /
// "Viernes 15 de enero de 2027" (a line of its own, so a capital), and the
// deadline inside a sentence ("domingo 15 de noviembre de 2026").
export const copy = {
  en: {
    date: date(event.startsAt, "en"),
    deadline: date(event.deadline, "en"),
    tagline: "Please join us as Sophia celebrates her fifteenth birthday.",
    intro: "Today begins a new chapter… join me to celebrate it.",
    rsvp: terms.rsvpAction.en,
    all: terms.seeSchedule.en,
    home: "Home",
    language: "Español",
    languageShort: "ES",
    signIn: terms.signIn.en,
    menu: "Menu",
    site: "Sophia’s Quinceañera",
    time: terms.timeZoneNote.en,
    contact: "Questions? Contact us",
    // The link adds "(opens in a new tab)" itself (celebration.mjs newTab).
    invitationCaption: "Open the full invitation",
    newTab: "(opens in a new tab)",
    footer: "With love,",
    loading: "Loading…",
  },
  es: {
    date: capitalize(date(event.startsAt, "es")),
    deadline: date(event.deadline, "es"),
    tagline: "Acompáñennos a celebrar los quince años de Sophia.",
    intro: "Hoy comienza un nuevo capítulo… acompáñame a celebrarlo.",
    rsvp: terms.rsvpAction.es,
    all: terms.seeSchedule.es,
    home: "Inicio",
    language: "English",
    languageShort: "EN",
    signIn: terms.signIn.es,
    menu: "Menú",
    site: "Los XV de Sophia",
    time: terms.timeZoneNote.es,
    contact: "¿Preguntas? Escríbenos",
    invitationCaption: "Ver la invitación completa",
    newTab: "(se abre en otra pestaña)",
    footer: "Con cariño,",
    loading: "Cargando…",
  },
};
export const textContent = {
  sophia: [
    ["A new chapter", "Un nuevo capítulo"],
    [
      "Sophia is turning fifteen. We’ll celebrate with a religious ceremony, then dinner and a dance, on Friday, January 15, 2027, in Fort Worth, Texas.",
      "Sophia cumple quince años. Lo celebraremos con una ceremonia religiosa y después una cena con baile, el viernes 15 de enero de 2027, en Fort Worth, Texas.",
    ],
    [
      "We’ll add a message from Sophia and her parents here soon.",
      "Pronto agregaremos aquí un mensaje de Sophia y sus papás.",
    ],
  ],
  court: [
    ["By her side", "A su lado"],
    [
      "Sophia’s court of honor will be by her side on her big day.",
      "La corte de honor acompañará a Sophia en su gran día.",
    ],
    [
      "We’ll share their names and photos here soon.",
      "Pronto compartiremos aquí sus nombres y fotos.",
    ],
  ],
  padrinos: [
    ["Padrinos and madrinas", "Padrinos y madrinas"],
    [
      "They help make a quinceañera possible, each with a special part of the day.",
      "Ayudan a hacer posibles los XV, y cada uno tiene una parte especial del día.",
    ],
    [
      "Soon we’ll thank Sophia’s padrinos and madrinas here by name.",
      "Pronto daremos aquí las gracias, por nombre, a los padrinos y madrinas de Sophia.",
    ],
  ],
  travel: [
    ["Make yourself at home", "Siéntete como en casa"],
    [
      "The celebration is in Fort Worth, Texas. The ceremony and the reception are in different places, so plan time to drive from one to the other.",
      "La celebración será en Fort Worth, Texas. La ceremonia y la recepción son en lugares distintos, así que calcula tiempo para manejar de uno a otro.",
    ],
    // Then the hotels promise (site/promises.mjs places.travel).
  ],
  "thank-you": [
    // Before the party; after it, textAfterParty below.
    ["A chapter to remember", "Un capítulo para recordar"],
    ["We look forward to celebrating together.", "Esperamos celebrar juntos."],
    [
      "After the celebration, we’ll share Sophia’s thank-you message and favorite moments here.",
      "Después de la celebración, compartiremos aquí el mensaje de agradecimiento de Sophia y los mejores momentos.",
    ],
  ],
};
// What a page in textContent says once the party is over, in place of its
// lead and last line (the thank-you page, until the family writes its own).
export const textAfterParty = {
  "thank-you": [
    ["Thank you for celebrating with us.", "Gracias por celebrar con nosotros."],
    [
      "Soon we’ll share Sophia’s thank-you message and favorite moments here.",
      "Pronto compartiremos aquí el mensaje de agradecimiento de Sophia y los mejores momentos.",
    ],
  ],
};
