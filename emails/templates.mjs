// Pure rendering only. No network, credentials, scheduling, or live dispatch.
import { event } from "../site/content.mjs";
// Invitations read like a letter (real date, places and Sophia's own words)
// instead of a lone "view your invitation" button, which is the shape of
// common invitation-phishing mail and lands in spam.
const copy = {
  en: {
    invitation: [
      "Sophia’s Mis XV",
      "",
      "Sophia is turning fifteen, and she would love for your family to celebrate with her.",
      "RSVP for your household",
    ],
    receipt: [
      "We received your RSVP · Sophia’s Mis XV",
      "Thank you for your response.",
      "Your household’s response has been received. You can review your attendance and make permitted changes through your private invitation.",
      "Review your response",
    ],
    update: [
      "Your RSVP has been updated · Sophia’s Mis XV",
      "Your latest response is recorded.",
      "To review your latest response, open your private invitation link or sign in with your verified email on the My Account page.",
      "View updated response",
    ],
    reminder: [
      "A little reminder · Sophia’s Mis XV",
      "Will you join us?",
      "We are still waiting for all or part of your household’s response.",
      "Complete your RSVP",
    ],
    details: [
      "Before we celebrate · Sophia’s Mis XV",
      "The celebration is almost here.",
      "Please review the confirmed schedule, directions, arrival guidance, and any updates before the celebration.",
      "View event details",
    ],
    change: [
      "An important update · Sophia’s Mis XV",
      "Please review an event update.",
      "The family has confirmed a change to the celebration. The details below explain what changed.",
      "Read the update",
    ],
    thanks: [
      "With love and thanks · Sophia’s Mis XV",
      "Thank you for being part of this chapter.",
      "Your love and support mean so much to Sophia and her family. We are grateful to have you in our lives.",
      "A message from Sophia",
    ],
    greeting: "Hello",
    date: "Event date",
    deadline: "RSVP by",
    replyBy: (d) => `Please let us know by ${d}.`,
    quick: ["Or answer now", "We'll be there", "We can't make it"],
    private: "Your RSVP link is just for your household.",
    help: `Add ${event.sender} to your contacts so updates reach your inbox. Questions? Just reply and the family will answer.`,
    sign: "With love, Sophia & family",
    preview: "SAMPLE PREVIEW — NOT SENT",
  },
  es: {
    invitation: [
      "Los XV de Sophia",
      "",
      "Sophia cumple quince años y le encantaría que tu familia celebrara con ella.",
      "Responder por tu familia",
    ],
    receipt: [
      "Recibimos tu confirmación · Los XV de Sophia",
      "Gracias por responder.",
      "Recibimos la respuesta de tu familia. Puedes revisar su asistencia y hacer los cambios permitidos a través de tu invitación privada.",
      "Revisar tu respuesta",
    ],
    update: [
      "Actualizamos tu respuesta · Los XV de Sophia",
      "Tu nueva respuesta quedó registrada.",
      "Abre tu invitación privada para revisar las respuestas más recientes de tu familia.",
      "Ver la respuesta actualizada",
    ],
    reminder: [
      "Un pequeño recordatorio · Los XV de Sophia",
      "¿Nos acompañarán?",
      "Aún nos falta toda o parte de la respuesta de tu familia.",
      "Confirmar asistencia",
    ],
    details: [
      "Antes de celebrar · Los XV de Sophia",
      "La celebración se acerca.",
      "Revisa el programa confirmado, las direcciones, las indicaciones de llegada y cualquier novedad antes de la celebración.",
      "Ver los detalles",
    ],
    change: [
      "Una actualización importante · Los XV de Sophia",
      "Revisa este cambio del evento.",
      "La familia confirmó un cambio en la celebración. Los detalles a continuación explican qué cambió.",
      "Leer la actualización",
    ],
    thanks: [
      "Con cariño y gratitud · Los XV de Sophia",
      "Gracias por ser parte de este capítulo.",
      "Tu cariño y apoyo significan mucho para Sophia y su familia. Gracias por formar parte de nuestras vidas.",
      "Un mensaje de Sophia",
    ],
    greeting: "Hola",
    date: "Fecha del evento",
    deadline: "Confirma antes del",
    replyBy: (d) => `Por favor, confírmanos a más tardar el ${d}.`,
    quick: ["O responde ahora", "Ahí estaremos", "No podremos asistir"],
    private: "Tu enlace es solo para tu familia.",
    help: `Agrega ${event.sender} a tus contactos para que nuestras novedades lleguen a tu bandeja de entrada. ¿Preguntas? Solo responde a este correo y la familia te contestará.`,
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
const TZ = "America/Chicago";
// Clock times are built by hand: Intl inserts U+202F before AM/PM, which the
// mail server's Windows-1252 conversion cannot carry.
function clock(iso, locale) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  const pm = /p/i.test(p.dayPeriod);
  return `${p.hour}:${p.minute} ${locale === "es" ? (pm ? "p. m." : "a. m.") : pm ? "PM" : "AM"}`;
}
export function longDate(iso, locale = "en") {
  return new Intl.DateTimeFormat(locale === "es" ? "es-US" : "en-US", {
    timeZone: TZ,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })
    .format(new Date(iso))
    .replace(/\s+/g, " ")
    .replace(locale === "es" ? /^(\p{L}+),/u : /$^/, "$1");
}
// Only the events this household is invited to, from the admin's site settings.
export function emailSchedule(site, invited, locale = "en") {
  if (!site || !invited) return [];
  const es = locale === "es",
    rows = [],
    place = (v) => `${v.name}, ${v.address}`;
  if (invited.ceremony)
    rows.push({
      time: clock(site.ceremony.start, locale),
      text: `${es ? "Ceremonia religiosa" : "Ceremony"} · ${place(site.ceremony)}`,
    });
  if (invited.dinner || invited.dance) {
    const at = clock(site.reception.start, locale),
      label =
        invited.dinner && invited.dance
          ? es
            ? `Cena y, a las ${at}, la recepción`
            : `Dinner, then the reception at ${at}`
          : invited.dinner
            ? es
              ? "Cena"
              : "Dinner"
            : es
              ? "Recepción"
              : "Reception";
    rows.push({
      time: clock(invited.dinner ? site.dinner.start : site.reception.start, locale),
      text: `${label} · ${place(site.reception)}`,
    });
  }
  return rows;
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
    preheader = rsvp && eventDate ? `${eventDate}. ${reply}`.trim() : "";
  // Quick answers open the same private link with the answer pre-selected; the
  // guest still confirms on the page, so link scanners cannot submit an RSVP.
  const quick =
    ["invitation", "reminder"].includes(type) &&
    /^#[A-Za-z0-9_-]{43}$/.test(target.hash)
      ? { yes: target.href + ".yes", no: target.href + ".no" }
      : null;
  const privacyNote = target.hash
    ? c.private
    : locale === "es"
      ? "Mantén privado el enlace de tu invitación."
      : "Keep your private invitation link confidential.";
  const lines = [
    preview ? c.preview : "",
    `${c.greeting} ${household},`,
    title,
    intro,
    quote ? `“${quote}” Sophia` : "",
    rows.length
      ? [eventDate, ...rows.map((r) => `${r.time} · ${r.text}`)]
          .filter(Boolean)
          .join("\n")
      : eventDate
        ? `${c.date}: ${eventDate}`
        : "",
    reply,
    updateText,
    `${cta}: ${target.href}`,
    ...(quick
      ? [`${c.quick[1]}: ${quick.yes}`, `${c.quick[2]}: ${quick.no}`]
      : []),
    privacyNote,
    c.help,
    c.sign,
  ].filter(Boolean);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;background:#fbf5e9;color:#351e21;font:16px/1.6 Arial,sans-serif">${preheader ? `<div style="display:none;max-height:0;overflow:hidden">${escape(preheader)}</div>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="560" style="width:100%;max-width:560px;background:#fffdf8;border:1px solid #d9c6a5" cellspacing="0" cellpadding="0"><tr><td style="background:#651625;color:#e9c77b;padding:28px;text-align:center;font:36px Georgia,serif">Sophia · Mis XV</td></tr><tr><td style="padding:28px">${preview ? `<p style="font-size:13px;color:#651625">${c.preview}</p>` : ""}<p>${escape(c.greeting)} ${escape(household)},</p>${title ? `<h1 style="font:30px/1.2 Georgia,serif;color:#651625">${escape(title)}</h1>` : ""}<p>${escape(intro)}</p>${quote ? `<p style="margin:0 0 16px;border-left:3px solid #e9c77b;padding:4px 0 4px 14px;font:italic 18px/1.5 Georgia,serif;color:#4a2a2e">“${escape(quote)}” <span style="font-style:normal;color:#651625">Sophia</span></p>` : ""}${rows.length ? `${eventDate ? `<p style="margin:0 0 6px"><strong>${escape(eventDate)}</strong></p>` : ""}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 16px">${rows.map((r) => `<tr><td style="padding:8px 12px 8px 0;border-top:1px solid #ecdfc8;font-weight:bold;color:#651625;white-space:nowrap;vertical-align:top">${escape(r.time)}</td><td style="padding:8px 0;border-top:1px solid #ecdfc8;vertical-align:top">${escape(r.text)}</td></tr>`).join("")}</table>` : eventDate ? `<p><strong>${c.date}:</strong> ${escape(eventDate)}</p>` : ""}${reply ? `<p>${c.replyBy(`<strong>${escape(rsvpDeadline)}</strong>`)}</p>` : ""}${updateText ? `<p>${escape(updateText)}</p>` : ""}<p style="margin:28px 0"><a href="${escape(target.href)}" style="display:inline-block;background:#651625;color:#fff;padding:14px 22px;text-decoration:none">${escape(cta)}</a></p>${quick ? `<p style="margin:0 0 24px">${escape(c.quick[0])}: <a href="${escape(quick.yes)}" style="color:#651625;font-weight:bold">${escape(c.quick[1])}</a> · <a href="${escape(quick.no)}" style="color:#651625;font-weight:bold">${escape(c.quick[2])}</a></p>` : ""}<p style="font-size:14px">${escape(privacyNote)}</p><p>${escape(c.help)}</p><p style="font-family:Georgia,serif">${escape(c.sign)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, html, text: lines.join("\n\n") };
}
