import { experienceReady, eventContent } from "./experience.js";
import {
  registryCards,
  contactTopics,
  contactTopicsEs,
} from "./celebration.mjs";
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
  portal.insertAdjacentHTML(
    "beforeend",
    `<hr><h2>${tr("Already registered?", "¿Ya te registraste?")}</h2><form id="email-login">${field(tr("Email", "Correo electrónico"), "email", { type: "email", required: true })}<p>${tr("We’ll email you a one-time sign-in link. No password needed.", "Te enviaremos un enlace de acceso de un solo uso. No necesitas contraseña.")}</p><p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Email my sign-in link", "Enviar enlace de acceso")}</button></form>`,
  );
  submit(document.querySelector("#email-login"), async (data) => {
    await api("auth/email/request", { email: data.get("email") });
    portal.innerHTML = `<p class="notice">${tr("If this email belongs to an active registered invitation, a sign-in link has been requested. Check your inbox and spam folder. The link expires after 15 minutes.", "Si este correo pertenece a una invitación registrada activa, se solicitó un enlace de acceso. Revisa tu bandeja de entrada y correo no deseado. El enlace vence en 15 minutos.")}</p><a href="${route("account")}">${tr("Back to sign-in", "Volver al acceso")}</a>`;
  });
}
const permissionNames = {
  gifts: tr("Registry / gifts", "Registro / regalos"),
  padrinos: tr("Godparents / sponsors", "Padrinos"),
  costs: tr("Celebration costs", "Gastos de la celebración"),
  admin: tr("Family administration", "Administración familiar"),
};
async function accountPage(inv, session) {
  const data = await api("account");
  if (!data.account) {
    if (!inv.response) {
      portal.innerHTML = `<p>${tr("Save your RSVP first, then register your email for future visits.", "Primero guarda tu respuesta y después registra tu correo para próximas visitas.")}</p><a class="button burgundy" href="${route("rsvp")}">RSVP</a>`;
      return;
    }
    portal.innerHTML = `<h2>${tr("Create your guest account", "Crea tu cuenta de invitado")}</h2><p>${tr("One contact account manages this household invitation. Page access is granted by the family after you verify your email.", "Una cuenta de contacto administra esta invitación familiar. La familia te dará acceso a las páginas después de verificar tu correo.")}</p><form id="register">${field(tr("Your name", "Tu nombre"), "name", { required: true, max: 120 })}${field(tr("Email", "Correo electrónico"), "email", { required: true, type: "email", value: inv.contact.email })}<p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Verify my email", "Verificar mi correo")}</button></form>`;
    submit(document.querySelector("#register"), async (f) => {
      await api("auth/email/request", {
        register: true,
        name: f.get("name"),
        email: f.get("email"),
      });
      portal.innerHTML = `<p class="notice">${tr("If this email can be registered, you’ll receive a verification link. Open it within 15 minutes. An email already assigned to another invitation cannot be registered again; contact the family for help.", "Si este correo puede registrarse, recibirás un enlace de verificación. Ábrelo en 15 minutos. Un correo asignado a otra invitación no puede registrarse otra vez; contacta a la familia.")}</p>`;
    });
    return;
  }
  const { profile } = await api("profile");
  portal.innerHTML = `<h2>${esc(data.account.name)}</h2><p>${esc(data.account.email)}</p><div class="row-actions"><a class="button burgundy" href="${route("rsvp")}">${tr("Update RSVP", "Actualizar respuesta")}</a><a href="${route("reception")}">${tr("Directions", "Cómo llegar")}</a>${session.permissions.map((p) => `<a href="${p === "admin" ? "/admin/login/" : route(p)}">${permissionNames[p]}</a>`).join("")}<button id="guest-logout" class="plain-button">${tr("Sign out", "Cerrar sesión")}</button></div>${!session.permissions.length ? `<p>${tr("Additional pages will appear here when the family grants access.", "Las páginas adicionales aparecerán aquí cuando la familia te dé acceso.")}</p>` : ""}<form id="profile-form"><h3>${tr("Contact details", "Datos de contacto")}</h3>${field(tr("Contact email (does not change your sign-in email)", "Correo de contacto (no cambia tu correo de acceso)"), "email", { type: "email", value: profile.contact.email })}${field(tr("Phone", "Teléfono"), "phone", { value: profile.contact.phone, max: 40 })}${field(tr("Mailing address", "Dirección postal"), "address", { value: profile.contact.address || "", max: 500 })}<p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Save contact details", "Guardar datos")}</button></form><div id="family-chat"></div>`;
  document.querySelector("#guest-logout").onclick = async () => {
    await api("logout", {});
    location.reload();
  };
  submit(document.querySelector("#profile-form"), async (f) => {
    await api("profile", {
      ...Object.fromEntries(f),
      version: profile.version,
    });
    await showPortal();
    notify(tr("Contact details saved.", "Datos guardados."));
  });
  const thread = await api("messages"),
    box = document.querySelector("#family-chat");
  box.innerHTML = `<h3>${tr("Messages with the family", "Mensajes con la familia")}</h3>${thread.messages.map((m) => `<article class="card"><p>${esc(m.text)}</p>${m.replies.map((r) => `<blockquote><strong>${tr("Family", "Familia")}:</strong> ${esc(r.text)}</blockquote>`).join("")}</article>`).join("")}<p>${tr("Refresh this page to check for replies.", "Actualiza esta página para ver las respuestas.")}</p><form id="family-message"><label>${tr("Your message", "Tu mensaje")}<textarea name="text" required maxlength="2000"></textarea></label><p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Send to the family", "Enviar a la familia")}</button></form>`;
  submit(document.querySelector("#family-message"), async (f) => {
    await api("messages", {
      kind: "contact",
      name: data.account.name,
      text: f.get("text"),
    });
    await showPortal();
  });
}
function countField(event, key, max, value) {
  return `<label>${tr(key === "kids" ? "Children" : "Adults / teens", key === "kids" ? "Niños" : "Adultos / jóvenes")}<select name="${event}.${key}" required><option value="">${tr("Choose a count", "Elige una cantidad")}</option>${Array.from({ length: max + 1 }, (_, n) => `<option value="${n}"${n === value ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
}
function rsvpForm(inv) {
  const saved = inv.response,
    contact = inv.draftContact || inv.contact || saved?.contact;
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
    rsvpForm({ ...inv, response: input, draftContact: input.contact });
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
  if (
    ["gifts", "registry", "padrinos", "costs"].includes(portal.dataset.view) &&
    (session.kind === "admin" || session.verified)
  ) {
    const data = await api(
        "pages/" +
          (portal.dataset.view === "registry" ? "gifts" : portal.dataset.view),
      ),
      c = data.content;
    portal.innerHTML = `<div class="private-copy">${esc((es ? c.es : c.en) || c.en || tr("The family will add these details soon.", "La familia agregará los detalles pronto.")).replaceAll("\n", "<br>")}</div><div class="row-actions">${c.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">${esc(l.label)} ↗</a>`).join("")}</div>`;
    if (data.registries)
      portal.insertAdjacentHTML(
        "beforeend",
        registryCards(data.registries, es ? "es" : "en"),
      );
    return;
  }
  if (session.kind !== "guest") {
    accessForm();
    return;
  }
  const inv = await api("invitation"),
    view = portal.dataset.view;
  if (["gifts", "registry", "padrinos", "costs"].includes(view)) {
    portal.innerHTML = `<p>${tr("Verify your email and ask the family for access to this page.", "Verifica tu correo y solicita acceso a esta página a la familia.")}</p><a href="${route("account")}">${tr("My account", "Mi cuenta")}</a>`;
    return;
  }
  if (view === "account") {
    await accountPage(inv, session);
    return;
  }
  if (view === "rsvp") {
    rsvpForm(inv);
    return;
  }
  if (view === "rsvp/confirmed") {
    if (!inv.response) {
      portal.innerHTML = `<p>${tr("No saved RSVP was found for this invitation.", "No encontramos una respuesta guardada para esta invitación.")}</p><a href="${route("rsvp")}">RSVP</a>`;
      return;
    }
    portal.innerHTML = `<div class="notice success"><h2>${tr("Your response is saved.", "Tu respuesta está guardada.")}</h2><p>${tr("Thank you", "Gracias")}, ${esc(inv.name)}.</p><p>${tr("Receipt", "Comprobante")}: ${esc(inv.response.id)}</p></div>${summary(inv.response)}<p>${inv.syncState === "synced" ? tr("The family’s invitation list has been updated.", "La lista de invitados se actualizó.") : tr("Your response is safely saved. Updating the family’s Notion view is pending.", "Tu respuesta está guardada. La actualización de la vista de Notion está pendiente.")}</p><div class="row-actions"><a class="button burgundy" href="${route("rsvp")}">${tr("Edit response", "Editar respuesta")}</a><a href="${route("details")}">${tr("Calendar & event details", "Calendario y detalles")}</a></div>`;
    portal.insertAdjacentHTML(
      "beforeend",
      `<p><a class="button burgundy" href="${route("account")}">${session.verified ? tr("Open my guest account", "Abrir mi cuenta") : tr("Register my email for future visits", "Registrar mi correo para próximas visitas")}</a></p>`,
    );
    return;
  }
  if (view === "share") {
    portal.innerHTML = `<form id="photo"><p>${tr("Photos: JPEG, PNG or WebP. Videos: MP4 or WebM, up to 60 seconds. Maximum 8 MB per file. Videos are prepared for web playback.", "Fotos: JPEG, PNG o WebP. Videos: MP4 o WebM, hasta 60 segundos. Máximo 8 MB por archivo. Los videos se preparan para reproducirse en la web.")}</p><label>${tr("Photo or video", "Foto o video")}<input type="file" name="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" required></label><label>${tr("Album", "Álbum")}<select name="album">${eventContent.albums.map((a) => `<option value="${esc(a.id)}"${a.id === "event" ? " selected" : ""}>${esc(es ? a.es : a.en)}</option>`).join("")}</select></label>${field(tr("Caption (optional)", "Descripción (opcional)"), "caption", { max: 200 })}<label class="check"><input type="checkbox" name="consent" required>${tr("I have permission from the people pictured and agree to the Media Policy.", "Tengo permiso de las personas fotografiadas y acepto la Política de medios.")}</label><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Submit for review", "Enviar para revisión")}</button></form>`;
    submit(document.querySelector("#photo"), async (data) => {
      const file = data.get("file");
      if (file.size > 8 * 1024 * 1024)
        throw new Error(
          tr(
            "Choose a file smaller than 8 MB.",
            "Elige un archivo de menos de 8 MB.",
          ),
        );
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await api(file.type.startsWith("video/") ? "videos" : "photos", {
        album: data.get("album"),
        base64,
        caption: data.get("caption"),
        consent: data.has("consent"),
      });
      portal.innerHTML = `<p class="notice success">${tr("File received for family review. Only approved media is shared with registered guests.", "Archivo recibido para revisión. Solo los archivos aprobados se comparten con invitados registrados.")}</p>`;
    });
    return;
  }
  if (["contact", "guestbook"].includes(view)) {
    portal.innerHTML = `<form id="message">${field(tr("Your display name", "Nombre para mostrar"), "name", { required: true, max: 100 })}${view === "contact" ? `${field(tr("Email", "Correo electrónico"), "email", { type: "email", required: true, value: inv.contact.email })}<label>${tr("Topic", "Tema")}<select name="topic">${contactTopics.map((t, i) => `<option value="${esc(t)}">${esc(es ? contactTopicsEs[i] : t)}</option>`).join("")}</select></label>` : ""}<label>${tr("Message", "Mensaje")}<textarea name="text" maxlength="2000" required></textarea></label>${view === "guestbook" ? `<label class="check"><input type="checkbox" name="consent" required>${tr("The family may publish this name and message after review.", "La familia puede publicar este nombre y mensaje después de revisarlo.")}</label>` : ""}<p class="error" role="alert"></p><button class="button burgundy" type="submit">${tr("Send message", "Enviar mensaje")}</button></form>`;
    submit(document.querySelector("#message"), async (data) => {
      await api("messages", {
        kind: view,
        email: data.get("email"),
        topic: data.get("topic"),
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
    "[data-guestbook],[data-announcements]",
  );
  if (!nodes.length) return;
  try {
    const data = await api("public");
    for (const box of nodes) {
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
await experienceReady;
let fragment = location.hash.slice(1);
if (portal && fragment && document.body.dataset.route === "account") {
  history.replaceState(null, "", location.pathname);
  portal.innerHTML = `<h2>${tr("Confirm sign-in", "Confirmar acceso")}</h2><p>${tr("Continue only if you requested this email link.", "Continúa solo si solicitaste este enlace por correo.")}</p><form id="email-verify"><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Continue to my invitation", "Continuar a mi invitación")}</button></form>`;
  submit(document.querySelector("#email-verify"), async () => {
    await api("auth/email/verify", { token: fragment });
    fragment = "";
    await showPortal();
    await permissionNavigation();
  });
} else if (portal && fragment && document.body.dataset.route === "rsvp") {
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
async function permissionNavigation() {
  try {
    const session = await api("session");
    for (const a of document.querySelectorAll("[data-permission]"))
      a.hidden = !(
        session.kind === "admin" ||
        session.permissions.includes(a.dataset.permission)
      );
  } catch {
    /* Private navigation stays hidden when the API is unavailable. */
  }
}
await permissionNavigation();
await publicContent();

async function gallery() {
  const photos = document.querySelector("[data-gallery]"),
    videos = document.querySelector("[data-videos]");
  if (!photos || !videos) return;
  let items = [];
  try {
    items = (await api("gallery")).media;
  } catch {
    photos.innerHTML = videos.innerHTML =
      "<p>" +
      tr(
        "Sign in to view approved photos and videos.",
        "Inicia sesión para ver fotos y videos aprobados.",
      ) +
      ' <a href="' +
      route("account") +
      '">' +
      tr("My account", "Mi cuenta") +
      "</a></p>";
    document
      .querySelector("[data-album-cards]")
      .addEventListener("click", (e) => {
        if (e.target.closest("[data-album]"))
          photos.closest("section").scrollIntoView({ block: "start" });
      });
    return;
  }
  for (const button of document.querySelectorAll("[data-album]")) {
    const image = items.find(
      (p) => p.kind === "photo" && p.album === button.dataset.album,
    );
    if (image)
      button.querySelector(".album-art").innerHTML =
        '<img src="' + esc(image.url) + '" alt="" loading="lazy">';
  }
  function render(album = "") {
    const rows = items.filter((p) => !album || p.album === album);
    for (const [kind, node] of [
      ["photo", photos],
      ["video", videos],
    ])
      node.innerHTML =
        rows
          .filter((p) => p.kind === kind)
          .map(
            (p) =>
              "<figure><" +
              (kind === "video"
                ? 'video controls playsinline preload="metadata"'
                : 'img loading="lazy" alt="' +
                  esc(
                    p.caption ||
                      tr("Celebration photo", "Foto de la celebración"),
                  ) +
                  '"') +
              ' src="' +
              esc(p.url) +
              '">' +
              (kind === "video" ? "</video>" : "") +
              "<figcaption>" +
              esc(p.caption) +
              '</figcaption><a href="' +
              esc(p.url) +
              '?download=1" download>' +
              tr("Download", "Descargar") +
              "</a></figure>",
          )
          .join("") ||
        "<p>" +
          tr(
            "No approved media in this album yet.",
            "Aún no hay archivos aprobados en este álbum.",
          ) +
          "</p>";
    const label = document.querySelector("[data-album-label]");
    if (label)
      label.textContent = album
        ? es
          ? eventContent.albums.find((a) => a.id === album)?.es
          : eventContent.albums.find((a) => a.id === album)?.en
        : tr("All albums", "Todos los álbumes");
    for (const b of document.querySelectorAll("[data-album]"))
      b.setAttribute("aria-pressed", String(b.dataset.album === album));
  }
  document
    .querySelector("[data-album-cards]")
    .addEventListener("click", (e) => {
      const b = e.target.closest("[data-album]");
      if (b) {
        render(
          b.getAttribute("aria-pressed") === "true" ? "" : b.dataset.album,
        );
        photos.closest("section").scrollIntoView({ block: "start" });
      }
    });
  render();
}
await gallery();
