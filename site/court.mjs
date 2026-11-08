// The court of honor, drawn the same way by the build (scripts/build-pages.mjs,
// from preview or fixture content) and in the browser (site/experience.js,
// from the runtime event settings). The court is usually other people's
// children, so their names and portraits are never committed to this public
// repository (#108, tests/family-slots.test.mjs): the family enters them in
// Admin → Website & event, the server keeps them (server/site-settings.mjs
// `court`), and GET /api/site serves them to the page at runtime.
import { escapeHtml as esc } from "./celebration.mjs";

export const courtRoles = ["escort", "dama", "chambelan"];
export const COURT_MAX = 40;
// A portrait is an approved gallery photo the family picked for the court; it
// is served publicly by GET /api/court-photo/<id> only while a court entry
// names it (server/application.mjs).
export const courtPhotoUrl = (id) => `/api/court-photo/${id}`;

const roleNames = {
  escort: { en: "Chambelán de honor", es: "Chambelán de honor" },
  dama: { en: "Dama", es: "Dama" },
  chambelan: { en: "Chambelán", es: "Chambelán" },
};
const pick = (value, lang) =>
  typeof value === "string" ? value : value?.[lang] || value?.en || "";

// `photoSrc(person)` returns an already-safe URL, or "" for initials.
export function courtSection(court, lang, { photoSrc = () => "" } = {}) {
  if (!Array.isArray(court) || !court.length) return "";
  // Initials stand in for photos so pages can go live before portraits arrive.
  const monogram = (p) => {
    const src = photoSrc(p);
    return src
      ? `<img class="monogram" loading="lazy" src="${src}" alt="">`
      : `<span class="monogram" aria-hidden="true">${esc(p.name.trim()[0] || "")}</span>`;
  };
  // Names are the court page's only headings, so they follow its h1 directly.
  const person = (p) =>
    `<div class="person">${monogram(p)}<div><p class="person-role">${esc(pick(roleNames[p.role], lang) || pick(p.role, lang))}</p><h2>${esc(p.name)}</h2>${pick(p.line, lang) ? `<p>${esc(pick(p.line, lang))}</p>` : ""}</div></div>`;
  const escorts = court.filter((p) => p.role === "escort"),
    paired = new Map();
  for (const p of court.filter((p) => p.role !== "escort" && p.pair))
    paired.set(p.pair, [...(paired.get(p.pair) || []), p]);
  const single = court.filter((p) => p.role !== "escort" && !p.pair);
  return `${escorts.map((p) => `<div class="court-escort">${person(p)}</div>`).join("")}<div class="court-pairs">${[
    ...paired.values(),
  ]
    .map(
      (pair) =>
        `<div class="pair">${[...pair]
          .sort((a, b) => (a.role === "dama" ? -1 : b.role === "dama" ? 1 : 0))
          .map(person)
          .join(`<span class="amp" aria-hidden="true">&amp;</span>`)}</div>`,
    )
    .join("")}${single.map((p) => `<div class="pair">${person(p)}</div>`).join("")}</div>`;
}
