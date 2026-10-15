// The privacy and photo & video policies, in the family's own voice ("we" is
// Sophia's family). Each entry is one paragraph; an entry starting "- " is a
// list item, and consecutive items form one list under the paragraph before.
//
// One retention statement, used on every page that mentions how long we keep
// information (privacy, WhatsApp). February 1, 2027 is the family's review
// date (DATA_RETENTION_DATE, docs/cleanup.md); no automatic deletion is scheduled.
const retention = {
  en: "After the celebration, starting February 1, 2027, we review the information we collected for it and delete what we no longer need. You can ask us to delete your information at any time.",
  es: "Después de la celebración, a partir del 1 de febrero de 2027, revisamos la información que reunimos para ella y borramos lo que ya no necesitamos. Puedes pedirnos que borremos tu información en cualquier momento.",
};
// Who "Simply Soph Media" is. The SMS program registered under that name
// (a sole-proprietor brand) is run by the family itself.
const host = {
  en: "Simply Soph Media is the name Sophia’s family uses for her quinceañera messages. It’s us, not a company.",
  es: "Simply Soph Media es el nombre que usa la familia de Sophia para los mensajes de sus XV; somos nosotros, no una empresa.",
};
export const policies = {
  retention,
  host,
  privacy: {
    en: [
      "This website is for the family and friends we invited to Sophia’s quinceañera. " +
        host.en,
      "In short:",
      "- What we collect: your family’s names and contact details from our guest list, your RSVP, and anything you choose to send us, such as messages, photos, videos, a mailing address or a phone number for updates.",
      "- Who sees it: Sophia’s family and the few people helping us run the celebration. Photos and videos we approve are shown only to guests who sign in. The public pages never show the guest list.",
      "- What we never do: sell your information, use it for advertising, or add ads or analytics trackers to this site.",
      "- To see, correct or delete your information: email misxv@simplysoph.com.",
      "- How long we keep it: " + retention.en,
      "The details are below.",
    ],
    es: [
      "Este sitio es para los familiares y amigos que invitamos a los XV de Sophia. " +
        host.es,
      "En resumen:",
      "- Qué guardamos: los nombres y datos de contacto de tu familia que tenemos en nuestra lista de invitados, tu respuesta y lo que decidas enviarnos, como mensajes, fotos, videos, una dirección postal o un teléfono para recibir avisos.",
      "- Quién lo ve: la familia de Sophia y las pocas personas que nos ayudan a organizar la celebración. Las fotos y los videos que aprobamos solo los ven los invitados que entran al sitio. Las páginas públicas nunca muestran la lista de invitados.",
      "- Lo que nunca hacemos: vender tu información, usarla para publicidad ni poner en este sitio anuncios o rastreadores de visitas.",
      "- Para ver, corregir o borrar tu información: escríbenos a misxv@simplysoph.com.",
      "- Cuánto tiempo la guardamos: " + retention.es,
      "Abajo están los detalles.",
    ],
  },
  terms: {
    en: [
      "Photos and videos on this site are for Sophia’s family and our guests. When you share photos or videos with us:",
      "- Please share only photos and videos you took or have permission to share.",
      "- Ask a parent before sharing photos of children.",
      "- We look at every upload before anyone else can see it, and we may decide not to show some.",
      "- The ones we approve are shown only on this private site, to guests who sign in.",
      "- We may include them in family keepsakes of the celebration, like Sophia’s photo album or a highlight video.",
      "- We never sell them or use them in advertising.",
      "By uploading, you give us, Sophia’s family, permission to store your photos and videos, show them to signed-in guests on this site, and use them in family keepsakes of the celebration. The photos are still yours; this permission is only for those uses.",
      "Want something removed? Email misxv@simplysoph.com and we’ll take it off the site and leave it out of any keepsakes we haven’t made yet.",
      "Please don’t post other guests’ photos publicly, for example on social media, without asking them first.",
      "There will be photos and videos at the celebration, and you may appear in some of them. We use them only on this private site and in family keepsakes. If you’d rather not appear, let us know.",
      "The photos, invitation artwork and design of this site are ours or used with permission. Please ask us before using them for anything other than a personal keepsake.",
    ],
    es: [
      "Las fotos y los videos de este sitio son para la familia de Sophia y nuestros invitados. Cuando compartes fotos o videos con nosotros:",
      "- Por favor, comparte solo fotos y videos que tú tomaste o que tienes permiso de compartir.",
      "- Si salen niños, pide permiso a sus papás antes de compartirlos.",
      "- Revisamos cada archivo antes de que alguien más lo vea, y podemos decidir no mostrar algunos.",
      "- Solo los invitados que entran a este sitio privado pueden ver los que aprobamos.",
      "- Podemos incluirlos en recuerdos familiares de la celebración, como el álbum de fotos de Sophia o un video con los mejores momentos.",
      "- Nunca los vendemos ni los usamos en publicidad.",
      "Al subir fotos o videos, nos das permiso a nosotros, la familia de Sophia, para guardarlos, mostrarlos a los invitados que entran a este sitio y usarlos en recuerdos familiares de la celebración. Las fotos siguen siendo tuyas; este permiso es solo para esos usos.",
      "¿Quieres que quitemos algo? Escríbenos a misxv@simplysoph.com y lo quitaremos del sitio y de los recuerdos que todavía no hayamos hecho.",
      "Por favor, no publiques fotos de otros invitados, por ejemplo en redes sociales, sin preguntarles primero.",
      "En la celebración habrá fotos y videos, y es posible que salgas en algunos. Solo los usamos en este sitio privado y en recuerdos familiares. Si prefieres no salir, avísanos.",
      "Las fotos, la invitación y el diseño de este sitio son nuestros o los usamos con permiso. Pregúntanos antes de usarlos para algo que no sea un recuerdo personal.",
    ],
  },
};
