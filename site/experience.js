import {
  celebration,
  venueSection,
  albumCards,
  registryCards,
  calendarLink,
  localTime,
  timeRange,
  localDate,
  escapeHtml as esc,
} from "./celebration.mjs";
const lang = document.documentElement.lang === "es" ? "es" : "en";
export let eventContent = celebration;
export let liveContent = false;
export function calendars(c = eventContent, live = liveContent) {
  const names =
    lang === "es"
      ? ["Ceremonia", "Cena", "Recepción"]
      : ["Ceremony", "Dinner", "Reception"];
  return ["ceremony", "dinner", "reception"]
    .map(
      (kind, i) =>
        `<div><strong>${names[i]}</strong>${calendarLink(kind, c, lang, live)}</div>`,
    )
    .join("");
}
function countdown() {
  const node = document.querySelector("[data-countdown]");
  if (!node) return;
  let seconds = Math.max(
    0,
    Math.floor((Date.parse(node.dataset.start) - Date.now()) / 1000),
  );
  if (!Number.isFinite(seconds)) return;
  if (!seconds) {
    node.textContent =
      lang === "es" ? "¡Llegó el gran día!" : "The special day has arrived!";
    return;
  }
  const values = [
    Math.floor(seconds / 86400),
    Math.floor(seconds / 3600) % 24,
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ];
  const labels =
    lang === "es"
      ? ["días", "horas", "minutos", "segundos"]
      : ["days", "hours", "minutes", "seconds"];
  node.innerHTML = values
    .map(
      (v, i) =>
        `<span><strong>${String(v).padStart(2, "0")}</strong><small>${labels[i]}</small></span>`,
    )
    .join("");
}
countdown();
setInterval(countdown, 1000);
document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-copy-address]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copyAddress);
    button.textContent = lang === "es" ? "Dirección copiada" : "Address copied";
  } catch {
    button.textContent =
      lang === "es"
        ? "Selecciona y copia la dirección de arriba"
        : "Select and copy the address above";
  }
});
export const experienceReady = (async () => {
  try {
    const res = await fetch("/api/site", { credentials: "same-origin" });
    if (!res.ok) return;
    const { site } = await res.json();
    if (!site?.ceremony || !site?.albums) return;
    eventContent = { ...celebration, ...site };
    liveContent = true;
    const c = eventContent;
    const registries = document.querySelector("[data-public-registries]");
    if (registries && Array.isArray(c.registries))
      registries.innerHTML = registryCards(c.registries, lang);
    const quote = document.querySelector("[data-home-quote]");
    if (quote)
      quote.innerHTML = `<p>“${esc(c.quote[lang])}”</p><cite>— ${esc(c.name)}</cite>`;
    const node = document.querySelector("[data-countdown]");
    if (node) {
      node.dataset.start = c.countdownAt;
      countdown();
    }
    for (const el of document.querySelectorAll("[data-venue]"))
      el.innerHTML = venueSection(el.dataset.venue, c, lang, true);
    const albums = document.querySelector("[data-album-cards]");
    if (albums) albums.innerHTML = albumCards(c, lang);
    for (const el of document.querySelectorAll("[data-calendar-links]"))
      el.innerHTML = calendars();
    for (const el of document.querySelectorAll("[data-event-date]"))
      el.textContent = localDate(c.ceremony.start, lang);
    for (const el of document.querySelectorAll("[data-event-time]")) {
      const v = c[el.dataset.eventTime];
      el.textContent = timeRange(v, lang);
    }
  } catch {
    /* The checked-in event details remain available during service outages. */
  }
})();
