import {
  celebration,
  venueSection,
  albumCards,
  registryCards,
  calendarLink,
  scheduleStrip,
  scheduleList,
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
// The home page's countdown counts what a guest can act on: the time left to
// reply until the RSVP deadline, then the time until the celebration. It reads
// as plain text under a visible label, changes once a minute (never seconds),
// and stops for good once the celebration is over. With reduced motion asked
// for, it is set once per visit and does not tick. The "Please reply by" line
// above it goes away at the deadline; the RSVP button stays, for the closed
// note and the household's saved answer.
const units = {
  en: [["day", "days"], ["hour", "hours"], ["minute", "minutes"]],
  es: [["día", "días"], ["hora", "horas"], ["minuto", "minutos"]],
};
let ticking = 0;
function countdown() {
  const node = document.querySelector("[data-countdown]");
  if (!node) return;
  clearTimeout(ticking);
  const now = Date.now(),
    deadline = Date.parse(node.dataset.deadline),
    start = Date.parse(node.dataset.start),
    end = Date.parse(node.dataset.end);
  const replyBy = document.querySelector("[data-reply-by]");
  if (replyBy) replyBy.hidden = now >= deadline;
  if (![deadline, start, end].every(Number.isFinite) || now >= Math.max(start, end)) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  if (now >= start) {
    node.innerHTML = `<p class="countdown-label">${lang === "es" ? "¡Hoy es el gran día!" : "Today is the day!"}</p>`;
  } else {
    const target = now < deadline ? deadline : start,
      minutes = Math.ceil((target - now) / 60000),
      values = [Math.floor(minutes / 1440), Math.floor(minutes / 60) % 24, minutes % 60];
    const label =
      now < deadline
        ? lang === "es" ? "Tiempo para confirmar" : "Left to reply"
        : lang === "es" ? "Falta para la celebración" : "Until the celebration";
    node.innerHTML = `<p class="countdown-label">${label}</p> <p class="countdown-values">${values
      .map((v, i) => `<span><strong>${v}</strong> ${units[lang][i][v === 1 ? 0 : 1]}</span>`)
      .join(" ")}</p>`;
  }
  // Next change at the top of the next minute.
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    ticking = setTimeout(countdown, 60000 - (now % 60000) + 50);
}
countdown();
document.addEventListener("visibilitychange", () => !document.hidden && countdown());
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
      node.dataset.end = c.reception.end || c.countdownAt;
      countdown();
    }
    for (const el of document.querySelectorAll("[data-venue]"))
      el.innerHTML = venueSection(el.dataset.venue, c, lang, true);
    for (const el of document.querySelectorAll("[data-schedule-strip]"))
      el.innerHTML = scheduleStrip(c, lang);
    for (const el of document.querySelectorAll("[data-schedule]"))
      el.innerHTML = scheduleList(c, lang, true);
    const albums = document.querySelector("[data-album-cards]");
    if (albums) albums.innerHTML = albumCards(c, lang);
    for (const el of document.querySelectorAll("[data-calendar-links]"))
      el.innerHTML = calendars();
    // "viernes, 15 de enero de 2027" starts a line, so it takes a capital.
    const day = localDate(c.ceremony.start, lang);
    for (const el of document.querySelectorAll("[data-event-date]"))
      el.textContent = day.charAt(0).toUpperCase() + day.slice(1);
  } catch {
    /* The checked-in event details remain available during service outages. */
  }
})();
