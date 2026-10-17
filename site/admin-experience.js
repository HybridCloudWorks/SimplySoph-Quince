import { api, esc, field, submit, notify, focusOn } from "./client.js";
import { stamp, date } from "./datetime.mjs";
import { partyDay } from "./lifecycle.mjs";
// The Privacy policy's review date (site/policies.mjs retentionReview): the
// photos may not go before it (tests/lifespan.test.mjs keeps them equal).
const reviewDay = "2027-02-01";
// The approved pages with the idea-book example text, served only to signed-in
// administrators by /api/admin/preview. Guests keep seeing the current pages.
const previewPages = [
  ["sophia", "Meet Sophia", "Conoce a Sophia"],
  ["court", "Court of honor", "Corte de honor"],
  ["padrinos", "Padrinos", "Padrinos"],
  ["travel", "Travel", "Hospedaje y transporte"],
  ["faq", "Questions", "Preguntas"],
  ["gallery", "Photos", "Fotos"],
  ["thank-you", "Thank you", "Gracias"],
];
const previewCard = () =>
  `<section class="card preview-links"><h2>Preview the approved pages</h2><p>These open the approved layouts filled with the example text from the idea book. Only administrators can open them. Guests keep seeing each page’s current text until the family sends the real details.</p>${["en", "es"]
    .map(
      (lang) =>
        `<p><strong>${lang === "en" ? "English" : "Español"}:</strong> ${previewPages
          .map(
            ([page, en, es]) =>
              `<a href="/api/admin/preview?page=${page}&amp;lang=${lang}" target="_blank" rel="noopener">${esc(lang === "en" ? en : es)}</a>`,
          )
          .join(" · ")}</p>`,
    )
    .join("")}</section>`;
// Who may download all approved photos and videos at once (the owner's
// choice; server/site-settings.mjs, docs/cleanup.md). Default: guests.
const downloadChoice = (site) =>
  `<fieldset><legend>Download all photos</legend><label>Who can download every approved photo and video at once<select name="gallery.download">${[
    ["guests", "Signed-in guests (default)"],
    ["admins", "Only administrators"],
  ]
    .map(([value, label]) => `<option value="${value}"${site.gallery.download === value ? " selected" : ""}>${label}</option>`)
    .join("")}</select></label><p class="hint">Either way, signed-in guests can still view and save photos one at a time.</p></fieldset>`;
// Contact's named host (server/site-settings.mjs): optional, both languages
// or neither; blank keeps the Contact page as it is.
const contactHost = (host) =>
  `<fieldset><legend>Contact page · who reads the messages</legend><p class="hint">Optional. Shown under the Contact page’s first line, for example “[your names], Sophia’s parents, read every message.” Write both languages, or leave both blank.</p>${["en", "es"].map((l) => `<label>${l === "en" ? "English" : "Español"}<textarea name="contact.host.${l}" maxlength="300">${esc(host[l])}</textarea></label>`).join("")}</fieldset>`;
// Spanish free text that differs from the site's wording decisions (a
// retired word, or tú and ustedes mixed: server/copy-check.mjs). A warning,
// never a refusal: the text is saved and shown as written, and the family
// decides whether to change it (docs/publishing.md).
// Page content, not a live region: after a save, focus moves to its heading
// and the saved note says how many there are (P5-A11Y-06).
export const copyWarnings = (warnings = []) =>
  warnings.length
    ? `<section class="notice copy-warnings" aria-labelledby="copy-warnings-title"><h2 id="copy-warnings-title" tabindex="-1">Check the Spanish wording</h2><p>These saved texts differ from the website’s wording decisions. They are shown to guests as written; change them here if you agree.</p><ul>${warnings.map((w) => `<li><strong>${esc(w.field)}:</strong> ${esc(w.note)}</li>`).join("")}</ul></section>`
    : "";
// How long the site and the photos stay (server/site-settings.mjs): blank
// until the family decides, and then the gallery and thank-you page say it.
// The rule is tied to both dates (aria-describedby) and checked on the form
// (min), and a date the server refuses is named and marked (P5-A11Y-07).
const dayText = (day) => date(Date.parse(day + "T12:00:00Z"), "en", { weekday: false });
const lifespanRules = (site) => ({
  "photos-before-review": ["lifespan.photosUntil", `Download your photos by: use ${dayText(reviewDay)} or later, the review date in the Privacy policy.`],
  "site-before-party": ["lifespan.siteUntil", `The site stays up through: use ${dayText(partyDay(site))} or later, after the celebration.`],
  "site-before-photos": ["lifespan.siteUntil", "The site stays up through: use the same day as “Download your photos by” or later."],
});
const lifespanFields = (site) => {
  const life = site.lifespan,
    rules = lifespanRules(site),
    attrs = (min, reason) => `min="${min}" aria-describedby="lifespan-rule" data-error="${esc(rules[reason][1].replace(/^[^:]+: u/, "U"))}"`;
  return `<fieldset><legend>Site and photo lifespan</legend><p class="hint" id="lifespan-rule">Optional. Leave blank until the family decides. Once set, the gallery and the thank-you page say “The site stays up through …” and “Download your photos by …”. The photos date can’t be before ${dayText(reviewDay)}, the review date in the Privacy policy, or after the site’s. The site’s date can’t be before ${dayText(partyDay(site))}.</p>${field("The site stays up through", "lifespan.siteUntil", { type: "date", value: life.siteUntil || "", max: 10, attrs: attrs(partyDay(site), "site-before-party") })}${field("Download your photos by", "lifespan.photosUntil", { type: "date", value: life.photosUntil || "", max: 10, attrs: attrs(reviewDay, "photos-before-review") })}</fieldset>`;
};
// Marks the field a refused save names: aria-invalid, its note tied to it.
function markRefused(form, name, words) {
  const input = form.elements[name];
  if (!input) return;
  input.setAttribute("aria-invalid", "true");
  const note = document.createElement("span");
  note.className = "field-error";
  note.id = input.id + "-error";
  note.setAttribute("aria-hidden", "true");
  note.textContent = words;
  document.getElementById(note.id)?.remove();
  input.closest("label").append(note);
  input.setAttribute("aria-describedby", [...new Set([...(input.getAttribute("aria-describedby") || "").split(" "), note.id])].filter(Boolean).join(" "));
  input.focus();
}
export async function websiteEditor(root) {
  const { site, warnings } = await api("admin/site");
  site.gallery ??= { download: "guests" };
  site.contact ??= { host: { en: "", es: "" } };
  site.lifespan ??= { siteUntil: "", photosUntil: "" };
  function render() {
    const bilingual = (label, key, value) =>
      `<label>${label} · English<textarea name="${key}.en" required maxlength="2000">${esc(value.en)}</textarea></label><label>${label} · Español<textarea name="${key}.es" required maxlength="2000">${esc(value.es)}</textarea></label>`;
    const times = (key, value) =>
      field("Start · date/time with UTC offset", key + ".start", {
        value: value.start,
        required: true,
      }) +
      field("End · leave blank until confirmed", key + ".end", {
        value: value.end || "",
      });
    root.innerHTML = `${copyWarnings(warnings)}${previewCard()}<p>Changes appear on the website and update its calendar downloads together. Use ISO times with an explicit offset, for example <code>2027-01-15T16:00:00-06:00</code> (Central Standard Time). Save before leaving this page.</p><form id="site-settings" class="settings-form"><fieldset><legend>Homepage</legend>${field("Signed name", "name", { value: site.name, required: true, max: 100 })}${bilingual("Message", "quote", site.quote)}${field("Countdown date/time", "countdownAt", { value: site.countdownAt, required: true })}</fieldset>${["ceremony", "reception"].map((k) => `<fieldset><legend>${k === "ceremony" ? "Ceremony" : "Dinner & reception venue"}</legend>${field("Venue name", k + ".name", { value: site[k].name, required: true, max: 200 })}${field("Full address", k + ".address", { value: site[k].address, required: true, max: 400 })}${times(k, site[k])}${bilingual("Guest notes", k + ".notes", site[k].notes)}</fieldset>`).join("")}<fieldset><legend>Dinner</legend>${times("dinner", site.dinner)}</fieldset><fieldset><legend>Gallery albums</legend><p>Album IDs stay unchanged so uploaded media keeps its album.</p>${site.albums.map((a, i) => `<div class="card">${field("Album ID", "albums." + i + ".id", { value: a.id, required: true, max: 40 })}${field("English name", "albums." + i + ".en", { value: a.en, required: true, max: 100 })}${field("Spanish name", "albums." + i + ".es", { value: a.es, required: true, max: 100 })}<button type="button" data-remove-album="${i}" class="plain-button">Remove empty album</button></div>`).join("")}<button type="button" id="add-album" class="plain-button">Add album</button></fieldset>${downloadChoice(site)}${contactHost(site.contact.host)}${lifespanFields(site)}<fieldset><legend>Registries · public, no sign-in required</legend>${site.registries.map((r, i) => `<div class="card">${field("Store ID", "registries." + i + ".id", { value: r.id, required: true, max: 40 })}${field("Store name", "registries." + i + ".name", { value: r.name, required: true, max: 100 })}${bilingual("Description", "registries." + i + ".description", r.description)}${field("Registry HTTPS URL · blank hides the visit button", "registries." + i + ".url", { value: r.url, type: "url", max: 2000 })}<button type="button" data-remove-registry="${i}" class="plain-button">Remove registry</button></div>`).join("")}<button type="button" id="add-registry" class="plain-button">Add store</button></fieldset><p class="error" role="alert"></p><button class="button burgundy" type="submit">Save website & calendars</button></form>`;
    const capture = () => {
      for (const [key, value] of new FormData(root.querySelector("form"))) {
        const parts = key.split(".");
        let obj = site;
        for (const part of parts.slice(0, -1)) obj = obj[part];
        obj[parts.at(-1)] = value;
      }
    };
    // The form is drawn again after each of these; focus goes to the new
    // card's first field, or back to the Add button (P5-A11Y-06).
    const again = (focus) => {
      render();
      focusOn(root.querySelector(focus));
    };
    root.querySelector("#add-album").onclick = () => {
      capture();
      site.albums.push({
        id: "album-" + (site.albums.length + 1),
        en: "New album",
        es: "Nuevo álbum",
      });
      again(`[name="albums.${site.albums.length - 1}.id"]`);
    };
    root.querySelector("#add-registry").onclick = () => {
      capture();
      site.registries.push({
        id: "store-" + (site.registries.length + 1),
        name: "New store",
        description: { en: "A wish for Sophia.", es: "Un deseo para Sophia." },
        url: "",
        logo: "",
      });
      again(`[name="registries.${site.registries.length - 1}.id"]`);
    };
    for (const b of root.querySelectorAll("[data-remove-album]"))
      b.onclick = () => {
        capture();
        site.albums.splice(Number(b.dataset.removeAlbum), 1);
        again("#add-album");
      };
    for (const b of root.querySelectorAll("[data-remove-registry]"))
      b.onclick = () => {
        capture();
        site.registries.splice(Number(b.dataset.removeRegistry), 1);
        again("#add-registry");
      };
    submit(root.querySelector("form"), async () => {
      capture();
      try {
        await api("admin/site", site);
      } catch (e) {
        const rule = lifespanRules(site)[e.details?.reason];
        if (rule) {
          markRefused(root.querySelector("form"), ...rule);
          e.message = rule[1];
        }
        throw e;
      }
      await websiteEditor(root);
      // Focus where the guest's attention belongs: the Spanish wording to
      // check, else the Save button again.
      const flagged = root.querySelectorAll(".copy-warnings li").length;
      focusOn(root.querySelector(flagged ? "#copy-warnings-title" : "#site-settings [type=submit]"));
      notify(
        "Website settings saved. Calendar downloads now use these details." +
          (flagged ? ` Check the Spanish wording: ${flagged} ${flagged === 1 ? "note" : "notes"} at the top.` : ""),
      );
    });
  }
  render();
}
// Where each kind of notification is acted on.
const noticeLinks = {
  rsvp: ["/admin/guests/", "Open invitations"],
  drift: ["/admin/guests/", "Open invitations"],
  sync: ["/admin/", "Open overview to retry"],
  security: ["/admin/access/", "Open guest access"],
  photo: ["/admin/photos/", "Open review queue"],
  video: ["/admin/photos/", "Open review queue"],
  contact: ["/admin/guestbook/", "Open review queue"],
  guestbook: ["/admin/guestbook/", "Open review queue"],
};
export async function notificationInbox(root) {
  const { notifications } = await api("admin/notifications");
  root.innerHTML = `<p>New RSVPs, uploads and contact messages appear here for family review. RSVP alerts are shown here only; they are never emailed. Showing the latest five active notifications.</p><p><a href="/admin/history/?kind=notifications">View full notification history</a></p>${
    notifications
      .filter((n) => !n.archived)
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 5)
      .map(
        (n) =>
          `<article class="notification-row"><div class="notification-summary"><h3>${esc(n.title || { photo: "Photo awaiting review", video: "Video awaiting review", contact: "New contact message", guestbook: "Guestbook message awaiting review" }[n.kind] || n.kind)}</h3>${n.text ? `<p class="notification-text">${esc(n.text)}</p>` : ""}<small>${esc(stamp(n.at))} · ${n.read ? "Read" : "Unread"} · ${n.emailState === "none" ? "In-app only" : "Email: " + esc(n.emailState || "pending / not configured")}</small></div><div class="row-actions"><a href="${(noticeLinks[n.kind] || noticeLinks.contact)[0]}">${(noticeLinks[n.kind] || noticeLinks.contact)[1]}</a>${!n.read ? `<button class="plain-button" data-read="${esc(n.id)}">Mark read</button>` : ""}</div></article>`,
      )
      .join("") || "<p>No notifications yet.</p>"
  }`;
  for (const b of root.querySelectorAll("[data-read]"))
    b.onclick = async () => {
      try {
        await api("admin/notifications", { id: b.dataset.read });
        await notificationInbox(root);
      } catch (e) {
        notify(e.message);
      }
    };
}
