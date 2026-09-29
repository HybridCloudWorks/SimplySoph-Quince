import { api, esc, submit, notify } from "./client.js";

export async function whatsappComposer(root) {
  root.innerHTML =
    '<h2>WhatsApp Invitations & Reminders</h2><p role="status">Checking WhatsApp Setup…</p>';
  try {
    const data = await api("admin/whatsapp/drafts");
    const templates = data.templates || [];
    root.innerHTML = `<h2>WhatsApp Invitations & Reminders</h2><p>Send Approved Templates To Guests Who Have Separately Subscribed And Verified Their WhatsApp Phone. International Numbers Are Supported. Email And SMS Consent Do Not Enroll Guests In WhatsApp.</p><p class="notice">${data.sendingEnabled ? "Review Each Recipient And Template Before Sending. Twilio And Meta Charges May Apply." : "Sending Is Disabled Pending Template Approval And Activation Review. Drafts Can Be Prepared For Review."}</p><form class="card"><h3>Create WhatsApp Drafts</h3><div class="recipient-list"><h4>Distribution Groups</h4>${(data.groups || []).map((group) => `<label class="check"><input type="checkbox" name="group" value="${esc(group)}">${esc(group)}</label>`).join("") || "<p>No Distribution Groups Available.</p>"}<h4>Individuals · Last Name, First Name</h4>${(data.recipients || []).map((recipient) => `<label class="check"><input type="checkbox" name="recipient" value="${esc(recipient.id)}">${esc(recipient.name)} · ${esc(recipient.phone)}</label>`).join("") || "<p>No Verified WhatsApp Subscribers Yet. Guests Can Subscribe In My Account.</p>"}</div><label>Template<select name="templateKey" required><option value="">Choose A Template</option>${templates.map((template) => `<option value="${esc(template.key)}">${esc(template.name || template.key)} · ${esc(template.language)} · ${esc(template.status || "Pending")}</option>`).join("")}</select></label><div class="whatsapp-template-preview" aria-live="polite"></div><p>Each Draft Gets That Household’s Private Invitation Link. Overlapping Group And Individual Selections Are Deduplicated. No Freeform Message Or Guest List Is Sent To Meta For Template Approval.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy"${templates.length ? "" : " disabled"}>Create WhatsApp Drafts For Review</button></form><div class="whatsapp-drafts"><h3>Latest Five WhatsApp Records</h3><a href="/admin/history/?kind=whatsapp">View Full WhatsApp History</a><button type="button" class="button" data-whatsapp-sync>Retry Pending Notion Consent Updates</button><p data-whatsapp-sync-status role="status"></p>${
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
            `<article class="card"><h4>${esc(draft.name || "Guest Invitation")}</h4><p>${esc(draft.to)}</p><p>Review To See The Personalized Message And Private RSVP Link.</p><p>Template: ${esc(draft.templateKey)} · Status: ${esc(draft.delivery || draft.state)}</p>${draft.state === "draft" ? `<button type="button" class="button" data-whatsapp-review="${esc(draft.id)}">Review WhatsApp Message</button><div class="whatsapp-review" aria-live="polite"></div>` : ""}</article>`,
        )
        .join("") || "<p>No WhatsApp Drafts Yet.</p>"
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
            `${result.attempted} Pending Update(s) Retried.`;
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
        ? `<h4>Template Preview</h4><p>${esc(template.text || template.body)}</p><p>Approval: ${esc(template.status || "Pending")}. The Private RSVP Link Is Added To Each Recipient’s Draft.</p>`
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
      notify(`${result.count} WhatsApp Drafts Created. Nothing Sent.`);
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
          pane.innerHTML = `<h4>Review This Recipient</h4><p>${esc(preview.name || "")} · ${esc(preview.to)}</p><p>${esc(preview.text)}</p><p>Template: ${esc(preview.templateKey)}</p>${preview.sendingEnabled && preview.state === "draft" ? '<form><label class="check"><input name="confirm" type="checkbox" required>I Have Reviewed This Recipient And Message</label><p>Sending May Incur Charges. This Sends Only The Message Shown Above.</p><p class="error" role="alert"></p><button type="submit" class="button burgundy">Send This WhatsApp Message</button></form>' : "<p>Sending Is Not Available. Confirm Template Approval, Activation And Current Consent.</p>"}`;
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
                "WhatsApp Message Accepted By Twilio. Delivery Confirmation Is Pending.",
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
    root.innerHTML = `<h2>WhatsApp Invitations & Reminders</h2><p role="alert">${esc(error.message)}</p><button type="button" class="button">Retry WhatsApp Setup</button>`;
    root
      .querySelector("button")
      .addEventListener("click", () => whatsappComposer(root));
  }
}
