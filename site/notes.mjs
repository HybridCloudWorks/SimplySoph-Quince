// Who can read the notes for Sophia, decided in one place.
//
// The family sets one runtime switch, site.guestbook.visibility, on
// Admin → Messages: "guests" (the default: only guests signed in with their
// email, and administrators) or "public" (anyone with the site's address). The
// API enforces it (server/application.mjs), and every sentence a guest reads
// about it (the note page, the box on the note form, the Privacy page) is
// chosen here from the same value, read from /api/site at runtime.
//
// Each note also keeps the audience its writer agreed to ("display"):
//   "family"  the box was left unchecked: only we read it (Sophia's family and
//             the few people helping us run the celebration, who review notes
//             in Admin), and no guest ever sees it;
//   "guests"  shown to signed-in guests once approved;
//   "public"  shown to anyone once approved, while the switch is "public".
// A note is shown to the narrower of the two, so a note written under "guests"
// never becomes public when the switch moves to "public". Notes saved before
// this choice existed were sent under the required statement "We may publish
// this name and message after we read them." and count as "public".
//
// The choice reached guests before the API that stores it: the pages of #104
// (b3546fa) were published at 2026-10-17T03:22:00Z while the live API was
// still revision 00031, which ignores `audience` and stores no `display`
// (QA-03). From that moment a note without a stored choice may have been
// written as "show to guests who sign in", so it counts as "guests", the
// narrower reading; only notes before it keep the legacy "public".
export const choiceLiveFrom = Date.parse("2026-10-17T03:22:00Z");
export const visibilities = ["guests", "public"];
export const visibilityOf = (site) =>
  site?.guestbook?.visibility === "public" ? "public" : "guests";
const rank = { family: 0, guests: 1, public: 2 };
export const consentOf = (note) =>
  Object.hasOwn(rank, note?.display)
    ? note.display
    : Number.isFinite(note?.at) && note.at < choiceLiveFrom
      ? "public"
      : "guests";
// Who may see this note now: "family", "guests" or "public".
export function audienceOf(note, visibility) {
  const consent = consentOf(note),
    setting = visibility === "public" ? "public" : "guests";
  return rank[consent] <= rank[setting] ? consent : setting;
}
// What the writer agrees to by ticking the box, given the wording they saw
// (`audience`, sent by the note form). A page from before this choice sends
// no audience: its required box said "We may publish this name and message
// after we read them.", so it counts as "public", like the notes kept from then.
export const displayFor = (consent, audience) =>
  consent !== true ? "family" : audience === "guests" ? "guests" : "public";

// Guest-facing sentences, { guests, public } × { en, es }. The note page and
// Privacy speak to one person (tú). Who reads a note kept off the page is
// said as Privacy says who sees guests' information (site/policies.mjs):
// Sophia's family and the few people helping us, not "only her family" (R-040).
export const noteWords = {
  // Under "Notes for Sophia" on the note page.
  audience: {
    guests: {
      en: "Only guests who sign in can see the notes here, and only after we read them.",
      es: "Solo los invitados que entran al sitio pueden ver los mensajes de esta página, y solo después de que los hayamos leído.",
    },
    public: {
      en: "Anyone with the site’s address can see the notes here, after we read them.",
      es: "Cualquier persona con la dirección del sitio puede ver los mensajes de esta página, después de que los hayamos leído.",
    },
  },
  // One sentence on the Privacy page.
  privacy: {
    guests: {
      en: "We read every note for Sophia before it appears on “A note for Sophia”, and only guests who sign in can see the notes there. If you leave the box to show your note unchecked, only we and the few people helping us run the celebration read it.",
      es: "Leemos cada mensaje para Sophia antes de que aparezca en “Un mensaje para Sophia”, y solo los invitados que entran al sitio pueden ver los mensajes ahí. Si dejas sin marcar la casilla para mostrar tu mensaje, solo lo leemos nosotros y las pocas personas que nos ayudan a organizar la celebración.",
    },
    public: {
      en: "We read every note for Sophia before it appears on “A note for Sophia”, and anyone with the site’s address can see the notes there. If you leave the box to show your note unchecked, only we and the few people helping us run the celebration read it.",
      es: "Leemos cada mensaje para Sophia antes de que aparezca en “Un mensaje para Sophia”, y cualquier persona con la dirección del sitio puede ver los mensajes ahí. Si dejas sin marcar la casilla para mostrar tu mensaje, solo lo leemos nosotros y las pocas personas que nos ayudan a organizar la celebración.",
    },
  },
  // The box on the note form: unchecked by default, a real choice.
  consent: {
    guests: {
      en: "Show my name and note on this page to guests who sign in, once you’ve read it.",
      es: "Pueden mostrar mi nombre y mi mensaje en esta página a los invitados que entran al sitio, después de leerlo.",
    },
    public: {
      en: "Show my name and note on this page once you’ve read it. Anyone with the site’s address can see this page.",
      es: "Pueden mostrar mi nombre y mi mensaje en esta página después de leerlo. Cualquier persona con la dirección del sitio puede ver esta página.",
    },
  },
  consentHint: {
    en: "Leave it unchecked and only we and the few people helping us will read your note.",
    es: "Si no la marcas, solo nosotros y las pocas personas que nos ayudan leeremos tu mensaje.",
  },
};
// Which wording a writer agreed to, stored with each new note (never shown to
// guests), so a later change of these sentences stays auditable (R-167): the
// audience the box was worded for, and a fingerprint (FNV-1a) of the box and
// its hint in both languages. A page that sent no audience showed the old
// required statement. Notes from before this have none.
export function consentVersion(audience) {
  if (!visibilities.includes(audience)) return "required-statement";
  let h = 2166136261;
  for (const c of JSON.stringify([noteWords.consent[audience], noteWords.consentHint]))
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `${audience}-${(h >>> 0).toString(16).padStart(8, "0")}`;
}
export const noteSentence = (kind, visibility, lang) =>
  noteWords[kind][visibility === "public" ? "public" : "guests"][lang === "es" ? "es" : "en"];
