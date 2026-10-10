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
//   court: [{ name, role: "escort" | "dama" | "chambelan", pair: 1, line: { en, es }, photo }]
//   parentsSignature: { en, es } — signed in script under the parents' letter
//   padrinos: [{ gift: "misa" (a key of padrinoTraditions), names }] — public thank-you
//     cards: names and tradition only, never amounts or planning status
//   hotels: [{ name, where: { en, es }, notes: { en, es }, url }]
//   airport: { name, notes: { en, es } } — the "Flying in" card on Travel
//   driveMinutes: 15 — church to reception, shown on the route strip
//   portraits: [{ album: "childhood" (a celebration album id), age, caption: { en, es }, src }]
//     — gallery chapters, oldest first; a missing src shows the age as a placeholder
//   parking, children: { en, es } — answers on Good to know
//   thanksNote: { en, es } — the thank-you page message, after the event
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
  churchAddress: null,
  churchName: null,
  churchNotes: null,
  dressCode: null,
  parking: null,
  children: null,
  highlightVideo: null,
  thanksNote: null,
};
// Padrino traditions for the public thank-you cards: the Spanish name in script,
// the English name underneath, and a one-line meaning (from the approved idea book).
export const padrinoTraditions = {
  misa: { es: "de Misa", en: "Mass", meaning: { en: "Sponsor the Mass of thanksgiving that opens the day.", es: "Patrocinan la Misa de acción de gracias que abre el día." } },
  vestido: { es: "de Vestido", en: "Gown", meaning: { en: "Give the gown Sophia wears into her new chapter.", es: "Regalan el vestido con el que Sophia entra a su nuevo capítulo." } },
  corona: { es: "de Corona", en: "Tiara", meaning: { en: "A sign that she is a princess before God and her family.", es: "Señal de que es una princesa ante Dios y su familia." } },
  zapatos: { es: "de Zapatos", en: "Shoes", meaning: { en: "Flats become heels at the reception: the step into young womanhood.", es: "Las zapatillas se cambian por tacones en la recepción: el paso a ser una joven mujer." } },
  medalla: { es: "de Medalla", en: "Medal", meaning: { en: "A religious medal blessed during the ceremony, a sign of her faith.", es: "Una medalla bendecida durante la ceremonia, señal de su fe." } },
  biblia: { es: "de Biblia y Rosario", en: "Bible & rosary", meaning: { en: "To keep God’s word and prayer close as she grows.", es: "Para mantener cerca la palabra de Dios y la oración mientras crece." } },
  anillo: { es: "de Anillo", en: "Ring", meaning: { en: "A circle with no end: her commitment to God, family and community.", es: "Un círculo sin fin: su compromiso con Dios, su familia y su comunidad." } },
  cojin: { es: "de Cojín", en: "Kneeler", meaning: { en: "The cushion Sophia kneels on at the altar.", es: "El cojín en el que Sophia se arrodilla ante el altar." } },
  ramo: { es: "de Ramo", en: "Bouquet", meaning: { en: "The flowers Sophia offers to Our Lady of Guadalupe.", es: "Las flores que Sophia ofrece a la Virgen de Guadalupe." } },
  muneca: { es: "de Última Muñeca", en: "Last doll", meaning: { en: "The last doll, passed on as she leaves childhood behind.", es: "La última muñeca, que entrega al dejar atrás la infancia." } },
  pastel: { es: "de Pastel", en: "Cake", meaning: { en: "The cake for the celebration.", es: "El pastel de la celebración." } },
  brindis: { es: "de Brindis", en: "Toast", meaning: { en: "The glasses for the family toast.", es: "Las copas para el brindis de la familia." } },
};
export const routes = [
  ["", "Home", "Inicio"],
  ["sophia", "Meet Sophia", "Conoce a Sophia"],
  ["details", "The celebration", "La celebración"],
  ["ceremony", "Religious ceremony", "Ceremonia religiosa"],
  ["reception", "Dinner & reception", "Cena y recepción"],
  ["rsvp", "Your invitation", "Tu invitación"],
  ["rsvp/confirmed", "Your response", "Tu respuesta"],
  ["account", "My account", "Mi cuenta"],
  ["court", "Court of honor", "Corte de honor"],
  ["padrinos", "With gratitude", "Con gratitud"],
  ["gallery", "The moments", "Los momentos"],
  ["share", "Share photos & videos", "Comparte fotos y videos"],
  ["registry", "Registry", "Registro de regalos"],
  ["travel", "Travel & stay", "Viaje y hospedaje"],
  ["faq", "Good to know", "Lo que debes saber"],
  ["guestbook", "A note for Sophia", "Un mensaje para Sophia"],
  ["contact", "Contact us", "Contáctanos"],
  ["privacy", "Privacy policy", "Política de privacidad"],
  ["terms", "Media policy", "Política de medios"],
  ["whatsapp", "WhatsApp Updates", "Mensajes WhatsApp"],
  ["sms", "SMS Updates", "Mensajes SMS"],
  ["sms-terms", "SMS Terms", "Términos SMS"],
  ["thank-you", "With love & thanks", "Con cariño y gratitud"],
  ["404", "Page not found", "Página no encontrada"],
];
export const adminRoutes = [
  ["admin/login", "Administrator login"],
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
export const copy = {
  en: {
    date: "Friday, January 15, 2027",
    deadline: "November 15, 2026 · 11:59 PM Central",
    tagline: "A celebration of grace and golden dreams.",
    intro: "Today begins a new chapter… join me to celebrate it.",
    rsvp: "Respond to your invitation",
    all: "Explore the celebration",
    home: "Home",
    details: "Celebration",
    people: "Our people",
    memories: "Memories",
    help: "Guest guide",
    language: "Español",
    pending: "The family will share this detail here soon.",
    time: "All times are local to Fort Worth, Texas.",
    contact: "Questions? Contact the family",
    invitationCaption: "Open the full invitation in a new tab ↗",
    deadlineLabel: "Please RSVP by",
    footer: "With love,",
    loading: "Loading…",
  },
  es: {
    date: "Viernes, 15 de enero de 2027",
    deadline: "15 de noviembre de 2026 · 11:59 p. m. (hora central)",
    tagline: "Una celebración de gracia y sueños dorados.",
    intro: "Hoy comienza un nuevo capítulo… acompáñame a celebrarlo.",
    rsvp: "Responde a tu invitación",
    all: "Explora la celebración",
    home: "Inicio",
    details: "Celebración",
    people: "Nuestra gente",
    memories: "Recuerdos",
    help: "Guía para invitados",
    language: "English",
    pending: "La familia compartirá este detalle aquí pronto.",
    time: "Todos los horarios son de Fort Worth, Texas.",
    contact: "¿Preguntas? Contacta a la familia",
    invitationCaption: "Abre la invitación completa en otra pestaña ↗",
    deadlineLabel: "Confirma antes del",
    footer: "Con cariño,",
    loading: "Cargando…",
  },
};
export const textContent = {
  sophia: [
    ["A new chapter", "Un nuevo capítulo"],
    [
      "Turning fifteen is a moment to celebrate family, friendship, faith and the dreams ahead. Join Sophia for this special day.",
      "Cumplir quince años es una ocasión para celebrar la familia, la amistad, la fe y los sueños por venir. Acompaña a Sophia en este día especial.",
    ],
    [
      "A message from Sophia and her parents will be added after the family shares it.",
      "Agregaremos un mensaje de Sophia y sus padres cuando la familia lo comparta.",
    ],
  ],
  court: [
    ["By her side", "A su lado"],
    [
      "The court of honor will join Sophia in celebrating this milestone.",
      "La corte de honor acompañará a Sophia en esta celebración.",
    ],
    [
      "The family is preparing the names, roles and portraits.",
      "La familia está preparando los nombres, los roles y los retratos.",
    ],
  ],
  padrinos: [
    ["For every act of love", "Por cada muestra de cariño"],
    [
      "This celebration brings together the love and support of family and friends.",
      "Esta celebración reúne el cariño y el apoyo de familiares y amigos.",
    ],
    [
      "Acknowledgements and padrino roles will be shared with the family’s approval.",
      "Compartiremos los agradecimientos y los roles de los padrinos con la aprobación de la familia.",
    ],
  ],
  travel: [
    ["Make yourself at home", "Siéntete como en casa"],
    [
      "The celebration takes place in Fort Worth, Texas. Use the reception address to plan your route and allow time between venues.",
      "La celebración será en Fort Worth, Texas. Usa la dirección de la recepción para planear tu ruta y deja tiempo para trasladarte entre los lugares.",
    ],
    [
      "Hotel suggestions, airport transportation and any room blocks will be shared once confirmed. Contact the family before making plans that depend on an unconfirmed detail.",
      "Compartiremos sugerencias de hoteles, transporte y tarifas de grupo cuando estén confirmados. Consulta con la familia antes de reservar algo que dependa de un detalle pendiente.",
    ],
  ],
  "thank-you": [
    ["A chapter to remember", "Un capítulo para recordar"],
    ["We look forward to celebrating together.", "Esperamos celebrar juntos."],
    [
      "After January 15, this page will hold Sophia’s thank-you message and any approved highlights from the celebration.",
      "Después del 15 de enero, aquí encontrarás el mensaje de agradecimiento de Sophia y los recuerdos aprobados de la celebración.",
    ],
  ],
};
