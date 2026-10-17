// Pure rendering only. No network, credentials, scheduling, or live dispatch.
// Shared words come from site/lexicon.mjs (household emails speak to the
// family: ustedes; the sign-in email and the reply notice to one person: tú),
// and every date and time from site/datetime.mjs.
import { event } from "../site/content.mjs";
import { terms, say } from "../site/lexicon.mjs";
import { date, time, at, capitalize } from "../site/datetime.mjs";
// Invitations read like a letter (real date, places and Sophia's own words)
// instead of a lone "view your invitation" button, which is the shape of
// common invitation-phishing mail and lands in spam.
const copy = {
  en: {
    invitation: [
      "Sophia’s quinceañera",
      "",
      "Sophia is turning fifteen, and she would love for your family to celebrate with her.",
      "RSVP for your family",
    ],
    receipt: [
      "We received your RSVP · Sophia’s quinceañera",
      "Thank you for your RSVP.",
      "Here is your family’s answer:",
      "See the schedule and directions",
    ],
    update: [
      "Your RSVP was updated · Sophia’s quinceañera",
      "We saved your latest answer.",
      "Here is your family’s answer now:",
      "See the schedule and directions",
    ],
    // Reminders go only to families with no saved answer (server/mail-batches.mjs).
    reminder: [
      "A little reminder · Sophia’s quinceañera",
      "Will you join us?",
      "We haven’t heard from you yet, and we’d love to know if you can come.",
      "RSVP now",
    ],
    details: [
      "Before we celebrate · Sophia’s quinceañera",
      "The celebration is almost here.",
      "Here’s what to know before the day. Directions to each place, and any last updates, are on the website.",
      "See the details",
    ],
    change: [
      "A change to the plans · Sophia’s quinceañera",
      "An update about the celebration",
      "Something has changed — here’s what you need to know:",
      "See the updated details",
    ],
    thanks: [
      "With love and thanks · Sophia’s quinceañera",
      "Thank you for being part of this chapter.",
      "Your love and support mean so much to Sophia and to all of us. We’re so grateful to have you in our lives.",
      "A message from Sophia",
    ],
    greeting: (name) => `Hello ${name},`,
    date: "Event date",
    replyBy: (d) => `${terms.rsvpBy.en} ${d}.`,
    quick: ["Or answer in one tap", terms.everyoneComing.en, terms.cantMakeIt.en],
    events: { ceremony: terms.ceremony.en, dinner: terms.dinner.en, dance: terms.receptionDance.en },
    adults: (n) => `${n} ${n === 1 ? "adult/teen" : "adults/teens"}`,
    kids: (n) => `${n} ${n === 1 ? "child" : "children"}`,
    absent: "not attending",
    // The receipt's title already thanks them, so this line doesn't again.
    declined: "You let us know no one in your family can attend. We’ll miss you, and we send you our love.",
    changeUntil: (d) =>
      `You can change it until ${d}: open your invitation link again, from the email or message we sent you.`,
    private: "This invitation link is just for your family, so please don’t forward this email.",
    help: `Add ${event.sender} to your contacts so our emails reach your inbox. Questions? Just reply — we read every message.`,
    sign: "With love, Sophia & family",
    preview: "SAMPLE PREVIEW — NOT SENT",
  },
  es: {
    // Emails greet a household ("Hola, familia Morales:"), so they say ustedes.
    invitation: [
      "Los XV de Sophia",
      "",
      "Sophia cumple quince años y le encantaría celebrarlos con ustedes.",
      terms.rsvpAction.es,
    ],
    receipt: [
      "Recibimos su respuesta · Los XV de Sophia",
      "Gracias por responder.",
      "Esta es la respuesta de su familia:",
      "Ver el programa y cómo llegar",
    ],
    update: [
      "Su respuesta se actualizó · Los XV de Sophia",
      "Guardamos su respuesta más reciente.",
      "Esta es ahora la respuesta de su familia:",
      "Ver el programa y cómo llegar",
    ],
    reminder: [
      "Un pequeño recordatorio · Los XV de Sophia",
      "¿Nos acompañarán?",
      "Todavía no recibimos su respuesta y nos encantaría saber si podrán venir.",
      terms.rsvpAction.es,
    ],
    details: [
      "Antes de celebrar · Los XV de Sophia",
      "Ya falta poco para la celebración.",
      "Esto es lo que necesitan saber antes de la fiesta. En el sitio encontrarán cómo llegar a cada lugar y cualquier novedad de último momento.",
      "Ver los detalles",
    ],
    change: [
      "Un cambio en los planes · Los XV de Sophia",
      "Una novedad sobre la celebración",
      "Hubo un cambio; esto es lo que necesitan saber:",
      "Ver los detalles actualizados",
    ],
    thanks: [
      "Con cariño y gratitud · Los XV de Sophia",
      "Gracias por ser parte de este capítulo.",
      "Su cariño y su apoyo significan mucho para Sophia y para todos nosotros. Estamos muy agradecidos de tenerlos en nuestras vidas.",
      "Un mensaje de Sophia",
    ],
    greeting: (name) => `Hola, ${name}:`,
    date: "Fecha del evento",
    replyBy: (d) => `${say(terms.rsvpBy, "es", "ustedes")} ${d}.`,
    quick: ["O respondan con un toque", terms.everyoneComing.es, terms.cantMakeIt.es],
    events: { ceremony: terms.ceremony.es, dinner: terms.dinner.es, dance: terms.receptionDance.es },
    adults: (n) => `${n} ${n === 1 ? "adulto/joven" : "adultos/jóvenes"}`,
    kids: (n) => `${n} ${n === 1 ? "niño" : "niños"}`,
    absent: "no asistirán",
    // The receipt's title already thanks them ("Gracias por responder."), so
    // this line doesn't again.
    declined: "Nos avisaron que nadie de su familia podrá asistir. Los vamos a extrañar y les mandamos todo nuestro cariño.",
    changeUntil: (d) =>
      `Pueden cambiarla hasta el ${d}: abran de nuevo su enlace de invitación, del correo o mensaje que les enviamos.`,
    private: "Este enlace de invitación es solo para su familia; por favor, no reenvíen este correo.",
    help: `Agreguen ${event.sender} a sus contactos para que nuestros correos lleguen a su bandeja de entrada. ¿Preguntas? Respondan a este correo; leemos todos los mensajes.`,
    sign: "Con cariño, Sophia y su familia",
    preview: "VISTA PREVIA — NO ENVIADO",
  },
};
export const templateKeys = [
  "invitation",
  "receipt",
  "update",
  "reminder",
  "details",
  "change",
  "thanks",
];
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// Only the events this household is invited to, from the admin's site
// settings, named as the website names them. Times are plain text (ordinary
// spaces), which the mail server's Windows-1252 conversion can carry.
export function emailSchedule(site, invited, locale = "en") {
  if (!site || !invited) return [];
  const es = locale === "es",
    t = (entry) => say(entry, locale),
    rows = [],
    place = (v) => `${v.name}, ${v.address}`;
  if (invited.ceremony)
    rows.push({
      time: time(site.ceremony.start, locale),
      text: `${t(terms.ceremonyLong)} · ${place(site.ceremony)}`,
    });
  if (invited.dinner || invited.dance) {
    const then = at(site.reception.start, locale),
      label =
        invited.dinner && invited.dance
          ? es
            ? `Cena y, ${then}, la recepción y el baile`
            : `Dinner, then the reception and dance ${then}`
          : t(invited.dinner ? terms.dinner : terms.receptionDance);
    rows.push({
      time: time(invited.dinner ? site.dinner.start : site.reception.start, locale),
      text: `${label} · ${place(site.reception)}`,
    });
  }
  return rows;
}
// Every email shares one frame: the burgundy "Sophia · Mis XV" band and a card.
function layout(locale, subject, preheader, body) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#fbf5e9;color:#351e21;font:16px/1.6 Arial,sans-serif">${preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escape(preheader)}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" style="width:100%;max-width:560px;background:#fffdf8;border:1px solid #d9c6a5" cellspacing="0" cellpadding="0"><tr><td style="background:#651625;color:#e9c77b;padding:28px;text-align:center;font:36px Georgia,serif">Sophia · Mis XV</td></tr><tr><td style="padding:28px">${body}</td></tr></table></td></tr></table></body></html>`;
}
const button = (href, label) =>
  `<p style="margin:28px 0"><a href="${escape(href)}" style="display:inline-block;background:#651625;color:#fff;padding:14px 22px;text-decoration:none">${escape(label)}</a></p>`;
// The sign-in link, in the guest's language. It says who it is from, which
// celebration, what the link opens and how long it lasts, instead of a lone
// link (the shape of phishing mail).
// It speaks to the one person who asked (tú), so it greets them without the
// household's name ("Hola:"), which would speak to the family (R-034).
const signInCopy = {
  en: {
    subject: "Your sign-in link · Sophia’s quinceañera",
    greeting: "Hello,",
    intro: (date) =>
      `You asked to sign in to the website for Sophia’s quinceañera${date ? ` (${date})` : ""}. Once you’re in, you can share photos and videos, leave Sophia a note, send us a message and update your contact details.`,
    cta: "Sign in to the website",
    once: "This link works once, within 15 minutes. No password needed.",
    ignore: "Didn’t ask for this? Ignore this email; nobody can sign in without the link.",
    sign: "With love, Sophia & family",
  },
  es: {
    subject: `Tu ${terms.signInLink.es} · Los XV de Sophia`,
    greeting: "Hola:",
    intro: (date) =>
      `Pediste entrar al sitio de los XV de Sophia${date ? ` (${date})` : ""}. Ya adentro, puedes compartir fotos y videos, dejarle un mensaje a Sophia, enviarnos mensajes y actualizar tus datos de contacto.`,
    cta: "Entrar al sitio",
    once: "Este enlace funciona una sola vez, durante 15 minutos. No necesitas contraseña.",
    ignore: "¿No lo pediste? Ignora este correo; nadie puede entrar sin el enlace.",
    sign: "Con cariño, Sophia y su familia",
  },
};
export function renderSignInEmail({ locale = "en", url, eventDate = "" }) {
  const c = signInCopy[locale];
  if (!c) throw new Error("Unsupported locale");
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("An HTTPS URL without embedded credentials is required");
  const greeting = c.greeting,
    intro = c.intro(eventDate);
  const html = layout(
    locale,
    c.subject,
    intro,
    `<p>${escape(greeting)}</p><p>${escape(intro)}</p>${button(target.href, c.cta)}<p>${escape(c.once)}</p><p style="font-size:14px">${escape(c.ignore)}</p><p style="font-family:Georgia,serif">${escape(c.sign)}</p>`,
  );
  const text = [greeting, intro, `${c.cta}: ${target.href}`, c.once, c.ignore, c.sign].join("\n\n");
  return { subject: c.subject, html, text };
}
// The opening sentence of Sophia's own message, when it is short enough to quote.
export function firstSentence(text) {
  const m = String(text || "")
    .trim()
    .match(/^.+?[.!?](?=\s|$)/s);
  return m && m[0].length <= 240 ? m[0] : "";
}
export function renderEmail({
  type,
  locale = "en",
  household = "Sample household",
  url,
  eventDate,
  rsvpDeadline,
  schedule = [],
  note = "",
  updateText = "",
  preview = true,
  dateConfirmed = false,
  receiptCommitted = false,
  // A receipt's saved answer, and the events on the household's invitation.
  attendance = null,
  invited = null,
}) {
  if (!templateKeys.includes(type) || !copy[locale])
    throw new Error("Unsupported template or locale");
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("An HTTPS URL without embedded credentials is required");
  if (
    !preview &&
    (!dateConfirmed || !eventDate || /\.example$/.test(target.hostname))
  )
    throw new Error("Confirmed event date and real destination required");
  if (!preview && ["receipt", "update"].includes(type) && !receiptCommitted)
    throw new Error("A committed response is required");
  if (!preview && ["invitation", "reminder"].includes(type) && !rsvpDeadline)
    throw new Error("RSVP deadline required");
  if (type === "change" && !updateText.trim())
    throw new Error("Describe the approved event change");
  const c = copy[locale],
    [base, title, intro, cta] = c[type],
    rsvp = ["invitation", "reminder"].includes(type),
    // The invitation subject carries the date instead of "You're invited".
    subject =
      type === "invitation" && eventDate ? `${base} · ${eventDate}` : base,
    rows = ["invitation", "reminder", "details"].includes(type) ? schedule : [],
    quote = type === "invitation" ? note : "",
    reply = rsvp && rsvpDeadline ? c.replyBy(rsvpDeadline) : "",
    // The date as a line of its own (the schedule's heading, the preview
    // text) starts with a capital; after "·" or "Fecha del evento:" it is
    // written as passed, in lowercase.
    dateLine = eventDate ? capitalize(eventDate) : "",
    preheader = rsvp && eventDate ? `${dateLine}. ${reply}`.trim() : "";
  // A receipt repeats the answer for the events on the invitation, and says
  // until when and how to change it (the private link is not kept, so the
  // invitation email is the way back).
  const answers =
    ["receipt", "update"].includes(type) && attendance && invited
      ? Object.keys(c.events)
          .filter((e) => invited[e] && attendance[e])
          .map((e) => ({ event: c.events[e], ...attendance[e] }))
      : [];
  const declined = answers.length && answers.every((a) => !a.adultsTeens && !a.kids),
    said = declined
      ? []
      : answers.map((a) => ({
          event: a.event,
          count:
            [a.adultsTeens && c.adults(a.adultsTeens), a.kids && c.kids(a.kids)]
              .filter(Boolean)
              .join(", ") || c.absent,
        })),
    lead = declined ? c.declined : intro,
    change = answers.length && rsvpDeadline ? c.changeUntil(rsvpDeadline) : "";
  // Quick answers open the same private link with the answer pre-selected; the
  // guest still confirms on the page, so link scanners cannot submit an RSVP.
  const quick =
    ["invitation", "reminder"].includes(type) &&
    /^#[A-Za-z0-9_-]{43}$/.test(target.hash)
      ? { yes: target.href + ".yes", no: target.href + ".no" }
      : null;
  // Only an email that carries the household's private link (an invitation
  // or a reminder) asks them to keep it; the others hold no link to keep.
  const privacyNote = target.hash ? c.private : "";
  const lines = [
    preview ? c.preview : "",
    c.greeting(household),
    title,
    lead,
    // The change itself follows "here's what you need to know:" directly.
    updateText,
    said.map((a) => `${a.event}: ${a.count}`).join("\n"),
    change,
    quote ? `“${quote}” Sophia` : "",
    rows.length
      ? [dateLine, ...rows.map((r) => `${r.time} · ${r.text}`)]
          .filter(Boolean)
          .join("\n")
      : eventDate
        ? `${c.date}: ${eventDate}`
        : "",
    reply,
    `${cta}: ${target.href}`,
    ...(quick
      ? [`${c.quick[1]}: ${quick.yes}`, `${c.quick[2]}: ${quick.no}`]
      : []),
    privacyNote,
    c.help,
    c.sign,
  ].filter(Boolean);
  const html = layout(
    locale,
    subject,
    preheader,
    `${preview ? `<p style="font-size:13px;color:#651625">${c.preview}</p>` : ""}<p>${escape(c.greeting(household))}</p>${title ? `<h1 style="font:30px/1.2 Georgia,serif;color:#651625">${escape(title)}</h1>` : ""}<p>${escape(lead)}</p>${updateText ? `<p>${escape(updateText)}</p>` : ""}${said.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 16px">${said.map((a) => `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #ecdfc8;font-weight:bold;color:#651625;white-space:nowrap;vertical-align:top">${escape(a.event)}</td><td style="padding:8px 0;border-top:1px solid #ecdfc8;vertical-align:top">${escape(a.count)}</td></tr>`).join("")}</table>` : ""}${change ? `<p>${escape(change)}</p>` : ""}${quote ? `<p style="margin:0 0 16px;border-left:3px solid #e9c77b;padding:4px 0 4px 14px;font:italic 18px/1.5 Georgia,serif;color:#4a2a2e">“${escape(quote)}” <span style="font-style:normal;color:#651625">Sophia</span></p>` : ""}${rows.length ? `${dateLine ? `<p style="margin:0 0 6px"><strong>${escape(dateLine)}</strong></p>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 16px">${rows.map((r) => `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #ecdfc8;font-weight:bold;color:#651625;white-space:nowrap;vertical-align:top">${escape(r.time)}</td><td style="padding:8px 0;border-top:1px solid #ecdfc8;vertical-align:top">${escape(r.text)}</td></tr>`).join("")}</table>` : eventDate ? `<p><strong>${c.date}:</strong> ${escape(eventDate)}</p>` : ""}${reply ? `<p>${c.replyBy(`<strong>${escape(rsvpDeadline)}</strong>`)}</p>` : ""}${button(target.href, cta)}${quick ? `<p style="margin:0 0 24px">${escape(c.quick[0])}: <a href="${escape(quick.yes)}" style="color:#651625;font-weight:bold">${escape(c.quick[1])}</a> · <a href="${escape(quick.no)}" style="color:#651625;font-weight:bold">${escape(c.quick[2])}</a></p>` : ""}${privacyNote ? `<p style="font-size:14px">${escape(privacyNote)}</p>` : ""}<p>${escape(c.help)}</p><p style="font-family:Georgia,serif">${escape(c.sign)}</p>`,
  );
  return { subject, html, text: lines.join("\n\n") };
}
// A household email as the server sends it (server/application.mjs): the
// event's date and the RSVP deadline from the event settings, written by
// site/datetime.mjs (lowercase in Spanish; renderEmail capitalizes the date
// where it starts a line), the household's events and Sophia's first
// sentence. `household` is the guest-list name.
export function householdEmail({ site, deadline, invited = null, locale = "en", preview = false, ...rest }) {
  return renderEmail({
    ...rest,
    locale,
    preview,
    invited,
    eventDate: date(site.ceremony.start, locale),
    rsvpDeadline: date(deadline, locale),
    schedule: emailSchedule(site, invited, locale),
    note: firstSentence(site.quote?.[locale]),
    dateConfirmed: true,
  });
}
// "We answered your message": a reply to a guest's message waits in My
// account. It speaks to the one person who wrote (tú), in the household's
// language, and in both when that is not known.
const replyCopy = {
  en: {
    subject: "We answered your message",
    line: "We answered your message on Sophia’s quinceañera website.",
    cta: "Sign in to read our reply",
  },
  es: {
    subject: "Te respondimos",
    line: "Te respondimos en el sitio de los XV de Sophia.",
    cta: "Entra para leer nuestra respuesta",
  },
};
export function renderReplyNotice({ locale, origin }) {
  const langs = locale === "en" || locale === "es" ? [locale] : ["en", "es"],
    href = `${origin}${locale === "es" ? "/es" : ""}/account/`,
    pick = (key) => langs.map((l) => replyCopy[l][key]).join(" / "),
    // Named as the other emails' subjects name it.
    subject = `${pick("subject")} · ${langs[0] === "es" ? terms.siteName.es : terms.eventProse.en}`,
    lines = langs.map((l) => replyCopy[l].line);
  const html = layout(langs[0], subject, lines[0], `${lines.map((l) => `<p>${escape(l)}</p>`).join("")}${button(href, pick("cta"))}`);
  return { subject, html, text: [...lines, `${pick("cta")}: ${href}`].join("\n\n") };
}

// The family's own emails, to administrators only and in English (Admin is
// English): each says the same thing as text as it does as HTML (R-122).
// A link is written into the text as "<label>: <address>", as in the guests'
// emails.
const familyEmail = (paragraphs) => ({
  html: paragraphs.map((p) => `<p>${typeof p === "string" ? escape(p) : `<a href="${escape(p.href)}">${escape(p.label)}</a>`}</p>`).join(""),
  text: paragraphs.map((p) => (typeof p === "string" ? p : `${p.label}: ${p.href}`)).join("\n\n"),
});
// "A new photo is waiting for review", to NOTIFICATION_EMAILS
// (server/notifications.mjs). It names the kind of submission only: the
// guest's words and details stay in Admin.
const notificationKinds = {
  photo: "New photo awaiting review",
  video: "New video awaiting review",
  contact: "New contact form submission",
  guestbook: "New guestbook message awaiting review",
};
export function renderFamilyNotification({ kind, origin }) {
  const what = notificationKinds[kind] || "New event submission";
  return {
    subject: "SimplySoph · " + what,
    ...familyEmail([
      `${what}.`,
      { label: "Sign in to review", href: `${origin}/admin/notifications/` },
      "Guest details remain in your private administration area.",
    ]),
  };
}
// The administrator's emailed sign-in link (server/admin-email.mjs). Like the
// guests' sign-in link it is sent as a secret: Microsoft 365 sends it HTML
// only and keeps it out of Sent Items (server/mail.mjs); the text version
// travels with it on the SendGrid standby.
export function renderAdminSignInEmail({ url }) {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password)
    throw new Error("An HTTPS URL without embedded credentials is required");
  return {
    subject: "SimplySoph · Administrator sign-in",
    ...familyEmail([
      "Continue to administrator verification. Your authenticator is still required.",
      { label: "Confirm email and continue", href: target.href },
      "This link works once and expires in 15 minutes. If you did not request it, ignore this email.",
    ]),
  };
}
