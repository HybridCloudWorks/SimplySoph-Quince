import { registryDefaults } from "../server/registry-settings.mjs";
import { smsProgram } from "../site/sms-program.mjs";
import { policies } from "../site/policies.mjs";
import {
  celebration,
  timeRange,
  venueSection,
  albumCards,
  registryCards,
  calendar,
  calendarLink,
} from "../site/celebration.mjs";
import { mkdir, writeFile, copyFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import QRCode from "qrcode";
import {
  event,
  family,
  routes,
  adminRoutes,
  copy,
  textContent,
} from "../site/content.mjs";
const root = new URL("../dist/", import.meta.url),
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
const href = (route, lang) =>
  `${lang === "es" ? "/es" : ""}/${route ? route + "/" : ""}`;
function contents(route, lang) {
  const es = lang === "es",
    t = copy[lang],
    say = (a, b) => (es ? b : a),
    link = (r, label) =>
      `<a class="button burgundy" href="${href(r, lang)}">${label}</a>`;
  if (route === "")
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow">Mis Quinceañera</p><h1>Sophia</h1><p class="hero-line">${t.tagline}</p><p class="date" data-event-date>${t.date}</p><blockquote class="sophia-quote" data-home-quote><p>“${esc(celebration.quote[lang])}”</p><cite>— ${esc(celebration.name)}</cite></blockquote><div class="actions">${link("rsvp", t.rsvp)}<a href="${href("details", lang)}">${t.all} ↗</a></div><div class="countdown" data-countdown data-start="${celebration.countdownAt}" aria-label="${say("Days until the celebration", "Días hasta la celebración")}"></div></div><figure class="invitation"><a href="/assets/invitation.png" target="_blank" rel="noopener" aria-label="${t.invitationCaption}"><img src="/assets/invitation.png" width="1024" height="1536" alt="${say("Sophia’s gold and burgundy invitation", "Invitación de Sophia en dorado y borgoña")}"></a><figcaption><a href="/assets/invitation.png" target="_blank" rel="noopener">${t.invitationCaption}</a></figcaption></figure></section><section class="section"><p class="eyebrow">${say("THE NEXT CHAPTER", "EL PRÓXIMO CAPÍTULO")}</p><h2>${say("A day made for memories.", "Un día para crear recuerdos.")}</h2><div class="cards home-cards">${[
      ["sophia", say("Meet Sophia", "Conoce a Sophia")],
      ["details", t.details],
      ["gallery", say("The moments", "Los momentos")],
    ]
      .map(
        ([r, label]) =>
          `<a class="card" href="${href(r, lang)}"><span>✦</span><h3>${label}</h3><span aria-hidden="true">↗</span></a>`,
      )
      .join("")}</div><div data-announcements></div></section>`;
  const heading = `<div class="page-heading"><p class="eyebrow">SOPHIA · MIS XV</p><h1>${routes.find((r) => r[0] === route)?.[es ? 2 : 1] || "Sophia"}</h1></div>`;
  if (["gifts", "registry"].includes(route))
    return `<section class="page section">${heading}<p class="lead">${say("Your presence is the greatest gift. If you would like to celebrate with a gift, here are Sophia’s wishes.", "Tu presencia es el mejor regalo. Si deseas celebrar con un regalo, aquí están los deseos de Sophia.")}</p><div data-public-registries>${registryCards(registryDefaults, lang)}</div></section>`;
  if (["padrinos", "costs", "account"].includes(route))
    return `<section class="page section">${heading}${route === "account" ? `<p class="account-admin-link"><a href="/admin/login/">${say("Administrator Login", "Acceso De Administradores")}</a></p>` : ""}<div class="portal" id="portal" data-view="${route}"><p role="status">${t.loading}</p></div>${route === "account" ? `<section class="card admin-entry"><h2>${say("Administrator Login", "Acceso De Administradores")}</h2><p>${say("Family organizers can sign in with their approved email address and authenticator.", "Los organizadores pueden entrar con su correo autorizado y autenticador.")}</p><a class="button burgundy" href="/admin/login/">${say("Administrator Login", "Acceso De Administradores")}</a></section>` : ""}</section>`;
  let body = "";
  if (textContent[route]) {
    const c = textContent[route];
    body = `<div class="editorial"><span class="ornament">✦</span><h2>${c[0][es ? 1 : 0]}</h2><p class="lead">${c[1][es ? 1 : 0]}</p><p>${c[2][es ? 1 : 0]}</p>${link("contact", t.contact)}</div>`;
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
  const person = (p) =>
    `<div class="person">${monogram(p)}<div><p class="person-role">${esc(courtRole[p.role] || localized(p.role))}</p><h3>${esc(p.name)}</h3>${p.line ? `<p>${esc(localized(p.line))}</p>` : ""}</div></div>`;
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
        ? `<div class="letter"><p class="eyebrow">${say("A letter from her parents", "Una carta de sus papás")}</p><p>${esc(localized(family.parentsMessage))}</p></div>`
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
  if (route === "gifts" && family.registry.length)
    body = `<div class="cards">${family.registry.map((item) => `<a class="card" href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">${esc(localized(item.label))} ↗</a>`).join("")}</div>`;
  // The day at a glance: church, then dinner, from the confirmed schedule.
  if (route === "travel")
    body =
      `<div class="route-strip"><div><b>${timeRange({ start: celebration.ceremony.start }, lang)} · ${say("Ceremony", "Ceremonia")}</b><span>${esc(celebration.ceremony.name)}<br>${esc(celebration.ceremony.address)}</span></div><div><b>${timeRange({ start: celebration.dinner.start }, lang)} · ${say("Dinner", "Cena")}</b><span>${esc(celebration.reception.name)}<br>${esc(celebration.reception.address)}</span></div></div>` +
      (family.hotels.length
        ? `<div class="cards">${family.hotels.map((item) => `<article class="card">${item.where ? `<p class="person-role">${esc(localized(item.where))}</p>` : ""}<h2>${esc(item.name)}</h2><p>${esc(localized(item.notes))}</p><a class="button burgundy" href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">${say("Hotel information", "Información del hotel")} ↗</a></article>`).join("")}</div>`
        : body);
  if (route === "thank-you" && (family.thanksNote || family.highlightVideo))
    body = `<div class="thanks-note"><p class="thanks-script">Gracias</p>${family.thanksNote ? `<p>${esc(localized(family.thanksNote))}</p>` : ""}<p class="actions">${family.highlightVideo ? `<a class="button burgundy" href="${safeLink(family.highlightVideo)}" target="_blank" rel="noopener noreferrer">${say("Watch the highlights", "Ver los mejores momentos")}</a>` : ""}<a href="${href("share", lang)}">${say("Share your photos", "Comparte tus fotos")} ↗</a></p></div>`;
  if (route === "details")
    body = `<p class="lead" data-event-date>${t.date}</p><p>${t.time}</p><div class="cards">${[
      ["ceremony", "4:00 PM", say("Religious ceremony", "Ceremonia religiosa")],
      [
        "reception",
        "6:30–7:30 PM",
        say("Dinner at The AMZ Event Center", "Cena en The AMZ Event Center"),
      ],
      ["reception", "7:30 PM", say("Reception & dance", "Recepción y baile")],
    ]
      .map(
        ([r, time, label], i) =>
          `<article class="card"><p class="eyebrow" data-event-time="${["ceremony", "dinner", "reception"][i]}">${timeRange(celebration[["ceremony", "dinner", "reception"][i]], lang)}</p><h2>${label}</h2><a href="${href(r, lang)}">${say("Venue details", "Detalles del lugar")} ↗</a></article>`,
      )
      .join(
        "",
      )}</div><div class="editorial"><h2>${say("Dress code", "Código de vestimenta")}</h2><p>${t.pending} ${say("Burgundy and gold are the site theme, not a required outfit.", "Borgoña y dorado son los colores del sitio, no una vestimenta obligatoria.")}</p><div class="calendar-actions" data-calendar-links>${["ceremony", "dinner", "reception"].map((k) => `<div><strong>${say({ ceremony: "Ceremony", dinner: "Dinner", reception: "Reception" }[k], { ceremony: "Ceremonia", dinner: "Cena", reception: "Recepción" }[k])}</strong>${calendarLink(k, celebration, lang)}</div>`).join("")}</div></div>`;
  if (route === "ceremony" || route === "reception")
    body =
      '<div data-venue="' +
      route +
      '">' +
      venueSection(route, celebration, lang) +
      "</div>";
  if (route === "rsvp" || route === "rsvp/confirmed")
    body = `<p class="deadline">${t.deadlineLabel} <strong>${t.deadline}</strong></p><div class="portal" id="portal" data-view="${route}"><p role="status">${t.loading}</p></div>`;
  if (route === "gallery")
    body =
      '<p class="lead">' +
      say(
        "A lifetime of little moments. A new chapter to share.",
        "Una vida de pequeños momentos. Un nuevo capítulo para compartir.",
      ) +
      "</p><div data-album-cards>" +
      albumCards(celebration, lang) +
      '</div><section class="gallery-section"><h2>' +
      say("Photographs", "Fotografías") +
      '</h2><p data-album-label></p><div data-gallery class="media-grid"></div></section><section class="gallery-section"><h2>' +
      say("The video collection", "La colección de videos") +
      "</h2><p>" +
      say(
        "Relive the laughter, the music, and the moments in between. Approved videos will appear here.",
        "Revive las risas, la música y los momentos especiales. Aquí aparecerán los videos aprobados.",
      ) +
      '</p><div data-videos class="media-grid"></div></section>' +
      link("share", say("Share photos & videos", "Comparte fotos y videos"));
  if (route === "share")
    body = `<div class="share-intro"><p class="lead">${say("Share the celebration through your eyes.", "Comparte la celebración desde tu mirada.")}</p><p>${say("Choose your favorite photos and videos. The family reviews every upload before sharing it in the guest gallery.", "Elige tus fotos y videos favoritos. La familia revisa cada archivo antes de compartirlo en la galería de invitados.")}</p></div><div id="media-upload" tabindex="-1"></div><div class="portal share-portal" id="portal" data-view="share"></div><aside class="media-reminder"><strong>${say("A Little Reminder", "Un Pequeño Recordatorio")}</strong><p>${say("Only share media you have permission to upload, including permission from a parent or guardian for children. Approved uploads are visible to registered guests.", "Comparte solo archivos que tengas permiso de subir, incluido el permiso de un padre o tutor para los menores. Los archivos aprobados son visibles para los invitados registrados.")} <a href="${href("terms", lang)}">${say("Read the Media Policy", "Lee la Política de Medios")}</a></p></aside>`;
  if (route === "guestbook" || route === "contact")
    body = `<p class="lead">${route === "guestbook" ? say("Leave Sophia a wish for the years ahead.", "Deja a Sophia un deseo para los años que vienen.") : say("We’re here to help with your invitation.", "Estamos aquí para ayudarte con tu invitación.")}</p>${route === "contact" ? `<p><a href="mailto:${event.sender}">${event.sender}</a></p>` : ""}<div class="portal" id="portal" data-view="${route}"></div>${route === "guestbook" ? '<div data-guestbook class="cards"></div>' : ""}`;
  if (route === "faq")
    body =
      [
        [
          say("When should I RSVP?", "¿Cuándo debo confirmar?"),
          `${t.deadline}. ${say("Use the private invitation sent to your household.", "Usa la invitación privada que recibió tu familia.")}`,
        ],
        [
          say(
            "Can I bring a guest or children?",
            "¿Puedo llevar acompañantes o niños?",
          ),
          say(
            "Your invitation specifies the adult/teen and child spaces allocated to your household. Contact the family if the information needs correcting.",
            "Tu invitación indica los lugares para adultos/jóvenes y niños asignados a tu familia. Contacta a la familia si hay un error.",
          ),
        ],
        [
          say(
            "What happens between the ceremony and dinner?",
            "¿Qué pasa entre la ceremonia y la cena?",
          ),
          esc(
            say(
              `The ceremony ends around ${timeRange({ start: celebration.ceremony.end }, lang)} and dinner starts at ${timeRange({ start: celebration.dinner.start }, lang)} at ${celebration.reception.name}.`,
              `La ceremonia termina alrededor de las ${timeRange({ start: celebration.ceremony.end }, lang)} y la cena comienza a las ${timeRange({ start: celebration.dinner.start }, lang)} en ${celebration.reception.name}.`,
            ),
          ),
        ],
        [
          say(
            "Can I take photos during the ceremony?",
            "¿Puedo tomar fotos durante la ceremonia?",
          ),
          say(
            "Please keep phones away during the ceremony. You can share your photos from the reception on the Share photos page.",
            "Por favor, guarda tu teléfono durante la ceremonia. Puedes compartir tus fotos de la recepción en la página Comparte fotos y videos.",
          ),
        ],
        [
          say("Can I change my response?", "¿Puedo cambiar mi respuesta?"),
          say(
            "Registered guests can request a one-time email sign-in link from My account and edit before the deadline. Your most recent saved response is the one counted.",
            "Los invitados registrados pueden solicitar un enlace de acceso por correo desde Mi cuenta y editar antes de la fecha límite. Se contará la última respuesta guardada.",
          ),
        ],
        [
          say("What should I wear?", "¿Cómo debo vestirme?"),
          esc(localized(family.dressCode)) || t.pending,
        ],
        [
          say("Are gifts required?", "¿Se requieren regalos?"),
          say(
            "The family will share gift preferences on the Gifts page.",
            "La familia compartirá sus preferencias en la página de regalos.",
          ),
        ],
        [
          say("Can I share photos?", "¿Puedo compartir fotos?"),
          say(
            "Use Share photos and agree to the photo terms. Only approved photos and videos appear to registered guests.",
            "Usa Comparte tus fotos y acepta las condiciones. Solo los invitados registrados pueden ver archivos aprobados.",
          ),
        ],
      ]
        .map(
          ([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`,
        )
        .join("") + `<p>${link("contact", t.contact)}</p>`;
  if (route === "privacy")
    body = `<article class="editorial"><h2>${say("Information for this celebration", "Información para esta celebración")}</h2><p>${say("Private invitations use household contact details and allocated spaces. Responses collect attendance, contact corrections and optional requests. Photos and guestbook submissions are held for family review.", "Las invitaciones privadas usan los datos de contacto y los lugares asignados a cada familia. Las respuestas incluyen asistencia, correcciones de contacto y solicitudes opcionales. Las fotos y mensajes se guardan para revisión de la familia.")}</p><p>${say("Authorized organizers use Notion and a private Google Cloud service to manage responses. Microsoft 365 is the planned email provider. Public pages never include the guest list.", "Los organizadores autorizados usan Notion y un servicio privado de Google Cloud para administrar respuestas. Microsoft 365 es el proveedor previsto de correos. Las páginas públicas nunca incluyen la lista de invitados.")}</p><p>${say("Firebase Hosting serves the site. Google Fonts receives normal network information when fonts load. Administrator sign-in uses Google. We have added no advertising or analytics trackers.", "Firebase Hosting aloja el sitio. Google Fonts recibe información de red al cargar fuentes. El acceso de administradores usa Google. No agregamos publicidad ni rastreadores de análisis.")}</p><h3>${say("Your choices", "Tus opciones")}</h3><p>${say("Optional requests, mailing addresses, messages and photos are voluntary. Keep invitation links private. Contact the family to correct or remove information. The family will review event data on February 1, 2027; this is not an automatic deletion date.", "Las solicitudes, direcciones postales, mensajes y fotos son opcionales. Mantén privados los enlaces de invitación. Contacta a la familia para corregir o eliminar información. La familia revisará los datos el 1 de febrero de 2027; no es una eliminación automática.")}</p><a href="mailto:${event.sender}">${event.sender}</a></article>`;
  if (route === "terms") body = "";
  if (route === "whatsapp")
    body += `<article class="editorial"><h2>${say("Stay In Touch On WhatsApp", "Sigue En Contacto Por WhatsApp")}</h2><p>${say("Simply Soph Media offers optional WhatsApp invitation links, RSVP reminders and event updates for Sophia Isabel’s celebration. Message frequency varies. Internet and data charges may apply. Email remains available; WhatsApp is not required to attend.", "Simply Soph Media ofrece enlaces de invitación, recordatorios de asistencia y novedades opcionales por WhatsApp para la celebración de Sophia Isabel. La frecuencia varía. Pueden aplicarse cargos por internet y datos. El correo sigue disponible; WhatsApp no es obligatorio para asistir.")}</p><h3>${say("Subscribe And Verify Your Number", "Suscríbete Y Verifica Tu Número")}</h3><p>${say("Open your private invitation, then visit My Account to enter your WhatsApp number with its country code, choose English or Spanish, and agree to WhatsApp messages. Follow the WhatsApp link and send START from that same number to verify it. A subscription is active only after verification and synchronization. If you have not received your private invitation, contact the family first.", "Abre tu invitación privada y visita Mi Cuenta para ingresar tu número de WhatsApp con código de país, elegir inglés o español y aceptar los mensajes de WhatsApp. Sigue el enlace a WhatsApp y envía START desde ese mismo número para verificarlo. La suscripción se activa después de la verificación y sincronización. Si aún no tienes tu invitación privada, contacta a la familia.")}</p><p><a class="button burgundy" href="${href("account", lang)}">${say("My Account", "Mi Cuenta")}</a></p><h3>${say("Help And Unsubscribe", "Ayuda Y Cancelación")}</h3><p>${say("Reply STOP or BAJA to stop WhatsApp event messages, or turn off consent in My Account. Reply HELP or AYUDA for support, or email misxv@simplysoph.com. Sending START alone does not create a guest account or submit an RSVP. Complete your RSVP on the website using your private link.", "Responde STOP o BAJA para dejar de recibir mensajes del evento por WhatsApp, o desactiva el consentimiento en Mi Cuenta. Responde HELP o AYUDA para recibir ayuda, o escribe a misxv@simplysoph.com. Enviar START no crea una cuenta ni confirma asistencia. Completa tu respuesta en el sitio con tu enlace privado.")}</p><p>${say("WhatsApp consent is separate from SMS consent. Twilio and Meta process messages and delivery information to provide this service. We record your consent, language, number and opt-out privately and synchronize them with Notion. We do not sell or share messaging consent for third-party marketing. Review/export is planned for February 1, 2027; no automatic deletion is scheduled.", "El consentimiento de WhatsApp es independiente del de SMS. Twilio y Meta procesan mensajes y datos de entrega para prestar el servicio. Guardamos tu consentimiento, idioma, número y baja de forma privada y los sincronizamos con Notion. No vendemos ni compartimos el consentimiento para marketing de terceros. La revisión y exportación está prevista para el 1 de febrero de 2027; no hay eliminación automática.")}</p><a href="${href("privacy", lang)}">${say("Privacy Policy", "Política De Privacidad")}</a></article>`;
  if (route === "privacy")
    body += `<article class="editorial"><h2>${say("Optional WhatsApp Messages", "Mensajes WhatsApp Opcionales")}</h2><p>${say("WhatsApp participation is optional and separate from SMS and email. Your WhatsApp number, language, consent evidence, opt-out and delivery status are processed by our event service, Twilio and Meta and synchronized to our private Notion guest records. These details are used to deliver event communications, not sold or shared for third-party marketing. STOP or BAJA withdraws WhatsApp consent. Minimal suppression records may remain to honor that choice.", "WhatsApp es opcional e independiente de SMS y correo. Nuestro servicio, Twilio y Meta procesan tu número, idioma, consentimiento, baja y estado de entrega, y los sincronizamos con nuestros registros privados de Notion. Los usamos para comunicaciones del evento; no los vendemos ni compartimos para marketing de terceros. STOP o BAJA cancela el consentimiento de WhatsApp. Podemos conservar registros mínimos para respetar esa decisión.")}</p><a href="${href("whatsapp", lang)}">${say("WhatsApp Program And Terms", "Programa Y Términos De WhatsApp")}</a></article>`;
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
    body += `<article class="editorial"><h2>${say("Optional SMS Messages", "Mensajes SMS Opcionales")}</h2><p>${say("Simply Soph Media uses mobile numbers, keyword messages, consent records and delivery status to operate event texts through Twilio. Preferences are recorded privately and synchronized to matching Notion guest records. We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes. No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. Text messaging originator opt-in data and consent will not be shared with any third parties. Twilio processes messages only to deliver this service. Website use or email RSVP alone does not provide SMS consent.", "Simply Soph Media usa números móviles, palabras clave, registros de consentimiento y estado de entrega para operar mensajes mediante Twilio. Las preferencias se guardan de forma privada y se sincronizan con los invitados correspondientes de Notion. No vendemos ni compartimos tus datos de suscripción SMS ni tu información personal con terceros para fines de mercadeo. No compartiremos información móvil con terceros ni afiliados para fines de mercadeo o promoción. Los datos de suscripción y consentimiento de mensajes no se compartirán con ningún tercero. Twilio procesa los mensajes solo para prestar este servicio. Usar el sitio o confirmar por correo no constituye consentimiento SMS.")}</p><p>${say("Event data will be reviewed on February 1, 2027; this is not automatic deletion. Contact misxv@simplysoph.com to request access, correction or deletion. Minimal suppression records may be retained to honor opt-outs.", "Los datos se revisarán el 1 de febrero de 2027; no es una eliminación automática. Escribe a misxv@simplysoph.com para solicitar acceso, corrección o eliminación. Pueden conservarse registros mínimos para respetar las bajas.")}</p><a href="${href("sms-terms", lang)}">${say("SMS Terms", "Términos SMS")}</a></article>`;
  if (["privacy", "terms"].includes(route)) {
    const notice =
      '<article class="editorial">' +
      policies[route][lang]
        .map((p) => "<p>" + esc(p.replace(/^- /, "• ")) + "</p>")
        .join("") +
      "</article>";
    body = notice + body;
  }
  if (route === "terms")
    body +=
      '<article class="editorial"><h2>' +
      say("Approved guest downloads", "Descargas para invitados") +
      "</h2><p>" +
      say(
        "Downloads made available to signed-in guests are permitted for personal event keepsakes. Other uses require written permission. Get permission from recognizable people and a parent or guardian for children before uploading. Contact the family to request removal.",
        "Las descargas disponibles para invitados registrados se permiten como recuerdos personales del evento. Otros usos requieren permiso por escrito. Antes de subir contenido, pide permiso a las personas reconocibles y a un padre o tutor para menores. Contacta a la familia para solicitar su retirada.",
      ) +
      '</p><a href="' +
      href("contact", lang) +
      '">' +
      say("Contact Us", "Contáctanos") +
      "</a></article>";
  if (route === "404")
    body = `<p class="lead">${say("Let’s get you back to the celebration.", "Volvamos a la celebración.")}</p>${link("", t.home)}`;
  if (route === "gallery" && family.portraits.length)
    body =
      `<div class="cards">${family.portraits.map((photo) => `<figure class="card"><img loading="lazy" src="${safeLink(photo.src)}" alt="${esc(localized(photo.caption))}"><figcaption>${esc(localized(photo.caption))}</figcaption></figure>`).join("")}</div>` +
      body;

  if (route === "privacy")
    body += `<article class="editorial"><h2>${say("Guest accounts", "Cuentas de invitados")}</h2><p>${say("We verify sign-in emails using one-time links. Account names, emails and access settings are synchronized to Notion. Our private backend also retains contact profiles, accepted responses, account permissions, sign-in records and private messages to operate the guest account. Optional private pages require the family’s permission. Contact-email changes do not change your verified sign-in email.", "Verificamos los correos de acceso con enlaces de un solo uso. Los nombres, correos y permisos de las cuentas se sincronizan con Notion. Nuestro servidor privado también guarda perfiles de contacto, respuestas, permisos, registros de acceso y mensajes privados para operar la cuenta. Las páginas privadas opcionales requieren permiso de la familia. Cambiar el correo de contacto no cambia tu correo de acceso verificado.")}</p></article>`;
  if (route === "details" && family.dressCode)
    body = body.replace(
      `${t.pending} ${say("Burgundy and gold are the site theme, not a required outfit.", "Borgoña y dorado son los colores del sitio, no una vestimenta obligatoria.")}`,
      esc(localized(family.dressCode)),
    );
  return `<section class="page section">${heading}${body}</section>`;
}
function navigation(lang, current) {
  const t = copy[lang],
    label = (r) => routes.find((p) => p[0] === r)?.[lang === "es" ? 2 : 1] || r;
  return `<header><a class="wordmark" href="${href("", lang)}">S <span>· MIS XV</span></a><nav aria-label="${lang === "es" ? "Navegación principal" : "Main navigation"}"><a href="${href("sophia", lang)}">Sophia</a>${[
    [t.details, ["details", "ceremony", "reception"]],
    [t.people, ["court", "padrinos"]],
    [t.memories, ["gallery", "share", "guestbook", "thank-you"]],
    [t.help, ["travel", "registry", "faq", "contact"]],
  ]
    .map(
      ([name, items]) =>
        `<details class="nav-group"><summary>${name}</summary><div>${items.map((r) => `<a href="${href(r, lang)}"${["padrinos"].includes(r) ? ` data-permission="${r === "registry" ? "gifts" : r}" hidden` : ""}${r === current ? ' aria-current="page"' : ""}>${label(r)}</a>`).join("")}</div></details>`,
    )
    .join(
      "",
    )}<a class="nav-rsvp" href="${href("rsvp", lang)}">RSVP</a><a href="${href("account", lang)}">${lang === "es" ? "Mi cuenta" : "My account"}</a><a class="language" lang="${lang === "es" ? "en" : "es"}" href="${href(current, lang === "es" ? "en" : "es")}">${t.language}</a></nav></header>`;
}
function document({ route, title, lang = "en", admin = false }) {
  const t = copy[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="description" content="${esc(t.tagline)}"><title>${esc(title)} · Sophia</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/pages.css"><script type="module" src="/${admin ? "admin" : "guest"}.js"></script></head><body data-route="${route}"><a class="skip" href="#main">${lang === "es" ? "Ir al contenido" : "Skip to content"}</a>${navigation(lang, admin ? "" : route)}<main id="main">${
    admin
      ? `<section class="section admin-shell"><aside aria-label="Family administration">${adminRoutes
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
          )}<button class="plain-button" id="logout">Sign out</button></aside><div><p class="eyebrow">FAMILY ONLY</p><h1 class="page-title">${title}</h1><div id="admin-app" data-view="${route}"><p role="status">Loading secure workspace…</p></div></div></section>`
      : contents(route, lang)
  }</main><footer><p class="copyright">© 2026 Simply Soph Media (SimplySoph). All Rights Reserved.</p><div><a href="${href("privacy", lang)}">${lang === "es" ? "Política de privacidad" : "Privacy Policy"}</a> · <a href="${href("terms", lang)}">${lang === "es" ? "Política de medios" : "Media Policy"}</a> · <a href="${href("whatsapp", lang)}">WhatsApp</a> · <a href="${href("sms", lang)}">${lang === "es" ? "Mensajes SMS" : "SMS Updates"}</a> · <a href="${href("contact", lang)}">${lang === "es" ? "Contáctanos" : "Contact Us"}</a></div></footer><div id="status" role="status" aria-live="polite"></div></body></html>`;
}
// Only remove the known generated directory inside this checkout, never a supplied path.
const checkout = fileURLToPath(new URL("../", import.meta.url));
if (path.resolve(fileURLToPath(root)) !== path.join(checkout, "dist"))
  throw new Error("Invalid build output");
await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true });
let count = 0;
for (const lang of ["en", "es"])
  for (const [route, en, es] of routes) {
    const folder = new URL(
      (lang === "es" ? "es/" : "") + (route ? route + "/" : ""),
      root,
    );
    await mkdir(folder, { recursive: true });
    const html = document({ route, title: lang === "es" ? es : en, lang });
    await writeFile(new URL("index.html", folder), html);
    if (route === "404" && lang === "en")
      await writeFile(new URL("404.html", root), html);
    count++;
  }
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
  "event-config.js",
  "assets/invitation.png",
  "assets/church.png",
  "assets/reception.png",
  "assets/target.svg",
  "celebration.mjs",
  "experience.js",
  "admin-experience.js",
  "admin-planning.js",
  "admin-audience.js",
  "admin-batches.js",
  "admin-pulse.js",
  "admin-history.js",
  "admin-whatsapp.js",
  "guest-whatsapp.js",
])
  await copyFile(
    new URL("../site/" + file, import.meta.url),
    new URL(file, root),
  );
await mkdir(new URL("calendar/", root), { recursive: true });
for (const kind of ["ceremony", "dinner", "reception"]) {
  if (celebration[kind].end)
    await writeFile(new URL("calendar/" + kind + ".ics", root), calendar(kind));
}

await writeFile(new URL("robots.txt", root), "User-agent: *\nDisallow: /\n");
console.log(
  `Built ${count} pages, English/Spanish guest routes, private admin shells and calendar. Runtime features require the configured API.`,
);
