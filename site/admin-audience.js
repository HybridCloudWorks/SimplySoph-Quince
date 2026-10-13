import { api, esc, submit, notify } from "./client.js";
// Custom emails to groups or individuals. Texts have their own page (admin-sms.js).
export async function audienceComposer(root, refresh) {
  const data = await api("admin/audience?channel=email");
  root.innerHTML = `<form id="group-composer" class="card"><h2>Draft email to groups or individuals</h2><p>Choose distribution groups, individual recipients, or both. Overlapping selections produce one draft per email address. Nothing is sent until you review and send each draft.</p><div class="recipient-list"><h3>Distribution groups</h3>${data.groups.map((g) => `<label class="check"><input type="checkbox" name="group" value="${esc(g)}">${esc(g)}</label>`).join("") || "<p>No groups yet. Populate Distribution Groups in Notion.</p>"}<h3>Individuals · Last name, first name</h3>${data.recipients.map((r) => `<label class="check"><input type="checkbox" name="recipient" value="${esc(r.id)}">${esc(r.name)} · ${esc(r.email)}</label>`).join("") || "<p>No eligible email addresses.</p>"}</div><input type="hidden" name="channel" value="email"><label>Subject / draft title<input name="subject" required maxlength="140"></label><label>Message<textarea name="text" required maxlength="5000"></textarea></label><p>Type <code>{link}</code> where each household's private RSVP link belongs. Every draft gets its own link, which opens only after that message is sent. Households without an active link are skipped and listed; create their links first.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Create email drafts for review</button><p id="audience-result" role="status"></p></form>`;
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
    notify(`${r.count} email drafts created. Nothing sent.${skipped}`);
  });
  root.querySelector("#group-composer").addEventListener("input", () => {
    requestId = crypto.randomUUID();
  });
}
