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
    "Select recipients with valid contact details. SMS also requires the guest to have texted SOPHIA from that phone.",
    "Selecciona destinatarios con datos válidos. Para SMS, el invitado debe haber enviado SOPHIA desde ese teléfono.",
  ],
  CONFIRM_COUNT_MISMATCH: [
    "Type the exact number of emails shown to confirm. Nothing was sent.",
    "Escribe el número exacto de correos para confirmar. No se envió nada.",
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
    "Verify your email in My account to view or download media.",
    "Verifica tu correo en Mi cuenta para ver o descargar archivos.",
  ],
  INVALID_VIDEO: [
    "Choose a valid MP4 or WebM video: up to 8 MB, 60 seconds and 4096 pixels per dimension.",
    "Elige un video MP4 o WebM válido: hasta 8 MB, 60 segundos y 4096 píxeles por dimensión.",
  ],
  VIDEO_BUSY: [
    "Another video is being prepared. Please try again shortly.",
    "Se está preparando otro video. Inténtalo de nuevo en un momento.",
  ],
  SIGN_IN_BUSY: [
    "Several people are signing in right now. Please try again in a few seconds, or use Sign in with Microsoft or Google.",
    "Varias personas están iniciando sesión. Inténtalo de nuevo en unos segundos, o entra con Microsoft o Google.",
  ],
  UPLOAD_BUSY: [
    "Several uploads are arriving right now. Please try this one again in a minute.",
    "Están llegando varias cargas. Intenta con esta de nuevo en un minuto.",
  ],
  PHOTO_BUSY: [
    "Several photos are being prepared right now. Please try this one again in a minute.",
    "Se están preparando varias fotos. Intenta con esta de nuevo en un minuto.",
  ],
  VIDEO_UNAVAILABLE: [
    "Video processing is not available yet. Contact the family.",
    "El procesamiento de videos aún no está disponible. Contacta a la familia.",
  ],
  PHOTO_TOO_LARGE: [
    "Choose a file up to 8 MB.",
    "Elige un archivo de hasta 8 MB.",
  ],
  EMAIL_SIGN_IN_UNAVAILABLE: [
    "Email sign-in is not open yet. Please contact the family.",
    "El acceso por correo aún no está disponible. Contacta a la familia.",
  ],
  EMAIL_LINK_INVALID: [
    "This link is expired or already used. Request a new sign-in link.",
    "Este enlace venció o ya se utilizó. Solicita uno nuevo.",
  ],
  PAGE_NOT_ALLOWED: [
    "The family has not granted your account access to this page.",
    "La familia no le ha dado acceso a esta página a tu cuenta.",
  ],
  OWNER_REQUIRED: [
    "Only the site owner can do this.",
    "Solo el propietario del sitio puede hacer esto.",
  ],
  SSO_NO_ACCOUNT: [
    "This email isn't on the guest list. Use the email the family has for your household, or contact the family to add it.",
    "Este correo no está en la lista de invitados. Usa el correo que la familia tiene de tu hogar o pide a la familia que lo agregue.",
  ],
  SSO_ACCOUNT_CHANGED: [
    "This email is linked to a different Microsoft or Google account. Use the emailed sign-in link instead, or contact the family.",
    "Este correo está vinculado a otra cuenta de Microsoft o Google. Usa el enlace de acceso por correo o contacta a la familia.",
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
    "This invitation isn't active right now. Please contact the family.",
    "Esta invitación no está activa en este momento. Comunícate con la familia.",
  ],
  INVITATION_NOT_READY: [
    "Your invitation hasn't been sent yet. The RSVP opens once the family sends it.",
    "Tu invitación aún no se ha enviado. La respuesta se abrirá cuando la familia la envíe.",
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
  INVALID_PHOTO: [
    "Choose a valid JPEG, PNG or WebP photo up to 8 MB.",
    "Elige una foto JPEG, PNG o WebP válida de hasta 8 MB.",
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
    "That invitation could not be opened. Check the link or contact the family.",
    "No pudimos abrir la invitación. Revisa el enlace o contacta a la familia.",
  ],
  RESPONSE_CHANGED: [
    "Your response changed in another window. Reload to review the latest saved response.",
    "Tu respuesta cambió en otra ventana. Recarga para revisar la última respuesta guardada.",
  ],
  RSVP_CLOSED: [
    "The RSVP deadline has passed. Please contact the family.",
    "La fecha límite ha pasado. Contacta a la familia.",
  ],
  CAPACITY_NEEDS_REVIEW: [
    "The family needs to review the spaces on this invitation. Please contact them.",
    "La familia debe revisar los lugares de esta invitación. Contáctalos.",
  ],
  TOO_MANY_REQUESTS: [
    "Please wait before trying again.",
    "Espera antes de intentarlo de nuevo.",
  ],
  API_NOT_CONFIGURED: [
    "Online submissions are not open yet. Please contact the family.",
    "Los envíos en línea aún no están disponibles. Contacta a la familia.",
  ],
  INVALID_MFA: [
    "The authenticator code is invalid or already used. Try the next code.",
    "El código no es válido o ya fue utilizado. Usa el siguiente código.",
  ],
};
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
    throw new Error(
      tr(
        "Connection interrupted. Your form has not been cleared. Please retry.",
        "Conexión interrumpida. El formulario no se borró. Inténtalo de nuevo.",
      ),
    );
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(
      tr(
        "Online submissions are not open yet. Please contact the family.",
        "Los envíos en línea aún no están disponibles. Contacta a la familia.",
      ),
    );
  }
  if (!res.ok) {
    const pair = messages[data.error];
    throw Object.assign(
      new Error(
        pair
          ? tr(...pair)
          : tr(
              "Unable to complete this request. Please retry or contact the family.",
              "No pudimos completar la solicitud. Inténtalo de nuevo o contacta a la familia.",
            ),
      ),
      { code: data.error, status: res.status },
    );
  }
  if (data.csrf) setCsrf(data.csrf);
  return data;
}
// An optional { href, label } adds a link after the message (built as DOM, not HTML).
export function notify(text, link) {
  const box = document.querySelector("#status");
  box.textContent = text;
  if (link) {
    const a = document.createElement("a");
    a.href = link.href;
    a.textContent = link.label;
    box.append(" ", a);
  }
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (box.textContent = ""), 12000);
}
export function field(
  label,
  name,
  {
    type = "text",
    value = "",
    required = false,
    max = 254,
    autocomplete = "",
  } = {},
) {
  return `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${max}"${autocomplete ? ` autocomplete="${esc(autocomplete)}"` : ""}></label>`;
}
export async function submit(form, fn) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await fn(new FormData(form));
    } catch (err) {
      const target = form.querySelector("[role=alert]");
      if (target) target.textContent = err.message;
      else notify(err.message);
    } finally {
      button.disabled = false;
    }
  });
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    for (const el of document.querySelectorAll(".nav-group[open]"))
      el.open = false;
});
document.addEventListener("click", (e) => {
  for (const el of document.querySelectorAll(".nav-group[open]"))
    if (!el.contains(e.target)) el.open = false;
});

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
