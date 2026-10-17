// One name per thing, in English and Mexican Spanish, and who the Spanish
// addresses on each page. The pages, the browser scripts, the emails and the
// server replies take shared wording from here, so a wording decision is made
// once; tests/language.test.mjs fails on the variants listed in `banned`.
//
// Spanish form of address (the family's rule, from the round 2 review):
//   - the hosts speaking to an invited family: ustedes (the RSVP and its
//     confirmation, the home page, the family's emails);
//   - the hosts speaking to one person, and information pages: tú;
//   - never usted; Sophia's own words are hers and keep their tú;
//   - chrome shared by every page (header, buttons, titles): neutral nouns or
//     infinitives, so it never carries a form into a page.
// Values in `terms` are { en, es }. A Spanish value that depends on who is
// addressed is { tu, ustedes }; say() picks the form for the page.

export const terms = {
  siteName: { en: "Sophia’s Quinceañera", es: "Los XV de Sophia" },
  eventProse: { en: "Sophia’s quinceañera", es: "los XV de Sophia" },
  // The home page's first line; Spanish in both languages ("mis" is plural).
  eyebrow: { en: "MIS XV AÑOS", es: "MIS XV AÑOS" },
  rsvpAction: { en: "RSVP", es: "Confirmar asistencia" },
  // The header pill: one word that fits a 320 px phone; the hidden part keeps
  // the accessible name equal to rsvpAction.
  rsvpPill: { en: "RSVP", es: "Confirmar" },
  rsvpPillHidden: { en: "", es: " asistencia" },
  rsvpRecord: { en: "RSVP", es: "respuesta" },
  yourRsvp: { en: "Your RSVP", es: { tu: "Tu respuesta", ustedes: "Su respuesta" } },
  reviewRsvp: { en: "Review your RSVP", es: "Revisar la respuesta" },
  saveRsvp: { en: "Save my RSVP", es: "Guardar la respuesta" },
  changeRsvp: { en: "Change your RSVP", es: "Cambiar la respuesta" },
  signIn: { en: "Sign in", es: "Entrar" },
  signInLink: { en: "sign-in link", es: "enlace de acceso" },
  myAccount: { en: "My account", es: "Mi cuenta" },
  signOut: { en: "Sign out", es: "Cerrar sesión" },
  note: { en: "note", es: "mensaje" },
  noteTitle: { en: "A note for Sophia", es: "Un mensaje para Sophia" },
  notesTitle: { en: "Notes for Sophia", es: "Mensajes para Sophia" },
  leaveNote: {
    en: "Leave Sophia a note",
    es: { tu: "Déjale un mensaje a Sophia", ustedes: "Déjenle un mensaje a Sophia" },
  },
  sendNote: { en: "Send my note", es: "Enviar mi mensaje" },
  messagesWithUs: { en: "Messages with us", es: "Mensajes con nosotros" },
  familyReplyLabel: { en: "Sophia’s family:", es: "La familia de Sophia:" },
  whatsappProgram: { en: "WhatsApp updates", es: "Avisos por WhatsApp" },
  smsProgram: { en: "SMS Updates", es: "Avisos por SMS" },
  smsTerms: { en: "SMS Terms", es: "Términos de SMS" },
  photos: { en: "Photos", es: "Fotos" },
  photosAndNotes: { en: "Photos & notes", es: "Fotos y mensajes" },
  sharePhotos: { en: "Share your photos", es: "Compartir fotos" },
  family: { en: "family", es: "familia" },
  ceremonyLong: { en: "Religious ceremony", es: "Ceremonia religiosa" },
  ceremony: { en: "Ceremony", es: "Ceremonia" },
  dinner: { en: "Dinner", es: "Cena" },
  receptionDance: { en: "Reception & dance", es: "Recepción y baile" },
  dinnerAndReception: { en: "Dinner & reception", es: "Cena y recepción" },
  schedule: { en: "Schedule", es: "Programa" },
  gifts: { en: "Gifts", es: "Mesa de regalos" },
  invitationLink: { en: "invitation link", es: "enlace de invitación" },
  invitationCode: { en: "invitation code", es: "código de invitación" },
  everyoneComing: { en: "Everyone’s coming", es: "Vamos todos" },
  cantMakeIt: { en: "We can’t make it", es: "No podremos asistir" },
  contactUs: { en: "Contact us", es: { tu: "Escríbenos", ustedes: "Escríbannos" } },
  timeZoneNote: {
    en: "All times are Fort Worth, Texas time.",
    es: "Todos los horarios son de Fort Worth, Texas.",
  },
};

// Who the Spanish addresses on each page (by route; "" is the home page).
// Pages not listed address one person (tú).
export const registers = {
  "": "ustedes",
  rsvp: "ustedes",
  "rsvp/confirmed": "ustedes",
  "thank-you": "ustedes",
  "404": "neutral",
  sophia: "neutral",
  court: "neutral",
  padrinos: "neutral",
};
export const registerFor = (route) => registers[route] ?? "tu";

// The text of a term in a language, in the page's form of address.
export function say(entry, lang, register = "tu") {
  if (!entry) throw new Error("Unknown lexicon entry");
  const value = entry[lang === "es" ? "es" : "en"];
  if (typeof value === "string") return value;
  if (!value || typeof value.tu !== "string" || typeof value.ustedes !== "string")
    throw new Error("A Spanish entry with two forms needs both tu and ustedes");
  return register === "ustedes" ? value.ustedes : value.tu;
}

// Variants that must not appear in what guests read: the decisions above,
// enforced by tests/language.test.mjs over the built pages, the guest scripts,
// the emails and the server replies.
export const banned = {
  en: [
    [/\bguestbook\b/i, "the note's name is 'note' (A note for Sophia)"],
    [/\bLog in\b|\blogin\b/i, "use Sign in"],
    [/\bEdit response\b|\bReview response\b|\bYour response\b/, "the saved answer is 'your RSVP'"],
    [/\bPlease reply by\b/, "the deadline sentence is 'Please RSVP by …'"],
    [/\bdisplay name\b/i, "say 'Your name, as you'd like it to appear'"],
  ],
  es: [
    [/libro de firmas/i, "el mensaje para Sophia se llama 'mensaje'"],
    [/iniciar sesi[oó]n|inicia sesi[oó]n|iniciando sesi[oó]n/i, "usar 'Entrar' / 'acceso'"],
    [/MIS QUINCEAÑERA/i, "'mis' es plural: 'MIS XV AÑOS'"],
    [/Responder ahora|Preguntas sobre RSVP/, "una sola forma: 'Confirmar asistencia'"],
    [/Confirma tu asistencia/, "título neutro: 'Confirmar asistencia'"],
    [/Mensajes WhatsApp|Actualizaciones por WhatsApp|novedades del evento por WhatsApp/i, "'Avisos por WhatsApp'"],
    [/Nombre para mostrar/, "'Tu nombre, como quieres que aparezca'"],
    [/\bhogar\b/i, "'familia'"],
    [/\b\d{1,2}:\d{2} ?p\.m\.|\b\d{1,2}:\d{2} ?a\.m\./, "la hora se escribe '4:00 p. m.' (con espacio)"],
  ],
};
