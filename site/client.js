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
  { type = "text", value = "", required = false, max = 254 } = {},
) {
  return `<label>${esc(label)}<input name="${esc(name)}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} maxlength="${max}"></label>`;
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
