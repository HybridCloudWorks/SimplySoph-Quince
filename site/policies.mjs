import { date } from "./datetime.mjs";
import { milestones } from "./lifecycle.mjs";
import { celebration } from "./celebration.mjs";
import { event } from "./content.mjs";
// The privacy and photo & video policies, in the family's own voice ("we" is
// Sophia's family). Each entry is one paragraph; an entry starting "- " is a
// list item, and consecutive items form one list under the paragraph before.
//
// One retention statement, used on every page that mentions how long we keep
// information (privacy, WhatsApp). February 1, 2027 is the family's review
// date (DATA_RETENTION_DATE, docs/cleanup.md); no automatic deletion is scheduled.
// A photo lifespan the family sets (site.lifespan.photosUntil,
// server/site-settings.mjs) can never end before it (tests/lifespan.test.mjs).
export const retentionReview = "2027-02-01";
const reviewOn = (lang) => date(retentionReview + "T12:00:00-06:00", lang, { weekday: false });
const retention = {
  en: `After the celebration, starting ${reviewOn("en")}, we review the information we collected for it and delete what we no longer need. You can ask us to delete your information at any time.`,
  es: `Después de la celebración, a partir del ${reviewOn("es")}, revisamos la información que reunimos para ella y borramos lo que ya no necesitamos. Puedes pedirnos que borremos tu información en cualquier momento.`,
};
// The same sentence continuing a list item: "How long we keep it: after …".
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
// Who "Simply Soph Media" is. The SMS program registered under that name
// (a sole-proprietor brand) is run by the family itself.
const host = {
  en: "Simply Soph Media is the name Sophia’s family uses for her quinceañera messages. It’s us, not a company.",
  es: "Simply Soph Media es el nombre que usa la familia de Sophia para los mensajes de sus XV; somos nosotros, no una empresa.",
};
// The printed table card (R-021, R-161), as the code runs it: off until we
// turn it on in Admin (server/party-card.mjs); while on, anyone with its QR
// code can send photos and videos without signing in, from the ceremony's
// start until the end of the upload window's last day (site/lifecycle.mjs
// uploadsFrom/uploadsUntil, Fort Worth time; the day is worked out from the
// checked-in schedule). What that collects, matching server/application.mjs
// (files, an optional name and caption, the consent time, a random per-visit
// code in the session cookie for the per-phone count; no email, no IP
// address), the counts' deletion a week after that window closes (the
// scheduled job, forgetPartyPhonesIfDue), the same review queue, and how to
// ask for removal (the reference the upload page shows after each file).
const lastDay = (lang) =>
  date(milestones({ deadline: event.deadline, site: celebration }).uploadsUntil - 1, lang, { weekday: false, year: false });
const tableCard = {
  privacy: {
    en: `- Photos from the table card: the card on the tables is off unless we turn it on. While it is on, anyone with its QR code can send us photos and videos without signing in, from the start of the ceremony until the end of ${lastDay("en")} (Fort Worth time). We keep the files, when you agreed to our Photo & video policy, and a name and caption only if you type them. We don’t ask for your email. To count how many each phone sends, we give your visit a random code through a cookie, never your IP address or anything about your phone, and we delete those counts a week after sharing from the card closes. Every file waits for our review, and only guests who sign in see the ones we approve. To have one removed, email us the reference shown after you sent it.`,
    es: `- Fotos desde la tarjeta de la mesa: la tarjeta de la mesa está desactivada salvo que la activemos. Mientras está activa, cualquier persona con su código QR puede enviarnos fotos y videos sin entrar a una cuenta, desde el inicio de la ceremonia hasta el final del ${lastDay("es")} (hora de Fort Worth). Guardamos los archivos, cuándo aceptaste nuestra política de uso de fotos y videos y, solo si los escribes, el nombre y la descripción. No te pedimos tu correo. Para contar cuántos envía cada teléfono, le damos a tu visita un código al azar mediante una cookie, nunca tu dirección IP ni datos de tu teléfono, y borramos esos conteos una semana después de que se cierre el envío desde la tarjeta. Revisamos cada archivo, y solo los invitados que entran al sitio ven los que aprobamos. Para que quitemos alguno, escríbenos con la referencia que aparece después de enviarlo.`,
  },
  terms: {
    en: "- While the table card is on, you can share from it without signing in. The same rules apply, and each file shows a reference after it arrives: email it to misxv@simplysoph.com to have that file removed.",
    es: "- Mientras la tarjeta de la mesa está activa, puedes compartir desde ella sin entrar a una cuenta. Se aplican las mismas reglas, y cada archivo muestra una referencia cuando llega: envíala a misxv@simplysoph.com para que quitemos ese archivo.",
  },
};
// What this device keeps after an RSVP (R-160, site/now.mjs "misxv-replied"):
// "yes" or "no" and when, so the home page can say "You replied" next time;
// no name. Read after the party it is deleted, and signing out deletes it.
const deviceNote = {
  en: "- On this device: after you RSVP, the site remembers whether your family replied (yes or no) and when, so the home page can say so next time. It keeps no name or other detail, and it is deleted the first time you open the site after the party, when you sign out, or when you clear this site’s data in your browser.",
  es: "- En este dispositivo: cuando confirmas tu asistencia, el sitio recuerda si tu familia respondió (sí o no) y cuándo, para que la página de inicio lo diga la próxima vez. No guarda ningún nombre ni otro dato, y se borra la primera vez que abres el sitio después de la fiesta, cuando cierras sesión o cuando borras los datos de este sitio en tu navegador.",
};
export const policies = {
  retention,
  host,
  tableCard,
  privacy: {
    en: [
      "This website is for the family and friends we invited to Sophia’s quinceañera. " +
        host.en,
      "In short:",
      "- What we collect: your family’s names and contact details from our guest list, your RSVP, and anything you choose to send us, such as messages, photos, videos, a mailing address or a phone number for updates.",
      "- Who sees it: only us (Sophia’s family) and the few people helping us run the celebration. Photos and videos we approve are shown only to guests who sign in. The public pages never show the guest list.",
      "- What we never do: sell your information, use it for advertising, or add ads or analytics trackers to this site.",
      tableCard.privacy.en,
      deviceNote.en,
      "- To see, correct or delete your information: email misxv@simplysoph.com.",
      "- How long we keep it: " + lowerFirst(retention.en),
      "The details are below.",
    ],
    es: [
      "Este sitio es para los familiares y amigos que invitamos a los XV de Sophia. " +
        host.es,
      "En resumen:",
      "- Qué guardamos: los nombres y datos de contacto de tu familia que tenemos en nuestra lista de invitados, tu respuesta y lo que decidas enviarnos, como mensajes, fotos, videos, una dirección postal o un teléfono para recibir avisos.",
      "- Quién lo ve: solo nosotros (la familia de Sophia) y las pocas personas que nos ayudan a organizar la celebración. Las fotos y los videos que aprobamos solo los ven los invitados que entran al sitio. Las páginas públicas nunca muestran la lista de invitados.",
      "- Lo que nunca hacemos: vender tu información, usarla para publicidad ni poner en este sitio anuncios o rastreadores de visitas.",
      tableCard.privacy.es,
      deviceNote.es,
      "- Para ver, corregir o borrar tu información: escríbenos a misxv@simplysoph.com.",
      "- Cuánto tiempo la guardamos: " + lowerFirst(retention.es),
      "Abajo están los detalles.",
    ],
  },
  terms: {
    en: [
      "Photos and videos on this site are for us and our guests. When you share photos or videos with us:",
      "- Please share only photos and videos you took or have permission to share.",
      "- Ask a parent before sharing photos of children.",
      "- We look at every upload before anyone else can see it, and we may decide not to show some.",
      "- The ones we approve are shown only on this private site, to guests who sign in.",
      "- We may include them in family keepsakes of the celebration, like Sophia’s photo album or a highlight video.",
      "- We never sell them or use them in advertising.",
      tableCard.terms.en,
      "By uploading, you give us, Sophia’s family, permission to store your photos and videos, show them to signed-in guests on this site, and use them in family keepsakes of the celebration. The photos are still yours; this permission is only for those uses.",
      "Want something removed? Email misxv@simplysoph.com and we’ll take it off the site and leave it out of any keepsakes we haven’t made yet.",
      "Please don’t post other guests’ photos publicly, for example on social media, without asking them first.",
      "There will be photos and videos at the celebration, and you may appear in some of them. We use them only on this private site and in family keepsakes. If you’d rather not appear, let us know.",
      "The photos, invitation artwork and design of this site are ours or used with permission. Please ask us before using them for anything other than a personal keepsake.",
    ],
    es: [
      "Las fotos y los videos de este sitio son para nosotros y nuestros invitados. Cuando compartes fotos o videos con nosotros:",
      "- Por favor, comparte solo fotos y videos que hayas tomado o que tengas permiso de compartir.",
      "- Si salen niños, pide permiso a sus papás antes de compartirlos.",
      "- Revisamos cada archivo antes de que alguien más lo vea, y podemos decidir no mostrar algunos.",
      "- Solo los invitados que entran a este sitio privado pueden ver los que aprobamos.",
      "- Podemos incluirlos en recuerdos familiares de la celebración, como el álbum de fotos de Sophia o un video con los mejores momentos.",
      "- Nunca los vendemos ni los usamos en publicidad.",
      tableCard.terms.es,
      "Al subir fotos o videos, nos das permiso a nosotros, la familia de Sophia, para guardarlos, mostrarlos a los invitados que entran a este sitio y usarlos en recuerdos familiares de la celebración. Las fotos siguen siendo tuyas; este permiso es solo para esos usos.",
      "¿Quieres que quitemos algo? Escríbenos a misxv@simplysoph.com y lo quitaremos del sitio y de los recuerdos que todavía no hayamos hecho.",
      "Por favor, no publiques fotos de otros invitados, por ejemplo en redes sociales, sin preguntarles primero.",
      "En la celebración habrá fotos y videos, y es posible que salgas en algunos. Solo los usamos en este sitio privado y en recuerdos familiares. Si prefieres no salir, avísanos.",
      "Las fotos, la invitación y el diseño de este sitio son nuestros o los usamos con permiso. Pregúntanos antes de usarlos para algo que no sea un recuerdo personal.",
    ],
  },
};
// When each policy last changed, shown as "Updated <date>" at its top (one
// constant per policy, read by scripts/build-pages.mjs). `text` fingerprints
// the policy as published, in both languages: tests/policies.test.mjs fails
// when a policy's words change and this entry does not, and prints the new
// fingerprint to record here together with the date of the change.
export const policyUpdated = {
  // Who can read the notes for Sophia (and who reads a note kept off the
  // page); the table card as it works (off until we turn it on, its window,
  // when its counts go); what this device keeps after an RSVP. Then the
  // round 5 wording review (the same day): the hosts say "we", one Spanish
  // word for marketing, the table card's sentence reordered.
  privacy: { on: "2026-10-17", text: "20dbd31afb2d8794" },
  // Sharing from the table card while it is on; "for us and our guests".
  terms: { on: "2026-10-17", text: "2f61d7efc7921588" },
  // The Spanish page: the registered replies arrive in English, and the
  // party is "los XV de Sophia"; "con fines de mercadotecnia".
  "sms-terms": { on: "2026-10-17", text: "a6d797224466c822" },
};
// "Updated October 17, 2026" · "Actualizado el 17 de octubre de 2026".
export function updatedOn(route, lang) {
  const day = date(policyUpdated[route].on + "T12:00:00-06:00", lang, { weekday: false });
  return lang === "es" ? "Actualizado el " + day : "Updated " + day;
}
