export const es = document.documentElement.lang === "es";
export const tr = (en, spanish) => (es ? spanish : en);
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
  INVALID_AMOUNT: [
    "Use a nonnegative amount with at most two decimal places.",
    "Usa una cantidad positiva con hasta dos decimales.",
  ],
  INVALID_DOCUMENT: [
    "Choose a valid JPG, PNG, WebP, PDF, text or Office file up to 8 MB.",
    "Elige un archivo válido de hasta 8 MB.",
  ],
  NO_ELIGIBLE_RECIPIENTS: [
    "None of the selected households can receive this. For texts, tick households marked Subscribed.",
    "Ninguna de las familias seleccionadas puede recibir esto. Para mensajes de texto, elige familias marcadas como Suscrita.",
  ],
  CONFIRM_COUNT_MISMATCH: [
    "Type the exact number shown to confirm. Nothing was sent.",
    "Escribe el número exacto para confirmar. No se envió nada.",
  ],
  SMS_NOT_SUBSCRIBED: [
    "That phone hasn't texted SOPHIA to the event number yet, or it texted STOP. Text SOPHIA first, then try again.",
    "Ese teléfono aún no envió SOPHIA al número del evento, o envió STOP. Envía SOPHIA primero e inténtalo de nuevo.",
  ],
  SMS_NOT_ENABLED: [
    "Text sending is switched off on the server. Ask whoever runs the website to turn it on.",
    "El envío de mensajes de texto está apagado en el servidor.",
  ],
  SMS_REJECTED: [
    "Twilio refused this text. The usual cause is the website's Twilio API key missing the Messages create permission. The Twilio error code is shown on the record below.",
    "Twilio rechazó este mensaje. La causa habitual es que la clave API de Twilio del sitio no tiene permiso para crear mensajes. El código de error de Twilio aparece en el registro.",
  ],
  SMS_DELIVERY_UNKNOWN: [
    "Twilio did not answer clearly. Check Twilio's message log before trying again; the text may have gone out.",
    "Twilio no respondió con claridad. Revisa el registro de mensajes de Twilio antes de reintentar; el mensaje pudo haberse enviado.",
  ],
  SMS_OPTED_OUT: [
    "This phone texted STOP. Nothing was sent.",
    "Este teléfono envió STOP. No se envió nada.",
  ],
  SMS_COUNTRY_NOT_ALLOWED: [
    "Texts can only go to US and Canadian numbers. Use WhatsApp or email for other countries.",
    "Los mensajes de texto solo llegan a números de EE. UU. y Canadá. Usa WhatsApp o correo para otros países.",
  ],
  SMS_DESTINATION_INVALID: [
    "Enter the phone with its country code, like +1 817 555 0123.",
    "Escribe el teléfono con su código de país, como +1 817 555 0123.",
  ],
  BATCH_NOT_CONFIRMED: [
    "Confirm this batch before sending.",
    "Confirma este lote antes de enviarlo.",
  ],
  BATCH_NOT_DRAFT: [
    "This batch was already confirmed or cancelled. Reopen it to see its status.",
    "Este lote ya fue confirmado o cancelado.",
  ],
  BATCH_ALREADY_SENDING: [
    "This batch is being sent from another tab. Wait a minute, then reopen it.",
    "Este lote se está enviando desde otra pestaña. Espera un minuto y vuelve a abrirlo.",
  ],
  INVALID_AUDIENCE: [
    "Select at least one household.",
    "Selecciona al menos una familia.",
  ],
  EVENTS_REQUIRED: [
    "Choose at least one event for the invitation.",
    "Elige al menos un evento para la invitación.",
  ],
  LINKS_NOT_READY: [
    "None of these households has an active private link for {link}. Create their links first. Nothing was drafted.",
    "Ninguno de estos hogares tiene un enlace privado activo para {link}. Crea sus enlaces primero. No se creó ningún borrador.",
  ],
  SMS_BRAND_OR_STOP_MISSING: [
    "Start the text with “Simply Soph Media:” and include STOP opt-out wording.",
    "Empieza el mensaje con “Simply Soph Media:” e incluye la opción STOP.",
  ],
  INVALID_DATA_SOURCE: [
    "Enter the Notion data source ID for this table.",
    "Ingresa el ID de la fuente de datos de Notion.",
  ],
  NAME_REQUIRED: [
    "Enter an item or person name.",
    "Ingresa el nombre del artículo o persona.",
  ],
  NOTION_404: [
    "Share this database with the dedicated Notion connection and check its data source ID.",
    "Comparte esta base de datos con la conexión de Notion y verifica su ID.",
  ],
  SETTINGS_CHANGED: [
    "Another organizer changed these settings. Reload before saving.",
    "Otro organizador cambió estos ajustes. Recarga antes de guardar.",
  ],
  INVALID_SITE_SETTINGS: [
    "Check the required fields, HTTPS links, and dates with an explicit time-zone offset. End times must follow start times.",
    "Revisa los campos obligatorios, enlaces HTTPS y fechas con zona horaria explícita. La hora final debe ser posterior a la inicial.",
  ],
  ALBUM_HAS_MEDIA: [
    "Move existing media to another album before removing or renaming its ID.",
    "Mueve los archivos a otro álbum antes de eliminarlo o cambiar su ID.",
  ],
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
  MEDIA_NOT_READY: [
    "This video is still being converted (or could not be). Approve it once it plays here.",
    "Este video todavía se está convirtiendo (o no se pudo convertir). Apruébalo cuando se reproduzca aquí.",
  ],
  // Admin only: the thank-you email links /thank-you/, which stays unlinked
  // until it has a thanks note or highlight video.
  THANK_YOU_PAGE_EMPTY: [
    "The thank-you page is still empty. Add the thanks note or highlight video to site/content.mjs and publish the site first; then this email can link to it.",
    "La página de agradecimiento todavía está vacía. Agrega la nota de agradecimiento o el video en site/content.mjs y publica el sitio primero; después este correo podrá enlazarla.",
  ],
  SIGN_IN_BUSY: [
    "Several people are signing in right now. Please try again in a few seconds, or use Sign in with Microsoft or Google.",
    "Varias personas están iniciando sesión. Inténtalo de nuevo en unos segundos, o entra con Microsoft o Google.",
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
    "El acceso por correo aún no está disponible. Escríbenos.",
  ],
  EMAIL_LINK_INVALID: [
    "This link is expired or already used. Request a new sign-in link.",
    "Este enlace venció o ya se utilizó. Solicita uno nuevo.",
  ],
  OWNER_REQUIRED: [
    "Only the site owner can do this.",
    "Solo el propietario del sitio puede hacer esto.",
  ],
  SSO_NO_ACCOUNT: [
    "We don't have this email yet. Try the one where you got your invitation, or write to us at misxv@simplysoph.com and we'll add it.",
    "Todavía no tenemos este correo. Prueba con el correo donde recibiste tu invitación, o escríbenos a misxv@simplysoph.com y lo agregamos.",
  ],
  SSO_ACCOUNT_CHANGED: [
    "This email is linked to a different Microsoft or Google account. Use the emailed sign-in link instead, or contact us.",
    "Este correo está vinculado a otra cuenta de Microsoft o Google. Usa el enlace de acceso por correo o escríbenos.",
  ],
  SSO_TENANT_NOT_ALLOWED: [
    "Use a personal Microsoft account (Outlook, Hotmail, Live) or a Simply Soph work account.",
    "Usa una cuenta personal de Microsoft (Outlook, Hotmail, Live) o una cuenta de trabajo de Simply Soph.",
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
  MFA_SETUP_NOT_ALLOWED: [
    "Your administrator access hasn't been switched on yet. Please ask Saul or Diana to turn it on, then sign in again.",
    "Tu acceso de administrador aún no está activado. Pide a Saul o a Diana que lo activen y vuelve a iniciar sesión.",
  ],
  ADMIN_NOT_ALLOWED: [
    "This account isn't an administrator. If you're expecting access, please contact Saul or Diana.",
    "Esta cuenta no es de administrador. Si esperas tener acceso, comunícate con Saul o Diana.",
  ],
  ADMIN_NOT_ELIGIBLE: [
    "This account isn't an administrator. If you're expecting access, please contact Saul or Diana.",
    "Esta cuenta no es de administrador. Si esperas tener acceso, comunícate con Saul o Diana.",
  ],
  INVITATION_INACTIVE: [
    "This invitation isn't active right now. Please contact us.",
    "Esta invitación no está activa en este momento. Escríbenos.",
  ],
  INVITATION_NOT_READY: [
    "Your invitation hasn't been sent yet. The RSVP opens once we send it.",
    "Tu invitación aún no se ha enviado. Podrás responder cuando te la enviemos.",
  ],
  ADMIN_SIGN_IN_PAUSED: [
    "Too many wrong authenticator codes. Administrator sign-in is paused for an hour; the family has been told.",
    "Demasiados códigos incorrectos. El acceso de administrador está en pausa por una hora; se avisó a la familia.",
  ],
  ADMIN_SETUP_BY_EMAIL: [
    "Your first sign-in as an administrator uses the emailed link. Request it above, then set up your authenticator; Google or Microsoft work after that.",
    "Tu primer acceso como administrador usa el enlace por correo. Solicítalo arriba y configura tu autenticador; después funcionan Google o Microsoft.",
  ],
  SIGN_IN_FAILED: [
    "We couldn't confirm that sign-in. Please try again.",
    "No pudimos confirmar ese acceso. Inténtalo de nuevo.",
  ],
  CSRF_REJECTED: [
    "Your page was open too long. Please refresh it and try again.",
    "La página estuvo abierta demasiado tiempo. Actualízala e inténtalo de nuevo.",
  ],
  INVALID_EMAIL: [
    "Please check the email address and try again.",
    "Revisa la dirección de correo e inténtalo de nuevo.",
  ],
  SIGN_IN_AGAIN: [
    "That sign-in expired or was already used. Choose your sign-in option again.",
    "Ese acceso venció o ya se usó. Vuelve a elegir tu forma de acceso.",
  ],
  MFA_REQUIRED: [
    "Set up your own authenticator first by signing out and signing in again.",
    "Primero configura tu autenticador cerrando sesión e iniciando sesión de nuevo.",
  ],
  NOT_AN_ADMINISTRATOR: [
    "That email is not a family administrator. Grant administration first, or check the email.",
    "Ese correo no es de un administrador. Otorga la administración primero o revisa el correo.",
  ],
  ALREADY_RESPONDED: [
    "This household has already answered, so this email was set aside.",
    "Esta familia ya respondió, así que este correo se apartó.",
  ],
  MAIL_DRAFT_STALE: [
    "This invitation or recipient changed. Create and review a new email draft.",
    "La invitación o el destinatario cambió. Crea y revisa un nuevo borrador.",
  ],
  MAIL_NOT_CONFIGURED: [
    "Email sending is not configured yet. The draft is saved.",
    "El envío de correo aún no está configurado. El borrador está guardado.",
  ],
  MAIL_ALREADY_ATTEMPTED: [
    "This message was already attempted. Check its status and Microsoft Sent Items before sending another.",
    "Ya se intentó enviar este mensaje. Revisa su estado y los elementos enviados de Microsoft antes de enviar otro.",
  ],
  PRIVATE_LINK_REQUIRED: [
    "Use the current private invitation link for this household.",
    "Usa el enlace privado vigente de esta familia.",
  ],
  INVALID_CAPACITY: [
    "Enter explicit whole-number adult and child counts, totaling 1–50. Use 0 when there are no children.",
    "Ingresa cantidades enteras de adultos y niños, con un total de 1 a 50. Usa 0 si no hay niños.",
  ],
  ALREADY_SEATED: [
    "A selected household is already assigned to another table. Remove that assignment first.",
    "Una familia ya está asignada a otra mesa. Retira esa asignación primero.",
  ],
  TABLE_OVER_CAPACITY: [
    "Those households have more guests attending dinner than this table seats. Raise the capacity or choose fewer households.",
    "Esas familias tienen más invitados en la cena de los que caben en esta mesa. Aumenta la capacidad o elige menos familias.",
  ],
  RECIPIENT_CHANGED: [
    "This household's verified email changed since the page loaded. Nothing was saved or sent; reload and check the address.",
    "El correo verificado de esta familia cambió desde que se cargó la página. No se guardó ni se envió nada; recarga y revisa la dirección.",
  ],
  EMAIL_NOT_CONFIGURED: [
    "Email isn't set up, so nothing was saved or sent. Reply without the email option.",
    "El correo no está configurado, así que no se guardó ni se envió nada. Responde sin la opción de correo.",
  ],
  INVALID_TABLE: [
    "Give the table a name and a capacity from 1 to 50.",
    "Ponle un nombre a la mesa y una capacidad de 1 a 50.",
  ],
  SIGN_IN_REQUIRED: [
    "Please sign in again: open your invitation link to RSVP, or sign in with your email on My account.",
    "Inicia sesión de nuevo: abre tu enlace de invitación para confirmar, o inicia sesión con tu correo en Mi cuenta.",
  ],
  INVALID_INVITATION: [
    "That invitation could not be opened. Check the link or contact us.",
    "No pudimos abrir la invitación. Revisa el enlace o escríbenos.",
  ],
  // Only Save on the RSVP review gets these two, and the review speaks to the
  // household (ustedes), so they do too.
  RESPONSE_CHANGED: [
    "Your response changed in another window. Reload to review the latest saved response.",
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
    "Espera antes de intentarlo de nuevo.",
  ],
  // The upload page words limits itself, with the number and the time the
  // API sends (site/media-upload.js); these are the plain fallbacks.
  DAILY_UPLOAD_LIMIT: [
    "Your family has reached the limit for photos and videos for now.",
    "Tu familia alcanzó el límite de fotos y videos por ahora.",
  ],
  PARTY_DEVICE_LIMIT: [
    "This phone has shared the most photos and videos one phone can send from the table card. Thank you!",
    "Este teléfono ya compartió el máximo de fotos y videos que se pueden enviar desde la tarjeta de la mesa. ¡Gracias!",
  ],
  PARTY_CARD_FULL: [
    "The table card has received all the photos and videos it can take. Thank you!",
    "La tarjeta de la mesa ya recibió todas las fotos y videos que puede recibir. ¡Gracias!",
  ],
  PARTY_CARD_INVALID: [
    "This table card isn’t working. Ask the family for the current card.",
    "Esta tarjeta de la mesa no funciona. Pide a la familia la tarjeta vigente.",
  ],
  PARTY_NOT_OPEN: [
    "Sharing from the table card hasn’t opened yet.",
    "Todavía no se puede compartir desde la tarjeta de la mesa.",
  ],
  PARTY_CLOSED: [
    "Sharing from the table card has closed.",
    "Ya no se puede compartir desde la tarjeta de la mesa.",
  ],
  // Admin only.
  PARTY_CARD_OPEN: [
    "The table card is already on. Use “Make a new code” to replace it.",
    "La tarjeta de la mesa ya está activa.",
  ],
  PARTY_CARD_NOT_OPEN: [
    "The table card is off. Turn it on first.",
    "La tarjeta de la mesa está apagada.",
  ],
  MEDIA_BUSY: [
    "This video is being prepared right now. Try again in a few minutes.",
    "Este video se está preparando en este momento. Inténtalo de nuevo en unos minutos.",
  ],
  API_NOT_CONFIGURED: [
    "Online submissions are not open yet. Please contact us.",
    "Los envíos en línea aún no están disponibles. Escríbenos.",
  ],
  INVALID_MFA: [
    "The authenticator code is invalid or already used. Try the next code.",
    "El código no es válido o ya fue utilizado. Usa el siguiente código.",
  ],
  WHATSAPP_PHONE_INVALID: [
    "WhatsApp can't use this number. Check the country code and the number, like +1 817 555 0199.",
    "WhatsApp no puede usar este número. Revisa el código de país y el número, como +1 817 555 0199.",
  ],
};
// Trouble reaching the API (an outage, a proxy's HTML error page, a dropped
// connection) is not an answer from it: guests must never read it as
// "submissions are closed". A form being sent keeps what was typed.
function trouble(sending, network) {
  if (network)
    return sending
      ? tr(
          "We couldn't reach the website. Your answers are still here; check your connection and try again.",
          "No pudimos conectar con el sitio. Tus respuestas siguen aquí; revisa tu conexión e inténtalo de nuevo.",
        )
      : tr(
          "We couldn't reach the website. Check your connection and try again.",
          "No pudimos conectar con el sitio. Revisa tu conexión e inténtalo de nuevo.",
        );
  return sending
    ? tr(
        "Something went wrong on our end. Your answers are still here — try again in a minute, or email misxv@simplysoph.com.",
        "Algo falló de nuestro lado. Tus respuestas siguen aquí; inténtalo de nuevo en un minuto o escríbenos a misxv@simplysoph.com.",
      )
    : tr(
        "Something went wrong on our end. Please try again in a minute, or email misxv@simplysoph.com.",
        "Algo falló de nuestro lado. Inténtalo de nuevo en un minuto o escríbenos a misxv@simplysoph.com.",
      );
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
            : tr(
                "We couldn’t finish that. Please try again, or contact us.",
                "No pudimos completar la solicitud. Inténtalo de nuevo o escríbenos.",
              ),
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
// note can be closed, and while it shows, the page keeps the focused control
// scrolled clear of it.
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
  clearTimeout(notify.timer);
  notify.timer = setTimeout(clearNote, 12000);
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
          ? tr("Tick the box:", "Marca la casilla:")
          : control.type === "file"
            ? tr("Choose:", "Elige:")
            : control.tagName === "SELECT"
              ? tr("Choose an answer for:", "Elige una respuesta para:")
              : v.valueMissing
                ? tr("Fill in:", "Completa:")
                : control.type === "email"
                  ? tr("Check the email address:", "Revisa el correo:")
                  : tr("Check:", "Revisa:"));
    if (!lines.has(opening)) lines.set(opening, []);
    lines.get(opening).push(control);
    if (!document.getElementById(control.id + "-error")) {
      const note = document.createElement("span");
      note.className = "field-error";
      note.id = control.id + "-error";
      note.textContent =
        v.valueMissing && control.type !== "checkbox"
          ? control.tagName === "SELECT"
            ? tr("Choose one.", "Elige una opción.")
            : control.type === "file"
              ? tr("Choose at least one file.", "Elige al menos un archivo.")
              : tr("Fill this in.", "Completa este campo.")
          : control.type === "checkbox"
            ? tr("Tick this box to continue.", "Marca esta casilla para continuar.")
            : control.type === "email"
              ? tr("Use an address like name@example.com.", "Usa un correo como nombre@ejemplo.com.")
              : tr("Check this field.", "Revisa este campo.");
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
  const summary = document.createElement("div");
  summary.className = "error-summary";
  summary.setAttribute("role", "alert");
  summary.tabIndex = -1;
  for (const [opening, controls] of lines) {
    const line = document.createElement("p");
    line.append(opening + " ");
    controls.forEach((control, i) => {
      const a = document.createElement("a");
      a.href = "#" + control.id;
      a.textContent = labelOf(control);
      // Focus the field without putting its id in the address bar, where a
      // reload would read it as an invitation or sign-in link.
      a.addEventListener("click", (e) => {
        e.preventDefault();
        control.focus();
      });
      line.append(...(i ? [", ", a] : [a]));
    });
    summary.append(line);
  }
  form.prepend(summary);
  if (!document.title.startsWith(prefix)) document.title = prefix + document.title;
  summary.focus();
  return false;
}
// Runs fn with the form's data once the form is complete. The submit button is
// marked busy with aria-disabled rather than disabled: disabling the focused
// button dropped focus to the page (Chromium), so keyboard and screen-reader
// users lost their place. A second submit while busy is ignored. An error is
// shown in the form's own alert, next to the button. A field's error note goes
// as soon as what is typed is valid: waiting for "change", which fires when the
// field loses focus, removed it during the press on the button, so the button
// moved up under the pointer and the press was lost.
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
    button?.setAttribute("aria-disabled", "true");
    if (target) target.textContent = "";
    try {
      await fn(new FormData(form));
    } catch (err) {
      if (target?.isConnected) target.textContent = err.message;
      else notify(err.message);
    } finally {
      busy = false;
      button?.removeAttribute("aria-disabled");
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
