import { api, esc, es, tr, route, field } from "./client.js";
import {
  createUploadBatch,
  sendUploadBatch,
  uploadTypes,
} from "./upload-batch.mjs";

export function mediaUpload(portal, albums) {
  portal.innerHTML = `<form id="photo"><h2>${tr("Add Your Photos & Videos", "Agrega Tus Fotos y Videos")}</h2><p id="upload-help">${tr("Select up to 10 files at once, up to 8 MB each. Photos: JPEG, PNG or WebP. Videos: MP4 or WebM, up to 60 seconds. Up to 20 submissions per household per day.", "Selecciona hasta 10 archivos a la vez, de hasta 8 MB cada uno. Fotos: JPEG, PNG o WebP. Videos: MP4 o WebM, hasta 60 segundos. Hasta 20 envíos por familia al día.")}</p><label>${tr("Choose Photos & Videos", "Elige Fotos y Videos")}<input type="file" name="file" accept="${uploadTypes.join(",")}" multiple required aria-describedby="upload-help"></label><div class="upload-fields"><label>${tr("Album", "Álbum")}<select name="album">${albums.map((a) => `<option value="${esc(a.id)}"${a.id === "event" ? " selected" : ""}>${esc(es ? a.es : a.en)}</option>`).join("")}</select></label>${field(tr("Caption For These Files (Optional)", "Descripción Para Estos Archivos (Opcional)"), "caption", { max: 200 })}</div><label class="check upload-consent"><input type="checkbox" name="consent" required><span>${tr("I have permission from the people pictured and agree to the", "Tengo permiso de las personas fotografiadas y acepto la")} <a href="${route("terms")}" target="_blank" rel="noopener">${tr("Media Policy", "Política de Medios")}</a>.</span></label><p class="error" role="alert"></p><div class="upload-actions"><button type="submit" class="button burgundy" disabled>${tr("Upload For Family Review", "Enviar Para Revisión Familiar")}</button><a href="${route("gallery")}">${tr("View The Gallery", "Ver La Galería")}</a></div><div id="upload-summary" role="status" aria-live="polite"></div><ol id="upload-results" aria-label="${tr("Selected files and upload results", "Archivos seleccionados y resultados")}"></ol></form>`;
  const form = portal.querySelector("form"),
    input = form.elements.file,
    button = form.querySelector('[type="submit"]'),
    error = form.querySelector('[role="alert"]'),
    results = form.querySelector("#upload-results"),
    summary = form.querySelector("#upload-summary");
  let entries = [],
    busy = false;
  const render = () => {
    const labels = {
      queued: tr("Ready", "Listo"),
      uploading: tr("Uploading…", "Subiendo…"),
      received: tr(
        "Received · Awaiting Family Review",
        "Recibido · Pendiente de Revisión",
      ),
      rejected: tr("Not Uploaded", "No Se Subió"),
      unknown: tr(
        "Receipt Unconfirmed — Check With The Family Before Retrying",
        "Recepción Sin Confirmar — Consulta a la Familia Antes de Reintentar",
      ),
      invalid: tr("Not Uploaded", "No Se Subió"),
    };
    results.innerHTML = entries
      .map(
        (e) =>
          `<li class="upload-result"><span class="upload-file-name">${esc(e.file.name)}</span><span class="${["invalid", "rejected", "unknown"].includes(e.state) || e.problem ? "error" : ""}">${esc(e.problem === "type" ? tr("Unsupported file type", "Tipo de archivo no admitido") : e.problem === "size" ? tr("File must be between 1 byte and 8 MB", "El archivo debe tener entre 1 byte y 8 MB") : labels[e.state])}${e.message ? `<small>${esc(e.message)}</small>` : ""}</span></li>`,
      )
      .join("");
    const received = entries.filter((e) => e.state === "received").length;
    summary.textContent = busy
      ? tr(
          `Uploading · ${received} of ${entries.length} received. Keep this page open.`,
          `Subiendo · ${received} de ${entries.length} recibidos. Mantén esta página abierta.`,
        )
      : entries.some((e) => !["queued"].includes(e.state))
        ? tr(
            `${received} of ${entries.length} files received for family review. You can choose more files above.`,
            `${received} de ${entries.length} archivos recibidos para revisión familiar. Puedes elegir más archivos arriba.`,
          )
        : "";
    summary.className = summary.textContent
      ? `notice${!busy && received === entries.length ? " success" : ""}`
      : "";
    button.disabled =
      busy || !entries.some((e) => e.state === "queued" && !e.problem);
  };
  input.addEventListener("change", () => {
    error.textContent = "";
    try {
      entries = createUploadBatch(Array.from(input.files));
    } catch {
      entries = [];
      error.textContent = tr(
        "Choose between 1 and 10 files at a time.",
        "Elige entre 1 y 10 archivos a la vez.",
      );
    }
    render();
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const album = form.elements.album.value,
      caption = form.elements.caption.value;
    error.textContent = "";
    busy = true;
    const controls = Array.from(form.querySelectorAll("input,select,button"));
    controls.forEach((el) => (el.disabled = true));
    try {
      await sendUploadBatch(
        entries,
        async (file) => {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(",")[1]);
            reader.onerror = () =>
              reject(
                Object.assign(
                  new Error(
                    tr(
                      "This file could not be read.",
                      "No se pudo leer este archivo.",
                    ),
                  ),
                  { status: 422 },
                ),
              );
            reader.readAsDataURL(file);
          });
          return api(file.type.startsWith("video/") ? "videos" : "photos", {
            album,
            caption,
            base64,
            consent: true,
          });
        },
        render,
      );
    } finally {
      busy = false;
      controls.forEach((el) => (el.disabled = false));
      render();
    }
  });
}
