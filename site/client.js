import { say, registerFor } from "./lexicon.mjs";
export const es = document.documentElement.lang === "es",
  lang = es ? "es" : "en";
// Who the page's Spanish speaks to (site/lexicon.mjs registers): the build
// writes it on <body data-register>; "ustedes" on the household's pages.
export const register = document.body?.dataset.register || registerFor(document.body?.dataset.route || "");
// Words in the page's language. The Spanish is a string, or { tu, ustedes }
// when it depends on who is addressed: the page's form picks one.
export const tr = (en, spanish) => (es ? say({ es: spanish }, "es", register) : en);
// A site/lexicon.mjs term, in the page's language and form.
export const term = (entry) => say(entry, lang, register);
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const route = (p) => (es ? "/es" : "") + "/" + p + "/";
let csrf = "";
export function setCsrf(value) {
  csrf = value;
}
const messages = {
  VERIFIED_ACCOUNT_REQUIRED: [
    "Sign in with your email to see and download photos and videos.",
    "Entra con tu correo para ver y descargar fotos y videos.",
  ],
  // Opening a photo or video upload (POST /api/uploads). Answers about the
  // pieces of a file and its conversion are worded in site/media-upload.js.
  INVALID_UPLOAD: [
    "This kind of file can't be shared here. Choose photos (JPEG, PNG or WebP) or videos (MP4, MOV or WebM).",
    "Este tipo de archivo no se puede compartir aquí. Elige fotos (JPEG, PNG o WebP) o videos (MP4, MOV o WebM).",
  ],
  VIDEO_TOO_LARGE: [
    "This video is larger than 300 MB. Trim it in your Photos or Gallery app, or record at 1080p instead of 4K, and try again.",
    "Este video pesa más de 300 MB. Recórtalo en tu app de Fotos o Galería, o grábalo en 1080p en lugar de 4K, y vuelve a intentarlo.",
  ],
  // Sign-in and invitation errors also reach the RSVP, which speaks to the
  // household: their Spanish has both forms ({ tu, ustedes }; client.js tr).
  SIGN_IN_BUSY: [
    "Several people are signing in right now. Please try again in a few seconds, or use Sign in with Microsoft or Google.",
    {
      tu: "Varias personas están entrando al sitio en este momento. Inténtalo de nuevo en unos segundos, o entra con Microsoft o Google.",
      ustedes: "Varias personas están entrando al sitio en este momento. Inténtenlo de nuevo en unos segundos, o entren con Microsoft o Google.",
    },
  ],
  UPLOAD_BUSY: [
    "Several files are arriving right now. Please try again in a minute.",
    "Están llegando varios archivos en este momento. Inténtalo de nuevo en un minuto.",
  ],
  PHOTO_BUSY: [
    "Several photos are being prepared right now. Please try again in a minute.",
    "Se están preparando varias fotos en este momento. Inténtalo de nuevo en un minuto.",
  ],
  PHOTO_TOO_LARGE: [
    "This photo is larger than 40 MB. Save a smaller copy and choose that one.",
    "Esta foto pesa más de 40 MB. Guarda una copia más pequeña y elige esa.",
  ],
  EMAIL_SIGN_IN_UNAVAILABLE: [
    "Email sign-in is not open yet. Please contact us.",
    { tu: "El acceso por correo aún no está disponible. Escríbenos.", ustedes: "El acceso por correo aún no está disponible. Escríbannos." },
  ],
  EMAIL_LINK_INVALID: [
    "This link is expired or already used. Request a new sign-in link.",
    "Este enlace venció o ya se utilizó. Solicita uno nuevo.",
  ],
  SSO_NO_ACCOUNT: [
    "We don't have this email yet. Try the one where you got your invitation, or write to us at misxv@simplysoph.com and we'll add it.",
    "Todavía no tenemos este correo. Prueba con el correo donde recibiste tu invitación, o escríbenos a misxv@simplysoph.com y lo agregamos.",
  ],
  SSO_ACCOUNT_CHANGED: [
    "This email is linked to a different Microsoft or Google account. Use the emailed sign-in link instead, or contact us.",
    "Este correo está vinculado a otra cuenta de Microsoft o Google. Usa el enlace de acceso por correo o escríbenos.",
  ],
  // Guests read this one; administrators read their own (site/admin-messages.js).
  SSO_TENANT_NOT_ALLOWED: [
    "This Microsoft account belongs to a school or workplace, so it can’t sign in here. Use the emailed sign-in link (it works with any address) or a personal Outlook or Hotmail account.",
    "Esta cuenta de Microsoft es de una escuela o un trabajo y no puede entrar aquí. Usa el enlace de acceso por correo (funciona con cualquier dirección) o una cuenta personal de Outlook o Hotmail.",
  ],
  SSO_EMAIL_NOT_VERIFIED: [
    "That account can’t confirm this email address. Gmail addresses work with Google, and Hotmail or Outlook addresses with Microsoft. Any address works with the emailed sign-in link.",
    "Esa cuenta no puede confirmar este correo. Las direcciones de Gmail funcionan con Google, y las de Hotmail u Outlook con Microsoft. Cualquier dirección funciona con el enlace de acceso por correo.",
  ],
  SSO_NOT_CONFIGURED: [
    "This sign-in option is not available yet. Use the emailed sign-in link.",
    "Esta opción de acceso aún no está disponible. Usa el enlace de acceso por correo.",
  ],
  SSO_KEYS_UNAVAILABLE: [
    "Microsoft sign-in is temporarily unavailable. Please retry in a minute.",
    "El acceso con Microsoft no está disponible por ahora. Inténtalo de nuevo en un minuto.",
  ],
  INVITATION_INACTIVE: [
    "This invitation isn't active right now. Please contact us.",
    { tu: "Esta invitación no está activa en este momento. Escríbenos.", ustedes: "Esta invitación no está activa en este momento. Escríbannos." },
  ],
  INVITATION_NOT_READY: [
    "Your invitation hasn't been sent yet. The RSVP opens once we send it.",
    {
      tu: "Tu invitación aún no se ha enviado. Podrás confirmar tu asistencia cuando te la enviemos.",
      ustedes: "Su invitación aún no se ha enviado. Podrán confirmar su asistencia cuando se la enviemos.",
    },
  ],
  SIGN_IN_FAILED: [
    "We couldn't confirm that sign-in. Please try again.",
    { tu: "No pudimos confirmar ese acceso. Inténtalo de nuevo.", ustedes: "No pudimos confirmar ese acceso. Inténtenlo de nuevo." },
  ],
  CSRF_REJECTED: [
    "Your page was open too long. Please refresh it and try again.",
    {
      tu: "La página estuvo abierta demasiado tiempo. Actualízala e inténtalo de nuevo.",
      ustedes: "La página estuvo abierta demasiado tiempo. Actualícenla e inténtenlo de nuevo.",
    },
  ],
  INVALID_EMAIL: [
    "Please check the email address and try again.",
    { tu: "Revisa la dirección de correo e inténtalo de nuevo.", ustedes: "Revisen la dirección de correo e inténtenlo de nuevo." },
  ],
  SIGN_IN_AGAIN: [
    "That sign-in expired or was already used. Choose your sign-in option again.",
    "Ese acceso venció o ya se usó. Vuelve a elegir tu forma de acceso.",
  ],
  SIGN_IN_REQUIRED: [
    "Please sign in again: open your invitation link to RSVP, or sign in with your email on My account.",
    {
      tu: "Vuelve a entrar: abre tu enlace de invitación para confirmar tu asistencia, o entra con tu correo en Mi cuenta.",
      ustedes: "Vuelvan a entrar: abran su enlace de invitación para confirmar su asistencia, o entren con su correo en Mi cuenta.",
    },
  ],
  INVALID_INVITATION: [
    "That invitation could not be opened. Check the link or contact us.",
    { tu: "No pudimos abrir la invitación. Revisa el enlace o escríbenos.", ustedes: "No pudimos abrir la invitación. Revisen el enlace o escríbannos." },
  ],
  // Only Save on the RSVP review gets these two, and the review speaks to the
  // household (ustedes), so they do too.
  RESPONSE_CHANGED: [
    "Your RSVP changed in another window. Reload to see the latest saved RSVP.",
    "Su respuesta cambió en otra ventana. Recarguen la página para revisar la última respuesta guardada.",
  ],
  RSVP_CLOSED: [
    "The RSVP deadline has passed. Please contact us.",
    "La fecha límite ya pasó. Por favor, escríbannos.",
  ],
  CAPACITY_NEEDS_REVIEW: [
    "We need to review the spaces on this invitation. Please contact us.",
    "Necesitamos revisar los lugares de esta invitación. Por favor, escríbannos.",
  ],
  TOO_MANY_REQUESTS: [
    "Please wait before trying again.",
    { tu: "Espera un momento antes de intentarlo de nuevo.", ustedes: "Esperen un momento antes de intentarlo de nuevo." },
  ],
  // The upload page words limits itself, with the number and the time the
  // API sends (site/media-upload.js); these are the plain fallbacks.
  DAILY_UPLOAD_LIMIT: [
    "Your family has reached the limit for photos and videos for now.",
    "Tu familia alcanzó el límite de fotos y videos por ahora.",
  ],
  PARTY_DEVICE_LIMIT: [
    "This phone has shared the most photos and videos we take from one phone at a time. Thank you!",
    "Este teléfono ya compartió el máximo de fotos y videos que recibimos de un teléfono a la vez. ¡Gracias!",
  ],
  PARTY_CARD_FULL: [
    "The table card has received all the photos and videos it can take. Thank you!",
    "La tarjeta de la mesa ya recibió todas las fotos y videos que puede recibir. ¡Gracias!",
  ],
  PARTY_CARD_INVALID: [
    "This table card isn’t working. Ask us for the current card.",
    "Esta tarjeta de la mesa no funciona. Pídenos la tarjeta vigente.",
  ],
  PARTY_NOT_OPEN: [
    "Sharing from the table card hasn’t opened yet.",
    "Todavía no se puede compartir desde la tarjeta de la mesa.",
  ],
  PARTY_CLOSED: [
    "Sharing from the table card has closed.",
    "Ya no se puede compartir desde la tarjeta de la mesa.",
  ],
  MEDIA_BUSY: [
    "This video is being prepared right now. Try again in a few minutes.",
    "Este video se está preparando en este momento. Inténtalo de nuevo en unos minutos.",
  ],
  API_NOT_CONFIGURED: [
    "Online submissions are not open yet. Please contact us.",
    { tu: "Los envíos en línea aún no están disponibles. Escríbenos.", ustedes: "Los envíos en línea aún no están disponibles. Escríbannos." },
  ],
  WHATSAPP_PHONE_INVALID: [
    "WhatsApp can't use this number. Check the country code and the number, like +52 55 1234 5678.",
    "WhatsApp no puede usar este número. Revisa el código de país y el número, como +52 55 1234 5678.",
  ],
  // site/guest-whatsapp.js adds the SMS keyword when SMS is live.
  WHATSAPP_US_NUMBER: [
    "WhatsApp updates are for numbers outside the US and Canada.",
    "Los avisos por WhatsApp son para números fuera de Estados Unidos y Canadá.",
  ],
  WHATSAPP_NOT_AVAILABLE: [
    "WhatsApp updates haven’t started yet. Nothing was saved.",
    "Los avisos por WhatsApp aún no empiezan. No se guardó nada.",
  ],
  // The note page speaks to one person (tú).
  LINK_NOTE_ALREADY_SENT: [
    "Your family already sent a note from this invitation link. To write another, sign in with your email.",
    "Tu familia ya envió un mensaje desde este enlace de invitación. Para escribir otro, entra con tu correo.",
  ],
  LINK_SESSION_REQUIRED: [
    "Open your invitation link again to send your note from it.",
    "Abre de nuevo tu enlace de invitación para enviar tu mensaje desde él.",
  ],
};
// Admin pages add their own errors, and their own wording of some of the
// above (site/admin-messages.js), so guest pages never download them.
export const addMessages = (more) => Object.assign(messages, more);
const onAdminPage = () => /^admin(\/|$)/.test(document.body?.dataset.route || "");
// An error written into a guest's alert. Its words that point to us become
// links, built as DOM so no message is ever read as HTML: "contact us",
// "escríbenos" and "escríbannos" open Contact, and our address opens an email.
// Admin pages keep plain text. Returns whether a link was made.
const toUs = "contact us|escr[ií]benos|escr[ií]bannos|misxv@simplysoph\\.com";
export const mentionsUs = (text) => new RegExp(toUs, "i").test(text);
export function sayError(box, message) {
  const text = String(message ?? ""),
    parts = [];
  let last = 0;
  if (!onAdminPage())
    for (const m of text.matchAll(new RegExp(toUs, "gi"))) {
      const a = document.createElement("a");
      a.href = m[0].includes("@") ? "mailto:" + m[0] : route("contact");
      a.textContent = m[0];
      parts.push(text.slice(last, m.index), a);
      last = m.index + m[0].length;
    }
  box.replaceChildren(...parts, text.slice(last));
  return parts.length > 0;
}
// Trouble reaching the API (an outage, a proxy's HTML error page, a dropped
// connection) is not an answer from it: guests must never read it as
// "submissions are closed". A form being sent keeps what was typed.
function trouble(sending, network) {
  if (network)
    return sending
      ? tr("We couldn't reach the website. Your answers are still here; check your connection and try again.", {
          tu: "No pudimos conectar con el sitio. Tus respuestas siguen aquí; revisa tu conexión e inténtalo de nuevo.",
          ustedes: "No pudimos conectar con el sitio. Sus respuestas siguen aquí; revisen su conexión e inténtenlo de nuevo.",
        })
      : tr("We couldn't reach the website. Check your connection and try again.", {
          tu: "No pudimos conectar con el sitio. Revisa tu conexión e inténtalo de nuevo.",
          ustedes: "No pudimos conectar con el sitio. Revisen su conexión e inténtenlo de nuevo.",
        });
  return sending
    ? tr("Something went wrong on our end. Your answers are still here — try again in a minute, or email misxv@simplysoph.com.", {
        tu: "Algo falló de nuestro lado. Tus respuestas siguen aquí; inténtalo de nuevo en un minuto o escríbenos a misxv@simplysoph.com.",
        ustedes: "Algo falló de nuestro lado. Sus respuestas siguen aquí; inténtenlo de nuevo en un minuto o escríbannos a misxv@simplysoph.com.",
      })
    : tr("Something went wrong on our end. Please try again in a minute, or email misxv@simplysoph.com.", {
        tu: "Algo falló de nuestro lado. Inténtalo de nuevo en un minuto o escríbenos a misxv@simplysoph.com.",
        ustedes: "Algo falló de nuestro lado. Inténtenlo de nuevo en un minuto o escríbannos a misxv@simplysoph.com.",
      });
}
export async function api(path, body, options = {}) {
  let res;
  try {
    res = await fetch("/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(body !== undefined
          ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
          : {}),
        ...options.headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw Object.assign(new Error(trouble(body !== undefined, true)), {
      code: "NETWORK_ERROR",
    });
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw Object.assign(new Error(trouble(body !== undefined, false)), {
      code: "SERVER_UNAVAILABLE",
      status: res.status,
    });
  }
  if (!res.ok) {
    const pair = messages[data?.error];
    throw Object.assign(
      new Error(
        pair
          ? tr(...pair)
          : res.status >= 500
            ? trouble(body !== undefined, false)
            : tr("We couldn’t finish that. Please try again, or contact us.", {
                tu: "No pudimos completar la solicitud. Inténtalo de nuevo o escríbenos.",
                ustedes: "No pudimos completar la solicitud. Inténtenlo de nuevo o escríbannos.",
              }),
      ),
      // `details`: the facts behind a refusal (a limit, how many were used,
      // when more fit), for pages that say more than the code's sentence.
      { code: data?.error, status: res.status, details: data },
    );
  }
  if (data.csrf) setCsrf(data.csrf);
  return data;
}
// The page-wide note at the bottom, for news that belongs to no control: what
// a form or button caused is shown next to it instead. An optional
// { href, label } adds a link after the message (built as DOM, not HTML). The
// note stays until it is closed or replaced (never on a timer: WCAG 2.2.1),
// and while it shows, the page keeps the focused control scrolled clear of it.
export function notify(text, link) {
  const box = document.querySelector("#status");
  if (!box) return;
  const message = document.createElement("span");
  message.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    message.append(" ", a);
  }
  const close = document.createElement("button");
  close.type = "button";
  close.className = "status-close plain-button";
  close.textContent = tr("Close", "Cerrar");
  close.addEventListener("click", () => {
    const back = notify.returnTo;
    clearNote();
    if (back?.isConnected) back.focus();
  });
  if (!box.contains(document.activeElement)) notify.returnTo = document.activeElement;
  box.replaceChildren(message, " ", close);
  // The note's height plus its gap from the bottom of the window.
  const room = Math.ceil(innerHeight - box.getBoundingClientRect().top) + 16 + "px";
  document.documentElement.style.scrollPaddingBottom = room;
  document.body.style.paddingBottom = room;
  const focused = document.activeElement;
  if (focused && focused !== document.body && !box.contains(focused))
    focused.scrollIntoView({ block: "nearest", behavior: "instant" });
}
function clearNote() {
  const box = document.querySelector("#status");
  if (box?.contains(document.activeElement) && notify.returnTo?.isConnected)
    notify.returnTo.focus();
  box?.replaceChildren();
  document.documentElement.style.scrollPaddingBottom = "";
  document.body.style.paddingBottom = "";
}
// Moves focus to content that just replaced what was there (a step's heading,
// a saved or error message), so keyboard and screen-reader users land on it.
export function focusOn(el) {
  if (!el) return;
  if (!el.matches("a[href],button,input,select,textarea,[tabindex]")) el.tabIndex = -1;
  el.focus();
}
let fields = 0;
// A labelled input. `hint` adds a sentence under it: the input is named by the
// label's own words (aria-labelledby) and described by the hint, so the hint
// is not read as part of its name. `attrs` is trusted, fixed markup (for
// example 'autocapitalize="off"'), never guest data.
export function field(
  label,
  name,
  {
    type = "text",
    value = "",
    required = false,
    max = 254,
    autocomplete = "",
    inputmode = "",
    hint = "",
    attrs = "",
  } = {},
) {
  const id = "field-" + ++fields,
    extra = `${inputmode ? ` inputmode="${esc(inputmode)}"` : ""}${hint ? ` aria-labelledby="${id}-label" aria-describedby="${id}-hint"` : ""}${attrs ? " " + attrs : ""}`;
  return `<label>${hint ? `<span id="${id}-label">${esc(label)}</span>` : esc(label)}<input id="${id}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${max}"${autocomplete ? ` autocomplete="${esc(autocomplete)}"` : ""}${extra}>${hint ? `<span class="hint field-hint" id="${id}-hint">${esc(hint)}</span>` : ""}</label>`;
}
// The words a form check uses for a control: its data-label, its
// aria-labelledby text, else the text written directly in its label (not the
// options of a select inside it).
function labelOf(control) {
  if (control.dataset.label) return control.dataset.label;
  const named = control.getAttribute("aria-labelledby");
  if (named) return document.getElementById(named.split(" ")[0])?.textContent.trim() || control.name;
  const label = control.labels?.[0];
  if (!label) return control.name;
  return (
    [...label.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join(" ")
      .trim() ||
    label.textContent.trim() ||
    control.name
  );
}
function unmark(control) {
  control.removeAttribute("aria-invalid");
  const note = document.getElementById(control.id + "-error");
  if (!note) return;
  note.remove();
  const ids = (control.getAttribute("aria-describedby") || "")
    .split(" ")
    .filter((id) => id && id !== note.id);
  if (ids.length) control.setAttribute("aria-describedby", ids.join(" "));
  else control.removeAttribute("aria-describedby");
}
// Forms are checked here, not by the browser (novalidate): the browser shows
// one field at a time, in its own language. This lists every field to fix in
// the page's language, each linked to its field, marks the fields
// (aria-invalid, with a note under each tied by aria-describedby) and moves
// focus to the list. A control's data-check replaces the opening words of
// its line ("Choose how many for:"). `only` limits the check to some controls
// (the RSVP's quick answers fill the counts themselves). Returns whether the
// form is complete.
export function checkForm(form, only = () => true) {
  form.querySelector(".error-summary")?.remove();
  const lines = new Map();
  for (const control of form.elements) {
    if (!control.willValidate || !only(control)) continue;
    if (control.validity.valid) {
      unmark(control);
      continue;
    }
    if (!control.id) control.id = "field-" + ++fields;
    const v = control.validity,
      opening =
        control.dataset.check ||
        (control.type === "checkbox"
          ? tr("Tick the box:", "Marcar la casilla:")
          : control.type === "file"
            ? tr("Choose:", "Elegir:")
            : control.tagName === "SELECT"
              ? tr("Choose an answer for:", "Elegir una respuesta para:")
              : v.valueMissing
                ? tr("Fill in:", "Completar:")
                : control.type === "email"
                  ? tr("Check the email address:", "Revisar el correo:")
                  : tr("Check:", "Revisar:"));
    if (!lines.has(opening)) lines.set(opening, []);
    lines.get(opening).push(control);
    if (!document.getElementById(control.id + "-error")) {
      const note = document.createElement("span");
      note.className = "field-error";
      note.id = control.id + "-error";
      // A control's data-error names what to fix when the generic words
      // would repeat down a form (the RSVP's counts, one pair per event).
      note.textContent =
        control.dataset.error ||
        (v.valueMissing && control.type !== "checkbox"
          ? control.tagName === "SELECT"
            ? tr("Choose one.", "Falta elegir una opción.")
            : control.type === "file"
              ? tr("Choose at least one file.", "Falta elegir al menos un archivo.")
              : tr("Fill this in.", "Falta este dato.")
          : control.type === "checkbox"
            ? tr("Tick this box to continue.", "Hay que marcar esta casilla para continuar.")
            : control.type === "email"
              ? tr("Use an address like name@example.com.", "Debe ser un correo como nombre@ejemplo.com.")
              : tr("Check this field.", "Este dato no es válido."));
      // Inside the label, so a field grid keeps its layout; hidden from the
      // label's own text (the field's name) and read as its description.
      note.setAttribute("aria-hidden", "true");
      const label = control.closest("label");
      if (label) label.append(note);
      else control.after(note);
      control.setAttribute(
        "aria-describedby",
        [control.getAttribute("aria-describedby"), note.id].filter(Boolean).join(" "),
      );
    }
    control.setAttribute("aria-invalid", "true");
  }
  const prefix = tr("Error: ", "Error: ");
  if (!lines.size) {
    if (document.title.startsWith(prefix)) document.title = document.title.slice(prefix.length);
    return true;
  }
  // Each kind of problem is a line ("Fill in:") over a list with one link
  // per thing to fix, so no name breaks across a comma-separated line. The
  // controls of a group that names itself (an RSVP event's fieldset,
  // data-check-group) get one link, by the group's name, to the first of
  // them to fix.
  const summary = document.createElement("div");
  summary.className = "error-summary";
  summary.setAttribute("role", "alert");
  summary.tabIndex = -1;
  for (const [opening, controls] of lines) {
    const line = document.createElement("p"),
      list = document.createElement("ul"),
      named = new Set();
    line.textContent = opening;
    for (const control of controls) {
      const group = control.closest("fieldset[data-check-group]");
      if (group && named.has(group)) continue;
      if (group) named.add(group);
      const item = document.createElement("li"),
        a = document.createElement("a");
      a.href = "#" + control.id;
      a.textContent = group ? group.dataset.checkGroup : labelOf(control);
      // Focus the field without putting its id in the address bar, where a
      // reload would read it as an invitation or sign-in link.
      a.addEventListener("click", (e) => {
        e.preventDefault();
        control.focus();
      });
      item.append(a);
      list.append(item);
    }
    summary.append(line, list);
  }
  form.prepend(summary);
  if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
  summary.focus();
  return false;
}
// ---- Busy state (one for every submit) ----
// Screen-reader news that belongs to no form: one polite region (#announce,
// built with every page) outside all forms, so a busy form never holds it
// back. The text is set a moment after clearing, so the same words said twice
// are read twice; a later call or silence() replaces what is still pending.
let announcing = 0,
  pending = "";
export function announce(text) {
  let box = document.getElementById("announce");
  if (!box) {
    box = document.createElement("div");
    box.id = "announce";
    box.className = "visually-hidden";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  clearTimeout(announcing);
  box.textContent = "";
  pending = text;
  announcing = setTimeout(() => {
    box.textContent = text;
    pending = "";
  }, 100);
}
// Takes back words no longer true ("Saving…" once saved), said or still to be.
function silence(text) {
  if (pending === text) {
    clearTimeout(announcing);
    pending = "";
  }
  const box = document.getElementById("announce");
  if (box?.textContent === text) box.textContent = "";
}
// Marks a button busy while its request is on its way: aria-disabled, not
// disabled (disabling the focused button dropped focus to the page in
// Chromium); its words become what is happening (data-busy, else "Saving…"),
// at no narrower a width, so nothing moves under the pointer; aria-busy on the
// region it belongs to (its form); and the same words announced. Returns the
// function that puts everything back. It is undone before any error is
// written, since aria-busy on an ancestor can hold back the error's alert.
export function markBusy(button, region = button?.form) {
  if (!button) return () => {};
  const words = button.dataset.busy || tr("Saving…", "Guardando…"),
    label = [...button.childNodes],
    width = button.style.minInlineSize;
  button.style.minInlineSize = button.getBoundingClientRect().width + "px";
  button.setAttribute("aria-disabled", "true");
  button.classList.add("is-busy");
  button.replaceChildren(words);
  region?.setAttribute("aria-busy", "true");
  announce(words);
  return () => {
    region?.removeAttribute("aria-busy");
    silence(words);
    button.replaceChildren(...label);
    button.style.minInlineSize = width;
    button.classList.remove("is-busy");
    button.removeAttribute("aria-disabled");
  };
}
// Runs fn with the form's data once the form is complete, with the submit
// button busy (markBusy) meanwhile. A second submit while busy is ignored. An
// error is shown in the form's own alert, next to the button, once the form is
// no longer busy. A field's error note goes as soon as what is typed is valid:
// waiting for "change", which fires when the field loses focus, removed it
// during the press on the button, so the button moved up under the pointer and
// the press was lost.
export async function submit(form, fn) {
  form.noValidate = true;
  form.addEventListener("input", (e) => {
    if (e.target.getAttribute?.("aria-invalid") && e.target.validity.valid) unmark(e.target);
  });
  let busy = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || !checkForm(form)) return;
    const button = form.querySelector("[type=submit]"),
      target = form.querySelector(".error[role=alert]") || form.querySelector("[role=alert]:not(.error-summary)");
    busy = true;
    if (target) target.textContent = "";
    const done = markBusy(button, form);
    try {
      await fn(new FormData(form));
      done();
    } catch (err) {
      done();
      if (target?.isConnected) sayError(target, err.message);
      else notify(err.message);
    } finally {
      busy = false;
    }
  });
}
// A URL fragment is either an in-page anchor (the skip link's #main, the photo
// QR code's #media-upload) or the one-time credential from an emailed or texted
// link (/rsvp/#…, /account/#…, /admin/login/#…, Microsoft's #state=…). Anchors
// belong to the browser: reading one as a credential, or reloading for it,
// threw away whatever the guest was filling in. Only a credential is returned.
export function linkFragment(hash = location.hash) {
  const value = hash.replace(/^#/, "");
  if (!value) return "";
  let id = value;
  try {
    id = decodeURIComponent(value);
  } catch {
    /* not percent-encoded: compare as written */
  }
  return document.getElementById(id) ? "" : value;
}
// An emailed link opened in a tab already on the page only changes the hash;
// reload so the new link is read like a fresh visit. Anchors never reload.
export function reloadOnNewLink(when = () => true) {
  addEventListener("hashchange", () => {
    if (linkFragment() && when()) location.reload();
  });
}
// Apply the shared action layout to dynamically rendered table cells.
const spaceActions = () =>
  document.querySelectorAll("td").forEach((td) => {
    if (td.querySelector(":scope > .table-actions")) return;
    const actions = Array.from(td.children).filter((el) =>
      el.matches("a,button"),
    );
    if (actions.length < 2) return;
    const group = document.createElement("div");
    group.className = "table-actions";
    td.insertBefore(group, actions[0]);
    actions.forEach((el) => group.append(el));
  });
new MutationObserver(spaceActions).observe(document.querySelector("main"), {
  childList: true,
  subtree: true,
});
spaceActions();
