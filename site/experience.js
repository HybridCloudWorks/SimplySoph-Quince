import {
  celebration,
  venueSection,
  registryCards,
  scheduleStrip,
  scheduleList,
  localDate,
  escapeHtml as esc,
} from "./celebration.mjs";
import { sample, setSite, siteSettled } from "./now.mjs";
// For site/guest.js (one import, one round trip fewer on every page).
export {
  ready as clockReady,
  serverConfig,
  rsvpOpenNow,
  rsvpDeadline,
  rememberReply,
  forgetReply,
  watch,
  state as lifecycleState,
  siteClock,
} from "./now.mjs";
export { terms, say, registerFor } from "./lexicon.mjs";
const lang = document.documentElement.lang === "es" ? "es" : "en";
export let eventContent = celebration;
export let liveContent = false;
// The home page follows the celebration's phase (site/home.mjs, loaded only
// there and after the page has drawn): the answered, closed, day-of, evening
// and after states. Its built HTML is the RSVP-open state, for anyone without
// JavaScript and for the first paint.
if (document.querySelector("[data-home]"))
  import("./home.mjs")
    .then((home) => home.startHome({ lang, content: () => eventContent }))
    .catch(() => {
      /* The built RSVP-open home page stays. */
    });
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
    const before = Date.now(),
      res = await fetch("/api/site", { credentials: "same-origin" }),
      after = Date.now();
    if (!res.ok) return;
    const { site, now } = await res.json();
    // The server's clock, for every date-aware part of the page (site/now.mjs).
    sample(before, after, now);
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
    for (const el of document.querySelectorAll("[data-venue]"))
      el.innerHTML = venueSection(el.dataset.venue, c, lang, true);
    for (const el of document.querySelectorAll("[data-schedule-strip]"))
      el.innerHTML = scheduleStrip(c, lang);
    for (const el of document.querySelectorAll("[data-schedule]"))
      el.innerHTML = scheduleList(c, lang, true);
    // "viernes, 15 de enero de 2027" starts a line, so it takes a capital.
    const day = localDate(c.ceremony.start, lang);
    for (const el of document.querySelectorAll("[data-event-date]"))
      el.textContent = day.charAt(0).toUpperCase() + day.slice(1);
    // The phase follows the live times (the home page redraws).
    setSite(c);
  } catch {
    /* The checked-in event details remain available during service outages. */
  } finally {
    siteSettled();
  }
})();
