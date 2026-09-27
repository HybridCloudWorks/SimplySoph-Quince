import { api, esc, es, tr, route, field, submit, notify } from "./client.js";
const portal = document.querySelector("#portal");
const eventNames = {
  ceremony: tr("Ceremony", "Ceremonia"),
  dinner: tr("Dinner", "Cena"),
  dance: tr("Reception & dance", "Recepción y baile"),
};
const statusError = (message) =>
  `<p class="notice" role="alert">${esc(message)}</p><a href="${route("contact")}">${tr("Contact the family", "Contacta a la familia")}</a>`;
function accessForm(value = "") {
  portal.innerHTML = `<h2>${tr("Open your invitation", "Abre tu invitación")}</h2><p>${tr("Use your household’s private invitation link or paste the invitation code below.", "Usa el enlace privado de tu familia o pega el código de invitación.")}</p><form id="access">${field(tr("Invitation code", "Código de invitación"), "token", { value, required: true, max: 1000 })}<p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Continue", "Continuar")}</button></form>`;
  submit(document.querySelector("#access"), async (data) => {
    let token = data.get("token").trim();
    if (token.startsWith("https://")) {
      const u = new URL(token);
      if (u.origin !== location.origin)
        throw new Error(
          tr("Use the link from this website.", "Usa el enlace de este sitio."),
        );
      token = u.hash.slice(1);
    }
    await api("invitation-session", { token });
    await showPortal();
  });
}
function countField(event, key, max, value) {
  return `<label>${tr(key === "kids" ? "Children" : "Adults / teens", key === "kids" ? "Niños" : "Adultos / jóvenes")}<select name="${event}.${key}" required><option value="">${tr("Choose a count", "Elige una cantidad")}</option>${Array.from({ length: max + 1 }, (_, n) => `<option value="${n}"${n === value ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
}
function rsvpForm(inv) {
  const saved = inv.response,
    contact = saved?.contact || inv.contact;
  portal.innerHTML = `<h2>${esc(inv.name)}</h2><p>${tr("Tell us how many people will attend each part of the celebration. Choose zero if nobody will attend.", "Indica cuántas personas asistirán a cada parte de la celebración. Elige cero si nadie asistirá.")}</p><form id="response">${Object.entries(
    eventNames,
  )
    .map(([e, label]) =>
      inv.invited[e]
        ? `<fieldset><legend>${label}</legend><div class="field-grid">${countField(e, "adultsTeens", inv.capacity.adultsTeens, saved?.attendance[e]?.adultsTeens)}${countField(e, "kids", inv.capacity.kids, saved?.attendance[e]?.kids)}</div></fieldset>`
        : `<p class="hint">${label}: ${tr("not included in this invitation", "no incluido en esta invitación")}</p>`,
    )
    .join(
      "",
    )}<div class="field-grid">${field(tr("Email", "Correo electrónico"), "email", { type: "email", value: contact.email })}${field(tr("Phone (optional)", "Teléfono (opcional)"), "phone", { type: "tel", value: contact.phone, max: 40 })}</div>${field(tr("Mailing address (optional)", "Dirección postal (opcional)"), "address", { value: contact.address || "", max: 500 })}<label>${tr("Dietary/accessibility needs or song request (optional)", "Necesidades alimentarias/de accesibilidad o canción (opcional)")}<textarea name="requests" maxlength="1000">${esc(saved?.requests || "")}</textarea></label><p class="hint">${tr("Meal selections will be offered if the family confirms menu choices.", "Ofreceremos selección de comida si la familia confirma opciones de menú.")}</p><p class="error" role="alert"></p><button class="button burgundy" type="submit">${tr("Review response", "Revisar respuesta")}</button></form>`;
  submit(document.querySelector("#response"), async (data) => {
    const attendance = {};
    for (const e of Object.keys(eventNames))
      attendance[e] = inv.invited[e]
        ? {
            adultsTeens: Number(data.get(e + ".adultsTeens")),
            kids: Number(data.get(e + ".kids")),
          }
        : { adultsTeens: 0, kids: 0 };
    const input = {
      previousSubmissionId: inv.previousSubmissionId,
      attendance,
      contact: {
        email: data.get("email"),
        phone: data.get("phone"),
        address: data.get("address") || null,
      },
      requests: data.get("requests"),
    };
    review(inv, input);
  });
}
function review(inv, input) {
  portal.innerHTML = `<h2>${tr("Review your response", "Revisa tu respuesta")}</h2>${summary(input)}<p>${esc(input.contact.email)}</p><p>${esc(input.requests)}</p><p class="error" role="alert"></p><div class="row-actions"><button id="confirm" class="button burgundy">${tr("Save my RSVP", "Guardar mi respuesta")}</button><button id="edit" class="plain-button">${tr("Edit", "Editar")}</button></div>`;
  const id = crypto.randomUUID();
  document.querySelector("#edit").onclick = () =>
    rsvpForm({ ...inv, response: input });
  document.querySelector("#confirm").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api("rsvp", input, { headers: { "Idempotency-Key": id } });
      location.assign(route("rsvp/confirmed"));
    } catch (err) {
      portal.querySelector("[role=alert]").textContent = err.message;
      e.target.disabled = false;
    }
  };
}
function summary(response) {
  return `<ul class="summary-list">${Object.entries(response.attendance)
    .map(
      ([e, v]) =>
        `<li><strong>${eventNames[e]}:</strong> ${v.adultsTeens} ${tr("adults/teens", "adultos/jóvenes")}, ${v.kids} ${tr("children", "niños")}</li>`,
    )
    .join("")}</ul>`;
}
async function showPortal() {
  if (!portal) return;
  const session = await api("session");
  if (session.kind !== "guest") {
    accessForm();
    return;
  }
  const inv = await api("invitation"),
    view = portal.dataset.view;
  if (view === "rsvp") {
    rsvpForm(inv);
    return;
  }
  if (view === "rsvp/confirmed") {
    if (!inv.response) {
      portal.innerHTML = `<p>${tr("No saved RSVP was found for this invitation.", "No encontramos una respuesta guardada para esta invitación.")}</p><a href="${route("rsvp")}">RSVP</a>`;
      return;
    }
    const google = new URL("https://calendar.google.com/calendar/render");
    google.search = new URLSearchParams({
      action: "TEMPLATE",
      text: "Sophia · Mis XV",
      dates: "20270115/20270116",
      details:
        "Save the date. Ceremony 4 PM Central; dinner 6:30–7:30 PM; reception from 7:30 PM. See https://misxv.simplysoph.com/details/ for venue details.",
    });
    portal.innerHTML = `<div class="notice success"><h2>${tr("Your response is saved.", "Tu respuesta está guardada.")}</h2><p>${tr("Thank you", "Gracias")}, ${esc(inv.name)}.</p><p>${tr("Receipt", "Comprobante")}: ${esc(inv.response.id)}</p></div>${summary(inv.response)}<p>${inv.syncState === "synced" ? tr("The family’s invitation list has been updated.", "La lista de invitados se actualizó.") : tr("Your response is safely saved. Updating the family’s Notion view is pending.", "Tu respuesta está guardada. La actualización de la vista de Notion está pendiente.")}</p><div class="row-actions"><a class="button burgundy" href="${route("rsvp")}">${tr("Edit response", "Editar respuesta")}</a><a href="/sophia-mis-xv.ics" download>${tr("Download calendar event", "Descargar evento")}</a><a href="${esc(google.href)}" target="_blank" rel="noopener noreferrer">Google Calendar</a></div>`;
    return;
  }
  if (view === "share") {
    portal.innerHTML = `<form id="photo"><label>${tr("Photo · maximum 8 MB", "Foto · máximo 8 MB")}<input type="file" name="file" accept="image/jpeg,image/png,image/webp" required></label>${field(tr("Caption (optional)", "Descripción (opcional)"), "caption", { max: 200 })}<label class="check"><input type="checkbox" name="consent" required>${tr("I have permission from the people pictured and agree to the photo sharing terms.", "Tengo permiso de las personas fotografiadas y acepto las condiciones para compartir fotos.")}</label><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Submit for review", "Enviar para revisión")}</button></form>`;
    submit(document.querySelector("#photo"), async (data) => {
      const file = data.get("file");
      if (file.size > 8 * 1024 * 1024)
        throw new Error(
          tr(
            "Choose a photo smaller than 8 MB.",
            "Elige una foto de menos de 8 MB.",
          ),
        );
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api("photos", {
        base64,
        caption: data.get("caption"),
        consent: data.has("consent"),
      });
      portal.innerHTML = `<p class="notice success">${tr("Photo received for family review. It is not public yet.", "Foto recibida para revisión de la familia. Aún no es pública.")}</p>`;
    });
    return;
  }
  if (["contact", "guestbook"].includes(view)) {
    portal.innerHTML = `<form id="message">${field(tr("Your display name", "Nombre para mostrar"), "name", { required: true, max: 100 })}<label>${tr("Message", "Mensaje")}<textarea name="text" maxlength="2000" required></textarea></label>${view === "guestbook" ? `<label class="check"><input type="checkbox" name="consent" required>${tr("The family may publish this name and message after review.", "La familia puede publicar este nombre y mensaje después de revisarlo.")}</label>` : ""}<p class="error" role="alert"></p><button class="button burgundy" type="submit">${tr("Send message", "Enviar mensaje")}</button></form>`;
    submit(document.querySelector("#message"), async (data) => {
      await api("messages", {
        kind: view,
        name: data.get("name"),
        text: data.get("text"),
        consent: data.has("consent"),
      });
      portal.innerHTML = `<p class="notice success">${tr("Your message was saved for the family.", "Tu mensaje se guardó para la familia.")}</p>`;
    });
  }
}
async function publicContent() {
  const nodes = document.querySelectorAll(
    "[data-gallery],[data-guestbook],[data-announcements]",
  );
  if (!nodes.length) return;
  try {
    const data = await api("public");
    for (const box of nodes) {
      if (box.hasAttribute("data-gallery"))
        box.innerHTML = data.photos
          .map(
            (p) =>
              `<figure class="gallery-photo card"><img loading="lazy" src="${esc(p.url)}" alt="${esc(p.caption || tr("Celebration photo", "Foto de la celebración"))}"><figcaption>${esc(p.caption)}</figcaption></figure>`,
          )
          .join("");
      if (box.hasAttribute("data-guestbook"))
        box.innerHTML = data.messages
          .map(
            (m) =>
              `<article class="card"><blockquote>${esc(m.text)}</blockquote><p>— ${esc(m.name)}</p></article>`,
          )
          .join("");
      if (box.hasAttribute("data-announcements"))
        box.innerHTML = data.announcements
          .map(
            (a) =>
              `<article class="notice"><h3>${esc(es && a.titleEs ? a.titleEs : a.title)}</h3><p>${esc(es && a.textEs ? a.textEs : a.text)}</p></article>`,
          )
          .join("");
    }
  } catch {
    for (const box of nodes)
      box.innerHTML = box.hasAttribute("data-announcements")
        ? ""
        : `<p class="hint">${tr("This collection is not available yet.", "Esta colección aún no está disponible.")}</p>`;
  }
}
const countdown = document.querySelector("[data-countdown]");
if (countdown) {
  const days = Math.ceil(
    (Date.parse("2027-01-15T16:00:00-06:00") - Date.now()) / 86400000,
  );
  countdown.textContent =
    days > 0
      ? tr(
          `${days} days until a new chapter`,
          `${days} días para un nuevo capítulo`,
        )
      : tr("The celebration has arrived.", "La celebración ha llegado.");
}
let fragment = location.hash.slice(1);
if (portal && fragment && document.body.dataset.route === "rsvp") {
  history.replaceState(null, "", location.pathname);
  try {
    await api("invitation-session", { token: fragment });
    fragment = "";
    await showPortal();
  } catch {
    accessForm(fragment);
  }
} else if (portal) {
  try {
    await showPortal();
  } catch (e) {
    portal.innerHTML = statusError(e.message);
  }
}
await publicContent();
