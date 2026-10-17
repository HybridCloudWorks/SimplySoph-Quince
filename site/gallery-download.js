// "Download all photos" on the gallery (GET /api/gallery/archive, see
// server/gallery.mjs): the approved photos and videos as one ZIP file, or as
// a few numbered parts when there are many. Each is a plain link with the
// download attribute, so the phone's own downloader saves it (iOS Safari:
// Files; Android: Downloads) and it works without this script too.
//
// Before a part starts, the page checks the list again, so the reasons the
// server would refuse it (the photos changed, one part at a time, the hourly
// limit) are said here in words instead of as a failed download.
import { api, esc, es, tr, focusOn } from "./client.js";
import { terms, say } from "./lexicon.mjs";

const lang = es ? "es" : "en";
const number = new Intl.NumberFormat(es ? "es-MX" : "en-US", { maximumFractionDigits: 1 });
// Sizes as phones show them (1 MB = 1,000,000 bytes), always "about".
function size(bytes) {
  const mb = bytes / 1e6;
  const text =
    mb >= 1000
      ? number.format(Math.round(mb / 100) / 10) + " GB"
      : number.format(mb < 10 ? Math.max(0.1, Math.round(mb * 10) / 10) : Math.round(mb)) + " MB";
  return tr(`about ${text}`, `unos ${text}`);
}
const counted = (n, one, many) => `${number.format(n)} ${n === 1 ? one : many}`;
// "12 photos and 2 videos" · "12 fotos y 2 videos"
const what = ({ photos, videos }) =>
  [
    photos && counted(photos, tr("photo", "foto"), tr("photos", "fotos")),
    videos && counted(videos, "video", "videos"),
  ]
    .filter(Boolean)
    .join(tr(" and ", " y "));
const minutes = (ms) => Math.max(1, Math.ceil(ms / 60000));
const reasons = {
  ARCHIVE_CHANGED: () =>
    tr(
      "Photos were added or removed since this page opened, so the parts changed. The list below is up to date: download from it again.",
      "Se agregaron o quitaron fotos desde que abriste esta página, así que las partes cambiaron. La lista de abajo ya está actualizada: vuelve a descargar desde ahí.",
    ),
  ARCHIVE_BUSY: () =>
    tr(
      "A part is still downloading. When it finishes, download the next one.",
      "Todavía se está descargando una parte. Cuando termine, descarga la siguiente.",
    ),
  ARCHIVE_HOURLY_LIMIT: (limits) =>
    tr(
      `You’ve started ${limits.partsPerHour} downloads in the last hour, the most allowed. You can download more in about ${counted(minutes(limits.waitMs), "minute", "minutes")}.`,
      `Iniciaste ${limits.partsPerHour} descargas en la última hora, el máximo permitido. Podrás descargar más en unos ${counted(minutes(limits.waitMs), "minuto", "minutos")}.`,
    ),
  DOWNLOAD_RESTRICTED: () =>
    tr(
      "Downloading all the photos at once is turned off. You can still download each photo and video below.",
      "La descarga de todas las fotos a la vez está desactivada. Aún puedes descargar cada foto y video abajo.",
    ),
};

// Adds the section before `before` (the album cards) once the list is known;
// nothing at all when downloading everything is off or nothing can be saved.
export async function downloadAll(before) {
  let list;
  try {
    list = await api("gallery/archive");
  } catch {
    // The gallery itself already shows; this action simply stays away.
    return;
  }
  if (!list.totalCount || !before?.parentNode) return;
  const section = document.createElement("section");
  section.className = "download-all";
  section.setAttribute("aria-labelledby", "download-all-title");
  before.before(section);
  render(section, list);
  section.addEventListener("click", (e) => check(e, section));
}

function render(section, list, message = "") {
  const many = list.parts.length > 1;
  const links = list.parts
    .map((p) => {
      const file = many
        ? `sophia-xv-photos-part-${p.part}-of-${list.parts.length}.zip`
        : "sophia-xv-photos.zip";
      const text = many
        ? `${tr(`Part ${p.part} of ${list.parts.length}`, `Parte ${p.part} de ${list.parts.length}`)} · ${what(p)} · ${size(p.bytes)}`
        : tr(`Download all (${what(p)}, ${size(p.bytes)})`, `Descargar todo (${what(p)}, ${size(p.bytes)})`);
      return `<li><a class="button burgundy download-part" href="${esc(p.url)}" download="${esc(file)}" data-part="${p.part}" data-version="${esc(p.version)}">${esc(text)}</a></li>`;
    })
    .join("");
  section.innerHTML = `<h2 id="download-all-title">${esc(say(terms.downloadAll, lang))}</h2>${
    many
      ? `<p>${esc(
          tr(
            `${what({ photos: list.totalPhotos, videos: list.totalVideos })}, ${size(list.totalBytes)} in all, in ${list.parts.length} ZIP files.`,
            `${what({ photos: list.totalPhotos, videos: list.totalVideos })}, ${size(list.totalBytes)} en total, en ${list.parts.length} archivos ZIP.`,
          ),
        )}</p>`
      : ""
  }<ul class="download-parts">${links}</ul><p class="hint">${esc(
    many
      ? tr("Large files: on a phone, use Wi-Fi. Download one part at a time.", "Archivos grandes: en el teléfono, usa wifi. Descarga una parte a la vez.")
      : tr("Large files: on a phone, use Wi-Fi.", "Archivos grandes: en el teléfono, usa wifi."),
  )}</p><p class="error" role="alert">${esc(message)}</p>`;
}

// A part's link was chosen: check the list first, then let the browser
// download it (the same link, clicked again once the check passed).
async function check(e, section) {
  const link = e.target.closest("a[data-part]");
  if (!link) return;
  if (link.dataset.checked) {
    delete link.dataset.checked;
    return;
  }
  e.preventDefault();
  // A second press while the first is being checked would start the same
  // download twice (and the server allows one at a time).
  if (section.dataset.checking) return;
  const alert = section.querySelector("[role=alert]");
  alert.textContent = "";
  let list;
  section.dataset.checking = "1";
  try {
    list = await api("gallery/archive");
  } catch (error) {
    alert.textContent = reasons[error.code]?.() || error.message;
    if (error.code === "DOWNLOAD_RESTRICTED") section.querySelector(".download-parts")?.remove();
    return;
  } finally {
    delete section.dataset.checking;
  }
  const part = list.parts.find((p) => p.part === Number(link.dataset.part));
  const problem =
    part?.version !== link.dataset.version
      ? "ARCHIVE_CHANGED"
      : list.limits.busy
        ? "ARCHIVE_BUSY"
        : list.limits.remaining < 1
          ? "ARCHIVE_HOURLY_LIMIT"
          : null;
  if (problem) {
    if (problem === "ARCHIVE_CHANGED") {
      if (!list.totalCount) return section.remove();
      render(section, list);
    }
    const said = section.querySelector("[role=alert]");
    said.textContent = reasons[problem](list.limits);
    // The chosen link was replaced: keyboard and screen-reader users land
    // on the explanation, just above the new list.
    if (problem === "ARCHIVE_CHANGED") focusOn(said);
    return;
  }
  link.dataset.checked = "1";
  link.click();
}
