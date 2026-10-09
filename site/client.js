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
    "Use A Nonnegative Amount With At Most Two Decimal Places.",
    "Usa una cantidad positiva con hasta dos decimales.",
  ],
  INVALID_DOCUMENT: [
    "Choose A Valid JPG, PNG, WebP, PDF, Text Or Office File Up To 8 MB.",
    "Elige un archivo válido de hasta 8 MB.",
  ],
  NO_ELIGIBLE_RECIPIENTS: [
    "Select Recipients With Valid Contact Details. SMS Also Requires The Guest To Have Texted SOPHIA From That Phone.",
    "Selecciona destinatarios con datos válidos. Para SMS, el invitado debe haber enviado SOPHIA desde ese teléfono.",
  ],
  CONFIRM_COUNT_MISMATCH: [
    "Type The Exact Number Of Emails Shown To Confirm. Nothing Was Sent.",
    "Escribe el número exacto de correos para confirmar. No se envió nada.",
  ],
  BATCH_NOT_CONFIRMED: [
    "Confirm This Batch Before Sending.",
    "Confirma este lote antes de enviarlo.",
  ],
  BATCH_NOT_DRAFT: [
    "This Batch Was Already Confirmed Or Cancelled. Reopen It To See Its Status.",
    "Este lote ya fue confirmado o cancelado.",
  ],
  BATCH_ALREADY_SENDING: [
    "This Batch Is Being Sent From Another Tab. Wait A Minute, Then Reopen It.",
    "Este lote se está enviando desde otra pestaña. Espera un minuto y vuelve a abrirlo.",
  ],
  INVALID_AUDIENCE: [
    "Select At Least One Household.",
    "Selecciona al menos una familia.",
  ],
  EVENTS_REQUIRED: [
    "Choose At Least One Event For The Invitation.",
    "Elige al menos un evento para la invitación.",
  ],
  SMS_BRAND_OR_STOP_MISSING: [
    "Start The Text With “Simply Soph Media:” And Include STOP Opt-Out Wording.",
    "Empieza el mensaje con “Simply Soph Media:” e incluye la opción STOP.",
  ],
  INVALID_DATA_SOURCE: [
    "Enter The Notion Data Source ID For This Table.",
    "Ingresa el ID de la fuente de datos de Notion.",
  ],
  NAME_REQUIRED: [
    "Enter An Item Or Person Name.",
    "Ingresa el nombre del artículo o persona.",
  ],
  NOTION_404: [
    "Share This Database With The Dedicated Notion Connection And Check Its Data Source ID.",
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
  EMAIL_SIGN_IN_REQUIRED: [
    "This invitation is registered. Use your email to request a sign-in link.",
    "Esta invitación está registrada. Usa tu correo para solicitar un enlace de acceso.",
  ],
  EMAIL_LINK_INVALID: [
    "This link is expired or already used. Request a new sign-in link.",
    "Este enlace venció o ya se utilizó. Solicita uno nuevo.",
  ],
  RSVP_FIRST: [
    "Save your RSVP before registering your email.",
    "Guarda tu respuesta antes de registrar tu correo.",
  ],
  PAGE_NOT_ALLOWED: [
    "The family has not granted your account access to this page.",
    "La familia no le ha dado acceso a esta página a tu cuenta.",
  ],
  OWNER_REQUIRED: [
    "Only the site owner can change administrator access.",
    "Solo el propietario puede cambiar el acceso de administradores.",
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
  SIGN_IN_REQUIRED: [
    "Open your private invitation to sign in again.",
    "Abre tu invitación privada para iniciar sesión de nuevo.",
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
export function notify(text) {
  const box = document.querySelector("#status");
  box.textContent = text;
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
