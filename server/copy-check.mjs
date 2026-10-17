// A check of Spanish wording against the site's decisions (site/lexicon.mjs):
// the retired variants in `banned.es`, and the two forms of address. Admin
// runs it on the Spanish free text of the event settings and announcements,
// which live on the server rather than in this repository, and shows what it
// finds as a warning the family may ignore; tests/language.test.mjs runs it on
// every built page and email.
//
// The forms are told apart by words only one of them uses, as this site
// writes them: the tú forms the round 2 review kept for one person and the
// ustedes forms it gave the household. The lists are a regression guard, not
// a grammar: a new imperative needs adding here. Words that are just as often
// third person ("pueden", "usa", "su familia") are left out on purpose.
import { banned } from "../site/lexicon.mjs";

export const TU = [
  "tú", "tu", "tus", "te", "ti", "contigo",
  "puedes", "podrás", "tienes", "quieres", "necesitas", "recibiste", "entraste", "pediste",
  "respondiste", "solicitaste", "elegiste", "estás", "eres",
  "confirma", "entra", "abre", "revisa", "elige", "escribe", "escríbenos", "inténtalo",
  "vuelve", "prueba", "pide", "actualízala", "agrega", "comparte", "déjale", "envía",
  "envíanos", "responde", "silencia", "calcula", "consulta", "avísanos", "guarda", "solicita",
  "toca", "recarga", "continúa", "pregúntanos", "selecciona", "cancela", "siéntete",
  "mantente", "espera", "completa",
];
export const USTEDES = [
  "ustedes", "les",
  "confirmen", "entren", "abran", "revisen", "elijan", "escríbannos", "usen", "prueben",
  "pidan", "vuelvan", "esperen", "inténtenlo", "actualícenla", "recarguen", "toquen",
  "agreguen", "respondan", "déjenle", "acompáñennos", "avísennos", "reenvíen", "compartan",
  "peguen", "escriban", "podrán", "volvieron", "empezaron", "recibieron", "necesitan",
  "encontrarán", "su respuesta", "sus respuestas", "su invitación", "su correo", "su acceso",
  "su conexión", "su asistencia", "su enlace", "su cariño", "los esperamos",
  "los vamos a extrañar", "los extrañamos", "nos acompañarán",
];
// Exceptions where a listed word is not a form of address: "se abre" (it
// opens), "invitación abre" (the link opens), "invitación completa" (whole),
// "la espera" (the wait).
const NOT = {
  abre: /(?:\bse|invitación) abre$/i,
  completa: /invitación completa$/i,
  espera: /\bla espera$/i,
};
const word = (w) => new RegExp(`(?<![\\p{L}])${w}(?![\\p{L}])`, "giu");
const lists = { tu: TU.map((w) => [w, word(w)]), ustedes: USTEDES.map((w) => [w, word(w)]) };
// The tú and the ustedes words a Spanish text uses.
export function addressWords(text) {
  const found = { tu: new Set(), ustedes: new Set() };
  for (const form of ["tu", "ustedes"])
    for (const [w, re] of lists[form])
      for (const m of String(text).matchAll(re)) {
        const before = String(text).slice(0, m.index + m[0].length);
        if (NOT[w]?.test(before)) continue;
        found[form].add(m[0].toLowerCase());
      }
  return { tu: [...found.tu], ustedes: [...found.ustedes] };
}
// What Admin says about one Spanish text: each retired variant it uses, and
// whether it mixes tú and ustedes or uses the form its page does not
// (`expect`: "tu" | "ustedes" | undefined; `address: false` checks only the
// variants, for words that are someone's own). Plain English for the family.
export function spanishNotes(text, { expect, address = true } = {}) {
  const notes = [];
  for (const [re, why] of banned.es) {
    const m = String(text).match(re);
    if (m) notes.push(`“${m[0]}”: ${why}`);
  }
  if (!address) return notes;
  const { tu, ustedes } = addressWords(text);
  if (tu.length && ustedes.length)
    notes.push(`Mixes tú (${tu.join(", ")}) and ustedes (${ustedes.join(", ")}). Pick one.`);
  else if (expect === "ustedes" && tu.length)
    notes.push(`Uses tú (${tu.join(", ")}) where the page speaks to the family (ustedes).`);
  else if (expect === "tu" && ustedes.length)
    notes.push(`Uses ustedes (${ustedes.join(", ")}) where the page speaks to one person (tú).`);
  return notes;
}
// The Spanish free text of the event settings, each with the page that shows
// it and that page's form: the venue notes and the gift list on information
// pages (tú), Contact's host line (tú). Sophia's message is hers, so only the
// retired variants are checked there.
export function settingsWarnings(site) {
  const fields = [
    ["Homepage message (Español)", site?.quote?.es, "own"],
    ["Ceremony guest notes (Español)", site?.ceremony?.notes?.es, "tu"],
    ["Reception guest notes (Español)", site?.reception?.notes?.es, "tu"],
    ["Contact page host line (Español)", site?.contact?.host?.es, "tu"],
    ...(site?.albums || []).map((a) => [`Album “${a.id}” (Español)`, a.es, "tu"]),
    ...(site?.registries || []).map((r) => [`Registry “${r.name}” description (Español)`, r.description?.es, "tu"]),
  ];
  return fields.flatMap(([field, text, form]) => {
    if (typeof text !== "string" || !text.trim()) return [];
    const notes = form === "own" ? spanishNotes(text, { address: false }) : spanishNotes(text, { expect: form });
    return notes.map((note) => ({ field, note }));
  });
}
// An announcement shows on the home page, which speaks to the family (ustedes).
export const announcementWarnings = ({ titleEs = "", textEs = "" } = {}) =>
  [
    ["Spanish title", titleEs],
    ["Spanish message", textEs],
  ].flatMap(([field, text]) => (text ? spanishNotes(text, { expect: "ustedes" }).map((note) => ({ field, note })) : []));
