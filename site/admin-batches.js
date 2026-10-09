import { api, esc, notify } from "./client.js";

// Bulk invitations with a person in the loop: select households, review the
// recipients, skips and one sample per language, type the count to confirm,
// then this open tab sends in small chunks. Closing the tab or pressing Stop
// halts sending; nothing is ever sent in the background.
const reasons = {
  "not-in-guest-list": "Not in the Notion guest list",
  archived: "Archived in Notion",
  "capacity-needs-review": "Capacity needs review in Notion",
  "no-invitation-link": "No invitation link yet (create links first)",
  "invitation-revoked": "Invitation link revoked",
  "no-email": "No valid email",
  "draft-already-exists": "A draft of this email already exists",
  "already-invited": "Invitation email already sent",
  "already-responded": "Already responded",
  "contacted-in-last-72-hours": "Emailed in the last 72 hours",
  "reminder-limit-reached": "Already received 3 reminders",
  "link-already-exists": "Already has a link (never replaced in bulk)",
};
const typeNames = { invitation: "Invitation emails", reminder: "Reminder emails" };
const events = ["ceremony", "dinner", "dance"];

export function selectedIds(root) {
  return [...root.querySelectorAll("[data-select]:checked")].map((b) => b.value);
}

export function batchToolbar(root, guests, reload) {
  // root is #guest-area, re-rendered with the list, so listeners never pile up.
  const bar = root.querySelector("#batch-toolbar"),
    box = document.querySelector("#guest-editor"),
    panel = document.querySelector("#batch-panel");
  const count = () => {
    const n = selectedIds(root).length;
    bar.querySelector("[data-selected-count]").textContent = n
      ? `${n} selected`
      : "Select households to act on them together";
    for (const b of bar.querySelectorAll("button")) b.disabled = !n;
  };
  root.querySelector("[data-select-all]").onchange = (e) => {
    for (const box of root.querySelectorAll("[data-select]"))
      if (!box.closest("tr").hidden) box.checked = e.target.checked;
    count();
  };
  root.addEventListener("change", (e) => {
    if (e.target.matches("[data-select]")) count();
  });
  bar.querySelector("[data-batch=issue]").onclick = () => {
    const ids = selectedIds(root);
    box.innerHTML = `<form id="issue-batch" class="card"><h2>Create links for ${ids.length} households</h2><p>Only households without a link get one; existing links are never replaced here. Nothing is emailed.</p>${events.map((e) => `<label class="check"><input type="checkbox" name="${e}" checked>${e}</label>`).join("")}<label>Language<select name="locale"><option value="en">English</option><option value="es">Español</option></select></label><p class="error" role="alert"></p><button type="submit" class="button burgundy">Create links</button></form>`;
    const form = box.querySelector("form");
    form.onsubmit = async (e) => {
      e.preventDefault();
      form.querySelector("button").disabled = true;
      try {
        const f = new FormData(form);
        const r = await api("admin/invitations/issue-batch", {
          ids,
          invited: Object.fromEntries(events.map((x) => [x, f.has(x)])),
          locale: f.get("locale"),
        });
        notify(
          `Created ${r.issued} link${r.issued === 1 ? "" : "s"}. ${r.skipped.length} skipped. No email sent.`,
        );
        await reload();
      } catch (err) {
        form.querySelector("[role=alert]").textContent = err.message;
        form.querySelector("button").disabled = false;
      }
    };
    box.scrollIntoView({ block: "nearest" });
  };
  for (const type of ["invitation", "reminder"])
    bar.querySelector(`[data-batch=${type}]`).onclick = async (e) => {
      e.target.disabled = true;
      try {
        const r = await api("admin/mail/invitation-batch", {
          requestId: crypto.randomUUID(),
          type,
          ids: selectedIds(root),
        });
        await openBatch(panel, r.id, guests, reload);
      } catch (err) {
        notify(err.message);
      } finally {
        e.target.disabled = false;
      }
    };
  count();
  recentBatches(document.querySelector("#recent-batches"), panel, guests, reload);
}

async function recentBatches(box, panel, guests, reload) {
  const { batches } = await api("admin/mail/batches");
  box.innerHTML = batches.length
    ? `<h2>Recent email batches</h2><div class="table-wrap"><table><thead><tr><th scope="col">Created</th><th scope="col">Type</th><th scope="col">State</th><th scope="col">Emails</th><th scope="col">Waiting to send</th><th scope="col"></th></tr></thead><tbody>${batches
        .map(
          (b) =>
            `<tr><td>${esc(new Date(b.createdAt).toLocaleString())}</td><td>${esc(typeNames[b.type])}</td><td>${esc(b.state)}</td><td>${b.total}</td><td>${b.remaining}</td><td><button type="button" class="plain-button" data-open-batch="${esc(b.id)}">Open</button></td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : "";
  for (const b of box.querySelectorAll("[data-open-batch]"))
    b.onclick = () => openBatch(panel, b.dataset.openBatch, guests, reload);
}

export async function openBatch(panel, id, guests, reload) {
  const d = await api("admin/mail/batch?id=" + encodeURIComponent(id));
  const names = new Map(guests.map((g) => [g.id, g.name]));
  const canConfirm = d.state === "draft" && d.remaining > 0,
    canSend = ["confirmed", "sending"].includes(d.state) && d.remaining > 0,
    canCancel = ["draft", "confirmed", "sending"].includes(d.state) && d.remaining > 0;
  panel.innerHTML = `<section class="card" aria-labelledby="batch-title"><h2 id="batch-title">${esc(typeNames[d.type])} · ${d.total} recipient${d.total === 1 ? "" : "s"} · ${d.skipped} skipped</h2><p>State: <strong>${esc(d.state)}</strong>${d.confirmedAt ? ` · confirmed ${esc(new Date(d.confirmedAt).toLocaleString())}` : ""}</p>${
    d.recipients.length
      ? `<h3>Recipients</h3><div class="table-wrap"><table><thead><tr><th scope="col">Household</th><th scope="col">Email</th><th scope="col">Language</th><th scope="col">Status</th></tr></thead><tbody>${d.recipients
          .map(
            (r) =>
              `<tr><td>${esc(names.get(r.householdId) || r.householdId)}</td><td>${esc(r.to)}</td><td>${r.locale === "es" ? "Español" : "English"}</td><td>${esc(r.state)}${r.error ? ` (${esc(r.error)})` : ""}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : "<p>No household in this selection can receive this email.</p>"
  }${
    d.skippedList.length
      ? `<h3>Skipped</h3><ul>${d.skippedList.map((s) => `<li>${esc(s.name || names.get(s.householdId) || s.householdId)}: ${esc(reasons[s.reason] || s.reason)}</li>`).join("")}</ul>`
      : ""
  }${Object.entries(d.samples)
    .map(
      ([locale, s]) =>
        `<h3>Sample (${locale === "es" ? "Español" : "English"})</h3><p>To: ${esc(s.to)} · Subject: ${esc(s.subject)}</p><iframe class="preview-frame" title="Sample email ${esc(locale)}" sandbox="" data-sample="${esc(locale)}"></iframe>`,
    )
    .join("")}${
    canConfirm
      ? `<form id="batch-confirm"><label class="check"><input type="checkbox" required>I reviewed the recipients, the skipped households and the sample emails.</label><label>Type ${d.remaining} to confirm sending ${d.remaining} email${d.remaining === 1 ? "" : "s"}<input name="count" inputmode="numeric" autocomplete="off" required></label><p class="error" role="alert"></p><button type="submit" class="button burgundy">Confirm and send ${d.remaining}</button></form>`
      : ""
  }${canSend ? `<button type="button" class="button burgundy" data-batch-send>Continue sending ${d.remaining}</button>` : ""}${canCancel ? `<button type="button" class="plain-button" data-batch-cancel>Cancel unsent emails</button>` : ""}<p data-batch-progress role="status" aria-live="polite"></p><button type="button" class="plain-button" data-batch-stop hidden>Stop after this group</button></section>`;
  for (const frame of panel.querySelectorAll("[data-sample]"))
    frame.srcdoc = d.samples[frame.dataset.sample].html;
  const form = panel.querySelector("#batch-confirm");
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      form.querySelector("button").disabled = true;
      try {
        await api("admin/mail/batch/confirm", {
          id,
          count: Number(new FormData(form).get("count")),
        });
        await sendLoop(panel, id, guests, reload);
      } catch (err) {
        form.querySelector("[role=alert]").textContent = err.message;
        form.querySelector("button").disabled = false;
      }
    };
  const cont = panel.querySelector("[data-batch-send]");
  if (cont) cont.onclick = () => sendLoop(panel, id, guests, reload);
  const cancel = panel.querySelector("[data-batch-cancel]");
  if (cancel)
    cancel.onclick = async () => {
      if (!confirm("Cancel the emails in this batch that have not been sent?")) return;
      await api("admin/mail/batch/cancel", { id });
      await openBatch(panel, id, guests, reload);
    };
  panel.scrollIntoView({ block: "nearest" });
}

async function sendLoop(panel, id, guests, reload) {
  const progress = panel.querySelector("[data-batch-progress]"),
    stop = panel.querySelector("[data-batch-stop]");
  let stopped = false;
  const totals = { accepted: 0, failed: 0, unknown: 0, skipped: 0 };
  stop.hidden = false;
  stop.onclick = () => {
    stopped = true;
    stop.disabled = true;
    progress.textContent += " Stopping after this group…";
  };
  for (const b of panel.querySelectorAll("form button, [data-batch-send], [data-batch-cancel]"))
    b.disabled = true;
  const leave = (e) => {
    e.preventDefault();
    e.returnValue = "";
  };
  window.addEventListener("beforeunload", leave);
  try {
    for (;;) {
      progress.textContent = `Sending… ${totals.accepted} accepted so far. Keep this tab open.`;
      const r = await api("admin/mail/batch/send", { id });
      for (const k of Object.keys(totals)) totals[k] += r[k];
      if (r.done || stopped) break;
    }
  } catch (err) {
    notify(err.message);
  } finally {
    window.removeEventListener("beforeunload", leave);
  }
  notify(
    `${totals.accepted} accepted by the mail provider, ${totals.failed} failed, ${totals.unknown} uncertain, ${totals.skipped} skipped. Accepted is not the same as delivered.`,
  );
  await reload();
  await openBatch(document.querySelector("#batch-panel"), id, guests, reload);
}
