import { celebration } from "../site/celebration.mjs";
import { registryDefaults } from "./registry-settings.mjs";
import { error } from "./auth.mjs";
import { visibilityOf } from "../site/notes.mjs";
import { places } from "../site/promises.mjs";
import { retentionReview } from "../site/policies.mjs";
import { partyDay } from "../site/lifecycle.mjs";
import { event } from "../site/content.mjs";
import { date } from "../site/datetime.mjs";
import { smsProgram } from "../site/sms-program.mjs";
import { smsCompliantText, smsPreview } from "./sms.mjs";
// The saved settings, or the defaults until the family first saves them.
// site.guestbook.visibility (who can read approved notes for Sophia,
// site/notes.mjs) is kept apart in the ledger, s.guestbook, and changed only on
// Admin → Messages: switching it never saves the other defaults in place of
// the code's, and a Website & event save never overwrites it. Until it is set,
// notes are for signed-in guests.
export const siteSettings = (state) => {
  const site = structuredClone(
    state.site || { ...celebration, registries: registryDefaults },
  );
  // site.sms (the automatic SMS invitation, autoInviteSettings below) names
  // the administrator who reviewed it, so it is read on the SMS tab only and
  // never served with the public site (GET /api/site).
  delete site.sms;
  site.guestbook = { visibility: visibilityOf(state) };
  for (const kind of ["ceremony", "reception"])
    if (site[kind]?.notes) site[kind].notes = venueFacts(site[kind].notes);
  return site;
};
// The venue notes once ended with a promise to post parking details. The
// pages now say that promise from the family's content (site/promises.mjs,
// with a date once there is one), so notes saved before still carrying it
// lose it here rather than say it twice. Only those exact sentences go; the
// family's next save in Admin → Website & event stores the notes without them.
// (The reception's Spanish sentence was worded without "aquí" then.)
const retired = Object.fromEntries(
  ["en", "es"].map((lang) => [
    lang,
    [places.ceremony.today[lang], places.reception.today[lang], ...(lang === "es" ? ["Compartiremos los detalles de entrada, estacionamiento y accesibilidad."] : [])],
  ]),
);
const venueFacts = (notes) =>
  Object.fromEntries(
    Object.entries(notes).map(([lang, text]) => [
      lang,
      (retired[lang] || []).reduce(
        (t, sentence) =>
          typeof t === "string" && t.includes(sentence)
            ? t.replace(sentence, "").replace(/ {2,}/g, " ").trim()
            : t,
        text,
      ),
    ]),
  );
// Whether the device that saved an RSVP remembers that its household replied
// (R-160: site/now.mjs "misxv-replied", the home page's "You replied ✓" on a
// later visit). The owner's choice (docs/account-access.md): "remember", the
// default, or "off", where the pages neither keep nor read that note and
// delete one already kept. Settings saved before the choice existed, and an
// API that does not send it, mean "remember".
export const deviceReplyChoices = ["remember", "off"];
// The automatic SMS invitation (owner decision, November 3, 2026, amending
// decision 7 for this one case; docs/twilio-setup.md): once a reviewed
// setting is on, a household that texts SOPHIA is sent its private RSVP link
// right after the welcome text, without waiting for a batch. Off until the
// family reviews both texts and turns it on from Admin → Communications →
// SMS. The default texts follow the registered samples
// (docs/sms-campaign-registration.md) with the current deadline from
// site/content.mjs, so they never carry the samples' old date. The composer
// fills no household name, so none is promised here either. Like the
// samples, both avoid accented letters, so each stays GSM-7 (160-character
// segments) and two segments long once the link is in.
export const AUTO_INVITE_TEXT_MAX = 320;
export const autoInviteDefaults = () => ({
  enabled: false,
  text: `${smsProgram.name}: You're invited to Sophia's quinceanera on ${date(event.startsAt, "en")}! RSVP by ${date(event.deadline, "en", { weekday: false })}: {link} Reply STOP to opt out.`,
  textEs: `${smsProgram.name}: Confirma tu asistencia a los XV de Sophia hasta el ${date(event.deadline, "es", { weekday: false })}: {link} Responde STOP para cancelar.`,
  reviewedAt: null,
  reviewedBy: null,
});
// The saved setting, or the defaults (off) until the family first saves it.
export const autoInviteSettings = (state) => ({
  ...autoInviteDefaults(),
  ...(state.site?.sms?.autoInvite || {}),
});
// A stand-in for the sealed per-household link, as long as a real one, so
// the preview's segment count and the length check hold for the sent text.
export const AUTO_INVITE_SAMPLE_LINK =
  "https://misxv.simplysoph.com/rsvp/#" + "x".repeat(43);
// Both texts must carry {link}, the brand prefix and STOP, fit the SMS code's
// length rule once the link is filled in, and stay short enough to be one or
// two segments. The review stamp is the server's (the route sets it from the
// admin's session), never taken from the page.
export function validateAutoInvite(input) {
  const bad = (reason) => {
    throw error(422, "INVALID_SITE_SETTINGS", { reason });
  };
  if (!input || typeof input !== "object") bad("auto-invite");
  if (typeof input.enabled !== "boolean") bad("auto-invite-enabled");
  const text = (v, field) => {
    if (
      typeof v !== "string" ||
      !v.trim() ||
      v.length > AUTO_INVITE_TEXT_MAX ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(v)
    )
      bad(field + "-length");
    const t = v.trim();
    if (!t.includes("{link}")) bad(field + "-link");
    if (!smsCompliantText(t)) bad(field + "-brand-or-stop");
    try {
      smsPreview(t.replaceAll("{link}", AUTO_INVITE_SAMPLE_LINK));
    } catch {
      bad(field + "-length");
    }
    return t;
  };
  const next = {
    enabled: input.enabled,
    text: text(input.text, "text"),
    textEs: text(input.textEs, "textEs"),
    reviewedAt: null,
    reviewedBy: null,
  };
  if (input.reviewedAt != null) {
    if (!Number.isInteger(input.reviewedAt) || input.reviewedAt < 0) bad("auto-invite-reviewed");
    next.reviewedAt = input.reviewedAt;
  }
  if (input.reviewedBy != null) {
    if (typeof input.reviewedBy !== "string" || input.reviewedBy.length > 254 || /[\x00-\x1f\x7f]/.test(input.reviewedBy))
      bad("auto-invite-reviewed");
    next.reviewedBy = input.reviewedBy;
  }
  if (next.enabled && (!next.reviewedAt || !next.reviewedBy)) bad("auto-invite-reviewed");
  return next;
}
export function validateSettings(input) {
  // `reason` names the rule a field broke, when Admin can point to it.
  const bad = (reason) => {
    throw error(422, "INVALID_SITE_SETTINGS", reason ? { reason } : undefined);
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
  // Contact's named host (R-166): a line the family may write, in both
  // languages, such as who reads the messages. Names live only here, in the
  // saved settings, never in the public repository; empty (the default) leaves
  // the Contact page exactly as built. Both languages or neither.
  if (input.contact !== undefined) {
    const line = (v) => {
      if (typeof v !== "string" || v.length > 300 || /[\x00-\x1f\x7f]/.test(v)) bad();
      return v.trim();
    };
    const en = line(input.contact?.host?.en ?? ""),
      es = line(input.contact?.host?.es ?? "");
    if (!en !== !es) bad();
    next.contact = { host: { en, es } };
  }
  // How long the site and the photos stay (R-171), the family's decision:
  // "YYYY-MM-DD" days, each blank (null) until decided, and then nothing about
  // it is shown. The photos stay at least until the review date the Privacy
  // policy gives (site/policies.mjs retentionReview), never past the site, and
  // the site stays past the celebration.
  if (input.lifespan !== undefined) {
    const day = (v) => {
      if (v === null || v === undefined || v === "") return null;
      if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) bad();
      if (new Date(v + "T00:00:00Z").toISOString().slice(0, 10) !== v) bad();
      return v;
    };
    const siteUntil = day(input.lifespan?.siteUntil),
      photosUntil = day(input.lifespan?.photosUntil),
      partyOver = partyDay(next);
    if (photosUntil && photosUntil < retentionReview) bad("photos-before-review");
    if (siteUntil && siteUntil < partyOver) bad("site-before-party");
    if (siteUntil && photosUntil && siteUntil < photosUntil) bad("site-before-photos");
    next.lifespan = siteUntil || photosUntil ? { siteUntil, photosUntil } : null;
  }
  // `guestbook` is not taken from here (see siteSettings).
  // Who may download all approved photos and videos at once (the owner's
  // choice, docs/cleanup.md). Settings saved before it existed mean "guests".
  if (input.gallery !== undefined) {
    if (!galleryDownloadChoices.includes(input.gallery?.download)) bad();
    next.gallery = { download: input.gallery.download };
  }
  // This device's "you replied" note (deviceReplyChoices above).
  if (input.device !== undefined) {
    if (!deviceReplyChoices.includes(input.device?.reply)) bad();
    next.device = { reply: input.device.reply };
  }
  // The automatic SMS invitation (validateAutoInvite above). A whole-site
  // save that carries it keeps it; one that leaves it out keeps the stored
  // one (POST /api/admin/site); the SMS tab's own route changes it.
  if (input.sms !== undefined) {
    if (input.sms?.autoInvite === undefined) bad("auto-invite");
    next.sms = { autoInvite: validateAutoInvite(input.sms.autoInvite) };
  }
  return next;
}
// "guests": every signed-in guest who can see the gallery (the default);
// "admins": only the family's administrators.
export const galleryDownloadChoices = ["guests", "admins"];
export const galleryDownload = (site) => site?.gallery?.download || "guests";
