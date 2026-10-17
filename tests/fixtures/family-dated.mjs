// Test content for scripts/build-pages.mjs --fixture (tests/family-slots.test.mjs):
// a date for every promise but none of the content yet, two traditions, a
// children's age and a drive time, and Spanish invitation art made by the
// test. Made up for the test; the family's real content is in site/content.mjs.
import { fileURLToPath } from "node:url";

export const family = {
  promises: { dressCode: { by: "2026-12-01" }, hotels: { by: "2026-12-01" }, parking: { by: "2026-12-01" } },
  traditions: ["corona", "zapatos"],
  childAgeCutoff: 12,
  driveMinutes: 15,
};
export const assets = fileURLToPath(new URL("../../.cache/fixture-assets/", import.meta.url));
