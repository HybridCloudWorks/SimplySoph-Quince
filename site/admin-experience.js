import { api, esc, field, submit, notify } from "./client.js";
// The approved pages with the idea-book example text, served only to signed-in
// administrators by /api/admin/preview. Guests keep seeing the current pages.
const previewPages = [
  ["sophia", "Meet Sophia", "Conoce a Sophia"],
  ["court", "Court of honor", "Corte de honor"],
  ["padrinos", "Padrinos", "Padrinos"],
  ["travel", "Travel & stay", "Viaje y hospedaje"],
  ["faq", "Good to know", "Lo que debes saber"],
  ["gallery", "The moments", "Los momentos"],
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
export async function websiteEditor(root) {
  const { site } = await api("admin/site");
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
    root.innerHTML = `${previewCard()}<p>Changes appear on the website and update its calendar downloads together. Use ISO times with an explicit offset, for example <code>2027-01-15T16:00:00-06:00</code> (Central Standard Time). Save before leaving this page.</p><form id="site-settings" class="settings-form"><fieldset><legend>Homepage</legend>${field("Signed name", "name", { value: site.name, required: true, max: 100 })}${bilingual("Message", "quote", site.quote)}${field("Countdown date/time", "countdownAt", { value: site.countdownAt, required: true })}</fieldset>${["ceremony", "reception"].map((k) => `<fieldset><legend>${k === "ceremony" ? "Ceremony" : "Dinner & reception venue"}</legend>${field("Venue name", k + ".name", { value: site[k].name, required: true, max: 200 })}${field("Full address", k + ".address", { value: site[k].address, required: true, max: 400 })}${times(k, site[k])}${bilingual("Guest notes", k + ".notes", site[k].notes)}</fieldset>`).join("")}<fieldset><legend>Dinner</legend>${times("dinner", site.dinner)}</fieldset><fieldset><legend>Gallery albums</legend><p>Album IDs stay unchanged so uploaded media keeps its album.</p>${site.albums.map((a, i) => `<div class="card">${field("Album ID", "albums." + i + ".id", { value: a.id, required: true, max: 40 })}${field("English name", "albums." + i + ".en", { value: a.en, required: true, max: 100 })}${field("Spanish name", "albums." + i + ".es", { value: a.es, required: true, max: 100 })}<button type="button" data-remove-album="${i}" class="plain-button">Remove empty album</button></div>`).join("")}<button type="button" id="add-album" class="plain-button">Add album</button></fieldset><fieldset><legend>Registries · public, no sign-in required</legend>${site.registries.map((r, i) => `<div class="card">${field("Store ID", "registries." + i + ".id", { value: r.id, required: true, max: 40 })}${field("Store name", "registries." + i + ".name", { value: r.name, required: true, max: 100 })}${bilingual("Description", "registries." + i + ".description", r.description)}${field("Registry HTTPS URL · blank hides the visit button", "registries." + i + ".url", { value: r.url, type: "url", max: 2000 })}<button type="button" data-remove-registry="${i}" class="plain-button">Remove registry</button></div>`).join("")}<button type="button" id="add-registry" class="plain-button">Add store</button></fieldset><p class="error" role="alert"></p><button class="button burgundy" type="submit">Save website & calendars</button></form>`;
    const capture = () => {
      for (const [key, value] of new FormData(root.querySelector("form"))) {
        const parts = key.split(".");
        let obj = site;
        for (const part of parts.slice(0, -1)) obj = obj[part];
        obj[parts.at(-1)] = value;
      }
    };
    root.querySelector("#add-album").onclick = () => {
      capture();
      site.albums.push({
        id: "album-" + (site.albums.length + 1),
        en: "New album",
        es: "Nuevo álbum",
      });
      render();
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
      render();
    };
    for (const b of root.querySelectorAll("[data-remove-album]"))
      b.onclick = () => {
        capture();
        site.albums.splice(Number(b.dataset.removeAlbum), 1);
        render();
      };
    for (const b of root.querySelectorAll("[data-remove-registry]"))
      b.onclick = () => {
        capture();
        site.registries.splice(Number(b.dataset.removeRegistry), 1);
        render();
      };
    submit(root.querySelector("form"), async () => {
      capture();
      await api("admin/site", site);
      await websiteEditor(root);
      notify(
        "Website settings saved. Calendar downloads now use these details.",
      );
    });
  }
  render();
}
export async function notificationInbox(root) {
  const { notifications } = await api("admin/notifications");
  root.innerHTML = `<p>New RSVPs, uploads and contact messages appear here for family review. RSVP alerts are shown here only; they are never emailed. Showing The Latest Five Active Notifications.</p><p><a href="/admin/history/?kind=notifications">View Full Notification History</a></p>${
    notifications
      .filter((n) => !n.archived)
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 5)
      .map(
        (n) =>
          `<article class="notification-row"><div class="notification-summary"><h3>${esc(n.title || { photo: "Photo awaiting review", video: "Video awaiting review", contact: "New contact message", guestbook: "Guestbook message awaiting review" }[n.kind] || n.kind)}</h3>${n.text ? `<p class="notification-text">${esc(n.text)}</p>` : ""}<small>${esc(new Date(n.at).toLocaleString())} · ${n.read ? "Read" : "Unread"} · ${n.emailState === "none" ? "In-app only" : "Email: " + esc(n.emailState || "pending / not configured")}</small></div><div class="row-actions"><a href="${n.kind === "rsvp" ? "/admin/guests/" : n.kind === "photo" || n.kind === "video" ? "/admin/photos/" : "/admin/guestbook/"}">${n.kind === "rsvp" ? "Open invitations" : "Open review queue"}</a>${!n.read ? `<button class="plain-button" data-read="${esc(n.id)}">Mark Read</button>` : ""}</div></article>`,
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
