// One name per thing, in English and Mexican Spanish, and who the Spanish
// addresses on each page. The pages, the browser scripts, the emails and the
// server replies take shared wording from here, so a wording decision is made
// once; tests/language.test.mjs fails on the variants listed in `banned`, and
// on a page or an email that mixes the two forms of address.
//
// Spanish form of address (the family's rule, from the round 2 review):
//   - the hosts speaking to an invited family: ustedes (the RSVP and its
//     confirmation, the home page, the thank-you page, the family's emails,
//     and those pages' link previews);
//   - the hosts speaking to one person, and information pages: tú (My
//     account, the sign-in email, the venue and policy pages, the WhatsApp
//     replies and the WhatsApp card, which is one phone's own choice);
//   - never usted; Sophia's own words are hers and keep their tú;
//   - chrome shared by every page (header, buttons, titles): neutral nouns or
//     infinitives, so it never carries a form into a page.
// Values in `terms` are { en, es }. A Spanish value that depends on who is
// addressed is { tu, ustedes }; say() picks the form for the page.
//
// In the browser every page carries its form on <body data-register> (the
// build writes registers[route] there) and site/client.js reads it: tr(en, es)
// takes the Spanish as a string or as { tu, ustedes }, and term(entry) says
// an entry below, both in the page's language and form. Admin's check of the
// Spanish free text in the event settings (server/copy-check.mjs) uses
// `banned` too.

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
  // The deadline sentence, before the date: "Please RSVP by Sunday, November
  // 15." (the approved WhatsApp templates' verb too).
  rsvpBy: {
    en: "Please RSVP by",
    es: {
      tu: "Por favor, confirma tu asistencia a más tardar el",
      ustedes: "Por favor, confirmen su asistencia a más tardar el",
    },
  },
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
  seePhotos: { en: "See the photos", es: "Ver las fotos" },
  seeSchedule: { en: "See the schedule", es: "Ver el programa" },
  // The gallery's action for saving every approved photo and video at once.
  downloadAll: { en: "Download all photos", es: "Descargar todas las fotos" },
  family: { en: "family", es: "familia" },
  // What a saved calendar event is part of: "<this> — Religious ceremony".
  calendarTitle: { en: "Sophia’s quinceañera", es: "XV de Sophia" },
  ceremonyLong: { en: "Religious ceremony", es: "Ceremonia religiosa" },
  ceremony: { en: "Ceremony", es: "Ceremonia" },
  dinner: { en: "Dinner", es: "Cena" },
  receptionDance: { en: "Reception & dance", es: "Recepción y baile" },
  dinnerAndReception: { en: "Dinner & reception", es: "Cena y recepción" },
  schedule: { en: "Schedule", es: "Programa" },
  gifts: { en: "Gifts", es: "Mesa de regalos" },
  invitationLink: { en: "invitation link", es: "enlace de invitación" },
  invitationCode: { en: "invitation code", es: "código de invitación" },
  // The code field's hint. A code (server/auth.mjs invitationCode) is 16
  // characters of A–Z and 2–7, shown in groups of four; the example is made
  // up and stops after two groups, so it can never be a real code.
  invitationCodeHint: {
    en: "For example misxv.simplysoph.com/rsvp/#… from your invitation email or message, or a code of 16 letters and numbers, like ABCD-EFGH-…",
    es: "Por ejemplo, misxv.simplysoph.com/rsvp/#… del correo o mensaje de invitación, o un código de 16 letras y números, como ABCD-EFGH-…",
  },
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
    [/\b(?:edit|review|your|saved) response\b/i, "the saved answer is 'your RSVP'"],
    [/\bPlease (?:reply|let us know) by\b|\bLeft to reply\b/, "the deadline sentence is 'Please RSVP by …'"],
    [/\bdisplay name\b/i, "say 'Your name, as you'd like it to appear'"],
    [/\bRSVP link\b/i, "the private link is the 'invitation link'"],
    [/\bWe['’]ll be there\b/i, "the quick answers are 'Everyone’s coming' and 'We can’t make it'"],
    [/\bhousehold\b/i, "the invited group is the 'family'"],
    [/\bPhotographs\b|\bThe video collection\b/, "'Photos' and 'Videos'"],
  ],
  es: [
    [/libro de firmas/i, "el mensaje para Sophia se llama 'mensaje'"],
    [/iniciar sesi[oó]n|inicia sesi[oó]n|iniciando sesi[oó]n/i, "usar 'Entrar' / 'acceso'"],
    [/Tu enlace para entrar/, "'Tu enlace de acceso'"],
    [/MIS QUINCEAÑERA/i, "'mis' es plural: 'MIS XV AÑOS'"],
    [/Responder ahora|Preguntas sobre RSVP|botón para responder/, "una sola forma: 'Confirmar asistencia'"],
    [/Confirma tu asistencia/, "título neutro: 'Confirmar asistencia'"],
    [/Fecha límite para responder/, "la fecha límite: 'confirmen su asistencia a más tardar el …'"],
    [/Editar respuesta|Cambiar tu respuesta|Revisar respuesta\b/, "botones neutros: 'Cambiar la respuesta', 'Revisar la respuesta'"],
    [/Mensajes WhatsApp|Actualizaciones por WhatsApp|novedades del evento por WhatsApp/i, "'Avisos por WhatsApp'"],
    [/Mensajes SMS|Términos SMS/, "'Avisos por SMS', 'Términos de SMS'"],
    [/recordatorios de (?:confirmación|asistencia)/i, "'recordatorios para confirmar'"],
    [/Nombre para mostrar/, "'Tu nombre, como quieres que aparezca'"],
    [/\bhogar\b/i, "'familia'"],
    [/comunícate con nosotros/i, "'escríbenos' / 'escríbannos'"],
    [/Ahí estaremos|No podremos ir\b/, "las respuestas rápidas: 'Vamos todos' y 'No podremos asistir'"],
    [/quinceañera de Sophia/i, "la fiesta es 'los XV de Sophia' (la quinceañera es Sophia)"],
    [/Fotografías|La colección de videos/, "'Fotos' y 'Videos'"],
    [/\b\d{1,2}:\d{2}\s?[ap]\.m\./, "la hora se escribe '4:00 p. m.' (con espacio)"],
    [/\b(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo), \d/i, "sin coma después del día: 'viernes 15 de enero de 2027'"],
    [/\b\d{1,2} de (?:Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\b/, "los meses van en minúscula"],
    [/\b\d{1,2}\s(?:ene|feb|mar|abr|may|jun|jul|ago|sept?|oct|nov|dic)\b/i, "el mes completo: '16 de enero'"],
  ],
};
