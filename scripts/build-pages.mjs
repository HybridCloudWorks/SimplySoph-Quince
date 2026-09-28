import { policies } from "../site/policies.mjs";
import {
  celebration,
  timeRange,
  venueSection,
  albumCards,
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
    return `<section class="hero"><div class="hero-copy"><p class="eyebrow">Mis Quinceañera</p><h1>Sophia</h1><p class="hero-line">${t.tagline}</p><p class="date" data-event-date>${t.date}</p><blockquote class="sophia-quote" data-home-quote><p>“${esc(celebration.quote[lang])}”</p><cite>— ${esc(celebration.name)}</cite></blockquote><div class="actions">${link("rsvp", t.rsvp)}<a href="${href("details", lang)}">${t.all} ↗</a></div><div class="countdown" data-countdown data-start="${celebration.countdownAt}" aria-label="${say("Days until the celebration", "Días hasta la celebración")}"></div></div><figure class="invitation"><a href="/assets/invitation.png" aria-label="${t.invitationCaption}"><img src="/assets/invitation.png" width="1024" height="1536" alt="${say("Sophia’s gold and burgundy invitation", "Invitación de Sophia en dorado y borgoña")}"></a><figcaption><a href="/assets/invitation.png">${t.invitationCaption}</a></figcaption></figure></section><section class="section"><p class="eyebrow">${say("THE NEXT CHAPTER", "EL PRÓXIMO CAPÍTULO")}</p><h2>${say("A day made for memories.", "Un día para crear recuerdos.")}</h2><div class="cards home-cards">${[
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
  if (["gifts", "registry", "padrinos", "costs", "account"].includes(route))
    return `<section class="page section">${heading}<div class="portal" id="portal" data-view="${route}"><p role="status">${t.loading}</p></div></section>`;
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
  if (route === "sophia" && (family.bio || family.parentsMessage))
    body = `<article class="editorial">${family.bio ? `<h2>${say("Meet Sophia", "Conoce a Sophia")}</h2><p class="lead">${esc(localized(family.bio))}</p>` : ""}${family.parentsMessage ? `<h2>${say("With love from her family", "Con cariño de su familia")}</h2><p>${esc(localized(family.parentsMessage))}</p>` : ""}</article>`;
  if (["court", "padrinos"].includes(route) && family[route].length)
    body = `<div class="cards">${family[route].map((person) => `<article class="card">${person.photo ? `<img loading="lazy" src="${safeLink(person.photo)}" alt="${esc(person.name)}">` : ""}<h2>${esc(person.name)}</h2><p>${esc(localized(person.role))}</p></article>`).join("")}</div>`;
  if (route === "gifts" && family.registry.length)
    body = `<div class="cards">${family.registry.map((item) => `<a class="card" href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">${esc(localized(item.label))} ↗</a>`).join("")}</div>`;
  if (route === "travel" && family.hotels.length)
    body += `<div class="cards">${family.hotels.map((item) => `<article class="card"><h2>${esc(item.name)}</h2><p>${esc(localized(item.notes))}</p><a href="${safeLink(item.url)}" target="_blank" rel="noopener noreferrer">${say("Hotel information", "Información del hotel")} ↗</a></article>`).join("")}</div>`;
  if (route === "thank-you" && family.highlightVideo)
    body += `<p><a class="button burgundy" href="${safeLink(family.highlightVideo)}" target="_blank" rel="noopener noreferrer">${say("Watch the highlights", "Ver los mejores momentos")}</a></p>`;
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
    body = `<p class="lead">${say("Share the celebration through your eyes.", "Comparte la celebración desde tu mirada.")}</p><p>${say("Photos and videos are reviewed by the family before appearing in the gallery for registered guests. Use your private invitation to sign in.", "La familia revisa las fotos y los videos antes de mostrarlos a los invitados registrados. Inicia sesión con tu invitación privada.")}</p><div class="portal" id="portal" data-view="share"></div><a href="${href("terms", lang)}">${say("Media Policy", "Política de medios")}</a>`;
  if (route === "share")
    body += `<details class="card"><summary>${say("QR code for the tables", "Código QR para las mesas")}</summary><img src="/assets/photo-upload-qr.svg" width="240" height="240" alt="${say("Photo sharing page QR code", "Código QR para compartir fotos")}"><p>${say("Guests still need their private invitation to upload.", "Los invitados necesitan su invitación privada para subir fotos.")}</p><a href="/assets/photo-upload-qr.svg" download>${say("Download printable QR", "Descargar QR para imprimir")}</a></details>`;
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
    body = `<article class="editorial"><h2>${say("Information for this celebration", "Información para esta celebración")}</h2><p>${say("Private invitations use household contact details and allocated spaces. Responses collect attendance, contact corrections and optional requests. Photos and guestbook submissions are held for family review.", "Las invitaciones privadas usan los datos de contacto y los lugares asignados a cada familia. Las respuestas incluyen asistencia, correcciones de contacto y solicitudes opcionales. Las fotos y mensajes se guardan para revisión de la familia.")}</p><p>${say("Authorized organizers use Notion and a private Google Cloud service to manage responses. Microsoft 365 is the planned email provider. Public pages never include the guest list.", "Los organizadores autorizados usan Notion y un servicio privado de Google Cloud para administrar respuestas. Microsoft 365 es el proveedor previsto de correos. Las páginas públicas nunca incluyen la lista de invitados.")}</p><p>${say("Firebase Hosting serves the site. Google Fonts receives normal network information when fonts load. Administrator sign-in uses Google. We have added no advertising or analytics trackers.", "Firebase Hosting aloja el sitio. Google Fonts recibe información de red al cargar fuentes. El acceso de administradores usa Google. No agregamos publicidad ni rastreadores de análisis.")}</p><h3>${say("Your choices", "Tus opciones")}</h3><p>${say("Optional requests, mailing addresses, messages and photos are voluntary. Keep invitation links private. Contact the family to correct or remove information. The family must finalize a retention date before live collection opens.", "Las solicitudes, direcciones postales, mensajes y fotos son opcionales. Mantén privados los enlaces de invitación. Contacta a la familia para corregir o eliminar información. La familia debe definir el plazo de retención antes de abrir la recopilación de datos.")}</p><a href="mailto:${event.sender}">${event.sender}</a></article>`;
  if (route === "terms") body = "";
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
        `<details class="nav-group"><summary>${name}</summary><div>${items.map((r) => `<a href="${href(r, lang)}"${["gifts", "registry", "padrinos"].includes(r) ? ` data-permission="${r === "registry" ? "gifts" : r}" hidden` : ""}${r === current ? ' aria-current="page"' : ""}>${label(r)}</a>`).join("")}</div></details>`,
    )
    .join(
      "",
    )}<a class="nav-rsvp" href="${href("rsvp", lang)}">RSVP</a><a href="${href("account", lang)}">${lang === "es" ? "Mi cuenta" : "My account"}</a><a class="language" lang="${lang === "es" ? "en" : "es"}" href="${href(current, lang === "es" ? "en" : "es")}">${t.language}</a></nav></header>`;
}
function document({ route, title, lang = "en", admin = false }) {
  const t = copy[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer"><meta name="description" content="${esc(t.tagline)}"><title>${esc(title)} · Sophia</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/pages.css"><script type="module" src="/${admin ? "admin" : "guest"}.js"></script></head><body data-route="${route}"><a class="skip" href="#main">${lang === "es" ? "Ir al contenido" : "Skip to content"}</a>${navigation(lang, admin ? "" : route)}<main id="main">${
    admin
      ? `<section class="section admin-shell"><aside aria-label="Family administration">${adminRoutes
          .filter(([r]) => r !== "admin/login")
          .map(
            ([r, t]) =>
              `<a href="/${r}/"${r === route ? ' aria-current="page"' : ""}>${t}</a>`,
          )
          .join(
            "",
          )}<button class="plain-button" id="logout">Sign out</button></aside><div><p class="eyebrow">FAMILY ONLY</p><h1 class="page-title">${title}</h1><div id="admin-app" data-view="${route}"><p role="status">Loading secure workspace…</p></div></div></section>`
      : contents(route, lang)
  }</main><footer><p class="copyright">© SimplySoph 2026. All Rights Reserved.</p><div><a href="${href("privacy", lang)}">${lang === "es" ? "Política de privacidad" : "Privacy Policy"}</a> · <a href="${href("terms", lang)}">${lang === "es" ? "Política de medios" : "Media Policy"}</a> · <a href="${href("contact", lang)}">${lang === "es" ? "Contáctanos" : "Contact Us"}</a></div></footer><div id="status" role="status" aria-live="polite"></div></body></html>`;
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
  await QRCode.toString("https://misxv.simplysoph.com/share/", {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 4,
  }),
);
for (const file of [
  "styles.css",
  "pages.css",
  "guest.js",
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
