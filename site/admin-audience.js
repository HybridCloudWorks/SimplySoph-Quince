import { api, esc, submit, notify } from "./client.js";
export async function audienceComposer(root, refresh) {
  const data = await api("admin/audience");
  root.innerHTML = `<form id="group-composer" class="card"><h2>Draft Emails To Groups Or Individuals</h2><p>Choose one or more distribution groups, individual recipients, or both. Overlapping selections produce one draft per email address. Nobody is emailed until you review and send a draft.</p><div class="recipient-list"><h3>Distribution Groups</h3>${data.groups.map((g) => `<label class="check"><input type="checkbox" name="group" value="${esc(g)}">${esc(g)}</label>`).join("") || "<p>No groups yet. Populate Distribution Groups in Notion.</p>"}<h3>Individuals · Last Name, First Name</h3>${data.recipients.map((r) => `<label class="check"><input type="checkbox" name="recipient" value="${r.id}">${esc(r.name)} · ${esc(r.email)}</label>`).join("") || "<p>No eligible email addresses.</p>"}</div><label>Channel<select name="channel"><option value="email">Email Drafts</option><option value="sms">SMS Drafts Only · Sending Not Enabled</option></select></label><label>Subject / Draft Title<input name="subject" required maxlength="140"></label><label>Message<textarea name="text" required maxlength="5000"></textarea></label><p>SMS drafts include only selected people with an international-format phone number, recorded SMS consent and consent date, and no opt-out. Groups may include people without email; the individual list shows only people with email.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Create Drafts For Review</button><p id="audience-result" role="status"></p></form><details><summary>SMS Drafts</summary><p>Sending is disabled until a provider, sender registration and opt-out handling are configured.</p><div id="sms-drafts"></div></details>`;
  const sms = await api("admin/sms/drafts");
  root.querySelector("#sms-drafts").innerHTML =
    sms.drafts
      .map(
        (d) =>
          `<article class="card"><h3>${esc(d.name)}</h3><p>${esc(d.to)}</p><p>${esc(d.text)}</p></article>`,
      )
      .join("") || "<p>No SMS drafts yet.</p>";
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
}
