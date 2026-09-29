import { api, esc, field, submit, notify } from "./client.js";
const fields = {
  costs: [
    ["item", "Item"],
    ["category", "Category"],
    ["quantity", "Quantity"],
    ["unitPrice", "Unit Price", "number"],
    ["costOwner", "Cost Owner"],
    ["sponsor", "Sponsor"],
    ["vendor", "Vendor"],
    ["contact", "Contact"],
    ["email", "Email", "email"],
    ["phone", "Phone"],
    ["estimated", "Estimated Cost", "number"],
    ["finalCost", "Final Cost", "number"],
    ["deposit", "Deposit Paid", "number"],
    ["additionalPaid", "Additional Paid", "number"],
    ["dueDate", "Due Date", "date"],
    ["status", "Status"],
    ["notes", "Notes"],
  ],
  padrinos: [
    ["name", "Name"],
    ["email", "Email", "email"],
    ["phone", "Phone"],
    ["gift", "Gift / Contribution"],
    ["role", "Role"],
    ["pledged", "Pledged Value", "number"],
    ["received", "Received Value", "number"],
    ["contacted", "Contacted", "checkbox"],
    ["contactedAt", "Contacted Date", "date"],
    ["followUp", "Follow-Up Date", "date"],
    ["status", "Status"],
    ["notes", "Notes"],
  ],
};
const dollars = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n || 0,
  );
export async function planningEditor(root) {
  root.innerHTML =
    '<p>Track expenses and godparent arrangements here. Website saves update Notion. Pending syncs remain saved here and can be retried. Import adds new Notion records. Amounts are in USD. Document access is administrator-only.</p><div class="row-actions"><button class="button burgundy" data-kind="costs">Accounting</button><button class="button burgundy" data-kind="padrinos">Godparents</button></div><div id="planning-grid"></div>';
  const grid = root.querySelector("#planning-grid");
  async function draw(kind) {
    const data = await api("admin/planning?kind=" + kind),
      allRows = data.rows,
      rows = allRows.filter((row) => !row.deleted),
      deleted = allRows.filter((row) => row.deleted),
      columns = fields[kind].filter(
        ([key]) =>
          !["notes", ...(kind === "costs" ? ["additionalPaid"] : [])].includes(
            key,
          ),
      );
    const cents = (value) => Math.round((value || 0) * 100);
    const paid = (row) => cents(row.deposit) + cents(row.additionalPaid);
    const cell = (row, key, type) =>
      key === "deposit" && kind === "costs"
        ? `<span title="Initial Deposit: ${dollars(row.deposit)}; Additional Payments: ${dollars(row.additionalPaid)}">${dollars(paid(row) / 100)}</span>`
        : type === "number"
          ? row[key] == null
            ? "—"
            : dollars(row[key])
          : type === "checkbox"
            ? row[key]
              ? "Yes"
              : "No"
            : esc(row[key] || "—");
    const syncCell = (r) =>
      r.sync?.status === "synced"
        ? "Synced"
        : r.sync
          ? `<span>${r.sync.status === "syncing" ? "Syncing" : "Pending"}</span><button class="plain-button" data-sync="${r.id}">Retry Sync</button>`
          : "Imported";
    const totalCells = columns
      .map(
        ([key], index) =>
          `<td>${index === 0 ? "Totals" : key === "finalCost" ? (data.totals.finalCents == null ? "Pending" : dollars(data.totals.finalCents / 100)) : key === "deposit" ? dollars(data.totals.paidCents / 100) : ""}</td>`,
      )
      .join("");
    grid.innerHTML = `<h2>${kind === "costs" ? "Accounting" : "Godparents"}</h2>${kind === "costs" ? `<p>Deposit Paid includes the initial deposit and subsequent payments. Owed = Final Cost − Deposit Paid. Edit a record to see or change the payment breakdown. Negative owed amounts indicate a credit.</p>${data.totals.pendingFinals ? `<p>${data.totals.pendingFinals} record(s) still need a final cost. Final Cost and Owed totals remain pending until all final costs are entered.</p>` : ""}` : ""}
      <details><summary>Import From Notion</summary><p>Import new rows from the connected Notion database. Existing and deleted rows are preserved. Website edits update the linked Notion row.</p><form id="planning-import"><p class="error" role="alert"></p><button type="submit" class="button burgundy">Import New Rows</button></form></details>
      <div class="row-actions"><button id="new-record" class="button burgundy">Add ${kind === "costs" ? "Expense" : "Godparent"}</button></div>
      <div class="table-wrap"><table class="planning-table"><thead><tr>${columns.map(([, label]) => `<th>${label}</th>`).join("")}${kind === "costs" ? "<th>Owed</th>" : ""}<th>Notion Sync</th><th>Actions</th></tr></thead><tbody>${rows.map((r) => `<tr>${columns.map(([key, , type]) => `<td>${cell(r, key, type)}</td>`).join("")}${kind === "costs" ? `<td class="money">${r.finalCost == null ? "—" : dollars((cents(r.finalCost) - paid(r)) / 100)}</td>` : ""}<td>${syncCell(r)}</td><td><div class="table-actions"><button class="plain-button" data-edit="${r.id}">Edit</button><a target="_blank" rel="noopener" aria-label="Documents For ${esc(r.item || r.name)}" href="/admin/documents/?kind=${kind}&rowId=${r.id}">📄 Documents</a><button class="plain-button" data-state="${r.id}" data-deleted="true">Delete</button></div></td></tr>`).join("") || `<tr><td colspan="${columns.length + (kind === "costs" ? 3 : 2)}">No records yet. Add a record or import from Notion.</td></tr>`}</tbody>${kind === "costs" ? `<tfoot><tr>${totalCells}<td class="money">${data.totals.owedCents == null ? "Pending" : dollars(data.totals.owedCents / 100)}</td><td></td><td></td></tr></tfoot>` : ""}</table></div>
      <details><summary>Deleted Records (${deleted.length})</summary><p>Delete archives the linked Notion record and removes it from active totals. Restore returns the same record. Documents and payment history are kept.</p>${deleted.map((r) => `<article class="card"><h3>${esc(r.item || r.name)}</h3><p>${syncCell(r)}</p><button class="plain-button" data-state="${r.id}" data-deleted="false">Restore</button></article>`).join("") || "<p>No deleted records.</p>"}</details><div id="planning-edit"></div>`;
    grid.querySelectorAll("[data-state]").forEach((button) => {
      button.onclick = async () => {
        const row = allRows.find((r) => r.id === button.dataset.state);
        button.disabled = true;
        try {
          const saved = await api("admin/planning/state", {
            kind,
            id: row.id,
            version: row.version,
            deleted: button.dataset.deleted === "true",
          });
          await draw(kind);
          notify(
            saved.row.sync?.status === "synced"
              ? saved.row.deleted
                ? "Record Deleted And Archived In Notion. Restore Is Available."
                : "Record Restored And Synced To Notion."
              : "Change Saved. Notion Sync Pending; Use Retry Sync.",
          );
        } catch (e) {
          notify(e.message);
          button.disabled = false;
        }
      };
    });
    submit(grid.querySelector("#planning-import"), async (f) => {
      const result = await api("admin/planning/import", {
        kind,
        sourceId: data.sourceId,
      });
      await draw(kind);
      notify(
        `${result.added} Imported; ${result.skipped} Existing Rows Preserved.`,
      );
    });
    function edit(row = {}) {
      const panel = grid.querySelector("#planning-edit"),
        createId = crypto.randomUUID();
      panel.innerHTML = `<form class="card planning-editor"><h3 class="full">${row.id ? "Edit" : "Add"} ${kind === "costs" ? "Expense" : "Godparent"}</h3>${kind === "costs" ? '<p class="full">Enter the initial deposit and additional payments separately. The table combines both under Deposit Paid.</p>' : ""}${fields[kind].map(([key, label, type]) => (type === "checkbox" ? `<label class="check"><input type="checkbox" name="${key}" ${row[key] ? "checked" : ""}>${label}</label>` : key === "notes" ? `<label class="full">Notes<textarea name="notes" maxlength="4000">${esc(row.notes || "")}</textarea></label>` : `<label>${key === "deposit" && kind === "costs" ? "Initial Deposit" : label}<input name="${key}" type="${type || "text"}" value="${esc(row[key] ?? "")}" ${type === "number" ? 'min="0" step="0.01"' : 'maxlength="250"'} ${["item", "name"].includes(key) ? "required" : ""}></label>`)).join("")}<div class="full"><p class="error" role="alert"></p><button type="submit" class="button burgundy">Save Record</button></div></form>`;
      submit(panel.querySelector("form"), async (f) => {
        const values = Object.fromEntries(f);
        if (kind === "padrinos") values.contacted = f.has("contacted");
        const saved = await api("admin/planning", {
          kind,
          ...(row.id ? { id: row.id, version: row.version } : { createId }),
          row: values,
        });
        await draw(kind);
        notify(
          saved.row.sync?.status === "synced"
            ? "Saved And Synced To Notion."
            : "Saved On Website. Notion Sync Pending; Use Retry Sync.",
        );
      });
      panel.scrollIntoView({ block: "nearest" });
    }
    grid.querySelectorAll("[data-sync]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          try {
            const result = await api("admin/planning/sync", {
              kind,
              id: b.dataset.sync,
            });
            await draw(kind);
            notify(
              result.row.sync?.status === "synced"
                ? "Synced To Notion."
                : "Notion Sync Still Pending.",
            );
          } catch (e) {
            notify(e.message);
            b.disabled = false;
          }
        }),
    );
    grid.querySelector("#new-record").onclick = () => edit();
    grid
      .querySelectorAll("[data-edit]")
      .forEach(
        (b) =>
          (b.onclick = () => edit(rows.find((r) => r.id === b.dataset.edit))),
      );
  }
  root
    .querySelectorAll("[data-kind]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          draw(b.dataset.kind).catch((e) => notify(e.message))),
    );
  await draw("costs");
}

export async function documentWorkspace(root) {
  const q = new URLSearchParams(location.search),
    kind = q.get("kind"),
    rowId = q.get("rowId");
  if (
    !["costs", "padrinos"].includes(kind) ||
    !/^[a-f0-9-]{36}$/.test(rowId || "")
  ) {
    root.innerHTML =
      "<p>Open Documents from an Accounting or Godparents row.</p>";
    return;
  }
  const suffix = "kind=" + kind + "&rowId=" + rowId;
  const data = await api("admin/documents?" + suffix);
  root.innerHTML = `<h2>${esc(data.row.item || data.row.name)}</h2><p>Upload bills and contracts here. Images, PDF and text open in a separate tab. Office files download for opening in their application. Delete moves a file to this workspace’s trash; Restore makes it available again.</p><form id="document-upload" class="card"><label>Document<input type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.txt,.docx,.xlsx,.pptx" required></label><p>Maximum 8 MB. Images are normalized and stripped of source metadata.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Upload Document</button></form><div class="cards">${data.documents.map((d) => `<article class="card"><h3>${esc(d.name)}</h3><p>${(d.size / 1024).toFixed(0)} KB ${d.deleted ? "· In Trash" : ""}</p><div class="row-actions">${!d.deleted ? `<a target="_blank" rel="noopener" href="/api/admin/documents/open?${suffix}&id=${d.id}">Open / View</a><a href="/api/admin/documents/open?${suffix}&id=${d.id}&download=1">Download</a>` : ""}<button class="plain-button" data-doc="${d.id}" data-deleted="${!d.deleted}">${d.deleted ? "Restore" : "Delete"}</button></div></article>`).join("") || "<p>No documents uploaded yet.</p>"}</div>`;
  submit(root.querySelector("#document-upload"), async (f) => {
    const file = f.get("file");
    if (!file?.size || file.size > 8 * 1024 * 1024)
      throw Error("Choose A File Up To 8 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    let raw = "";
    for (let i = 0; i < bytes.length; i += 32768)
      raw += String.fromCharCode(...bytes.subarray(i, i + 32768));
    await api("admin/documents/upload", {
      kind,
      rowId,
      name: file.name,
      data: btoa(raw),
    });
    await documentWorkspace(root);
    notify("Document Uploaded.");
  });
  root.querySelectorAll("[data-doc]").forEach(
    (b) =>
      (b.onclick = async () => {
        try {
          await api("admin/documents/state", {
            kind,
            rowId,
            id: b.dataset.doc,
            deleted: b.dataset.deleted === "true",
          });
          await documentWorkspace(root);
        } catch (e) {
          notify(e.message);
        }
      }),
  );
}
