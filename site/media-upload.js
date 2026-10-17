import { api, esc, es, tr, route, field, submit, focusOn } from "./client.js";
import {
  createUploadBatch,
  sendUploadBatch,
  checkVideoLengths,
  classify,
  progress,
  retryable,
  referenceCode,
  uploadAccept,
  uploadLimits,
} from "./upload-batch.mjs";
import { parts, time, date } from "./datetime.mjs";
import { delayUntil } from "./lifecycle.mjs";

const lang = es ? "es" : "en";
const mb = (bytes) =>
  bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + " KB"
    : (bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0) + " MB";
const minutes = (s) => Math.floor(s / 60) + ":" + String(Math.round(s % 60)).padStart(2, "0");
// The phone's clock corrected by the server's (each limit answer says when it
// was given), so "after 9:15 PM" and the Try again that comes back then are
// right even on a phone whose clock is off.
let skew = 0;
const noteServerTime = (iso) => {
  const t = Date.parse(iso);
  if (Number.isFinite(t)) skew = t - Date.now();
};
const now = () => Date.now() + skew;
// "after 9:15 PM", or "after 9:15 PM on Saturday, January 16" when that is
// another day (Fort Worth time, like every time on the site). Never
// "tomorrow": the limits count 24 hours from each upload, not calendar days.
function after(at) {
  const a = parts(at),
    b = parts(now()),
    sameDay = a.year === b.year && a.month === b.month && a.day === b.day,
    t = time(at, lang, { nbsp: true });
  if (es) {
    const lead = (a.hour % 12 === 1 ? "después de la " : "después de las ") + t;
    return sameDay ? lead : `${lead} del ${date(at, lang, { year: false })}`;
  }
  return sameDay ? `after ${t}` : `after ${t} on ${date(at, lang, { year: false })}`;
}
// What a limit means for the guest, with the number and the time the API
// gave (server/upload-quota.mjs); the page never states a number of its own.
function limitSentence({ scope, limit, retryAt }) {
  const n = Number.isSafeInteger(limit) ? limit : null;
  if (scope === "device")
    return tr(
      `This phone has shared ${n ?? "the most"} photos and videos from the table card, the most one phone can send. Thank you!`,
      `Este teléfono ya compartió ${n ?? "el máximo de"} fotos y videos desde la tarjeta de la mesa, el máximo por teléfono. ¡Gracias!`,
    );
  if (scope === "card")
    return tr(
      "The table card has received all the photos and videos it can take. Thank you!",
      "La tarjeta de la mesa ya recibió todas las fotos y videos que puede recibir. ¡Gracias!",
    );
  const shared = n
    ? tr(
        `Your family has shared ${n} photos and videos in the last 24 hours, the most we can take at once.`,
        `Tu familia ya compartió ${n} fotos y videos en las últimas 24 horas, el máximo que podemos recibir a la vez.`,
      )
    : tr("Your family has reached the limit for now.", "Tu familia alcanzó el límite por ahora.");
  return (
    shared +
    " " +
    (retryAt
      ? tr(`You can add more ${after(retryAt)}.`, `Puedes agregar más ${after(retryAt)}.`)
      : tr("You can add more later.", "Puedes agregar más después."))
  );
}
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
      "Tu sesión terminó. Vuelve a entrar y elige el archivo otra vez.",
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
        // A proxy error page: its status says what it is (upload-batch.mjs).
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else
        reject(
          Object.assign(new Error(answer(data.error)), {
            status: xhr.status,
            code: data.error,
            details: data,
          }),
        );
    };
    xhr.onerror = () => reject(new Error(""));
    xhr.ontimeout = () => reject(Object.assign(new Error(""), { timeout: true }));
    xhr.send(blob);
  });
}
// "3 photos chosen", in the page's language (the browser's own file control
// would speak the browser's language).
function chosenText(files) {
  const n = files.length;
  if (!n) return tr("No files chosen yet", "Aún no has elegido archivos");
  const kinds = files.map((f) => classify(f).kind),
    all = (k) => kinds.every((x) => x === k);
  if (all("photo"))
    return tr(`${n} ${n === 1 ? "photo" : "photos"} chosen`, `${n} ${n === 1 ? "foto elegida" : "fotos elegidas"}`);
  if (all("video"))
    return tr(`${n} ${n === 1 ? "video" : "videos"} chosen`, `${n} ${n === 1 ? "video elegido" : "videos elegidos"}`);
  return tr(`${n} ${n === 1 ? "file" : "files"} chosen`, `${n} ${n === 1 ? "archivo elegido" : "archivos elegidos"}`);
}

// The upload form. `party`: the guest came in through the printed table card
// (no sign-in): an optional name, a reference for each file, and a way to
// take a file back before the family reviews it.
export function mediaUpload(portal, albums, { party = false } = {}) {
  const help = tr(
    `Choose up to ${uploadLimits.files} photos or videos (${uploadLimits.videoSeconds} seconds or less) from your phone.`,
    `Elige hasta ${uploadLimits.files} fotos o videos (de ${uploadLimits.videoSeconds} segundos o menos) desde tu teléfono.`,
  );
  const intro = party
    ? `<p class="notice party-note">${tr(
        "You’re sharing from the table card, so there’s nothing to sign in to. We look at every photo and video before our guests can see it, and we don’t ask for your email.",
        "Estás compartiendo desde la tarjeta de la mesa, así que no tienes que entrar a ninguna cuenta. Revisamos cada foto y video antes de que lo vean nuestros invitados, y no te pedimos tu correo.",
      )}</p>`
    : "";
  const name = party
    ? field(tr("Your name (optional)", "Tu nombre (opcional)"), "name", {
        max: 60,
        autocomplete: "name",
        hint: tr("So the family knows who took them.", "Para que la familia sepa quién los tomó."),
      })
    : "";
  portal.innerHTML = `<form id="photo"><h2>${tr("Add your photos & videos", "Agrega tus fotos y videos")}</h2>${intro}<p id="upload-help">${help}</p><p id="upload-room" class="hint" hidden></p><div class="file-picker"><input type="file" id="upload-files" class="file-input" name="file" accept="${esc(uploadAccept)}" multiple required aria-describedby="upload-help upload-chosen" data-label="${tr("Photos & videos", "Fotos y videos")}"><label for="upload-files" class="button outline file-button">${tr("Choose photos & videos", "Elige fotos y videos")}</label><p id="upload-chosen" class="file-count" aria-live="polite">${chosenText([])}</p></div><div class="upload-fields">${name}<label>${tr("Album", "Álbum")}<select name="album">${albums.map((a) => `<option value="${esc(a.id)}"${a.id === "event" ? " selected" : ""}>${esc(es ? a.es : a.en)}</option>`).join("")}</select></label>${field(tr("Caption for these files (optional)", "Descripción para estos archivos (opcional)"), "caption", { max: 200 })}</div><label class="check upload-consent"><input type="checkbox" name="consent" required data-label="${tr("Permission from the people pictured", "Permiso de las personas que aparecen")}"><span>${tr("I have permission from the people pictured and agree to the", "Tengo permiso de las personas que aparecen y acepto lo indicado en")} <a href="${route("terms")}" target="_blank" rel="noopener">${tr("Photo & video policy", "Uso de fotos y videos")}</a>.</span></label><p class="error" role="alert"></p><div class="upload-actions"><button type="submit" class="button burgundy">${tr("Send my photos & videos", "Enviar mis fotos y videos")}</button>${party ? "" : `<a href="${route("gallery")}">${tr("View the gallery", "Ver la galería")}</a>`}</div><div id="upload-summary" role="status" aria-live="polite"></div><ol id="upload-results" aria-label="${tr("Your files", "Tus archivos")}"></ol></form>`;
  // Signed in, or in through the table card: the page's "How to share" steps
  // (for signed-out visitors, scripts/build-pages.mjs) have done their job.
  document.querySelector("[data-share-steps]")?.setAttribute("hidden", "");
  const form = portal.querySelector("form"),
    input = form.elements.file,
    chosen = form.querySelector("#upload-chosen"),
    room = form.querySelector("#upload-room"),
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
    shown = "",
    wake = 0;
  const arrivedNote = (e) =>
    party && e.id
      ? " " + tr(`Reference: ${referenceCode(e.id)}.`, `Referencia: ${referenceCode(e.id)}.`)
      : "";
  const status = (e) => {
    if (e.state === "invalid" || (e.state === "queued" && e.problem))
      return problems[e.problem](e);
    if (["rejected", "failed", "blocked"].includes(e.state)) return e.message;
    if (e.state === "uploading")
      return tr(
        `Sending… ${progress(e)}% (${mb(e.sent + (e.inFlight || 0))} of ${mb(e.size)})`,
        `Enviando… ${progress(e)}% (${mb(e.sent + (e.inFlight || 0))} de ${mb(e.size)})`,
      );
    if (e.state === "paused")
      return e.reason === "busy"
        ? tr(
            `Paused at ${progress(e)}%: the site is busy. What was sent is saved.`,
            `En pausa en ${progress(e)}%: el sitio está ocupado. Lo que se envió está guardado.`,
          )
        : tr(
            `Paused at ${progress(e)}%: the connection dropped. What was sent is saved.`,
            `En pausa en ${progress(e)}%: se cortó la conexión. Lo que se envió está guardado.`,
          );
    if (e.state === "limited")
      return tr("Not sent: the limit is reached.", "No se envió: se alcanzó el límite.");
    if (e.state === "waiting")
      return tr("Not sent yet: a lot was sent in the last hour.", "Aún no se envía: se envió mucho en la última hora.");
    if (e.state === "processing")
      return (
        tr(
          "Arrived. We're preparing the video so we can review it; you can close this page.",
          "Llegó. Estamos preparando el video para revisarlo; ya puedes cerrar esta página.",
        ) + arrivedNote(e)
      );
    if (e.state === "received")
      return (
        tr(
          "Arrived. We'll review it before it appears in the gallery.",
          "Llegó. Lo revisaremos antes de que aparezca en la galería.",
        ) + arrivedNote(e)
      );
    if (e.state === "withdrawn")
      return tr("Removed before anyone saw it.", "Lo quitaste antes de que alguien lo viera.");
    return checking && e.kind === "video"
      ? tr("Checking the video…", "Revisando el video…")
      : tr("Ready to send", "Listo para enviar");
  };
  const failed = (e) =>
    ["invalid", "rejected", "failed", "blocked"].includes(e.state) || (e.state === "queued" && e.problem);
  // Try again only where it can work now (upload-batch.mjs retryable()).
  const again = (e) => !busy && retryable(e, now());
  const row = (e, i) =>
    `<li class="upload-result" data-state="${esc(e.state)}"><span class="upload-file-name">${esc(e.file.name)}<small>${esc(mb(e.size))}</small></span><span class="upload-status${failed(e) ? " error" : ""}"><span data-status="${i}">${esc(status(e))}</span>${["uploading", "paused"].includes(e.state) ? `<progress class="upload-progress" max="100" value="${progress(e)}" data-progress="${i}" aria-label="${esc(e.file.name)}"></progress>` : ""}${again(e) ? `<button type="button" class="plain-button" data-retry>${tr("Try again", "Reintentar")}</button>` : ""}${party && !busy && ["received", "processing"].includes(e.state) ? `<button type="button" class="plain-button" data-withdraw="${i}" aria-label="${esc(tr(`Remove ${e.file.name}`, `Quitar ${e.file.name}`))}">${tr("Remove", "Quitar")}</button>` : ""}</span></li>`;
  // The first reason the batch stopped, for the sentence above the list.
  const stopped = () => {
    const sendable = entries.filter((e) => !e.problem).length,
      arrived = entries.filter((e) => ["received", "processing"].includes(e.state)).length,
      head = tr(`${arrived} of ${sendable} arrived.`, `Llegaron ${arrived} de ${sendable}.`),
      first = (state) => entries.find((e) => e.state === state);
    const limited = first("limited"),
      waiting = first("waiting"),
      blocked = first("blocked"),
      paused = first("paused");
    if (limited)
      return `${head} ${retryable(limited, now()) ? tr("You can send the rest now: tap Try again.", "Ya puedes enviar los demás: toca Reintentar.") : limitSentence(limited)}`;
    if (waiting)
      return `${head} ${
        retryable(waiting, now())
          ? tr("You can send the rest now: tap Try again.", "Ya puedes enviar los demás: toca Reintentar.")
          : waiting.retryAt
            ? tr(`A lot was sent in the last hour. You can try again ${after(waiting.retryAt)}.`, `Se envió mucho en la última hora. Puedes intentarlo de nuevo ${after(waiting.retryAt)}.`)
            : tr("A lot was sent in the last hour. Try again later.", "Se envió mucho en la última hora. Inténtalo más tarde.")
      }`;
    if (blocked) return `${head} ${blocked.message}`;
    if (paused)
      return paused.reason === "busy"
        ? tr(
            `${head} The site is busy right now. What arrived is saved; tap Try again in a minute.`,
            `${head} El sitio está ocupado en este momento. Lo que llegó está guardado; toca Reintentar en un minuto.`,
          )
        : tr(
            `${head} Sending paused; check your connection and tap Try again.`,
            `${head} El envío está en pausa; revisa tu conexión y toca Reintentar.`,
          );
    return null;
  };
  const render = () => {
    // Progress alone changes the numbers in place; anything else redraws the
    // list (keeping focus on a Try again button is not needed while sending).
    const layout =
      entries.map((e) => e.state + e.problem + e.message + again(e)).join("|") + busy + checking;
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
      sendable = entries.filter((e) => !e.problem).length,
      stop = busy ? null : stopped();
    summary.textContent = busy
      ? tr(
          `Sending your files: ${arrived} of ${sendable} arrived. Keep this page open until they finish.`,
          `Enviando tus archivos: llegaron ${arrived} de ${sendable}. Mantén esta página abierta hasta que terminen.`,
        )
      : stop ||
        (entries.some((e) => !["queued"].includes(e.state)) && arrived
          ? tr(
              `${arrived} of ${sendable} arrived. Thank you! We'll review them before they appear in the gallery. You can choose more files above.`,
              `Llegaron ${arrived} de ${sendable}. ¡Gracias! Los revisaremos antes de que aparezcan en la galería. Puedes elegir más archivos arriba.`,
            ) +
            (party
              ? " " +
                tr(
                  "To have one removed later, email misxv@simplysoph.com with its reference.",
                  "Para que quitemos alguno después, escríbenos a misxv@simplysoph.com con su referencia.",
                )
              : "")
          : "");
    summary.className = summary.textContent
      ? `notice${!busy && !stop && arrived === sendable ? " success" : ""}`
      : "";
    // A limit that passes while the page is open brings Try again back then.
    clearTimeout(wake);
    const next = entries
      .filter((e) => ["limited", "waiting"].includes(e.state) && e.retryAt > now())
      .map((e) => e.retryAt)
      .sort((a, b) => a - b)[0];
    if (next && !busy) wake = setTimeout(render, delayUntil(next, now()) + 50);
  };
  // How many more can be shared now, from the API; said only when it matters.
  async function showRoom() {
    let q;
    try {
      q = await api("uploads/quota");
    } catch {
      return;
    }
    noteServerTime(q.now);
    const retryAt = q.retryAt ? Date.parse(q.retryAt) : null;
    room.textContent =
      q.remaining <= 0
        ? limitSentence({ scope: q.scope, limit: q.limit, retryAt })
        : q.remaining < uploadLimits.files
          ? q.scope === "family"
            ? tr(`You can share ${q.remaining} more now.`, `Puedes compartir ${q.remaining} más por ahora.`)
            : tr(`This phone can share ${q.remaining} more.`, `Este teléfono puede compartir ${q.remaining} más.`)
          : "";
    room.hidden = !room.textContent;
  }
  showRoom();
  input.addEventListener("change", async () => {
    error.textContent = "";
    const mine = ++choice,
      files = Array.from(input.files);
    chosen.textContent = chosenText(files);
    try {
      entries = createUploadBatch(files);
    } catch {
      entries = [];
      error.textContent = tr(
        `Choose between 1 and ${uploadLimits.files} files at a time.`,
        `Elige entre 1 y ${uploadLimits.files} archivos a la vez.`,
      );
    }
    checking = true;
    render();
    const list = entries;
    await (checked = checkVideoLengths(list));
    if (mine !== choice) return;
    checking = false;
    render();
  });
  // A video waits for its conversion (the scheduled job runs every few
  // minutes); while the page stays open, its row follows along.
  async function follow(entry) {
    for (let i = 0; i < 45 && entry.state === "processing"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      let state;
      try {
        state = await api(`uploads/${encodeURIComponent(entry.id)}?poll=1`);
      } catch {
        continue;
      }
      if (entry.state !== "processing") break;
      if (state.state === "review") entry.state = "received";
      if (state.state === "failed") {
        entry.state = "failed";
        entry.message = answer(state.problem);
      }
    }
    if (!busy) render();
  }
  async function send() {
    if (busy) return;
    const album = form.elements.album.value,
      caption = form.elements.caption.value,
      named = party ? form.elements.name.value : "";
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
            api("uploads", {
              kind: e.kind,
              type: e.type,
              size: e.size,
              album,
              caption,
              consent: true,
              ...(party ? { name: named } : {}),
            }),
          put: (id, offset, blob, onBytes) => sendPiece(csrf, id, offset, blob, onBytes),
        },
        render,
      );
    } catch (e) {
      error.textContent = e.message;
    } finally {
      for (const e of entries) if (e.serverNow) noteServerTime(new Date(e.serverNow).toISOString());
      busy = false;
      button.removeAttribute("aria-disabled");
      controls.forEach((el) => (el.disabled = false));
      // Clear the chooser, so picking the same file again (after "Not
      // sent") counts as a new choice; the results stay listed below.
      if (!entries.some((e) => e.state === "paused")) {
        input.value = "";
        chosen.textContent = chosenText([]);
      }
      render();
      showRoom();
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
    if (!entries.some((e) => (e.state === "queued" && !e.problem) || again(e))) {
      // A limit stopped the batch: say so again, not "nothing can be sent".
      const held = entries.find((e) => ["limited", "waiting"].includes(e.state));
      throw new Error(
        held
          ? stopped()
          : tr(
              "None of the files you chose can be sent. See the note next to each one, then choose others.",
              "No se puede enviar ninguno de los archivos que elegiste. Revisa la nota junto a cada uno y elige otros.",
            ),
      );
    }
    await send();
  });
  results.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry]")) {
      send();
      return;
    }
    const take = event.target.closest("[data-withdraw]");
    if (!take || busy) return;
    const i = Number(take.dataset.withdraw),
      entry = entries[i];
    try {
      await api("uploads/withdraw", { id: entry.id });
      entry.state = "withdrawn";
    } catch (e) {
      error.textContent = e.message;
      return;
    }
    render();
    // The button is gone: keyboard and screen-reader users land on what
    // happened to the file.
    focusOn(results.querySelector(`[data-status="${i}"]`));
  });
}
