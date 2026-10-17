// The guests' gallery (/gallery/), loaded by site/guest.js only on that
// page, so every other page (the home page above all) stays light
// (tests/home-weight.test.mjs).
import { eventContent, siteClock, terms } from "./experience.js";
import { api, esc, es, lang, tr, term, route } from "./client.js";
import { galleryOpen } from "./lifecycle.mjs";
import { date } from "./datetime.mjs";
// "Download all photos" (site/gallery-download.js), only once there is media.
const downloads = () => import("./gallery-download.js");

// The guests' gallery shows one clear state: a sign-in panel (photos and
// videos are for signed-in guests only), a friendly "nothing yet", or the
// approved media, with album cards and sections only for what exists.
export async function gallery() {
  const state = document.querySelector("[data-gallery-state]"),
    photos = document.querySelector("[data-gallery]"),
    videos = document.querySelector("[data-videos]"),
    cards = document.querySelector("[data-gallery-albums]");
  if (!state || !photos || !videos || !cards) return;
  // A panel with one or two actions: [href, label, primary?].
  const panel = (title, text, ...links) => {
    state.innerHTML = `<div class="notice gallery-panel"><h2>${esc(title)}</h2><p>${esc(text)}</p>${
      links.length
        ? `<p class="gallery-actions">${links.map(([href, label], i) => `<a class="button ${i ? "outline" : "burgundy"}" href="${esc(href)}">${esc(label)}</a>`).join(" ")}</p>`
        : ""
    }</div>`;
  };
  // Before the celebration (R-071), an empty gallery is about to open rather
  // than empty, and there is nothing to sign in for yet: one honest line and
  // the two things a guest can do now. Approved items (childhood photos, say)
  // are never hidden by it: it shows only when there are none.
  let before = false,
    ceremony = null;
  try {
    const clock = await siteClock();
    before = !galleryOpen(clock.now(), clock.m);
    ceremony = clock.m.ceremonyStart;
  } catch {
    // No timeline: the gallery as it is after the celebration.
  }
  const opensAfter = () =>
    panel(
      tr("Photos open after the celebration", "Las fotos estarán aquí después de la celebración"),
      ceremony
        ? tr(
            `Our guests’ photos and videos from ${date(ceremony, lang, { year: false })} appear here after the celebration, once we’ve reviewed them.`,
            `Las fotos y los videos de nuestros invitados del ${date(ceremony, lang, { year: false })} aparecerán aquí después de la celebración, cuando los hayamos revisado.`,
          )
        : tr(
            "Our guests’ photos and videos appear here after the celebration, once we’ve reviewed them.",
            "Las fotos y los videos de nuestros invitados aparecerán aquí después de la celebración, cuando los hayamos revisado.",
          ),
      [route("share"), term(terms.sharePhotos)],
      [route("guestbook"), term(terms.leaveNote)],
    );
  let items, pending;
  try {
    // Only a verified sign-in (or an administrator) may see media; anyone else
    // gets the sign-in panel without a refused request in the console.
    const session = await api("session");
    if (session.kind !== "admin" && !session.verified) {
      if (before && !(await api("gallery-status").catch(() => ({ hasMedia: true }))).hasMedia) {
        opensAfter();
        return;
      }
      panel(
        tr("Our guests’ photos and videos", "Las fotos y videos de nuestros invitados"),
        tr(
          "We share them privately with our guests. Sign in with the email where you received your invitation to see them and to add your own.",
          "Los compartimos en privado con nuestros invitados. Entra con el correo donde recibiste tu invitación para verlos y para agregar los tuyos.",
        ),
        [route("account") + "?return=gallery", tr("Sign in to see the gallery", "Entra para ver la galería")],
      );
      return;
    }
    ({ media: items, pending } = await api("gallery"));
  } catch (e) {
    panel(
      tr("The gallery isn’t available right now", "La galería no está disponible por ahora"),
      e.message,
    );
    return;
  }
  // The signed-in person's own files the family has not reviewed yet (R-081).
  const waiting = document.querySelector("[data-gallery-pending]");
  if (waiting && pending > 0) {
    waiting.textContent = tr(
      `You have ${pending} ${pending === 1 ? "file" : "files"} waiting for our review. ${pending === 1 ? "It appears" : "They appear"} here once we’ve looked.`,
      `Tienes ${pending} ${pending === 1 ? "archivo" : "archivos"} esperando nuestra revisión. ${pending === 1 ? "Aparecerá" : "Aparecerán"} aquí cuando lo${pending === 1 ? "" : "s"} hayamos visto.`,
    );
    waiting.hidden = false;
  }
  if (!items.length && before) {
    opensAfter();
    return;
  }
  if (!items.length) {
    panel(
      tr("Nothing here yet", "Todavía no hay nada aquí"),
      tr(
        "Photos and videos from the celebration appear here once we’ve reviewed them. Took some? Share them with us.",
        "Las fotos y videos de la celebración aparecen aquí cuando los revisamos. ¿Tomaste algunos? Compártelos con nosotros.",
      ),
      [route("share"), term(terms.sharePhotos)],
    );
    return;
  }
  state.hidden = true;
  document.querySelector("[data-gallery-share]")?.removeAttribute("hidden");
  // "Download all photos", above the albums (site/gallery-download.js, loaded
  // only here). Not awaited: the albums draw while it asks for the parts.
  // A failed load leaves the albums as they are.
  downloads().then(({ downloadAll }) => downloadAll(cards), () => {});
  const name = (id) => {
    const album = eventContent.albums.find((a) => a.id === id);
    return album ? (es ? album.es : album.en) : "";
  };
  const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // A card for each album with something in it (a real cover, never a
  // placeholder), and only when there is more than one to choose between.
  const albums = eventContent.albums
    .map((a) => ({ ...a, rows: items.filter((p) => p.album === a.id) }))
    .filter((a) => a.rows.length);
  if (albums.length > 1) {
    cards.innerHTML = `<div class="album-grid">${albums
      .map((a, i) => {
        const cover = a.rows.find((p) => p.kind === "photo")?.url || a.rows.find((p) => p.poster)?.poster,
          shots = a.rows.filter((p) => p.kind === "photo").length,
          clips = a.rows.length - shots;
        return `<button type="button" class="album-card album-${i % 3}" data-album="${esc(a.id)}" aria-pressed="false"><span class="album-art" aria-hidden="true">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ""}</span><span class="album-title">${esc(name(a.id))} <small>${esc(
          [
            shots && counted(shots, tr("photo", "foto"), tr("photos", "fotos")),
            clips && counted(clips, "video", "videos"),
          ]
            .filter(Boolean)
            .join(" · "),
        )}</small></span><span class="album-overlay" aria-hidden="true">${tr("Show this album", "Ver este álbum")}</span></button>`;
      })
      .join("")}</div>`;
    cards.hidden = false;
  }
  const alt = (p) => p.caption || tr("Photo from the celebration", "Foto de la celebración");
  const figure = (p) => {
    // No empty caption box under media that has none.
    const caption = p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : "",
      download = `<a class="target" href="${esc(p.url)}?download=1" download>${tr("Download", "Descargar")}</a>`;
    // A photo opens larger with a tap on it, or with its own button for the
    // keyboard and screen readers. Videos keep their own controls.
    return p.kind === "video"
      ? `<figure><video controls playsinline preload="${p.poster ? "none" : "metadata"}"${p.poster ? ` poster="${esc(p.poster)}"` : ""} src="${esc(p.url)}"></video>${caption}${download}</figure>`
      : `<figure><img loading="lazy" alt="${esc(alt(p))}" src="${esc(p.url)}" data-enlarge="${esc(p.id)}">${caption}<p class="media-actions"><button type="button" class="plain-button" data-enlarge="${esc(p.id)}" aria-haspopup="dialog" aria-label="${esc(tr(`View larger: ${alt(p)}`, `Ver más grande: ${alt(p)}`))}">${tr("View larger", "Ver más grande")}</button>${download}</p></figure>`;
  };
  // The larger view: a modal dialog (the page behind it is inert), named, with
  // the photo's description as its text alternative. Focus starts on Close,
  // stays inside while it is open (Tab and Shift+Tab go round), Escape or
  // Close shuts it, and focus goes back to what opened it.
  const viewer = document.createElement("dialog");
  viewer.className = "media-viewer";
  viewer.setAttribute("aria-labelledby", "media-viewer-title");
  viewer.innerHTML = `<div class="media-viewer-bar"><h2 id="media-viewer-title"></h2><button type="button" class="button outline" data-close>${tr("Close", "Cerrar")}</button></div><img alt=""><p class="media-actions"><a download>${tr("Download", "Descargar")}</a></p>`;
  document.body.append(viewer);
  let opener = null;
  const enlarge = (id, from) => {
    const p = items.find((x) => x.id === id);
    if (!p) return;
    opener = from;
    viewer.querySelector("#media-viewer-title").textContent = alt(p);
    const img = viewer.querySelector("img");
    img.src = p.url;
    img.alt = alt(p);
    viewer.querySelector("a[download]").href = p.url + "?download=1";
    viewer.showModal();
    viewer.querySelector("[data-close]").focus();
  };
  viewer.addEventListener("click", (e) => {
    // Close, or a tap on the dimmed page around the photo.
    if (e.target.closest("[data-close]") || e.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (e) => {
    if (e.key !== "Tab") return;
    const stops = [...viewer.querySelectorAll("button, a[href]")],
      i = stops.indexOf(document.activeElement);
    e.preventDefault();
    stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
  });
  viewer.addEventListener("close", () => {
    // A photo opened by a tap returns focus to its button.
    const back = opener?.matches("button") ? opener : opener?.closest("figure")?.querySelector("button[data-enlarge]");
    back?.focus();
    opener = null;
  });
  photos.addEventListener("click", (e) => {
    const from = e.target.closest("[data-enlarge]");
    if (from) enlarge(from.dataset.enlarge, from);
  });
  function render(album = "") {
    const rows = items.filter((p) => !album || p.album === album);
    for (const [kind, node] of [
      ["photo", photos],
      ["video", videos],
    ]) {
      const mine = rows.filter((p) => p.kind === kind);
      node.innerHTML = mine.map(figure).join("");
      // The videos section (and the photos one) only when it has something.
      node.closest("section").hidden = !mine.length;
    }
    const label = document.querySelector("[data-album-label]");
    if (label) label.textContent = album ? name(album) : albums.length > 1 ? tr("All albums", "Todos los álbumes") : "";
    for (const b of cards.querySelectorAll("[data-album]"))
      b.setAttribute("aria-pressed", String(b.dataset.album === album));
  }
  cards.addEventListener("click", (e) => {
    const b = e.target.closest("[data-album]");
    if (!b) return;
    render(b.getAttribute("aria-pressed") === "true" ? "" : b.dataset.album);
    [photos, videos]
      .map((node) => node.closest("section"))
      .find((section) => !section.hidden)
      ?.scrollIntoView({ block: "start" });
  });
  render();
}
