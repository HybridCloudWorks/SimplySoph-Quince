// Where the celebration is in time, for a page that changes with it (the
// gallery before and after the ceremony). One small helper, so a shared
// runtime clock can take its place without touching the pages: it builds the
// lifecycle model (site/lifecycle.mjs) from the RSVP deadline in /api/config
// and the live event settings from /api/site (site/experience.js), and
// follows the server's clock when /api/config sends one (`now`), so a phone
// whose clock is off still sees the right state.
import { milestones, clockOffset } from "./lifecycle.mjs";
import { experienceReady, eventContent } from "./experience.js";

let pending = null;
export function siteClock() {
  return (pending ??= (async () => {
    await experienceReady;
    const before = Date.now();
    const res = await fetch("/api/config", { credentials: "same-origin", cache: "no-store" });
    const after = Date.now();
    if (!res.ok) throw new Error("config unavailable");
    const config = await res.json();
    const { offset } = config.now
      ? clockOffset({ before, after, server: config.now })
      : { offset: 0 };
    const m = milestones({ deadline: config.deadline, site: eventContent });
    return { m, now: () => Date.now() + offset };
  })().catch((e) => {
    pending = null;
    throw e;
  }));
}
