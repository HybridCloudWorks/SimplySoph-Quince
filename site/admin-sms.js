import { api, esc, submit, notify } from "./client.js";

// Text messages, all from this one page: who can be texted and why not, a test
// to the organizer's own phone, and batches with one typed-count confirmation.
// Guests opt in only by texting the keyword; nothing here enrolls anyone.
const statusWords = {
  subscribed: "Subscribed",
  waiting: "Hasn't texted SOPHIA yet",
  syncing: "Texted SOPHIA · matching to this row",
  "opted-out": "Opted out (texted STOP)",
  "not-us-ca": "Not a US/Canada number",
  "no-phone": "No phone in Notion",
};
const DEFAULT_TEXT =
  "Simply Soph Media: Hello from Sophia's quinceañera! RSVP by November 15: {link} Reply STOP to opt out.";
const TEST_TEXT =
  "Simply Soph Media: Test from the Mis XV website. Reply STOP to opt out.";
const when = (ms) => (ms ? new Date(ms).toLocaleString() : "—");

export async function smsComposer(root) {
  root.innerHTML = '<p role="status">Loading…</p>';
  const [data, sms] = await Promise.all([
    api("admin/audience?channel=sms"),
    api("admin/sms/drafts"),
  ]);
  const households = data.households || [];
  const count = (status) => households.filter((h) => h.status === status).length;
  const subscribed = count("subscribed");
  const review = new URLSearchParams(location.search).get("review");
  root.innerHTML = `<section class="card"><h2>Text messages (SMS)</h2><p>${
    sms.sendingEnabled
      ? "Sending is on. Every text still goes out only after you confirm it here."
      : "Sending is switched off on the server; you can prepare and review texts, but nothing can go out."
  }</p><p>Guests subscribe by texting <strong>SOPHIA</strong> to <strong>+1 682-786-8002</strong>. That text is the only way onto the list; nothing on this page or in Notion enrolls anyone. Texts reach US and Canadian numbers; use WhatsApp or email for other countries.</p></section>
<form id="sms-test" class="card"><h2>Send a test to my phone</h2><p>Text SOPHIA to the event number from your phone first. Then enter that number here.</p><label>My phone<input name="phone" inputmode="tel" autocomplete="tel" placeholder="+1 817 555 0123" required></label><label>Message<textarea name="text" required maxlength="1600">${esc(TEST_TEXT)}</textarea></label><label class="check"><input type="checkbox" name="confirm" required>Send this one text to my phone</label><p class="error" role="alert"></p><button type="submit" class="button outline"${sms.sendingEnabled ? "" : " disabled"}>Send test</button></form>
<form id="sms-compose" class="card"><h2>Text guests</h2><p><strong>${subscribed}</strong> subscribed · ${count("waiting") + count("syncing")} waiting to text SOPHIA · ${count("opted-out")} opted out · ${count("not-us-ca") + count("no-phone")} without a textable number</p>${
    data.groups.length
      ? `<h3>Distribution groups</h3><p>Picks the subscribed households in each group.</p>${data.groups.map((g) => `<label class="check"><input type="checkbox" name="group" value="${esc(g)}">${esc(g)}</label>`).join("")}`
      : ""
  }<h3>Households</h3><label class="check"><input type="checkbox" data-select-all>Select all subscribed</label><label class="check"><input type="checkbox" data-only-subscribed>Show only subscribed</label><div class="table-wrap"><table><thead><tr><th scope="col"></th><th scope="col">Household</th><th scope="col">Phone</th><th scope="col">Status</th></tr></thead><tbody>${
    households
      .map(
        (h) =>
          `<tr data-status="${esc(h.status)}"><td><input type="checkbox" name="recipient" value="${esc(h.id)}" aria-label="${esc(h.name)}"${h.status === "subscribed" ? "" : " disabled"}></td><td>${esc(h.name)}</td><td>${esc(h.phone || "")}</td><td>${esc(statusWords[h.status] || h.status)}</td></tr>`,
      )
      .join("") || '<tr><td colspan="4">No households in Notion yet.</td></tr>'
  }</tbody></table></div>${
    count("syncing")
      ? '<button type="button" class="button outline" data-sync>Match texted phones to their rows now</button>'
      : ""
  }<label>Message<textarea name="text" required maxlength="1600">${esc(DEFAULT_TEXT)}</textarea></label><p>Every text must start with “Simply Soph Media:” and include STOP. Type <code>{link}</code> where each household's private RSVP link belongs; households without an active link are skipped and listed.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Review before sending</button></form>
<div id="sms-batch-panel"></div>
<section class="recent-records"><h2>Recent text batches</h2>${
    sms.batches.length
      ? `<div class="table-wrap"><table><thead><tr><th scope="col">Created</th><th scope="col">Message</th><th scope="col">State</th><th scope="col">Texts</th><th scope="col">Waiting to send</th><th scope="col"></th></tr></thead><tbody>${sms.batches
          .map(
            (b) =>
              `<tr><td>${esc(when(b.createdAt))}</td><td><p class="history-snippet">${esc(b.text)}</p></td><td>${esc(b.state)}</td><td>${b.total}</td><td>${b.remaining}</td><td><button type="button" class="plain-button" data-open-batch="${esc(b.id)}">Open</button></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : "<p>No batches yet.</p>"
  }<h2>Latest five texts</h2><a href="/admin/history/?kind=sms">View full SMS history</a><div id="sms-drafts">${
    sms.drafts
      .filter((d) => !d.archived)
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .filter((d, i) => i < 5 || d.id === review)
      .map(
        (d) =>
          `<article class="compact-record"><h3>${esc(d.name)}</h3><p>${esc(d.to)}</p><p>${esc(d.text)}</p><p>Status: ${esc(d.delivery || d.state)}${d.error ? ` (${esc(d.error)}${d.providerError ? ` · Twilio ${esc(String(d.providerError))}` : ""})` : ""}</p>${d.state === "draft" ? `<button type="button" class="button outline" data-review-sms="${esc(d.id)}">Review this text</button><div class="sms-review" aria-live="polite"></div>` : ""}</article>`,
      )
      .join("") || "<p>No texts yet.</p>"
  }</div></section>`;
  const reload = () => smsComposer(root);
  const panel = root.querySelector("#sms-batch-panel");

  // Test to self: drafted and sent in one confirmed step.
  submit(root.querySelector("#sms-test"), async (f) => {
    await api("admin/sms/test", {
      phone: f.get("phone"),
      text: f.get("text"),
      confirm: true,
    });
    notify("Test text accepted by Twilio. It should arrive within a minute.");
    await reload();
  });

  // Household table helpers.
  const compose = root.querySelector("#sms-compose");
  const boxes = () => [...compose.querySelectorAll('[name="recipient"]:not(:disabled)')];
  compose.querySelector("[data-select-all]").onchange = (e) => {
    for (const b of boxes()) b.checked = e.target.checked;
  };
  compose.querySelector("[data-only-subscribed]").onchange = (e) => {
    for (const tr of compose.querySelectorAll("tbody tr[data-status]"))
      tr.hidden = e.target.checked && tr.dataset.status !== "subscribed";
  };
  compose.querySelector("[data-sync]")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const r = await api("admin/sms/sync", {});
      notify(`${r.attempted} phone(s) re-matched.`);
      await reload();
    } catch (err) {
      notify(err.message);
      e.target.disabled = false;
    }
  });
  let requestId = crypto.randomUUID();
  compose.addEventListener("input", () => {
    requestId = crypto.randomUUID();
  });
  submit(compose, async (f) => {
    // The request ID is also the batch ID.
    const id = requestId;
    const r = await api("admin/mail/batch-draft", {
      requestId: id,
      groups: f.getAll("group"),
      ids: f.getAll("recipient"),
      subject: "Text · " + new Date().toLocaleDateString(),
      text: f.get("text"),
      channel: "sms",
    });
    requestId = crypto.randomUUID();
    const skipped = r.skipped?.length
      ? ` ${r.skipped.length} skipped without an active private link: ${r.skipped.join("; ")}.`
      : "";
    notify(`${r.count} text${r.count === 1 ? "" : "s"} ready to review. Nothing sent.${skipped}`);
    await openBatch(panel, r.ids.length ? id : null, reload);
  });
  for (const b of root.querySelectorAll("[data-open-batch]"))
    b.onclick = () => openBatch(panel, b.dataset.openBatch, reload);

  // Single texts: review one, send one.
  for (const button of root.querySelectorAll("[data-review-sms]")) {
    button.addEventListener("click", async () => {
      const pane = button.nextElementSibling;
      button.disabled = true;
      try {
        const preview = await api("admin/sms/preview?id=" + encodeURIComponent(button.dataset.reviewSms));
        pane.innerHTML = `<p>${esc(preview.encoding)} · about ${preview.segments} SMS segment(s). ${esc(preview.costNote)}</p>${
          preview.sendingEnabled
            ? '<form><label class="check"><input type="checkbox" name="confirm" required>I reviewed this recipient and message</label><p class="error" role="alert"></p><button type="submit" class="button burgundy">Send this text</button></form>'
            : "<p>Sending is switched off on the server.</p>"
        }`;
        if (preview.sendingEnabled)
          submit(pane.querySelector("form"), async () => {
            await api("admin/sms/send", { id: preview.id, reviewToken: preview.reviewToken, confirm: true });
            notify("Text accepted by Twilio. Delivery confirmation is pending.");
            await reload();
          });
      } catch (e) {
        pane.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    });
  }
  root.querySelector(`[data-review-sms="${CSS.escape(review || "")}"]`)?.click();
}

async function openBatch(panel, id, reload) {
  if (!id) {
    panel.innerHTML = "";
    return;
  }
  const d = await api("admin/sms/batch?id=" + encodeURIComponent(id));
  const canConfirm = d.state === "draft" && d.remaining > 0,
    canSend = ["confirmed", "sending"].includes(d.state) && d.remaining > 0,
    canCancel = ["draft", "confirmed", "sending"].includes(d.state) && d.remaining > 0;
  panel.innerHTML = `<section class="card" aria-labelledby="sms-batch-title"><h2 id="sms-batch-title">${d.total} text${d.total === 1 ? "" : "s"} · ${esc(d.state)}</h2><p>Created ${esc(when(d.createdAt))}${d.confirmedAt ? ` · confirmed ${esc(when(d.confirmedAt))}` : ""}</p><h3>Message</h3><p>${esc(d.text)}</p><p>Each household's own private link replaces <code>{link}</code> when its text is sent.</p><h3>Recipients</h3><div class="table-wrap"><table><thead><tr><th scope="col">Household</th><th scope="col">Phone</th><th scope="col">Status</th></tr></thead><tbody>${d.recipients
    .map(
      (r) =>
        `<tr><td>${esc(r.name)}</td><td>${esc(r.to)}</td><td>${esc(r.delivery || r.state)}${r.error ? ` (${esc(r.error)})` : ""}</td></tr>`,
    )
    .join("")}</tbody></table></div>${
    canConfirm
      ? `<form id="sms-batch-confirm"><label class="check"><input type="checkbox" required>I reviewed the message and the recipients.</label><label>Type ${d.remaining} to confirm sending ${d.remaining} text${d.remaining === 1 ? "" : "s"}<input name="count" inputmode="numeric" autocomplete="off" required></label><p class="error" role="alert"></p><button type="submit" class="button burgundy">Confirm and send ${d.remaining}</button></form>`
      : ""
  }${canSend ? `<button type="button" class="button burgundy" data-batch-send>Continue sending ${d.remaining}</button>` : ""}${canCancel ? '<button type="button" class="plain-button" data-batch-cancel>Cancel unsent texts</button>' : ""}<p data-batch-progress role="status" aria-live="polite"></p><button type="button" class="plain-button" data-batch-stop hidden>Stop after this group</button></section>`;
  const form = panel.querySelector("#sms-batch-confirm");
  if (form)
    submit(form, async (f) => {
      await api("admin/sms/batch/confirm", { id, count: Number(f.get("count")) });
      await sendLoop(panel, id, reload);
    });
  const cont = panel.querySelector("[data-batch-send]");
  if (cont) cont.onclick = () => sendLoop(panel, id, reload);
  const cancel = panel.querySelector("[data-batch-cancel]");
  if (cancel)
    cancel.onclick = async () => {
      if (!confirm("Cancel the texts in this batch that have not been sent?")) return;
      await api("admin/sms/batch/cancel", { id });
      await reload();
    };
  panel.scrollIntoView({ block: "nearest" });
}

// The open tab sends one small group per request and asks for the next;
// closing the tab or pressing Stop halts it. Nothing sends in the background.
async function sendLoop(panel, id, reload) {
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
      const r = await api("admin/sms/batch/send", { id });
      for (const k of Object.keys(totals)) totals[k] += r[k];
      if (r.done || stopped) break;
    }
  } catch (err) {
    notify(err.message);
  } finally {
    window.removeEventListener("beforeunload", leave);
  }
  notify(
    `${totals.accepted} accepted by Twilio, ${totals.failed} rejected, ${totals.unknown} uncertain, ${totals.skipped} skipped. Accepted is not the same as delivered; the status column updates as Twilio reports.`,
  );
  await reload();
}
