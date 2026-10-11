import { api, esc, submit, notify } from "./client.js";
export async function audienceComposer(root, refresh, channel = "email") {
  const data = await api("admin/audience?channel=" + channel);
  const label = channel === "sms" ? "SMS" : "email";
  root.innerHTML = `<form id="group-composer" class="card"><h2>Draft ${label} to groups or individuals</h2><p>Choose distribution groups, individual recipients, or both. Overlapping selections produce one draft per ${channel === "sms" ? "phone number" : "email address"}. Nothing is sent until you review and send each draft.</p><div class="recipient-list"><h3>Distribution groups</h3>${data.groups.map((g) => `<label class="check"><input type="checkbox" name="group" value="${esc(g)}">${esc(g)}</label>`).join("") || "<p>No groups yet. Populate Distribution Groups in Notion.</p>"}<h3>Individuals · Last name, first name</h3>${data.recipients.map((r) => `<label class="check"><input type="checkbox" name="recipient" value="${esc(r.id)}">${esc(r.name)} · ${esc(channel === "sms" ? r.phone : r.email)}</label>`).join("") || `<p>No eligible ${channel === "sms" ? "SMS phone numbers" : "email addresses"}.</p>`}</div><input type="hidden" name="channel" value="${channel}"><label>Subject / draft title<input name="subject" required maxlength="140"></label><label>Message<textarea name="text" required maxlength="${channel === "sms" ? 1600 : 5000}">${channel === "sms" ? "Simply Soph Media: \n\nReply STOP to opt out." : ""}</textarea></label><p>Type <code>{link}</code> where each household's private RSVP link belongs. Every draft gets its own link, which opens only after that message is sent. Households without an active link are skipped and listed; create their links first.</p>${channel === "sms" ? "<p>Only US/Canada phones whose owner texted SOPHIA (or START) to the event number, and that match the household's Notion phone, are eligible. Ticking SMS Consent in Notion does not enroll anyone. Every text must start with “Simply Soph Media:” and include STOP. WhatsApp consent does not enroll guests in SMS.</p>" : ""}<p class="error" role="alert"></p><button type="submit" class="button burgundy">Create ${label} drafts for review</button><p id="audience-result" role="status"></p></form>${channel === "sms" ? '<section class="recent-records"><h3>Latest five SMS records</h3><a href="/admin/history/?kind=sms">View full SMS history</a><p id="sms-status">Checking SMS setup…</p><div id="sms-drafts"></div></section>' : ""}`;
  if (channel === "sms") {
    const sms = await api("admin/sms/drafts");
    root.querySelector("#sms-status").textContent = sms.sendingEnabled
      ? "Review one recipient and message before each send."
      : "Sending is disabled pending sender setup and activation review.";
    root.querySelector("#sms-drafts").innerHTML =
      sms.drafts
        .filter((d) => !d.archived)
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .filter(
          (d, i) =>
            i < 5 ||
            d.id === new URLSearchParams(location.search).get("review"),
        )
        .map(
          (d) =>
            `<article class="compact-record"><h3>${esc(d.name)}</h3><p>${esc(d.to)}</p><p>${esc(d.text)}</p><p>Status: ${esc(d.delivery || d.state)}</p>${d.state === "draft" ? `<button type="button" class="button outline" data-review-sms="${esc(d.id)}">Review SMS</button><div class="sms-review" aria-live="polite"></div>` : ""}</article>`,
        )
        .join("") || "<p>No SMS drafts yet.</p>";
    for (const button of root.querySelectorAll("[data-review-sms]")) {
      button.addEventListener("click", async () => {
        const pane = button.nextElementSibling;
        button.disabled = true;
        try {
          const preview = await api(
            "admin/sms/preview?id=" +
              encodeURIComponent(button.dataset.reviewSms),
          );
          pane.innerHTML = `<p>${esc(preview.encoding)} · Approximately ${preview.segments} SMS segment(s). ${esc(preview.costNote)}</p><p>${preview.sendingEnabled ? "Review the recipient and message above before sending. Sending may incur charges." : "Sending is not enabled. Sender approval and activation tests are still required."}</p>${preview.sendingEnabled ? '<form><label class="check"><input type="checkbox" name="confirm" required>I have reviewed this recipient and message</label><p class="error" role="alert"></p><button type="submit" class="button burgundy">Send this SMS</button></form>' : ""}`;
          if (preview.sendingEnabled)
            submit(pane.querySelector("form"), async () => {
              await api("admin/sms/send", {
                id: preview.id,
                reviewToken: preview.reviewToken,
                confirm: true,
              });
              await refresh();
              notify(
                "SMS accepted by Twilio. Delivery confirmation is pending.",
              );
            });
        } catch (e) {
          pane.textContent = e.message;
        } finally {
          button.disabled = false;
        }
      });
    }
    const selectedReview = new URLSearchParams(location.search).get("review");
    const reviewButton = [...root.querySelectorAll("[data-review-sms]")].find(
      (b) => b.dataset.reviewSms === selectedReview,
    );
    reviewButton?.click();
    if (sms.pendingOptOutSync) {
      const retry = document.createElement("button");
      retry.className = "button outline";
      retry.textContent = `Retry ${sms.pendingOptOutSync} pending Notion opt-out update(s)`;
      retry.addEventListener("click", async () => {
        retry.disabled = true;
        try {
          await api("admin/sms/sync", {});
          await refresh();
        } catch (e) {
          retry.textContent = e.message;
          retry.disabled = false;
        }
      });
      root.querySelector("#sms-drafts").prepend(retry);
    }
  }
  let requestId = crypto.randomUUID();
  submit(root.querySelector("#group-composer"), async (f) => {
    const r = await api("admin/mail/batch-draft", {
      requestId,
      groups: f.getAll("group"),
      ids: f.getAll("recipient"),
      subject: f.get("subject"),
      text: f.get("text"),
      channel: f.get("channel"),
    });
    requestId = crypto.randomUUID();
    await refresh();
    const skipped = r.skipped?.length
      ? ` ${r.skipped.length} skipped without an active private link: ${r.skipped.join("; ")}.`
      : "";
    notify(
      `${r.count} ${r.channel === "email" ? "email" : "SMS"} drafts created. Nothing sent.${skipped}`,
    );
  });
  root.querySelector("#group-composer").addEventListener("input", () => {
    requestId = crypto.randomUUID();
  });
}
