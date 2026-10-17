import { planningEditor, documentWorkspace } from "./admin-planning.js";
import { whatsappComposer } from "./admin-whatsapp.js";
import { communicationHistory } from "./admin-history.js";
import { audienceComposer } from "./admin-audience.js";
import { smsComposer } from "./admin-sms.js";
import { batchToolbar, eventNames } from "./admin-batches.js";
import { startPulse, activityBanner } from "./admin-pulse.js";
import { websiteEditor, notificationInbox } from "./admin-experience.js";
import {
  api,
  esc,
  field,
  submit,
  notify,
  linkFragment,
  reloadOnNewLink,
} from "./client.js";
import {
  startMicrosoft,
  microsoftReturn,
  finishMicrosoft,
  ssoRow,
  googleButton,
} from "./sso.js";
import { contactTopics, contactTopicsEn } from "./celebration.mjs";
import { date, time } from "./datetime.mjs";
const root = document.querySelector("#admin-app"),
  view = root.dataset.view;
// Contact messages store the topic value the server checks; show the label
// the guest chose from.
const topicLabel = (topic) => contactTopicsEn[contactTopics.indexOf(topic)] || topic || "";
const mailStates = {
  draft: "Waiting for review",
  sending: "Sending",
  accepted: "Sent",
  failed: "Not sent",
  unknown: "Delivery unknown",
};
const button = (name, action, id) =>
  `<button class="button burgundy compact" data-action="${action}" data-id="${esc(id)}">${name}</button>`;
const formEnd = (label) =>
  `<p class="error" role="alert"></p><button type="submit" class="button burgundy">${label}</button></form>`;
const table = (head, rows) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((x) => `<th scope="col">${x}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
// Records carry numeric timestamps (createdAt, at); Date.parse(number) is NaN,
// which once left "Latest five" lists in insertion order (oldest first).
const stamp = (r) =>
  Number(r.at) || Number(r.createdAt) || Date.parse(r.at || r.createdAt) || 0;
const newestFirst = (a, b) => stamp(b) - stamp(a);
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
// When sign-in itself worked but the person has no administrator access (or it
// is not switched on yet), explain it in plain words instead of an error code.
// Most people who land here are guests looking for their invitation.
const noAccess = new Set([
  "ADMIN_NOT_ALLOWED",
  "ADMIN_NOT_ELIGIBLE",
  "MFA_SETUP_NOT_ALLOWED",
]);
function accessNote(method, e) {
  if (!noAccess.has(e.code)) return false;
  const how = {
      microsoft: "your Microsoft account",
      google: "your Google account",
      email: "the link we emailed you",
      account: "your guest account",
    }[method],
    pending = e.code === "MFA_SETUP_NOT_ALLOWED";
  root.innerHTML = `<section class="card access-note" role="alert"><h2>${pending ? "Your access isn’t turned on yet" : "This account isn’t an administrator"}</h2><p>You signed in with ${how}, and that part worked.</p><p>${pending ? "Your administrator access hasn’t been switched on yet. Please ask Saul or Diana to turn it on, then come back and sign in again within a day to finish setting up." : "The administrator pages are only for the few people helping to run Sophia’s celebration. If you’re expecting access, please contact Saul or Diana."}</p><p>Looking for your invitation? Your RSVP, the event details and photos are under <a href="/account/">My account</a>.</p><p><a href="/admin/login/">Try a different account</a></p></section>`;
  root.scrollIntoView({ block: "start" });
  return true;
}
async function attempt(method, fn) {
  try {
    await fn();
  } catch (e) {
    if (!accessNote(method, e)) notify(e.message);
  }
}
reloadOnNewLink(() => view === "admin/login");
async function login() {
  const session = await api("session");
  if (session.kind === "admin") {
    location.assign("/admin/");
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
      if (accessNote("microsoft", e)) return;
      // Say why on the page itself, next to "Start over".
      progress.className = "notice";
      progress.setAttribute("role", "alert");
      progress.textContent = e.message;
    }
    return;
  }
  const fragment = linkFragment();
  if (fragment) {
    history.replaceState(null, "", location.pathname);
    root.innerHTML =
      '<p>Confirm your email to continue to your authenticator code.</p><button id="verify-admin-email" class="button burgundy">Confirm email</button><div id="mfa"></div>';
    document.querySelector("#verify-admin-email").onclick = () =>
      attempt("email", async () => {
        showMfa(await api("auth/admin-email/verify", { token: fragment }));
        document.querySelector("#verify-admin-email").remove();
        root.querySelector("p").textContent =
          "Email confirmed. Enter your authenticator code.";
      });
    return;
  }
  const cfg = await api("config");
  root.innerHTML = `<form id="admin-email-login" class="card"><h2>Sign in by email</h2><p>Enter your approved email. Follow the one-time link, then enter your authenticator code.</p>${field("Email", "email", { type: "email", required: true, max: 254 })}<p id="admin-email-result" role="status"></p>${formEnd("Email my sign-in link")}${
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
      attempt("google", async () =>
        showMfa(await api("auth/google", { credential, ticket })),
      ),
    notify,
  );
}
// The last step of every admin sign-in. It is brought into view and focused:
// after Google or Microsoft it appears below the buttons and was easy to miss.
// First-time setup: a standard QR code that Google Authenticator and Microsoft
// Authenticator both scan, with the text key and a tap-to-add link as fallbacks
// for setting up on the same phone.
function enrollmentPanel(data) {
  const qr = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(
      data.provisioningQr || "",
    )
      ? `<img class="mfa-qr" src="${data.provisioningQr}" width="240" height="240" alt="QR code that adds SimplySoph to your authenticator app">`
      : "",
    link = /^otpauth:\/\/totp\//.test(data.provisioningUri || "")
      ? `<p><a class="button burgundy" href="${esc(data.provisioningUri)}">Add to my authenticator app</a></p>`
      : "";
  return `<div class="mfa-setup">${qr}<ol><li>Open <strong>Google Authenticator</strong> or <strong>Microsoft Authenticator</strong> on your phone.</li><li>Tap <strong>+</strong>. In Google, choose <strong>Scan a QR code</strong>; in Microsoft, choose <strong>Other account</strong>.</li><li>Scan this code, then type the 6-digit <strong>SimplySoph</strong> code below.</li></ol></div><details class="mfa-fallback"><summary>Can’t scan? Setting up on this phone?</summary>${link}<p>Or add the account manually: name <strong>SimplySoph</strong>, time-based, with this key:</p><code class="break">${esc(data.enrollmentSecret)}</code></details>`;
}
function showMfa(data) {
  const box = document.querySelector("#mfa");
  const heading = data.recovered
    ? "Recovery code accepted: set up your new authenticator"
    : data.enrollmentSecret
      ? "Set up your authenticator"
      : "Enter your authenticator code";
  // The site owner may type a recovery code instead (12 letters and numbers).
  const hint = data.enrollmentSecret
    ? ""
    : "<p>Open your authenticator app and enter the 6-digit SimplySoph code to finish signing in. Site owner without your phone? Enter one of your recovery codes instead.</p>";
  box.innerHTML = `<form id="mfa-form" class="card"><h2>${heading}</h2>${data.enrollmentSecret ? enrollmentPanel(data) : hint}${field(data.enrollmentSecret ? "Authenticator code" : "Authenticator or recovery code", "code", { required: true, max: 14, autocomplete: "one-time-code" })}${formEnd("Verify and sign in")}`;
  box.scrollIntoView({ behavior: "smooth", block: "center" });
  box.querySelector('[name="code"]').focus({ preventScroll: true });
  submit(document.querySelector("#mfa-form"), async (f) => {
    const result = await api("auth/mfa", { challenge: data.challenge, code: f.get("code").trim() });
    if (result.recovered) return showMfa(result);
    location.assign("/admin/");
  });
}
// Who can sign in. Notion decides: tick "Administrator Eligible" on a person's
// row (with their email) to make them an administrator, untick to remove them.
// Guests sign in with the email on their household's row. Nothing here grants
// access; the owner can only reset a lost authenticator.
async function accountAccess() {
  const data = await api("admin/accounts");
  const when = (t) => (t ? esc(new Date(t).toLocaleString()) : "—");
  root.innerHTML = `<section class="card"><h2>Administrators</h2><p>Administrators are managed in Notion. To add someone, tick <strong>Administrator Eligible</strong> on their row and make sure the row has their email. To remove them, untick it; they are signed out on their next click. Everyone sets up an authenticator app the first time they sign in.</p><div class="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Authenticator</th>${data.owner ? "<th></th>" : ""}</tr></thead><tbody>${data.administrators
    .map(
      (a) =>
        `<tr><td>${esc(a.name)}${a.owner ? " (outside Notion)" : ""}</td><td>${esc(a.email)}</td><td>${a.authenticator ? "Set up" : "Not yet"}</td>${data.owner ? `<td>${!a.owner && a.authenticator ? `<button type="button" class="button outline" data-reset="${esc(a.email)}">Reset authenticator</button>` : ""}</td>` : ""}</tr>`,
    )
    .join("")}</tbody></table></div>${data.flaggedWithoutEmail.length ? `<p class="notice">These rows are ticked but have no email, so they can't sign in: ${data.flaggedWithoutEmail.map(esc).join(", ")}.</p>` : ""}<div id="reset-panel"></div></section><section class="card"><h2>Guest sign-in</h2><p>Guests sign in with the email the family has for their household in Notion (or a comma-separated <strong>Additional Emails</strong> column). ${data.missingEmails ? `<strong>${data.missingEmails} of ${data.households}</strong> households have no email yet, so they can RSVP with their invitation link but can't sign in for photos and messages.` : "Every household has an email."}</p><div class="table-wrap"><table><thead><tr><th>Household</th><th>Email</th><th>First sign-in</th><th>Last sign-in</th></tr></thead><tbody>${
    data.guests
      .map(
        (g) =>
          `<tr><td>${esc(g.name)}</td><td>${esc(g.email)}</td><td>${when(g.verifiedAt)}</td><td>${when(g.lastSignInAt)}</td></tr>`,
      )
      .join("") || '<tr><td colspan="4">No guest has signed in yet.</td></tr>'
  }</tbody></table></div></section>`;
  for (const button of root.querySelectorAll("[data-reset]"))
    button.onclick = () => {
      const panel = root.querySelector("#reset-panel");
      panel.innerHTML = `<form id="reset-form" class="card"><h3>Reset ${esc(button.dataset.reset)}’s authenticator</h3><p>Use this if they lost their phone. Their current authenticator and admin sessions stop working, and they set up a new one with a QR code at their next sign-in.</p>${field("Your authenticator code", "code", { required: true, max: 6, autocomplete: "one-time-code" })}${formEnd("Reset authenticator")}</form>`;
      submit(panel.querySelector("#reset-form"), async (f) => {
        await api("admin/authenticator-reset", {
          email: button.dataset.reset,
          code: f.get("code").trim(),
        });
        notify(`Authenticator reset for ${button.dataset.reset}.`);
        await accountAccess();
      });
      panel.querySelector("input").focus();
    };
  if (data.owner) {
    const r = await api("admin/role-events");
    const changes = {
      "authenticator-set-up": "Authenticator set up",
      "authenticator-reset": "Authenticator reset",
      "authenticator-replaced": "Authenticator replaced",
      "recovery-codes-created": "Recovery codes created",
      "recovery-code-used": "Recovery code used",
    };
    root.insertAdjacentHTML(
      "beforeend",
      `<section class="card" id="recovery"><h2>Your recovery codes</h2><p>If you lose your phone, a recovery code lets you sign in once and set up a new authenticator. You have <strong>${data.recoveryCodesLeft}</strong> unused ${data.recoveryCodesLeft === 1 ? "code" : "codes"}. Creating a new set cancels the old one.</p><div id="recovery-panel"><button type="button" class="button outline" id="recovery-new">Create new recovery codes</button></div></section><section class="card"><h2>Authenticator history</h2>${r.events.length ? `<ul>${r.events.map((e) => `<li>${esc(new Date(e.at).toLocaleString())} · ${esc(changes[e.change] || e.change)} · ${esc(e.target)}</li>`).join("")}</ul>` : "<p>No changes recorded yet.</p>"}</section>`,
    );
    root.querySelector("#recovery-new").onclick = () => {
      const panel = root.querySelector("#recovery-panel");
      panel.innerHTML = `<form id="recovery-form">${field("Your authenticator code", "code", { required: true, max: 6, autocomplete: "one-time-code" })}${formEnd("Create recovery codes")}</form>`;
      submit(panel.querySelector("#recovery-form"), async (f) => {
        const { codes } = await api("admin/recovery-codes", { code: f.get("code").trim() });
        panel.innerHTML = `<p class="notice">Save these now: print them or keep them somewhere safe away from your phone. They won’t be shown again, and each works once.</p><ol class="recovery-codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ol>`;
      });
      panel.querySelector("input").focus();
    };
  }
}
async function dashboard() {
  const d = await api("admin/dashboard");
  root.innerHTML = `<div class="cards">${[
    ["Households", d.households],
    ["Active invitations", d.active],
    ["Responses", d.responded],
    ["Pending Notion sync", d.pendingSync],
    // Shown only when there is something to act on.
    ...(d.failedSync ? [["Notion refused", d.failedSync]] : []),
    ...(d.notionDrift ? [["Differs in Notion", d.notionDrift]] : []),
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
        `<tr><td>${esc(eventNames[e] || e)}</td><td>${c.adultsTeens}</td><td>${c.kids}</td><td>${c.adultsTeens + c.kids}</td></tr>`,
    ),
  )}<p>Counts use each household's answer: the latest one saved on the website, or Notion's for an answer taken by phone or a difference you chose to keep.</p><h2>Dietary, accessibility & song requests</h2>${d.requests.map((r) => `<p class="card">${esc(r.text)}</p>`).join("") || "<p>No requests recorded.</p>"}<h2>Email status</h2>${
    Object.entries(d.mail)
      .map(([s, n]) => `<p>${esc(mailStates[s] || s)}: ${n}</p>`)
      .join("") || "<p>No email drafted.</p>"
  }<div class="row-actions">${button("Retry pending Notion updates", "sync", "")}${button("Prepare RSVP columns in Notion", "schema", "")}</div>`;
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
    .join("")}</select></label></div><div id="batch-toolbar" class="row-actions"><span data-selected-count></span><button type="button" class="button outline" data-batch="issue">Create links</button><button type="button" class="button burgundy" data-batch="invitation">Email invitation</button><button type="button" class="button outline" data-batch="reminder">Email reminder</button></div><p class="hint">Emails are drafted for review first. Nothing sends until you check the recipients and sample and type the number to confirm.</p>${table(
    ['<input type="checkbox" data-select-all aria-label="Select all shown households">', "Household", "Status", "Invited capacity", "Email", "Response / sync", "Actions"],
    guests.map(
      (r) =>
        `<tr data-guest-row data-name="${esc(r.name)}" data-status="${esc(r.status)}"><td><input type="checkbox" data-select value="${esc(r.id)}" aria-label="Select ${esc(r.name)}"></td><td>${esc(r.name)}<br><span class="badge">${esc(r.role)}</span></td><td><span class="badge">${esc(statusLabels[r.status] || r.status)}</span>${r.respondedAt || r.openedAt ? `<br><small>${esc(when(r.respondedAt || r.openedAt))}</small>` : ""}</td><td>${r.capacity.adultsTeens ?? "?"} adults/teens · ${r.capacity.kids ?? "?"} ${r.capacity.kids === 1 ? "child" : "children"}${r.validCapacity ? "" : "<br>Needs review"}</td><td>${esc(r.email)}</td><td>${
          r.response
            ? Object.entries(r.response.attendance)
                .map(([e, v]) => `${esc(eventNames[e] || e)}: ${v.adultsTeens + v.kids}`)
                .join("<br>")
            : r.answeredIn === "notion"
              ? // An answer typed into Notion, say after a phone call.
                `Answered in Notion: ${esc(r.invitationStatus)}<br>` +
                Object.entries(r.notionCounts || {})
                  .map(([e, v]) => `${esc(eventNames[e] || e)}: ${(v.adultsTeens ?? 0) + (v.kids ?? 0)}`)
                  .join("<br>")
              : "No response"
        }<br>${esc(r.syncState)}${r.notionDiffers ? `<p class="notice">Notion differs: ${esc(r.notionDiffers)}.</p>${button("Keep Notion's version", "drift-notion", r.id)}${button("Write the website's answer", "drift-website", r.id)}` : ""}</td><td><a href="https://www.notion.so/${encodeURIComponent(r.id.replaceAll("-", ""))}" target="_blank" rel="noopener noreferrer">Edit household in Notion</a>${button("Review / create link", "invite-form", r.id)}${r.active ? button("Revoke link", "revoke", r.id) : ""}</td></tr>`,
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
  box.innerHTML = `<form id="invitation" class="card"><h2>${esc(r.name)}</h2><p>Creating a link replaces any previous link. Review the eligible events.</p>${Object.entries(eventNames).map(([e, name]) => `<label class="check"><input type="checkbox" name="${e}" ${r.invited?.[e] ? "checked" : ""}>${name}</label>`).join("")}<label>Language<select name="locale"><option value="en">English</option><option value="es"${r.locale === "es" ? " selected" : ""}>Español</option></select></label>${formEnd("Create private invitation link")}`;
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
  root.innerHTML = `<p>Assign whole households using their confirmed dinner attendance. Responses can change; over-capacity tables are flagged below.</p><div class="cards">${d.tables.map((t) => `<article class="card"><h2>${esc(t.name)}</h2><p${count(t) > t.capacity ? ' class="error"' : ""}>${count(t)} / ${t.capacity} seats</p><p>${t.households.map((id) => esc(d.households.find((h) => h.id === id)?.name || id)).join(", ")}</p>${button("Edit table", "edit-table", t.id)}${button("Delete table", "delete-table", t.id)}</article>`).join("")}</div><div id="table-editor"></div>`;
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
  // FLOW-12: delete a table after a confirmation; its households become unseated.
  root.querySelectorAll("[data-action=delete-table]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const t = d.tables.find((x) => x.id === b.dataset.id);
          if (!confirm(`Delete ${t.name}? Its households become unseated.`)) return;
          await api("admin/seating/delete", { id: t.id });
          await seating();
        })),
  );
}
// A guest video is converted by the scheduled media job before it can play;
// until then (or when it could not be) its card says so instead of a player.
const conversionProblems = {
  VIDEO_TOO_LONG: "it is longer than 60 seconds",
  INVALID_VIDEO: "the file could not be read as a video",
  PROCESSING_FAILED: "conversion failed 3 times; see the API logs",
};
function mediaPreview(r) {
  if (r.state === "processing")
    return `<p class="notice">Converting this video for the gallery. It is usually ready within 10 minutes; approve it once it plays here.</p>`;
  if (r.state === "failed")
    return `<p class="notice">This video could not be converted: ${esc(conversionProblems[r.problem] || r.problem || "unknown reason")}. The guest was told on the upload page if it was still open. Remove it from display, or ask them to send it again.</p>`;
  return r.kind === "video"
    ? `<video controls playsinline preload="${r.poster ? "none" : "metadata"}"${r.poster ? ` poster="/api/photo/${esc(r.id)}?poster=1"` : ""} src="/api/photo/${esc(r.id)}"></video>`
    : `<img src="/api/photo/${esc(r.id)}" alt="Pending photo">`;
}
// The printed table card (R-021): off until the family creates it. Its code
// is shown once, when it is made (the server keeps only a fingerprint), so the
// picture stays on this page until it is reloaded.
let madeCard = null;
const cardTime = (iso) => `${date(iso, "en", { year: false })} at ${time(iso, "en", { nbsp: true })}`;
const cardUrl = (svg) => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
async function partyCard(box) {
  const st = await api("admin/party-card");
  const counts = `<p>${st.files} ${st.files === 1 ? "file" : "files"} from ${st.phones} ${st.phones === 1 ? "phone" : "phones"} so far. Each phone can send up to ${st.perPhone}, and the card up to ${st.perCard} in all.</p>`;
  const windowLine = st.opensAt
    ? `<p>It works from ${esc(cardTime(st.opensAt))} through ${esc(date(Date.parse(st.closesAt) - 1, "en", { year: false }))} (Fort Worth time); before and after, the page offers the usual email sign-in.</p>`
    : "<p>The event times in Website settings can’t form a timeline, so the card can’t work until they are fixed.</p>";
  const picture =
    madeCard && st.state === "open"
      ? `<div class="party-card-preview"><img src="${cardUrl(madeCard.card)}" alt="The table card: a QR code with “Share your photos” and “Compartir fotos”"><p><a class="button burgundy" download="table-card.svg" href="${cardUrl(madeCard.card)}">Download the card to print</a></p><p class="hint">Save or print it now: for safety we keep only a fingerprint of its code, so this picture can’t be shown again. If it’s lost, make a new code (cards printed before stop working).</p></div>`
      : "";
  box.innerHTML =
    st.state === "open"
      ? `<p><strong>The table card is on.</strong> Anyone with it can send photos and videos without signing in. They wait here for your review, like every upload, and only signed-in guests see the ones you approve.</p>${windowLine}${counts}${picture}<div class="row-actions"><button type="button" class="button outline compact" data-party-action="rotate">Make a new code</button><button type="button" class="button outline compact" data-party-action="close">Turn off the table card</button></div>`
      : `<p><strong>The table card is off${st.state === "closed" && st.closedAt ? ` (since ${esc(cardTime(st.closedAt))})` : ""}.</strong> Turn it on to print a QR card for the tables: during the party anyone at the celebration, even guests who aren’t on our list, can send photos and videos from it without signing in. They wait here for your review, and only signed-in guests see the ones you approve.</p>${windowLine}${st.state === "closed" ? counts : ""}<div class="row-actions"><button type="button" class="button burgundy compact" data-party-action="create">${st.state === "closed" ? "Turn it on with a new code" : "Create the table card"}</button></div>`;
  box.onclick = (e) => {
    const action = e.target.closest("[data-party-action]")?.dataset.partyAction;
    if (!action) return;
    if (action === "rotate" && !confirm("Make a new code? Cards printed with the current code stop working at once.")) return;
    if (action === "close" && !confirm("Turn off the table card? Phones using it can’t send anything more.")) return;
    run(async () => {
      const result = await api("admin/party-card", { action });
      madeCard = result.card ? { card: result.card } : null;
      await partyCard(box);
      notify(
        action === "close"
          ? "The table card is off."
          : "The table card is on. Download the card below and print it.",
      );
    });
  };
}
async function moderation() {
  const d = await api("admin/moderation"),
    photos = view === "admin/photos",
    rows = photos ? d.photos : d.messages;
  // A file from the table card says so, with the name typed (if any) and the
  // reference the guest was shown, so a removal request can be matched.
  const source = (r) =>
    r.source === "party"
      ? `<p><span class="badge">From the table card</span>${r.uploaderName ? ` Name given: ${esc(r.uploaderName)}.` : ""} Reference ${esc(r.ref)}.</p>`
      : "";
  root.innerHTML = `<p>${photos ? "Photos and videos are visible only to signed-in guests after approval. Rejected items remain hidden." : "Contact messages always remain private. Guestbook messages require approval before publication."}</p><div class="cards">${rows.map((r) => `<article class="card">${photos ? `${mediaPreview(r)}${source(r)}<p>${esc(r.caption)}</p>` : `<h3>${esc(r.name)}</h3><p>${esc(topicLabel(r.topic))}</p><p>${esc(r.email || "")}</p><p>${esc(r.text)}</p><span class="badge">${esc(r.kind)}</span>`}<p>Status: ${esc(r.state)}</p>${photos ? `<label>Album<select data-media-album="${esc(r.id)}">${(d.albums || []).map((a) => `<option value="${esc(a.id)}"${a.id === (r.album || "event") ? " selected" : ""}>${esc(a.en)}</option>`).join("")}</select></label>` : ""}<div class="row-actions">${r.kind !== "contact" && !["processing", "failed"].includes(r.state) ? button("Approve", "approve", r.id) : ""}${button("Remove from display", "reject", r.id)}</div></article>`).join("") || "<p>No submissions yet.</p>"}</div>`;
  if (photos) {
    root.insertAdjacentHTML(
      "afterbegin",
      `<section class="card" aria-labelledby="party-card-title"><h2 id="party-card-title">Table card</h2><div data-party-card><p role="status">Loading…</p></div></section><details class="card table-qr"><summary>QR code for signed-in sharing</summary><div class="table-qr-content"><img src="/assets/photo-upload-qr.svg" width="160" height="160" alt="QR code to the photo upload page"><div><p>Scan to open the photo upload page directly. Guests sign in with the email the family has for their household before choosing files.</p><a class="button burgundy" href="/assets/photo-upload-qr.svg" download>Download printable QR</a></div></div></details>`,
    );
    await partyCard(root.querySelector("[data-party-card]")).catch((e) => {
      root.querySelector("[data-party-card]").innerHTML = `<p class="notice">${esc(e.message)}</p>`;
    });
  }
  if (!photos) {
    const cards = root.querySelectorAll(".cards > .card");
    rows.forEach((r, i) => {
      if (r.kind !== "contact") return;
      cards[i].insertAdjacentHTML(
        "beforeend",
        `${(r.replies || []).map((reply) => `<blockquote>${esc(reply.text)}</blockquote>`).join("")}<form class="reply-form"><label>Private reply<textarea name="text" required maxlength="2000"></textarea></label>${
          // FLOW-8: the admin sees the exact recipient before choosing to email.
          r.replyTo && d.mailConfigured
            ? `<label class="check"><input type="checkbox" name="notify"> Also email <strong>${esc(r.replyTo)}</strong> that the family replied. The email only says there is a reply and links to My account.</label>`
            : `<p class="hint">${d.mailConfigured ? "No email will be sent: this household has no verified email (their sign-in email or the Email in Notion)." : "No email will be sent: email isn’t set up."}</p>`
        }${formEnd("Reply in guest account")}`,
      );
      submit(cards[i].querySelector(".reply-form"), async (f) => {
        const notifying = f.get("notify") === "on";
        const result = await api("admin/message-reply", {
          id: r.id,
          text: f.get("text"),
          notify: notifying,
          ...(notifying ? { to: r.replyTo } : {}),
        });
        await moderation();
        notify(
          result.emailed
            ? `Reply saved, and ${result.to} was emailed that the family replied.`
            : notifying
              ? "Reply saved in the guest account, but the email didn’t go through. You can tell them another way."
              : "Reply saved in the guest account. No email sent.",
        );
      });
    });
  }
}
async function updates() {
  const choices = {
    announcements: "General announcements",
    whatsapp: "WhatsApp reminders",
    sms: "SMS reminders",
    email: "Communication emails",
  };
  const query = new URLSearchParams(location.search);
  const selected = Object.hasOwn(choices, query.get("tab"))
    ? query.get("tab")
    : "announcements";
  root.innerHTML = `<div class="communication-tabs" role="tablist" aria-label="Communication channels">${Object.entries(
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
    await smsComposer(panel);
    return;
  }
  const d = await api("admin/updates");
  if (selected === "announcements") {
    const announcements = (d.announcements || [])
      .filter((a) => !a.archived)
      .sort(newestFirst)
      .slice(0, 5);
    panel.innerHTML = `<form id="announcement" class="card"><h2>Publish a website announcement</h2>${field("English title", "title", { required: true, max: 140 })}<label>English message<textarea name="text" required maxlength="2000"></textarea></label>${field("Spanish title", "titleEs", { max: 140 })}<label>Spanish message<textarea name="textEs" maxlength="2000"></textarea></label>${formEnd("Publish on website")}<section class="recent-records"><h2>Latest five announcements</h2><a href="/admin/history/?kind=announcements">View full announcement history</a>${announcements.map((a) => `<article class="compact-record"><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p><small>${a.at ? esc(new Date(a.at).toLocaleString()) : ""} · ${a.published ? "Published" : "Unpublished"}</small></article>`).join("") || "<p>No announcements yet.</p>"}</section>`;
    submit(panel.querySelector("#announcement"), async (f) => {
      await api("admin/updates", Object.fromEntries(f));
      notify("Announcement published. No email sent.");
      await updates();
    });
    return;
  }
  panel.innerHTML = `${d.mailConfigured ? "" : '<p class="notice">Email sending is not configured. Drafts can be reviewed but cannot be sent yet.</p>'}<div id="email-groups"></div><section id="email-outbox" class="recent-records"><h2>Latest five emails</h2><a href="/admin/history/?kind=email">View full email history</a><p>Review each recipient before sending. Accepted means the provider accepted the request, not confirmed delivery.</p>${table(
    ["Recipient", "Subject", "State", "Review"],
    d.outbox
      .filter((m) => !m.archived)
      .sort(newestFirst)
      .slice(0, 5)
      .map(
        (m) =>
          `<tr><td>${esc(m.to)}</td><td>${esc(m.subject)}</td><td>${esc(m.state)}</td><td>${button("Review message", "mail-review", m.id)}</td></tr>`,
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
    notify("Email status: " + (mailStates[result.state] || result.state).toLowerCase() + ".");
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
      // One click used to revoke at once; name the household and ask first.
      // From data-name: the name cell's text also holds the role badge.
      const name = b.closest("tr")?.dataset.name || "this household";
      if (
        !confirm(
          `Revoke the invitation link for ${name}? Their current link will stop working. You can create a new one later.`,
        )
      )
        return;
      await api("admin/revoke", { id });
      await guestList();
    }
    // NOTION-8: the admin decides each difference between Notion and the site.
    if (action === "drift-notion") {
      await api("admin/drift", { id, keep: "notion" });
      notify("Kept Notion's version. This difference won't be reported again.");
      await guestList();
    }
    if (action === "drift-website") {
      if (!confirm("Write the website's answer to Notion? It replaces the RSVP and head counts on that Notion row.")) return;
      const r = await api("admin/drift", { id, keep: "website" });
      notify(
        r.syncState === "synced"
          ? "The website's answer was written to Notion."
          : "Notion didn't accept it yet; it will be retried automatically.",
      );
      await guestList();
    }
    if (action === "draft-invitation") {
      await api("admin/mail/draft", { id, type: "invitation" });
      notify("Draft saved. Review it on Communications before sending.", {
        href: "/admin/updates/?tab=email",
        label: "Open Communications",
      });
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
// Ends this administrator's sessions on every device (AUTHN-10).
document.querySelector("#logout-all").onclick = () =>
  run(async () => {
    await api("logout-all", {});
    location.assign("/admin/login/");
  });
try {
  if (view === "admin/login") await login();
  else {
    const session = await api("session");
    if (session.kind !== "admin") {
      root.innerHTML =
        '<p class="notice">Please sign in as an administrator to see this page.</p><a class="button burgundy" href="/admin/login/">Administrator sign-in</a>';
    } else {
      document.querySelector(".admin-shell aside").hidden = false;
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
  root.innerHTML = `<p role="alert" class="notice">${esc(e.message)}</p>${e.status === 401 || e.status === 403 ? '<a href="/admin/login/">Administrator sign-in</a>' : '<button type="button" class="button outline" id="retry-admin-page">Retry this page</button>'}`;
  root
    .querySelector("#retry-admin-page")
    ?.addEventListener("click", () => location.reload());
}
