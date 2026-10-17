import {
  celebration,
  venueSection,
  registryCards,
  scheduleStrip,
  scheduleList,
  escapeHtml as esc,
} from "./celebration.mjs";
import { date, capitalize } from "./datetime.mjs";
import { sample, setSite, siteSettled, state } from "./now.mjs";
import { announce, redraw } from "./client.js";
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
  sessionStatus,
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
// "Copy address" says what happened through the page's polite region
// (client.js announce) and on the button for a moment; the button's own label
// always comes back, at no narrower a width, so nothing moves.
document.addEventListener("click", async (e) => {
  const button = e.target.closest("[data-copy-address]");
  if (!button) return;
  const es = lang === "es",
    label = (button.dataset.label ??= button.textContent);
  let said, wait;
  try {
    await navigator.clipboard.writeText(button.dataset.copyAddress);
    [said, wait] = [es ? "Dirección copiada" : "Address copied", 2500];
  } catch {
    [said, wait] = [es ? "Selecciona y copia la dirección de arriba" : "Select and copy the address above", 8000];
  }
  clearTimeout(button.copied);
  button.style.minInlineSize = button.getBoundingClientRect().width + "px";
  button.textContent = said;
  announce(said);
  button.copied = setTimeout(() => {
    button.textContent = label;
    button.style.minInlineSize = "";
  }, wait);
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
    // Each part is redrawn only if the live settings change it, keeping the
    // focus of a guest who tabbed in before they arrived (client.js redraw).
    if (registries && Array.isArray(c.registries)) redraw(registries, registryCards(c.registries, lang));
    redraw(document.querySelector("[data-home-quote]"), `<p>“${esc(c.quote[lang])}”</p><cite>— ${esc(c.name)}</cite>`);
    // The parking line is the family's content, built into the page.
    // A parking promise ends with the party.
    const over = ["after", "archived"].includes(state()?.phase);
    for (const el of document.querySelectorAll("[data-venue]")) {
      const promise = "parkingPromise" in el.dataset;
      redraw(el, venueSection(el.dataset.venue, c, lang, true, promise && over ? "" : el.dataset.parking, promise));
    }
    for (const el of document.querySelectorAll("[data-schedule-strip]")) redraw(el, scheduleStrip(c, lang));
    for (const el of document.querySelectorAll("[data-schedule]")) redraw(el, scheduleList(c, lang, true));
    // "viernes 15 de enero de 2027" starts a line, so it takes a capital.
    const day = capitalize(date(c.ceremony.start, lang));
    for (const el of document.querySelectorAll("[data-event-date]")) el.textContent = day;
    // Contact's named host, from the event settings (never in this public
    // repo): nothing until the family writes it (server/site-settings.mjs).
    const host = document.querySelector("[data-contact-host]"),
      line = c.contact?.host?.[lang] || "";
    if (host) [host.textContent, host.hidden] = [line, !line];
    // The phase follows the live times (the home page redraws).
    setSite(c);
  } catch {
    /* The checked-in event details remain available during service outages. */
  } finally {
    siteSettled();
  }
})();
