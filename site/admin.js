import { planningEditor, documentWorkspace } from "./admin-planning.js";
import { whatsappComposer } from "./admin-whatsapp.js";
import { communicationHistory } from "./admin-history.js";
import { audienceComposer } from "./admin-audience.js";
import { batchToolbar } from "./admin-batches.js";
import { startPulse, activityBanner } from "./admin-pulse.js";
import { websiteEditor, notificationInbox } from "./admin-experience.js";
import { api, esc, field, submit, notify } from "./client.js";
import {
  startMicrosoft,
  microsoftReturn,
  finishMicrosoft,
  ssoRow,
  googleButton,
} from "./sso.js";
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
  const microsoft = microsoftReturn();
  if (microsoft) {
    root.innerHTML =
      '<p id="sso-progress" role="status">Finishing Microsoft sign-in…</p><p><a href="/admin/login/">Start over</a></p><div id="mfa"></div>';
    const progress = root.querySelector("#sso-progress");
    try {
      const cfg = await api("config"),
        data = await api(
          "auth/microsoft",
          await finishMicrosoft(cfg.microsoftClientId, "admin", microsoft),
        );
      if (data.signedIn) return location.assign("/admin/");
      progress.textContent = "Microsoft confirmed your account.";
      showMfa(data);
    } catch (e) {
      // Say why on the page itself, next to "Start over".
      progress.className = "notice";
      progress.setAttribute("role", "alert");
      progress.textContent = e.message;
    }
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
        root.querySelector("p").textContent =
          "Email Verified. Enter Your Authenticator Code.";
      });
    return;
  }
  const cfg = await api("config");
  root.innerHTML = `<form id="admin-email-login" class="card"><h2>Sign In By Email</h2><p>Enter your approved email. Follow the one-time link, then enter your authenticator code.</p>${field("Email", "email", { type: "email", required: true, max: 254 })}<p id="admin-email-result" role="status"></p>${formEnd("Email My Sign-In Link")}${
    cfg.microsoftClientId || cfg.clientId
      ? `<section class="sso-choices"><h2>Or sign in with</h2>${ssoRow({
          microsoft: cfg.microsoftClientId && "Sign in with Microsoft",
          google: !!cfg.clientId,
          note: "Then enter your authenticator code. Google sign-in is for the site owner. After you sign in once with Microsoft and the code, Microsoft can skip the code when it confirms your two-step sign-in.",
        })}</section>`
      : ""
  }<div id="mfa"></div>`;
  submit(document.querySelector("#admin-email-login"), async (f) => {
    await api("auth/admin-email/request", { email: f.get("email") });
    document.querySelector("#admin-email-result").textContent =
      "If this email has administrator access, a sign-in link will arrive shortly. The link expires in 15 minutes.";
  });
  const microsoftStart = root.querySelector('[data-sso="microsoft"]');
  if (microsoftStart)
    microsoftStart.onclick = () =>
      run(() => startMicrosoft(cfg.microsoftClientId, "admin"));
  if (!cfg.clientId) return;
  googleButton(
    root.querySelector('[data-sso="google"]'),
    cfg.clientId,
    "admin",
    (credential, ticket) =>
      run(async () => showMfa(await api("auth/google", { credential, ticket }))),
    notify,
  );
}
// The last step of every admin sign-in. It is brought into view and focused:
// after Google or Microsoft it appears below the buttons and was easy to miss.
function showMfa(data) {
  const box = document.querySelector("#mfa");
  box.innerHTML = `<form id="mfa-form" class="card"><h2>Enter your authenticator code</h2><p>${data.enrollmentSecret ? "First time: add a time-based SimplySoph account in your authenticator app with this private setup key, then enter the 6-digit code it shows." : "Open your authenticator app and enter the 6-digit SimplySoph code to finish signing in."}</p>${data.enrollmentSecret ? `<code class="break">${esc(data.enrollmentSecret)}</code>` : ""}${field("Authenticator code", "code", { required: true, max: 6, autocomplete: "one-time-code" })}${formEnd("Verify and sign in")}`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  box.querySelector('[name="code"]').focus({ preventScroll: true });
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
  root.innerHTML = `<p>Each household registers one verified contact account after its RSVP. Checked pages are available; unchecked pages are denied by the server. Only the site owner can grant or remove full administration, and the household must first be marked Administrator Eligible in Notion. Eligibility alone does not grant access. Deleted accounts can be restored. The registry is public and does not require page access.</p><div class="cards">${
    data.accounts
      .map(
        (a) =>
          `<article class="card"><form class="access-form" data-id="${esc(a.id)}"><h2>${esc(a.name)}</h2><p>${esc(a.email)}</p><p>${a.deletedAt ? "Deleted - Access Revoked" : a.administratorEligible ? "Administrator Eligible In Notion" : "Not Eligible For Administration"}</p><label class="check"><input type="checkbox" name="active" ${a.active ? "checked" : ""}${a.deletedAt || (!data.owner && a.permissions.includes("admin")) ? " disabled" : ""}>Account enabled</label><fieldset><legend>Page access</legend>${data.permissions
            .filter((p) => p !== "gifts")
            .map(
              (p) =>
                `<label class="check"><input type="checkbox" name="permission" value="${p}" ${a.permissions.includes(p) ? "checked" : ""}${a.deletedAt || (p === "admin" && (!data.owner || (!a.administratorEligible && !a.permissions.includes("admin")))) ? " disabled" : ""}>${labels[p]}</label>`,
            )
            .join(
              "",
            )}</fieldset>${data.owner && !a.deletedAt && !a.permissions.includes("admin") && a.administratorEligible ? field("Your authenticator code (needed only when granting administration)", "code", { max: 6, autocomplete: "one-time-code" }) : ""}${a.deletedAt ? "</form>" : formEnd("Save Access")}${data.owner && !a.protectedOwner ? `<button type="button" data-account-action="${a.deletedAt ? "restore" : "delete"}" data-id="${esc(a.id)}">${a.deletedAt ? "Restore Account" : "Delete Account"}</button>` : ""}</article>`,
      )
      .join("") || "<p>No verified guest accounts yet.</p>"
  }</div>`;
  for (const button of root.querySelectorAll("[data-account-action]"))
    button.onclick = () =>
      run(async () => {
        const a = data.accounts.find((a) => a.id === button.dataset.id),
          action = button.dataset.accountAction;
        if (
          !confirm(
            action === "delete"
              ? "Delete this account? Access and sessions will be revoked. You can restore it later."
              : "Restore this account? Administration must be granted again separately.",
          )
        )
          return;
        await api("admin/accounts/" + action, { id: a.id, version: a.version });
        await accountAccess();
        notify(action === "delete" ? "Account Deleted" : "Account Restored");
      });
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
        ...(f.get("code") ? { code: f.get("code").trim() } : {}),
      });
      await accountAccess();
      notify(
        permissions.includes("admin") && !a.permissions.includes("admin")
          ? "Administration granted. Next, use Authenticator setup below to let them set up their authenticator within 24 hours."
          : "Access saved. Changes apply to current sessions.",
      );
    });
  if (data.owner) await authenticatorSetup();
}
// Owner tools: open a 24-hour authenticator-setup window for a delegate or a
// promoted guest (optionally resetting a lost authenticator), plus history.
async function authenticatorSetup() {
  const r = await api("admin/role-events");
  const section = document.createElement("section");
  section.className = "card";
  section.innerHTML = `<h2>Authenticator setup</h2><p>Family administrators other than the site owner can set up their authenticator only within 24 hours after you allow it here. Allow it, then tell them to sign in at /admin/login/ right away. Use reset if they lost their phone: their current authenticator and admin sessions stop working.</p><form id="mfa-setup">${field("Administrator email", "email", { type: "email", required: true })}<label class="check"><input type="checkbox" name="reset">Reset their existing authenticator first</label>${field("Your authenticator code", "code", { required: true, max: 6, autocomplete: "one-time-code" })}${formEnd("Allow setup for 24 hours")}</form>${r.pendingSetups.length ? `<h3>Open setup windows</h3><ul>${r.pendingSetups.map((p) => `<li>${esc(p.email)} until ${esc(new Date(p.until).toLocaleString())}</li>`).join("")}</ul>` : ""}<h3>Role and authenticator history</h3>${r.events.length ? `<ul>${r.events.map((e) => `<li>${esc(new Date(e.at).toLocaleString())} · ${esc(e.change)} · ${esc(e.target)}</li>`).join("")}</ul>` : "<p>No changes recorded yet.</p>"}`;
  root.append(section);
  submit(section.querySelector("#mfa-setup"), async (f) => {
    const result = await api("admin/mfa-setup", {
      email: f.get("email"),
      code: f.get("code").trim(),
      reset: f.has("reset"),
    });
    notify(`Setup allowed until ${new Date(result.allowedUntil).toLocaleString()}.`);
    await accountAccess();
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
    .join("")}</div><h2>Invitation status</h2><div class="cards">${Object.entries(
    d.statuses || {},
  )
    .map(
      ([k, n]) =>
        `<article class="card"><p>${esc(statusLabels[k] || k)}</p><p class="stat">${n}</p></article>`,
    )
    .join("")}</div><p><a href="/admin/guests/">Filter households by status</a></p>${table(
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
const statusLabels = {
  "not-issued": "No link yet",
  revoked: "Link revoked",
  issued: "Link created, not emailed",
  sent: "Invitation emailed",
  opened: "Opened, no answer",
  attending: "Attending",
  declined: "Declined",
};
const when = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
let guests = [];
async function guestList() {
  const data = await api("admin/guests");
  guests = data.guests;
  root.innerHTML = `<p>Review household capacity and event eligibility before creating a private invitation. Blank Kids values need correction in Notion.</p><div class="row-actions">${button("Export CSV", "export", "")}${button("Import CSV", "import-form", "")}</div><div id="guest-editor"></div><div id="batch-panel"></div><div id="guest-area"><div class="field-grid">${field("Filter guests", "filter")}<label>Status<select name="status"><option value="">All statuses</option>${Object.entries(
    statusLabels,
  )
    .map(
      ([k, v]) =>
        `<option value="${k}">${esc(v)} (${guests.filter((g) => g.status === k).length})</option>`,
    )
    .join("")}</select></label></div><div id="batch-toolbar" class="row-actions"><span data-selected-count></span><button type="button" class="button" data-batch="issue">Create links</button><button type="button" class="button burgundy" data-batch="invitation">Email invitation</button><button type="button" class="button" data-batch="reminder">Email reminder</button></div><p class="hint">Emails are drafted for review first. Nothing sends until you check the recipients and sample and type the number to confirm.</p>${table(
    ['<input type="checkbox" data-select-all aria-label="Select all shown households">', "Household", "Status", "Invited capacity", "Email", "Response / sync", "Actions"],
    guests.map(
      (r) =>
        `<tr data-guest-row data-status="${esc(r.status)}"><td><input type="checkbox" data-select value="${esc(r.id)}" aria-label="Select ${esc(r.name)}"></td><td>${esc(r.name)}<br><span class="badge">${esc(r.role)}</span></td><td><span class="badge">${esc(statusLabels[r.status] || r.status)}</span>${r.respondedAt || r.openedAt ? `<br><small>${esc(when(r.respondedAt || r.openedAt))}</small>` : ""}</td><td>${r.capacity.adultsTeens ?? "?"} adults/teens · ${r.capacity.kids ?? "?"} children${r.validCapacity ? "" : "<br>Needs review"}</td><td>${esc(r.email)}</td><td>${
          r.response
            ? Object.entries(r.response.attendance)
                .map(([e, v]) => `${e}: ${v.adultsTeens + v.kids}`)
                .join("<br>")
            : "No response"
        }<br>${esc(r.syncState)}</td><td><a href="https://www.notion.so/${encodeURIComponent(r.id.replaceAll("-", ""))}" target="_blank" rel="noopener noreferrer">Edit household in Notion</a>${button("Review / create link", "invite-form", r.id)}${r.active ? button("Revoke link", "revoke", r.id) : ""}</td></tr>`,
    ),
  )}</div><div id="recent-batches"></div>`;
  const text = root.querySelector("[name=filter]"),
    status = root.querySelector("[name=status]");
  text.oninput = status.onchange = () => {
    for (const row of root.querySelectorAll("[data-guest-row]"))
      row.hidden =
        !row.textContent.toLowerCase().includes(text.value.toLowerCase()) ||
        (status.value && row.dataset.status !== status.value);
  };
  batchToolbar(root.querySelector("#guest-area"), guests, guestList);
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
    box.innerHTML = `<div class="notice success"><p>This link and code are shown once and open this household’s RSVP; creating a new link revokes older ones. To email the invitation, use “Draft invitation email” — the email carries its own private link and quick-answer buttons, so you never need to copy this one. Keep the code only for a printed invitation.</p><textarea id="private-link" readonly>${esc(result.link)}</textarea><p>Invitation code: <code>${esc(result.code)}</code></p><p>No email has been sent.</p>${button("Draft invitation email", "draft-invitation", id)}</div>`;
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
  if (photos)
    root.insertAdjacentHTML(
      "afterbegin",
      `<details class="card table-qr"><summary>Media Uploads</summary><div class="table-qr-content"><img src="/assets/photo-upload-qr.svg" width="160" height="160" alt="QR code to Media Uploads"><div><p>Scan to open Media Uploads directly. Guests sign in with their invitation or registered email before choosing files.</p><a class="button burgundy" href="/assets/photo-upload-qr.svg" download>Download Printable QR</a></div></div></details>`,
    );
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
  const choices = {
    announcements: "General Announcements",
    whatsapp: "WhatsApp Reminders",
    sms: "SMS Reminders",
    email: "Communication Emails",
  };
  const query = new URLSearchParams(location.search);
  const selected = Object.hasOwn(choices, query.get("tab"))
    ? query.get("tab")
    : "announcements";
  root.innerHTML = `<div class="communication-tabs" role="tablist" aria-label="Communication Channels">${Object.entries(
    choices,
  )
    .map(
      ([key, label]) =>
        `<button type="button" role="tab" id="tab-${key}" aria-controls="communication-panel" aria-selected="${key === selected}" tabindex="${key === selected ? 0 : -1}" data-tab="${key}">${label}</button>`,
    )
    .join(
      "",
    )}</div><section id="communication-panel" role="tabpanel" aria-labelledby="tab-${selected}"><p role="status">Loading…</p></section>`;
  const panel = root.querySelector("#communication-panel");
  const choose = (key) => {
    const url = new URL(location.href);
    url.searchParams.set("tab", key);
    url.searchParams.delete("review");
    history.replaceState(null, "", url);
    run(updates);
  };
  for (const button of root.querySelectorAll("[data-tab]")) {
    button.onclick = () => choose(button.dataset.tab);
    button.onkeydown = (event) => {
      if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key))
        return;
      event.preventDefault();
      const keys = Object.keys(choices),
        index = keys.indexOf(selected);
      const key =
        event.key === "Home"
          ? keys[0]
          : event.key === "End"
            ? keys.at(-1)
            : keys[
                (index + (event.key === "ArrowRight" ? 1 : keys.length - 1)) %
                  keys.length
              ];
      choose(key);
    };
  }
  if (selected === "whatsapp") {
    await whatsappComposer(panel);
    return;
  }
  if (selected === "sms") {
    await audienceComposer(panel, updates, "sms");
    return;
  }
  const d = await api("admin/updates");
  if (selected === "announcements") {
    const announcements = (d.announcements || [])
      .filter((a) => !a.archived)
      .sort(
        (a, b) =>
          (Number(b.at) || Date.parse(b.createdAt) || 0) -
          (Number(a.at) || Date.parse(a.createdAt) || 0),
      )
      .slice(0, 5);
    panel.innerHTML = `<form id="announcement" class="card"><h2>Publish A Website Announcement</h2>${field("English Title", "title", { required: true, max: 140 })}<label>English Message<textarea name="text" required maxlength="2000"></textarea></label>${field("Spanish Title", "titleEs", { max: 140 })}<label>Spanish Message<textarea name="textEs" maxlength="2000"></textarea></label>${formEnd("Publish On Website")}<section class="recent-records"><h2>Latest Five Announcements</h2><a href="/admin/history/?kind=announcements">View Full Announcement History</a>${announcements.map((a) => `<article class="compact-record"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><small>${a.at ? esc(new Date(a.at).toLocaleString()) : ""} · ${a.published ? "Published" : "Unpublished"}</small></article>`).join("") || "<p>No Announcements Yet.</p>"}</section>`;
    submit(panel.querySelector("#announcement"), async (f) => {
      await api("admin/updates", Object.fromEntries(f));
      notify("Announcement Published. No Email Sent.");
      await updates();
    });
    return;
  }
  panel.innerHTML = `${d.mailConfigured ? "" : '<p class="notice">Email Sending Is Not Configured. Drafts Can Be Reviewed But Cannot Be Sent Yet.</p>'}<div id="email-groups"></div><section id="email-outbox" class="recent-records"><h2>Latest Five Emails</h2><a href="/admin/history/?kind=email">View Full Email History</a><p>Review Each Recipient Before Sending. Accepted Means The Provider Accepted The Request, Not Confirmed Delivery.</p>${table(
    ["Recipient", "Subject", "State", "Review"],
    d.outbox
      .filter((m) => !m.archived)
      .sort(
        (a, b) =>
          (Number(b.at) || Date.parse(b.createdAt) || 0) -
          (Number(a.at) || Date.parse(a.createdAt) || 0),
      )
      .slice(0, 5)
      .map(
        (m) =>
          `<tr><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td>${esc(m.state)}</td><td>${button("Review Message", "mail-review", m.id)}</td></tr>`,
      ),
  )}</section><div id="mail-review"></div>`;
  await audienceComposer(
    panel.querySelector("#email-groups"),
    updates,
    "email",
  );
  const households = (await api("admin/guests")).guests
    .filter((r) => r.active && r.email)
    .sort((a, b) =>
      (a.displayName || a.name).localeCompare(b.displayName || b.name),
    );
  const composer = document.createElement("div");
  composer.innerHTML = `<form id="compose-mail" class="card"><h2>Draft an event email</h2><label>Household<select name="id" required><option value="">Choose a recipient</option>${households.map((r) => `<option value="${esc(r.id)}">${esc(r.displayName || r.name)} · ${esc(r.email)}</option>`).join("")}</select></label><label>Message type<select name="type"><option value="reminder">RSVP reminder</option><option value="details">Event details</option><option value="change">Schedule or parking update</option><option value="thanks">After-event thank you</option></select></label><label>Update message (required for schedule/parking changes)<textarea name="updateText" maxlength="2000"></textarea></label><p>Each draft is addressed to the selected household only. Review its language and contents below before sending.</p>${formEnd("Save email draft")}`;
  panel.querySelector("#email-outbox").before(composer);
  submit(document.querySelector("#compose-mail"), async (f) => {
    await api("admin/mail/draft", Object.fromEntries(f));
    notify(
      "Email draft saved. Review the recipient and message in the outbox.",
    );
    await updates();
  });
  if (query.get("review")) await mailReview(query.get("review"));
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
      await api("admin/mail/draft", { id, type: "invitation" });
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
      if (view === "admin/history") await communicationHistory(root);
      // Keep the open tab current; never re-render over a form being edited.
      startPulse(async () => {
        // The guest list only gets a banner, so selections are never lost.
        if (view === "admin/guests") return activityBanner(root, guestList);
        if (!["admin", "admin/notifications"].includes(view)) return;
        // Never redraw over a field being typed in; try again next check.
        if (root.contains(document.activeElement) && document.activeElement.matches("input[type=text], input:not([type]), textarea, select"))
          return false;
        if (view === "admin") await dashboard();
        else await notificationInbox(root);
      });
    }
  }
} catch (e) {
  root.innerHTML = `<p role="alert" class="notice">${esc(e.message)}</p>${e.status === 401 || e.status === 403 ? '<a href="/admin/login/">Administrator Login</a>' : '<button type="button" class="button" id="retry-admin-page">Retry This Page</button>'}`;
  root
    .querySelector("#retry-admin-page")
    ?.addEventListener("click", () => location.reload());
}
