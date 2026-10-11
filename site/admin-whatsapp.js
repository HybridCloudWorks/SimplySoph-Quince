import { api, esc, submit, notify } from "./client.js";

export async function whatsappComposer(root) {
  root.innerHTML =
    '<h2>WhatsApp invitations & reminders</h2><p role="status">Checking WhatsApp setup…</p>';
  try {
    const data = await api("admin/whatsapp/drafts");
    const templates = data.templates || [];
    root.innerHTML = `<h2>WhatsApp invitations & reminders</h2><p>Send approved templates to guests who have separately subscribed and verified their WhatsApp phone. International numbers are supported. Email and SMS consent do not enroll guests in WhatsApp.</p><p class="notice">${data.sendingEnabled ? "Review each recipient and template before sending. Twilio and Meta charges may apply." : "Sending is disabled pending template approval and activation review. Drafts can be prepared for review."}</p><form class="card"><h3>Create WhatsApp drafts</h3><div class="recipient-list"><h4>Distribution groups</h4>${(data.groups || []).map((group) => `<label class="check"><input type="checkbox" name="group" value="${esc(group)}">${esc(group)}</label>`).join("") || "<p>No distribution groups available.</p>"}<h4>Individuals · Last name, first name</h4>${(data.recipients || []).map((recipient) => `<label class="check"><input type="checkbox" name="recipient" value="${esc(recipient.id)}">${esc(recipient.name)} · ${esc(recipient.phone)}</label>`).join("") || "<p>No verified WhatsApp subscribers yet. Guests can subscribe in My account.</p>"}</div><label>Template<select name="templateKey" required><option value="">Choose a template</option>${templates.map((template) => `<option value="${esc(template.key)}">${esc(template.name || template.key)} · ${esc(template.language)} · ${esc(template.status || "Pending")}</option>`).join("")}</select></label><div class="whatsapp-template-preview" aria-live="polite"></div><p>Each draft gets that household’s private invitation link. Overlapping group and individual selections are deduplicated. No freeform message or guest list is sent to Meta for template approval.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy"${templates.length ? "" : " disabled"}>Create WhatsApp drafts for review</button></form><div class="whatsapp-drafts"><h3>Latest five WhatsApp records</h3><a href="/admin/history/?kind=whatsapp">View full WhatsApp history</a><button type="button" class="button outline" data-whatsapp-sync>Retry pending Notion consent updates</button><p data-whatsapp-sync-status role="status"></p>${
      (data.drafts || [])
        .filter((d) => !d.archived)
        .sort((a, b) => (b.at || 0) - (a.at || 0))
        .filter(
          (d, i) =>
            i < 5 ||
            d.id === new URLSearchParams(location.search).get("review"),
        )
        .map(
          (draft) =>
            `<article class="card"><h4>${esc(draft.name || "Guest invitation")}</h4><p>${esc(draft.to)}</p><p>Review to see the personalized message and private RSVP link.</p><p>Template: ${esc(draft.templateKey)} · Status: ${esc(draft.delivery || draft.state)}</p>${draft.state === "draft" ? `<button type="button" class="button outline" data-whatsapp-review="${esc(draft.id)}">Review WhatsApp message</button><div class="whatsapp-review" aria-live="polite"></div>` : ""}</article>`,
        )
        .join("") || "<p>No WhatsApp drafts yet.</p>"
    }</div>`;
    root
      .querySelector("[data-whatsapp-sync]")
      .addEventListener("click", async (event) => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const result = await api("admin/whatsapp/sync", {});
          await whatsappComposer(root);
          root.querySelector("[data-whatsapp-sync-status]").textContent =
            `${result.attempted} pending update(s) retried.`;
        } catch (error) {
          root.querySelector("[data-whatsapp-sync-status]").textContent =
            error.message;
          button.disabled = false;
        }
      });
    let requestId = crypto.randomUUID();
    const form = root.querySelector("form");
    form.addEventListener("input", () => {
      requestId = crypto.randomUUID();
    });
    form.elements.templateKey.addEventListener("change", () => {
      const template = templates.find(
        (item) => item.key === form.elements.templateKey.value,
      );
      root.querySelector(".whatsapp-template-preview").innerHTML = template
        ? `<h4>Template preview</h4><p>${esc(template.text || template.body)}</p><p>Approval: ${esc(template.status || "Pending")}. The private RSVP link is added to each recipient’s draft.</p>`
        : "";
    });
    submit(form, async (values) => {
      const result = await api("admin/whatsapp/batch-draft", {
        requestId,
        groups: values.getAll("group"),
        ids: values.getAll("recipient"),
        templateKey: values.get("templateKey"),
      });
      await whatsappComposer(root);
      notify(`${result.count} WhatsApp drafts created. Nothing sent.`);
    });
    for (const button of root.querySelectorAll("[data-whatsapp-review]")) {
      button.addEventListener("click", async () => {
        button.disabled = true;
        const pane = button.nextElementSibling;
        try {
          const preview = await api(
            "admin/whatsapp/preview?id=" +
              encodeURIComponent(button.dataset.whatsappReview),
          );
          pane.innerHTML = `<h4>Review this recipient</h4><p>${esc(preview.name || "")} · ${esc(preview.to)}</p><p>${esc(preview.text)}</p><p>Template: ${esc(preview.templateKey)}</p>${preview.sendingEnabled && preview.state === "draft" ? '<form><label class="check"><input name="confirm" type="checkbox" required>I have reviewed this recipient and message</label><p>Sending may incur charges. This sends only the message shown above.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Send this WhatsApp message</button></form>' : "<p>Sending is not available. Confirm template approval, activation and current consent.</p>"}`;
          const sendForm = pane.querySelector("form");
          if (sendForm)
            submit(sendForm, async () => {
              await api("admin/whatsapp/send", {
                id: preview.id,
                reviewToken: preview.reviewToken,
                confirm: true,
              });
              await whatsappComposer(root);
              notify(
                "WhatsApp message accepted by Twilio. Delivery confirmation is pending.",
              );
            });
        } catch (error) {
          pane.innerHTML = `<p role="alert">${esc(error.message)}</p>`;
        } finally {
          button.disabled = false;
        }
      });
    }
    const selectedReview = new URLSearchParams(location.search).get("review");
    [...root.querySelectorAll("[data-whatsapp-review]")]
      .find((b) => b.dataset.whatsappReview === selectedReview)
      ?.click();
  } catch (error) {
    root.innerHTML = `<h2>WhatsApp invitations & reminders</h2><p role="alert">${esc(error.message)}</p><button type="button" class="button outline">Retry WhatsApp setup</button>`;
    root
      .querySelector("button")
      .addEventListener("click", () => whatsappComposer(root));
  }
}
