import { api, esc, es, tr, route, field, submit } from "./client.js";
import {
  createUploadBatch,
  sendUploadBatch,
  checkVideoLengths,
  progress,
  uploadAccept,
  uploadLimits,
} from "./upload-batch.mjs";

const mb = (bytes) =>
  bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + " KB"
    : (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
const minutes = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
// What each problem means for the guest, and what to do about it.
const tooLong = (seconds) =>
  seconds
    ? tr(
        `This video is ${minutes(seconds)} long. Videos can be up to 60 seconds: trim it in your Photos or Gallery app and choose it again.`,
        `Este video dura ${minutes(seconds)}. Los videos pueden durar hasta 60 segundos: recórtalo en tu app de Fotos o Galería y vuelve a elegirlo.`,
      )
    : tr(
        "This video is longer than 60 seconds. Trim it in your Photos or Gallery app and send it again.",
        "Este video dura más de 60 segundos. Recórtalo en tu app de Fotos o Galería y vuelve a enviarlo.",
      );
const heic = () =>
  tr(
    "This photo is in HEIC format, which the site can't open. On an iPhone, choose it from Photos on this page and it's sent as a JPEG. On a computer, export or save it as JPEG first.",
    "Esta foto está en formato HEIC y el sitio no puede abrirla. En un iPhone, elígela desde Fotos en esta página y se enviará como JPEG. En una computadora, primero expórtala o guárdala como JPEG.",
  );
const problems = {
  heic,
  "video-long": (e) => tooLong(e.seconds),
  type: () =>
    tr(
      "This kind of file can't be shared here. Choose photos (JPEG, PNG or WebP) or videos (MP4, MOV or WebM).",
      "Este tipo de archivo no se puede compartir aquí. Elige fotos (JPEG, PNG o WebP) o videos (MP4, MOV o WebM).",
    ),
  empty: () =>
    tr(
      "This file is empty. Choose it again from your photos.",
      "Este archivo está vacío. Vuelve a elegirlo desde tus fotos.",
    ),
  "photo-size": () =>
    tr(
      "This photo is larger than 40 MB. Save a smaller copy and choose that one.",
      "Esta foto pesa más de 40 MB. Guarda una copia más pequeña y elige esa.",
    ),
  "video-size": () =>
    tr(
      "This video is larger than 300 MB. Trim it in your Photos or Gallery app, or record at 1080p instead of 4K, and try again.",
      "Este video pesa más de 300 MB. Recórtalo en tu app de Fotos o Galería, o grábalo en 1080p en lugar de 4K, y vuelve a intentarlo.",
    ),
};
// Answers to a piece of a file (sent here, not through api()), and what a
// finished video conversion reported.
const answers = {
  HEIC_NOT_SUPPORTED: heic,
  VIDEO_TOO_LONG: () => tooLong(null),
  INVALID_PHOTO: () =>
    tr(
      "This photo couldn't be opened. Choose it again from your Photos or Gallery app.",
      "No se pudo abrir esta foto. Vuelve a elegirla desde tu app de Fotos o Galería.",
    ),
  INVALID_VIDEO: () =>
    tr(
      "This video couldn't be opened. Choose it again from your Photos or Gallery app; if it still fails, contact us.",
      "No se pudo abrir este video. Vuelve a elegirlo desde tu app de Fotos o Galería; si sigue fallando, comunícate con nosotros.",
    ),
  PROCESSING_FAILED: () =>
    tr(
      "This video couldn't be prepared for the gallery. Try a shorter clip, or contact us.",
      "No se pudo preparar este video para la galería. Prueba con un clip más corto o comunícate con nosotros.",
    ),
  UPLOAD_EXPIRED: () =>
    tr(
      "This upload expired. Choose the file again to send it.",
      "Este envío venció. Vuelve a elegir el archivo para enviarlo.",
    ),
  SIGN_IN_REQUIRED: () =>
    tr(
      "Your sign-in ended. Sign in again, then choose the file again.",
      "Tu sesión terminó. Vuelve a iniciar sesión y elige el archivo otra vez.",
    ),
  CSRF_REJECTED: () =>
    tr(
      "This page was open too long. Refresh it and choose the file again.",
      "Esta página estuvo abierta demasiado tiempo. Actualízala y vuelve a elegir el archivo.",
    ),
  TOO_MANY_REQUESTS: () =>
    tr(
      "A lot was sent in the last hour. Wait a while, then tap Try again.",
      "Se envió mucho en la última hora. Espera un rato y toca Reintentar.",
    ),
};
answers.NOT_FOUND = answers.UPLOAD_EXPIRED;
const answer = (code) =>
  (answers[code] || (() => tr(
    "This file couldn't be sent. Choose it again; if it keeps failing, contact us.",
    "No se pudo enviar este archivo. Vuelve a elegirlo; si sigue fallando, comunícate con nosotros.",
  )))();
// One piece of a file, as raw bytes. XMLHttpRequest (not fetch) because it
// reports upload progress. 50 seconds stays inside Hosting's 60-second limit;
// a piece that runs out is retried smaller.
function sendPiece(csrf, id, offset, blob, onBytes) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/uploads/${encodeURIComponent(id)}?offset=${offset}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-CSRF-Token", csrf);
    xhr.timeout = 50000;
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // A proxy error page: treated like a dropped connection.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else
        reject(
          Object.assign(new Error(answer(data.error)), {
            status: xhr.status,
            code: data.error,
          }),
        );
    };
    xhr.onerror = () => reject(new Error(""));
    xhr.ontimeout = () => reject(Object.assign(new Error(""), { timeout: true }));
    xhr.send(blob);
  });
}

export function mediaUpload(portal, albums) {
  portal.innerHTML = `<form id="photo"><h2>${tr("Add your photos & videos", "Agrega tus fotos y videos")}</h2><p id="upload-help">${tr(
    "Choose photos and short videos straight from your phone, up to 10 at a time. Videos can be up to 60 seconds long. Each photo can be up to 40 MB and each video up to 300 MB. Your household can share up to 20 files a day.",
    "Elige fotos y videos cortos directamente de tu teléfono, hasta 10 a la vez. Los videos pueden durar hasta 60 segundos. Cada foto puede pesar hasta 40 MB y cada video hasta 300 MB. Tu hogar puede compartir hasta 20 archivos al día.",
  )}</p><label>${tr("Choose photos & videos", "Elige fotos y videos")}<input type="file" name="file" accept="${esc(uploadAccept)}" multiple required aria-describedby="upload-help" data-label="${tr("Photos & videos", "Fotos y videos")}"></label><div class="upload-fields"><label>${tr("Album", "Álbum")}<select name="album">${albums.map((a) => `<option value="${esc(a.id)}"${a.id === "event" ? " selected" : ""}>${esc(es ? a.es : a.en)}</option>`).join("")}</select></label>${field(tr("Caption for these files (optional)", "Descripción para estos archivos (opcional)"), "caption", { max: 200 })}</div><label class="check upload-consent"><input type="checkbox" name="consent" required data-label="${tr("Permission from the people pictured", "Permiso de las personas que aparecen")}"><span>${tr("I have permission from the people pictured and agree to the", "Tengo permiso de las personas que aparecen y acepto lo indicado en")} <a href="${route("terms")}" target="_blank" rel="noopener">${tr("Photo & video policy", "Uso de fotos y videos")}</a>.</span></label><p class="error" role="alert"></p><div class="upload-actions"><button type="submit" class="button burgundy">${tr("Send my photos & videos", "Enviar mis fotos y videos")}</button><a href="${route("gallery")}">${tr("View the gallery", "Ver la galería")}</a></div><div id="upload-summary" role="status" aria-live="polite"></div><ol id="upload-results" aria-label="${tr("Your files", "Tus archivos")}"></ol></form>`;
  // Signed in: the page's "How to share" steps (for the QR's signed-out
  // visitors, scripts/build-pages.mjs) have done their job.
  document.querySelector("[data-share-steps]")?.setAttribute("hidden", "");
  const form = portal.querySelector("form"),
    input = form.elements.file,
    button = form.querySelector('[type="submit"]'),
    error = form.querySelector('[role="alert"]'),
    results = form.querySelector("#upload-results"),
    summary = form.querySelector("#upload-summary");
  let entries = [],
    busy = false,
    checking = false,
    // The length check of the videos chosen last; Send waits for it.
    checked = Promise.resolve(),
    choice = 0,
    shown = "";
  const status = (e) => {
    if (e.state === "invalid" || (e.state === "queued" && e.problem))
      return problems[e.problem](e);
    if (["rejected", "failed"].includes(e.state)) return e.message;
    if (e.state === "uploading")
      return tr(
        `Sending… ${progress(e)}% (${mb(e.sent + (e.inFlight || 0))} of ${mb(e.size)})`,
        `Enviando… ${progress(e)}% (${mb(e.sent + (e.inFlight || 0))} de ${mb(e.size)})`,
      );
    if (e.state === "paused")
      return (
        e.message ||
        tr(
          `Paused at ${progress(e)}%: the connection dropped. What was sent is saved.`,
          `En pausa en ${progress(e)}%: se cortó la conexión. Lo que se envió está guardado.`,
        )
      );
    if (e.state === "processing")
      return tr(
        "Arrived. We're preparing the video so we can review it; you can close this page.",
        "Llegó. Estamos preparando el video para revisarlo; ya puedes cerrar esta página.",
      );
    if (e.state === "received")
      return tr(
        "Arrived. We'll review it before it appears in the gallery.",
        "Llegó. Lo revisaremos antes de que aparezca en la galería.",
      );
    return checking && e.kind === "video"
      ? tr("Checking the video…", "Revisando el video…")
      : tr("Ready to send", "Listo para enviar");
  };
  const failed = (e) =>
    ["invalid", "rejected", "failed"].includes(e.state) || (e.state === "queued" && e.problem);
  const row = (e, i) =>
    `<li class="upload-result" data-state="${esc(e.state)}"><span class="upload-file-name">${esc(e.file.name)}<small>${esc(mb(e.size))}</small></span><span class="upload-status${failed(e) ? " error" : ""}"><span data-status="${i}">${esc(status(e))}</span>${["uploading", "paused"].includes(e.state) ? `<progress class="upload-progress" max="100" value="${progress(e)}" data-progress="${i}" aria-label="${esc(e.file.name)}"></progress>` : ""}${e.state === "paused" && !busy ? `<button type="button" class="plain-button" data-retry>${tr("Try again", "Reintentar")}</button>` : ""}</span></li>`;
  const render = () => {
    // Progress alone changes the numbers in place; anything else redraws the
    // list (keeping focus on a Try again button is not needed while sending).
    const layout = entries.map((e) => e.state + e.problem + e.message).join("|") + busy + checking;
    if (layout === shown)
      entries.forEach((e, i) => {
        const text = results.querySelector(`[data-status="${i}"]`),
          bar = results.querySelector(`[data-progress="${i}"]`);
        if (text) text.textContent = status(e);
        if (bar) bar.value = progress(e);
      });
    else results.innerHTML = entries.map(row).join("");
    shown = layout;
    const arrived = entries.filter((e) => ["received", "processing"].includes(e.state)).length,
      paused = entries.some((e) => e.state === "paused"),
      sendable = entries.filter((e) => !e.problem).length;
    summary.textContent = busy
      ? tr(
          `Sending your files: ${arrived} of ${sendable} arrived. Keep this page open until they finish.`,
          `Enviando tus archivos: llegaron ${arrived} de ${sendable}. Mantén esta página abierta hasta que terminen.`,
        )
      : paused
        ? tr(
            `${arrived} of ${sendable} arrived. Sending paused; check your connection and tap Try again.`,
            `Llegaron ${arrived} de ${sendable}. El envío está en pausa; revisa tu conexión y toca Reintentar.`,
          )
        : entries.some((e) => !["queued"].includes(e.state)) && arrived
          ? tr(
              `${arrived} of ${sendable} arrived. Thank you! We'll review them before they appear in the gallery. You can choose more files above.`,
              `Llegaron ${arrived} de ${sendable}. ¡Gracias! Los revisaremos antes de que aparezcan en la galería. Puedes elegir más archivos arriba.`,
            )
          : "";
    summary.className = summary.textContent
      ? `notice${!busy && !paused && arrived === sendable ? " success" : ""}`
      : "";
  };
  input.addEventListener("change", async () => {
    error.textContent = "";
    const mine = ++choice;
    try {
      entries = createUploadBatch(Array.from(input.files));
    } catch {
      entries = [];
      error.textContent = tr(
        `Choose between 1 and ${uploadLimits.files} files at a time.`,
        `Elige entre 1 y ${uploadLimits.files} archivos a la vez.`,
      );
    }
    checking = true;
    render();
    const chosen = entries;
    await (checked = checkVideoLengths(chosen));
    if (mine !== choice) return;
    checking = false;
    render();
  });
  // A video waits for its conversion (the scheduled job runs every few
  // minutes); while the page stays open, its row follows along.
  async function follow(entry) {
    for (let i = 0; i < 45 && entry.state === "processing"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      let now;
      try {
        now = await api(`uploads/${encodeURIComponent(entry.id)}?poll=1`);
      } catch {
        continue;
      }
      if (now.state === "review") entry.state = "received";
      if (now.state === "failed") {
        entry.state = "failed";
        entry.message = answer(now.problem);
      }
    }
    if (!busy) render();
  }
  async function send() {
    if (busy) return;
    const album = form.elements.album.value,
      caption = form.elements.caption.value;
    error.textContent = "";
    busy = true;
    // Nothing can change while files are on their way. Send (and whatever has
    // focus) is only marked busy: disabling it would drop focus to the page.
    button.setAttribute("aria-disabled", "true");
    const controls = Array.from(form.querySelectorAll("input,select,button")).filter(
      (el) => el !== button && el !== document.activeElement,
    );
    controls.forEach((el) => (el.disabled = true));
    render();
    try {
      // The token for the X-CSRF-Token header of each piece.
      const { csrf } = await api("session");
      await sendUploadBatch(
        entries,
        {
          start: (e) =>
            api("uploads", { kind: e.kind, type: e.type, size: e.size, album, caption, consent: true }),
          put: (id, offset, blob, onBytes) => sendPiece(csrf, id, offset, blob, onBytes),
        },
        render,
      );
    } catch (e) {
      error.textContent = e.message;
    } finally {
      busy = false;
      button.removeAttribute("aria-disabled");
      controls.forEach((el) => (el.disabled = false));
      // Clear the chooser, so picking the same file again (after "Not
      // sent") counts as a new choice; the results stay listed below.
      if (!entries.some((e) => e.state === "paused")) input.value = "";
      render();
      for (const e of entries) if (e.state === "processing" && !e.following) {
        e.following = true;
        follow(e);
      }
    }
  }
  // Checked like every form on the site (site/client.js): what is missing is
  // listed in the page's language, and Send keeps focus while it is busy.
  submit(form, async () => {
    await checked;
    if (!entries.some((e) => e.state === "queued" && !e.problem))
      throw new Error(
        tr(
          "None of the files you chose can be sent. See the note next to each one, then choose others.",
          "No se puede enviar ninguno de los archivos que elegiste. Revisa la nota junto a cada uno y elige otros.",
        ),
      );
    await send();
  });
  results.addEventListener("click", (event) => {
    if (event.target.closest("[data-retry]")) send();
  });
}
