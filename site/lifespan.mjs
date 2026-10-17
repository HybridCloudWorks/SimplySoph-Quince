// How long the site and the photos stay, on the gallery and the thank-you page
// (R-171): "The site stays up through …" and "Download your photos by …", once
// the family sets site.lifespan in the event settings (server/site-settings.mjs
// checks it against the Privacy policy's review date). Until then nothing is
// shown: no date is ever made up here. Loaded only by those two pages
// (scripts/build-pages.mjs), never with the home page.
import { experienceReady } from "./experience.js";
import * as live from "./experience.js";
import { date } from "./datetime.mjs";

const es = document.documentElement.lang === "es",
  // The thank-you page speaks to the household (ustedes), the gallery to one
  // person (site/lexicon.mjs registers).
  household = document.body.dataset.route === "thank-you";
// A "YYYY-MM-DD" day; noon UTC is the same calendar day in Fort Worth.
const day = (d) => date(Date.parse(d + "T12:00:00Z"), es ? "es" : "en");
function lifespanLines({ siteUntil, photosUntil } = {}) {
  return [
    siteUntil &&
      (es ? `El sitio seguirá disponible hasta el ${day(siteUntil)}.` : `The site stays up through ${day(siteUntil)}.`),
    photosUntil &&
      (es
        ? `${household ? "Descarguen sus" : "Descarga tus"} fotos a más tardar el ${day(photosUntil)}.`
        : `Download your photos by ${day(photosUntil)}.`),
  ].filter(Boolean);
}
await experienceReady;
const lines = live.liveContent ? lifespanLines(live.eventContent.lifespan || {}) : [];
for (const el of document.querySelectorAll("[data-lifespan]")) {
  el.textContent = lines.join(" ");
  el.hidden = !lines.length;
}
