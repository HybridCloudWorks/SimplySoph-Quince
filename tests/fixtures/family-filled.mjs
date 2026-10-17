// Test content for scripts/build-pages.mjs --fixture (tests/family-slots.test.mjs):
// the promised content itself (a dress code, parking and a hotel), with the
// dates still set, so the content must win. Made up for the test; the
// family's real content is in site/content.mjs.
export const family = {
  promises: { dressCode: { by: "2026-12-01" }, hotels: { by: "2026-12-01" }, parking: { by: "2026-12-01" } },
  dressCode: { en: "Fixture attire.", es: "Vestimenta de ensayo." },
  parking: { en: "Fixture parking.", es: "Estacionamiento de ensayo." },
  hotels: [
    {
      name: "Fixture Hotel",
      where: { en: "Fixture area", es: "Zona de ensayo" },
      notes: { en: "Fixture notes.", es: "Notas de ensayo." },
      url: "https://example.com/",
    },
  ],
};
