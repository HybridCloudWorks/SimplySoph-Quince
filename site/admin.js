import { planningEditor, documentWorkspace } from "./admin-planning.js";
import { audienceComposer } from "./admin-audience.js";
import { websiteEditor, notificationInbox } from "./admin-experience.js";
import { api, esc, field, submit, notify } from "./client.js";
const root = document.querySelector("#admin-app"),
  view = root.dataset.view;
const button = (name, action, id) =>
  `<button class="button burgundy compact" data-action="${action}" data-id="${esc(id)}">${name}</button>`;
const formEnd = (label) =>
  `<p class="error" role="alert"></p><button type="submit" class="button burgundy">${label}</button></form>`;
const table = (head, rows) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    notify(e.message);
  }
}
function download(name, text, type = "text/csv") {
  const a = document.createElement("a"),
    url = URL.createObjectURL(new Blob([text], { type }));
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = (s) =>
  '"' +
  String(s ?? "")
    .replace(/^[=+@\-\t\r]/, "'$&")
    .replaceAll('"', '""') +
  '"';
function parseCsv(text) {
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const keys = rows.shift()?.map((s) => s.trim());
  if (!keys || keys.join(",") !== "name,adultsTeens,kids,email,phone")
    throw new Error(
      "Use the exact CSV header: name,adultsTeens,kids,email,phone",
    );
  return rows.map((r) =>
    Object.fromEntries(keys.map((k, i) => [k, r[i] ?? ""])),
  );
}
async function login() {
  const session = await api("session");
  if (session.kind === "admin") {
    location.assign("/admin/");
    return;
  }
  if (session.verified && session.permissions.includes("admin")) {
    root.innerHTML =
      '<p>Verify your authenticator to enter family administration.</p><button id="step-up" class="button burgundy">Continue with verified email</button><div id="mfa"></div>';
    document.querySelector("#step-up").onclick = () =>
      run(async () => showMfa(await api("auth/step-up", {})));
    return;
  }
  const fragment = location.hash.slice(1);
  if (fragment) {
    history.replaceState(null, "", location.pathname);
    root.innerHTML =
      '<p>Verify Your Email To Continue To MFA.</p><button id="verify-admin-email" class="button burgundy">Verify Email</button><div id="mfa"></div>';
    document.querySelector("#verify-admin-email").onclick = () =>
      run(async () => {
        showMfa(await api("auth/admin-email/verify", { token: fragment }));
        document.querySelector("#verify-admin-email").remove();
      });
    return;
  }
  const cfg = await api("config");
  root.innerHTML = `<form id="admin-email-login" class="card"><h2>Sign In By Email</h2><p>Enter your approved email. Follow the one-time link, then enter your authenticator code.</p>${field("Email", "email", { type: "email", required: true, max: 254 })}<p id="admin-email-result" role="status"></p>${formEnd("Email My Sign-In Link")}${cfg.clientId ? '<p>Or use your authorized Google account, followed by your authenticator.</p><div id="google-signin"></div>' : ""}<div id="mfa"></div>`;
  submit(document.querySelector("#admin-email-login"), async (f) => {
    await api("auth/admin-email/request", { email: f.get("email") });
    document.querySelector("#admin-email-result").textContent =
      "If this email has administrator access, a sign-in link will arrive shortly. The link expires in 15 minutes.";
  });
  if (!cfg.clientId) return;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.onload = () => {
    google.accounts.id.initialize({
      client_id: cfg.clientId,
      callback: (result) =>
        run(async () => {
          const data = await api("auth/google", {
            credential: result.credential,
          });
          showMfa(data);
        }),
    });
    google.accounts.id.renderButton(document.querySelector("#google-signin"), {
      theme: "outline",
      size: "large",
    });
  };
  script.onerror = () => notify("Google sign-in could not load. Please retry.");
  document.head.append(script);
}
function showMfa(data) {
  document.querySelector("#mfa").innerHTML =
    `<form id="mfa-form">${data.enrollmentSecret ? `<p class="notice">Add a time-based SimplySoph account in your authenticator using this private setup key:</p><code class="break">${esc(data.enrollmentSecret)}</code>` : ""}${field("Authenticator code", "code", { required: true, max: 6 })}${formEnd("Verify and sign in")}`;
  submit(document.querySelector("#mfa-form"), async (f) => {
    await api("auth/mfa", { challenge: data.challenge, code: f.get("code") });
    location.assign("/admin/");
  });
}
async function accountAccess() {
  const data = await api("admin/accounts"),
    labels = {
      gifts: "Legacy private gift notes",
      padrinos: "Godparents / sponsors",
      costs: "Costs",
      admin: "Family administration (MFA required)",
    };
  root.innerHTML = `<p>Each household registers one verified contact account after its RSVP. Checked pages are available; unchecked pages are denied by the server. Only the site owner can grant or remove full administration. The registry is public and does not require page access.</p><div class="cards">${
    data.accounts
      .map(
        (a) =>
          `<form class="card access-form" data-id="${esc(a.id)}"><h2>${esc(a.name)}</h2><p>${esc(a.email)}</p><label class="check"><input type="checkbox" name="active" ${a.active ? "checked" : ""}${!data.owner && a.permissions.includes("admin") ? " disabled" : ""}>Account enabled</label><fieldset><legend>Page access</legend>${data.permissions
            .filter((p) => p !== "gifts")
            .map(
              (p) =>
                `<label class="check"><input type="checkbox" name="permission" value="${p}" ${a.permissions.includes(p) ? "checked" : ""}${p === "admin" && !data.owner ? " disabled" : ""}>${labels[p]}</label>`,
            )
            .join("")}</fieldset>${formEnd("Save access")}`,
      )
      .join("") || "<p>No verified guest accounts yet.</p>"
  }</div>`;
  for (const form of root.querySelectorAll(".access-form"))
    submit(form, async (f) => {
      const a = data.accounts.find((a) => a.id === form.dataset.id),
        permissions = f.getAll("permission");
      if (a.permissions.includes("gifts")) permissions.push("gifts");
      if (!data.owner && a.permissions.includes("admin"))
        permissions.push("admin");
      await api("admin/accounts", {
        id: a.id,
        version: a.version,
        active:
          !data.owner && a.permissions.includes("admin")
            ? a.active
            : f.has("active"),
        permissions,
      });
      await accountAccess();
      notify("Access saved. Changes apply to current sessions.");
    });
}
async function dashboard() {
  const d = await api("admin/dashboard");
  root.innerHTML = `<div class="cards">${[
    ["Households", d.households],
    ["Active invitations", d.active],
    ["Responses", d.responded],
    ["Pending Notion sync", d.pendingSync],
  ]
    .map(
      ([title, n]) =>
        `<article class="card"><p>${title}</p><p class="stat">${n}</p></article>`,
    )
    .join("")}</div>${table(
    ["Event", "Adults/teens", "Children", "Total"],
    Object.entries(d.counts).map(
      ([e, c]) =>
        `<tr><td>${esc(e)}</td><td>${c.adultsTeens}</td><td>${c.kids}</td><td>${c.adultsTeens + c.kids}</td></tr>`,
    ),
  )}<p>Counts use the latest saved response for each active invitation.</p><h2>Dietary, accessibility & song requests</h2>${d.requests.map((r) => `<p class="card">${esc(r.text)}</p>`).join("") || "<p>No requests recorded.</p>"}<h2>Email status</h2>${
    Object.entries(d.mail)
      .map(([s, n]) => `<p>${esc(s)}: ${n}</p>`)
      .join("") || "<p>No email drafted.</p>"
  }${button("Retry pending Notion updates", "sync", "")}${button("Prepare RSVP columns in Notion", "schema", "")}`;
}
let guests = [];
async function guestList() {
  const data = await api("admin/guests");
  guests = data.guests;
  root.innerHTML = `<p>Review household capacity and event eligibility before creating a private invitation. Blank Kids values need correction in Notion.</p><div class="row-actions">${button("Export CSV", "export", "")}${button("Import CSV", "import-form", "")}</div><div id="guest-editor"></div>${field("Filter guests", "filter")}${table(
    ["Household", "Invited capacity", "Email", "Response / sync", "Actions"],
    guests.map(
      (r) =>
        `<tr data-guest-row><td>${esc(r.name)}<br><span class="badge">${esc(r.role)}</span></td><td>${r.capacity.adultsTeens ?? "?"} adults/teens · ${r.capacity.kids ?? "?"} children${r.validCapacity ? "" : "<br>Needs review"}</td><td>${esc(r.email)}</td><td>${
          r.response
            ? Object.entries(r.response.attendance)
                .map(([e, v]) => `${e}: ${v.adultsTeens + v.kids}`)
                .join("<br>")
            : "No response"
        }<br>${esc(r.syncState)}</td><td><a href="https://www.notion.so/${encodeURIComponent(r.id.replaceAll("-", ""))}" target="_blank" rel="noopener noreferrer">Edit household in Notion</a>${button("Review / create link", "invite-form", r.id)}${r.active ? button("Revoke link", "revoke", r.id) : ""}</td></tr>`,
    ),
  )}`;
  root.querySelector("[name=filter]").oninput = (e) => {
    for (const row of root.querySelectorAll("[data-guest-row]"))
      row.hidden = !row.textContent
        .toLowerCase()
        .includes(e.target.value.toLowerCase());
  };
}
function invitationEditor(id) {
  const r = guests.find((r) => r.id === id),
    box = document.querySelector("#guest-editor");
  box.innerHTML = `<form id="invitation" class="card"><h2>${esc(r.name)}</h2><p>Creating a link replaces any previous link. Review the eligible events.</p>${["ceremony", "dinner", "dance"].map((e) => `<label class="check"><input type="checkbox" name="${e}" ${r.invited?.[e] ? "checked" : ""}>${e}</label>`).join("")}<label>Language<select name="locale"><option value="en">English</option><option value="es"${r.locale === "es" ? " selected" : ""}>Español</option></select></label>${formEnd("Create private invitation link")}`;
  submit(document.querySelector("#invitation"), async (f) => {
    const result = await api("admin/invitation", {
      id,
      invited: Object.fromEntries(
        ["ceremony", "dinner", "dance"].map((e) => [e, f.has(e)]),
      ),
      locale: f.get("locale"),
    });
    box.innerHTML = `<div class="notice success"><p>Save this private link and code securely. They are shown once and open this household’s first RSVP. Registered guests return using a verified email link.</p><textarea id="private-link" readonly>${esc(result.link)}</textarea><p>Invitation code: <code>${esc(result.code)}</code></p><p>No email has been sent.</p>${button("Draft invitation email", "draft-invitation", id)}</div>`;
  });
  box.scrollIntoView({ block: "nearest" });
}
function importForm() {
  const box = document.querySelector("#guest-editor");
  box.innerHTML = `<form id="csv-import" class="card"><h2>Import new households</h2><p>Header: name,adultsTeens,kids,email,phone. Maximum 50 rows. This creates new Notion rows; review for duplicates first.</p><label>CSV<input name="file" type="file" accept=".csv,text/csv" required></label><div id="import-preview"></div><label class="check"><input name="confirm" type="checkbox" required>I reviewed the rows and want to create these new invitations.</label>${formEnd("Create Notion records")}`;
  let rows = [];
  document.querySelector("#csv-import [name=file]").onchange = (e) =>
    run(async () => {
      rows = parseCsv(await e.target.files[0].text());
      document.querySelector("#import-preview").innerHTML = table(
        ["Name", "Adults/teens", "Kids", "Email"],
        rows.map(
          (r) =>
            `<tr><td>${esc(r.name)}</td><td>${esc(r.adultsTeens)}</td><td>${esc(r.kids)}</td><td>${esc(r.email)}</td></tr>`,
        ),
      );
    });
  submit(document.querySelector("#csv-import"), async () => {
    const r = await api("admin/import", { rows });
    box.innerHTML = `<p class="notice">Created ${r.created.length} rows. ${r.stopped ? esc(r.message) : "Refresh to review new households."}</p>`;
  });
}
async function seating() {
  const d = await api("admin/seating"),
    count = (t) =>
      t.households.reduce(
        (n, id) => n + (d.households.find((h) => h.id === id)?.count || 0),
        0,
      );
  root.innerHTML = `<p>Assign whole households using their confirmed dinner attendance. Responses can change; over-capacity tables are flagged below.</p><div class="cards">${d.tables.map((t) => `<article class="card"><h2>${esc(t.name)}</h2><p${count(t) > t.capacity ? ' class="error"' : ""}>${count(t)} / ${t.capacity} seats</p><p>${t.households.map((id) => esc(d.households.find((h) => h.id === id)?.name || id)).join(", ")}</p>${button("Edit table", "edit-table", t.id)}</article>`).join("")}</div><div id="table-editor"></div>`;
  function edit(t = {}) {
    const box = document.querySelector("#table-editor");
    box.innerHTML = `<form id="table-form" class="card"><h2>${t.id ? "Edit table" : "New table"}</h2>${field("Table name", "name", { value: t.name || "", required: true, max: 80 })}${field("Capacity", "capacity", { type: "number", value: t.capacity || 10, required: true })}<fieldset><legend>Households</legend>${d.households.map((h) => `<label class="check"><input name="household" type="checkbox" value="${esc(h.id)}"${t.households?.includes(h.id) ? " checked" : ""}>${esc(h.name)} · ${h.count} attending dinner</label>`).join("")}</fieldset>${formEnd("Save seating")}`;
    submit(document.querySelector("#table-form"), async (f) => {
      await api("admin/seating", {
        id: t.id,
        name: f.get("name"),
        capacity: Number(f.get("capacity")),
        households: f.getAll("household"),
      });
      await seating();
    });
  }
  edit();
  root
    .querySelectorAll("[data-action=edit-table]")
    .forEach(
      (b) =>
        (b.onclick = () => edit(d.tables.find((t) => t.id === b.dataset.id))),
    );
}
async function moderation() {
  const d = await api("admin/moderation"),
    photos = view === "admin/photos",
    rows = photos ? d.photos : d.messages;
  root.innerHTML = `<p>${photos ? "Photos and videos are visible only to registered guests after approval. Rejected items remain hidden." : "Contact messages always remain private. Guestbook messages require approval before publication."}</p><div class="cards">${rows.map((r) => `<article class="card">${photos ? `${r.kind === "video" ? `<video controls playsinline preload="metadata" src="/api/photo/${esc(r.id)}"></video>` : `<img src="/api/photo/${esc(r.id)}" alt="Pending photo">`}<p>${esc(r.caption)}</p>` : `<h3>${esc(r.name)}</h3><p>${esc(r.topic || "")}</p><p>${esc(r.email || "")}</p><p>${esc(r.text)}</p><span class="badge">${esc(r.kind)}</span>`}<p>Status: ${esc(r.state)}</p>${photos ? `<label>Album<select data-media-album="${esc(r.id)}">${(d.albums || []).map((a) => `<option value="${esc(a.id)}"${a.id === (r.album || "event") ? " selected" : ""}>${esc(a.en)}</option>`).join("")}</select></label>` : ""}<div class="row-actions">${r.kind !== "contact" ? button("Approve", "approve", r.id) : ""}${button("Remove from display", "reject", r.id)}</div></article>`).join("") || "<p>No submissions yet.</p>"}</div>`;
  if (!photos) {
    const cards = root.querySelectorAll(".cards > .card");
    rows.forEach((r, i) => {
      if (r.kind !== "contact") return;
      cards[i].insertAdjacentHTML(
        "beforeend",
        `${(r.replies || []).map((reply) => `<blockquote>${esc(reply.text)}</blockquote>`).join("")}<form class="reply-form"><label>Private reply<textarea name="text" required maxlength="2000"></textarea></label>${formEnd("Reply in guest account")}`,
      );
      submit(cards[i].querySelector(".reply-form"), async (f) => {
        await api("admin/message-reply", { id: r.id, text: f.get("text") });
        await moderation();
        notify("Reply saved in the guest account. No email sent.");
      });
    });
  }
}
async function updates() {
  const d = await api("admin/updates");
  root.innerHTML = `${d.mailConfigured ? "" : '<p class="notice">Email sending is not configured. Drafts can be reviewed, but cannot be sent yet.</p>'}<form id="announcement" class="card"><h2>Publish a website announcement</h2>${field("English title", "title", { required: true, max: 140 })}<label>English message<textarea name="text" required maxlength="2000"></textarea></label>${field("Spanish title", "titleEs", { max: 140 })}<label>Spanish message<textarea name="textEs" maxlength="2000"></textarea></label>${formEnd("Publish on website")}<h2>Announcements</h2>${d.announcements.map((a) => `<article class="card"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></article>`).join("")}<h2>Emails Outbox</h2><p>Review each recipient and message before sending. Accepted means Microsoft accepted the request, not confirmed delivery. Unknown results require checking Sent Items before any manual retry.</p>${table(
    ["Recipient", "Subject", "State", "Review"],
    d.outbox.map(
      (m) =>
        `<tr><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td>${esc(m.state)}</td><td>${button("Review message", "mail-review", m.id)}</td></tr>`,
    ),
  )}<div id="mail-review"></div>`;
  submit(document.querySelector("#announcement"), async (f) => {
    await api("admin/updates", Object.fromEntries(f));
    notify("Announcement published. No email sent.");
    await updates();
  });
  const groupComposer = document.createElement("section");
  root.querySelector("#announcement").after(groupComposer);
  await audienceComposer(groupComposer, updates);
  const households = (await api("admin/guests")).guests
    .filter((r) => r.active && r.email)
    .sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name),
    );
  const composer = document.createElement("div");
  composer.innerHTML = `<form id="compose-mail" class="card"><h2>Draft an event email</h2><label>Household<select name="id" required><option value="">Choose a recipient</option>${households.map((r) => `<option value="${esc(r.id)}">${esc(r.displayName || r.name)} · ${esc(r.email)}</option>`).join("")}</select></label><label>Message type<select name="type"><option value="reminder">RSVP reminder</option><option value="details">Event details</option><option value="change">Schedule or parking update</option><option value="thanks">After-event thank you</option></select></label>${field("Current private invitation link (required for reminders)", "link", { max: 1000 })}<label>Update message (required for schedule/parking changes)<textarea name="updateText" maxlength="2000"></textarea></label><p>Each draft is addressed to the selected household only. Review its language and contents below before sending.</p>${formEnd("Save email draft")}`;
  groupComposer.after(composer);
  submit(document.querySelector("#compose-mail"), async (f) => {
    await api("admin/mail/draft", Object.fromEntries(f));
    notify(
      "Email draft saved. Review the recipient and message in the outbox.",
    );
    await updates();
  });
}
async function mailReview(id) {
  const r = await api("admin/mail/preview?id=" + encodeURIComponent(id)),
    box = document.querySelector("#mail-review");
  box.innerHTML = `<div class="card"><h3>${esc(r.subject)}</h3><p>Recipient: <strong>${esc(r.to)}</strong></p><iframe class="preview-frame" title="Email preview" sandbox=""></iframe><form id="send-mail"><label class="check"><input type="checkbox" required>I approve sending this message to ${esc(r.to)}.</label>${formEnd("Send this email")}</div>`;
  box.querySelector("iframe").srcdoc = r.html;
  submit(document.querySelector("#send-mail"), async () => {
    const result = await api("admin/mail/send", { id, confirm: true });
    notify("Email status: " + result.state);
    await updates();
  });
  box.scrollIntoView({ block: "nearest" });
}
root.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const { action, id } = b.dataset;
  run(async () => {
    if (action === "invite-form") invitationEditor(id);
    if (action === "import-form") importForm();
    if (action === "export")
      download(
        "misxv-guests.csv",
        [
          ["name", "adultsTeens", "kids", "email", "phone"],
          ...guests.map((r) => [
            r.name,
            r.capacity.adultsTeens,
            r.capacity.kids,
            r.email,
            r.phone,
          ]),
        ]
          .map((r) => r.map(csvCell).join(","))
          .join("\r\n"),
      );
    if (action === "revoke") {
      await api("admin/revoke", { id });
      await guestList();
    }
    if (action === "draft-invitation") {
      await api("admin/mail/draft", {
        id,
        type: "invitation",
        link: document.querySelector("#private-link").value,
      });
      notify(
        "Draft saved. Review it in Announcements & Emails before sending.",
      );
    }
    if (action === "sync") {
      await api("admin/sync", {});
      await dashboard();
    }
    if (action === "schema") {
      await api("admin/schema", {});
      notify("Website RSVP columns are ready. Existing fields were preserved.");
    }
    if (action === "approve" || action === "reject") {
      await api("admin/moderation", {
        id,
        collection: view === "admin/photos" ? "photos" : "messages",
        state: action === "approve" ? "approved" : "rejected",
        album: root.querySelector(`[data-media-album="${id}"]`)?.value,
      });
      await moderation();
    }
    if (action === "mail-review") await mailReview(id);
  });
});
document.querySelector("#logout").onclick = () =>
  run(async () => {
    await api("logout", {});
    location.assign("/admin/login/");
  });
try {
  if (view === "admin/login") await login();
  else {
    const session = await api("session");
    if (session.kind !== "admin") {
      root.innerHTML =
        '<p class="notice">Sign in with an authorized family account and MFA to access this page.</p><a class="button burgundy" href="/admin/login/">Family sign-in</a>';
    } else {
      if (view === "admin/site") await websiteEditor(root);
      if (view === "admin/notifications") await notificationInbox(root);
      if (view === "admin") await dashboard();
      if (view === "admin/guests") await guestList();
      if (view === "admin/access") await accountAccess();
      if (view === "admin/content") await planningEditor(root);
      if (view === "admin/documents") await documentWorkspace(root);
      if (view === "admin/seating") await seating();
      if (["admin/photos", "admin/guestbook"].includes(view))
        await moderation();
      if (view === "admin/updates") await updates();
    }
  }
} catch (e) {
  root.innerHTML = `<p role="alert" class="notice">${esc(e.message)}</p><a href="/admin/login/">Family sign-in</a>`;
}
