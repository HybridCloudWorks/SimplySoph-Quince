import { celebration } from "../site/celebration.mjs";
import { registryDefaults } from "./registry-settings.mjs";
import { error } from "./auth.mjs";
export const siteSettings = (state) =>
  structuredClone(
    state.site || { ...celebration, registries: registryDefaults },
  );
export function validateSettings(input) {
  const bad = () => {
    throw error(422, "INVALID_SITE_SETTINGS");
  };
  const text = (v, max) => {
    if (
      typeof v !== "string" ||
      v.length > max ||
      !v.trim() ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)
    )
      bad();
    return v.trim();
  };
  const bilingual = (v, max) => ({
    en: text(v?.en, max),
    es: text(v?.es, max),
  });
  const date = (v) => {
    if (
      typeof v !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(
        v,
      ) ||
      !Number.isFinite(Date.parse(v))
    )
      bad();
    const day = v.slice(0, 10);
    if (new Date(day + "T00:00:00Z").toISOString().slice(0, 10) !== day) bad();
    return v;
  };
  const times = (v) => {
    const start = date(v?.start),
      end = v?.end ? date(v.end) : null;
    if (
      end &&
      (Date.parse(end) <= Date.parse(start) ||
        Date.parse(end) - Date.parse(start) > 86400000)
    )
      bad();
    return { start, end };
  };
  if (!input || !Number.isInteger(input.version) || input.version < 0) bad();
  const next = {
    version: input.version,
    name: text(input.name, 100),
    quote: bilingual(input.quote, 1500),
    countdownAt: date(input.countdownAt),
  };
  for (const kind of ["ceremony", "reception"])
    next[kind] = {
      ...times(input[kind]),
      name: text(input[kind]?.name, 200),
      address: text(input[kind]?.address, 400),
      notes: bilingual(input[kind]?.notes, 2000),
      image: celebration[kind].image,
    };
  next.dinner = times(input.dinner);
  if (!next.dinner.end) bad();
  if (
    !Array.isArray(input.albums) ||
    !input.albums.length ||
    input.albums.length > 30
  )
    bad();
  next.albums = input.albums.map((a) => {
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(a?.id)) bad();
    return { id: a.id, ...bilingual(a, 100) };
  });
  if (new Set(next.albums.map((a) => a.id)).size !== next.albums.length) bad();
  if (!Array.isArray(input.registries) || input.registries.length > 20) bad();
  next.registries = input.registries.map((r) => {
    let url = "";
    if (r.url) {
      try {
        const u = new URL(r.url);
        if (
          u.protocol !== "https:" ||
          u.username ||
          u.password ||
          r.url.length > 2000
        )
          bad();
        url = u.href;
      } catch {
        bad();
      }
    }
    if (!/^[a-z][a-z0-9-]{0,39}$/.test(r.id)) bad();
    return {
      id: r.id,
      name: text(r.name, 100),
      description: bilingual(r.description, 500),
      url,
      logo: r.id === "target" ? "/assets/target.svg" : "",
    };
  });
  if (new Set(next.registries.map((r) => r.id)).size !== next.registries.length)
    bad();
  return next;
}
