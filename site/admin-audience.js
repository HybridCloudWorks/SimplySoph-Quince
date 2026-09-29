import { whatsappComposer } from "./admin-whatsapp.js";
import { api, esc, submit, notify } from "./client.js";
export async function audienceComposer(root, refresh) {
  const data = await api("admin/audience");
  root.innerHTML = `<form id="group-composer" class="card"><h2>Draft Messages To Groups Or Individuals</h2><p>Choose one or more distribution groups, individual recipients, or both. Overlapping selections produce one draft per email address. Nobody is emailed until you review and send a draft.</p><div class="recipient-list"><h3>Distribution Groups</h3>${data.groups.map((g) => `<label class="check"><input type="checkbox" name="group" value="${esc(g)}">${esc(g)}</label>`).join("") || "<p>No groups yet. Populate Distribution Groups in Notion.</p>"}<h3>Individuals · Last Name, First Name</h3>${data.recipients.map((r) => `<label class="check"><input type="checkbox" name="recipient" value="${r.id}">${esc(r.name)} · ${esc(r.email)}</label>`).join("") || "<p>No eligible email addresses.</p>"}</div><label>Channel<select name="channel"><option value="email">Email Drafts</option><option value="sms">SMS Drafts Only · Sending Not Enabled</option></select></label><label>Subject / Draft Title<input name="subject" required maxlength="140"></label><label>Message<textarea name="text" required maxlength="5000"></textarea></label><p>SMS drafts include only selected people with a US/Canada phone number in international format, recorded SMS consent and consent date, and no opt-out. Groups may include people without email; the individual list shows only people with email.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Create Drafts For Review</button><p id="audience-result" role="status"></p></form><details><summary>SMS Drafts</summary><p id="sms-status">Checking SMS Setup…</p><div id="sms-drafts"></div></details>`;
  const sms = await api("admin/sms/drafts");
  root.querySelector("#sms-status").textContent = sms.sendingEnabled
    ? "Review One Recipient And Message Before Each Send."
    : "Sending Is Disabled Pending Sender Setup And Activation Review.";
  root.querySelector("#sms-drafts").innerHTML =
    sms.drafts
      .map(
        (d) =>
          `<article class="card"><h3>${esc(d.name)}</h3><p>${esc(d.to)}</p><p>${esc(d.text)}</p><p>Status: ${esc(d.delivery || d.state)}</p>${d.state === "draft" ? `<button type="button" class="button" data-review-sms="${esc(d.id)}">Review SMS</button><div class="sms-review" aria-live="polite"></div>` : ""}</article>`,
      )
      .join("") || "<p>No SMS drafts yet.</p>";
  root.querySelector('option[value="sms"]').textContent = sms.sendingEnabled
    ? "SMS Drafts"
    : "SMS Drafts Only · Sending Not Enabled";
  for (const button of root.querySelectorAll("[data-review-sms]")) {
    button.addEventListener("click", async () => {
      const pane = button.nextElementSibling;
      button.disabled = true;
      try {
        const preview = await api(
          "admin/sms/preview?id=" +
            encodeURIComponent(button.dataset.reviewSms),
        );
        pane.innerHTML = `<p>${esc(preview.encoding)} · Approximately ${preview.segments} SMS Segment(s). ${esc(preview.costNote)}</p><p>${preview.sendingEnabled ? "Review the recipient and message above before sending. Sending may incur charges." : "Sending Is Not Enabled. Sender Approval And Activation Tests Are Still Required."}</p>${preview.sendingEnabled ? '<form><label class="check"><input type="checkbox" name="confirm" required>I Have Reviewed This Recipient And Message</label><p class="error" role="alert"></p><button class="button burgundy">Send This SMS</button></form>' : ""}`;
        if (preview.sendingEnabled)
          submit(pane.querySelector("form"), async () => {
            await api("admin/sms/send", {
              id: preview.id,
              reviewToken: preview.reviewToken,
              confirm: true,
            });
            await refresh();
            notify("SMS Accepted By Twilio. Delivery Confirmation Is Pending.");
          });
      } catch (e) {
        pane.textContent = e.message;
      } finally {
        button.disabled = false;
      }
    });
  }
  if (sms.pendingOptOutSync) {
    const retry = document.createElement("button");
    retry.className = "button";
    retry.textContent = `Retry ${sms.pendingOptOutSync} Pending Notion Opt-Out Update(s)`;
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
    notify(
      `${r.count} ${r.channel === "email" ? "Email" : "SMS"} Drafts Created. Nothing Sent.`,
    );
  });
  root.querySelector("#group-composer").addEventListener("input", () => {
    requestId = crypto.randomUUID();
  });
  const whatsappRoot = document.createElement("section");
  root.append(whatsappRoot);
  await whatsappComposer(whatsappRoot);
}
