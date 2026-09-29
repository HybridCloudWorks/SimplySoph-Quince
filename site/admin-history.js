import { api, esc, field, submit, notify } from "./client.js";
const names = {
  notifications: "Notifications",
  announcements: "Announcements",
  email: "Emails",
  sms: "SMS",
  whatsapp: "WhatsApp",
};
const instant = (row) => {
  const value = row.at ?? row.createdAt;
  return typeof value === "number" ? value : Date.parse(value || "") || 0;
};
export async function communicationHistory(root) {
  const kind =
    new URLSearchParams(location.search).get("kind") || "announcements";
  if (!Object.hasOwn(names, kind)) {
    root.innerHTML = '<p role="alert">Choose A Valid History Category.</p>';
    return;
  }
  const { rows } = await api("admin/records?kind=" + encodeURIComponent(kind));
  root.innerHTML = `<p><a href="${kind === "notifications" ? "/admin/notifications/" : "/admin/updates/?tab=" + kind}">← Back To ${names[kind]}</a></p><h2>${names[kind]} History</h2><div class="history-controls"><label>Search<input type="search" name="search" placeholder="Recipient, title, message or status"></label><label>Status<select name="state"><option value="">All Statuses</option>${[
    ...new Set(
      rows.map(
        (r) =>
          r.state ||
          (r.read === true
            ? "read"
            : r.published === true
              ? "published"
              : "unread"),
      ),
    ),
  ]
    .sort()
    .map((state) => `<option value="${esc(state)}">${esc(state)}</option>`)
    .join(
      "",
    )}</select></label><label>Sort By<select name="sort"><option value="newest">Newest First</option><option value="oldest">Oldest First</option><option value="name">Recipient / Title A–Z</option><option value="status">Status A–Z</option></select></label><label class="check"><input type="checkbox" name="archived">Include Archived</label></div>${["notifications", "announcements"].includes(kind) ? '<button class="button burgundy" type="button" data-create>Create Record</button>' : ""}<p data-count role="status"></p><div id="history-editor"></div><div class="table-wrap"><table><thead><tr><th>Date</th><th>Recipient / Title</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody></table></div>`;
  const status = (row) =>
    row.archived
      ? "Archived"
      : row.state ||
        (row.read === true
          ? "Read"
          : row.published === true
            ? "Published"
            : "Unread");
  const label = (row) =>
    row.to || row.title || row.subject || row.name || row.kind || "Record";
  function render() {
    const search = root.querySelector('[name="search"]').value.toLowerCase(),
      selected = root.querySelector('[name="state"]').value;
    let filtered = rows.filter(
      (row) =>
        (root.querySelector('[name="archived"]').checked || !row.archived) &&
        (!selected ||
          (row.state ||
            (row.read === true
              ? "read"
              : row.published === true
                ? "published"
                : "unread")) === selected) &&
        [label(row), row.subject, row.text, row.notes, status(row)]
          .join(" ")
          .toLowerCase()
          .includes(search),
    );
    const sort = root.querySelector('[name="sort"]').value;
    filtered.sort((a, b) =>
      sort === "oldest"
        ? instant(a) - instant(b)
        : sort === "name"
          ? label(a).localeCompare(label(b))
          : sort === "status"
            ? status(a).localeCompare(status(b))
            : instant(b) - instant(a),
    );
    root.querySelector("[data-count]").textContent =
      `${filtered.length} Record(s)`;
    root.querySelector("tbody").innerHTML =
      filtered
        .map(
          (row) =>
            `<tr><td>${instant(row) ? esc(new Date(instant(row)).toLocaleString()) : "—"}</td><td>${esc(label(row))}${row.subject ? `<small>${esc(row.subject)}</small>` : ""}</td><td><p class="history-snippet">${esc(row.text || row.notes || row.templateKey || "")}</p></td><td>${esc(status(row))}</td><td><div class="table-actions"><button type="button" class="plain-button" data-edit="${esc(row.id)}">${row.state && row.state !== "draft" ? "View / Notes" : "View / Edit"}</button><button type="button" class="plain-button" data-archive="${esc(row.id)}">${row.archived ? "Restore" : "Archive"}</button>${["email", "sms", "whatsapp"].includes(kind) && !row.archived ? `<a href="/admin/updates/?tab=${kind}&review=${encodeURIComponent(row.id)}">Review Message</a>` : ""}</div></td></tr>`,
        )
        .join("") || '<tr><td colspan="5">No Matching Records.</td></tr>';
    for (const button of root.querySelectorAll("[data-edit]"))
      button.onclick = () =>
        edit(rows.find((row) => row.id === button.dataset.edit));
    for (const button of root.querySelectorAll("[data-archive]"))
      button.onclick = async () => {
        button.disabled = true;
        const row = rows.find((row) => row.id === button.dataset.archive);
        try {
          await api("admin/records", {
            kind,
            id: row.id,
            version: row.version,
            action: row.archived ? "restore" : "archive",
          });
          await communicationHistory(root);
        } catch (error) {
          notify(error.message);
          button.disabled = false;
        }
      };
  }
  async function edit(row = {}) {
    const full = ["notifications", "announcements"].includes(kind),
      draft = ["email", "sms"].includes(kind) && row.state === "draft";
    const box = root.querySelector("#history-editor");
    box.innerHTML = `<form class="card"><h3>${row.id ? "Record Details" : "Create Record"}</h3>${full ? field("Title", "title", { value: row.title || "", required: true, max: 140 }) : draft ? field("Subject / Title", "subject", { value: row.subject || "", max: 140 }) : `<p>${esc(label(row))}</p><p>${esc(row.text || row.subject || row.templateKey || "")}</p><p>Delivery And Recipient Facts Cannot Be Edited.</p>`}${full || draft ? `<label>${kind === "email" ? "Replacement Message (Optional · Leave Blank To Keep Original)" : "Message"}<textarea name="text" maxlength="5000"${kind === "email" ? "" : " required"}>${esc(row.text || "")}</textarea></label>` : ""}${kind === "announcements" ? `${field("Spanish Title", "titleEs", { value: row.titleEs || "", max: 140 })}<label>Spanish Message<textarea name="textEs" maxlength="2000">${esc(row.textEs || "")}</textarea></label><label class="check"><input name="published" type="checkbox"${row.published ? " checked" : ""}>Published On Website</label>` : ""}${kind === "notifications" ? `<label class="check"><input name="read" type="checkbox"${row.read ? " checked" : ""}>Read</label>` : ""}${kind === "email" && row.id ? "<div data-original-email></div>" : ""}<label>Private Notes<textarea name="notes" maxlength="2000">${esc(row.notes || "")}</textarea></label><p role="alert" class="error"></p><div class="row-actions"><button type="submit" class="button burgundy">Save Record</button><button type="button" class="plain-button" data-cancel>Cancel</button></div></form>`;
    box.querySelector("[data-cancel]").onclick = () => {
      box.innerHTML = "";
    };
    submit(box.querySelector("form"), async (f) => {
      const values = Object.fromEntries(f);
      if (kind === "email" && !values.text?.trim()) delete values.text;
      if (kind === "announcements") values.published = f.has("published");
      if (kind === "notifications") values.read = f.has("read");
      await api("admin/records", {
        kind,
        id: row.id,
        version: row.version,
        action: row.id ? "update" : "create",
        values,
      });
      await communicationHistory(root);
      notify("Record Saved.");
    });
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    if (kind === "email" && row.id) {
      const previewBox = box.querySelector("[data-original-email]");
      try {
        const preview = await api(
          "admin/mail/preview?id=" + encodeURIComponent(row.id),
        );
        previewBox.innerHTML =
          '<h4>Original Email</h4><iframe class="preview-frame" title="Original Email Preview" sandbox=""></iframe>';
        previewBox.querySelector("iframe").srcdoc = preview.html;
      } catch (error) {
        previewBox.textContent = "Original Preview: " + error.message;
      }
    }
  }
  root.querySelector("[data-create]")?.addEventListener("click", () => edit());
  root.querySelector(".history-controls").addEventListener("input", render);
  render();
}
