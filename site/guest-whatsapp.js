import { api, esc, es, tr, route, submit } from "./client.js";

export async function whatsappPreferences(root, defaultPhone = "") {
  root.innerHTML = `<h3>${tr("WhatsApp Updates", "Actualizaciones por WhatsApp")}</h3><p role="status">${tr("Loading preferences…", "Cargando preferencias…")}</p>`;
  try {
    const data = await api("whatsapp/consent");
    render(root, data, defaultPhone);
  } catch (error) {
    root.innerHTML = `<h3>${tr("WhatsApp Updates", "Actualizaciones por WhatsApp")}</h3><p role="alert">${esc(error.message)}</p>`;
  }
}

function render(root, data, defaultPhone) {
  const preference = data.preference || data;
  const phone = preference.phone || defaultPhone;
  const active =
    preference.consent === true && preference.syncState === "synced";
  const language = preference.language || (es ? "es" : "en");
  root.innerHTML = `<h3>${tr("WhatsApp Updates", "Actualizaciones por WhatsApp")}</h3><p>${tr("Optional updates from Simply Soph Media about Sophia’s invitation, RSVP and celebration. WhatsApp is separate from email and SMS. Your RSVP does not require subscribing.", "Actualizaciones opcionales de Simply Soph Media sobre la invitación, respuesta y celebración de Sophia. WhatsApp es independiente del correo y SMS. No necesitas suscribirte para confirmar asistencia.")}</p><p role="status">${active ? tr("Subscribed. Your phone is verified.", "Suscripción activa. Tu teléfono está verificado.") : tr("Not subscribed until your phone is verified in WhatsApp.", "No estarás suscrito hasta verificar tu teléfono en WhatsApp.")}</p><form><label>${tr("WhatsApp Phone · Include Country Code", "Teléfono de WhatsApp · Incluye código de país")}<input type="tel" name="phone" autocomplete="tel" value="${esc(phone)}" placeholder="+525512345678" pattern="\\+[1-9][0-9]{6,14}" maxlength="16" required><span class="hint">${tr("Use + followed by the country code and number, without spaces. International numbers are welcome.", "Usa +, el código de país y el número, sin espacios. Aceptamos números internacionales.")}</span></label><label>${tr("Message Language", "Idioma de mensajes")}<select name="language"><option value="en"${language === "en" ? " selected" : ""}>English</option><option value="es"${language === "es" ? " selected" : ""}>Español</option></select></label><label class="check"><input type="checkbox" name="consent" required>${tr("I agree to receive invitation links, RSVP reminders and event updates from Simply Soph Media on WhatsApp. Frequency varies. Data charges may apply. I can send STOP to unsubscribe or HELP for assistance.", "Acepto recibir enlaces de invitación, recordatorios de asistencia y actualizaciones del evento de Simply Soph Media por WhatsApp. La frecuencia varía. Pueden aplicarse cargos de datos. Puedo enviar STOP para cancelar o HELP para ayuda.")}</label><p><a href="${route("whatsapp")}">${tr("WhatsApp Program Details", "Detalles del programa de WhatsApp")}</a> · <a href="${route("privacy")}">${tr("Privacy Policy", "Política de privacidad")}</a></p><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Save And Verify In WhatsApp", "Guardar y verificar en WhatsApp")}</button></form><div class="whatsapp-verification" aria-live="polite"></div>${preference.consent === true ? `<button type="button" class="plain-button" data-whatsapp-stop>${tr("Unsubscribe From WhatsApp", "Cancelar suscripción de WhatsApp")}</button>` : ""}`;
  submit(root.querySelector("form"), async (form) => {
    const result = await api("whatsapp/consent", {
      phone: form.get("phone"),
      language: form.get("language"),
      consent: form.get("consent") === "on",
    });
    render(root, result, form.get("phone"));
    verification(root, result);
  });
  root
    .querySelector("[data-whatsapp-stop]")
    ?.addEventListener("click", async (event) => {
      event.currentTarget.disabled = true;
      try {
        const result = await api("whatsapp/consent", {
          phone,
          language,
          consent: false,
        });
        render(root, result, phone);
      } catch (error) {
        root.querySelector("[role=alert]").textContent = error.message;
        event.currentTarget.disabled = false;
      }
    });
}

function verification(root, data) {
  const url = data.verificationUrl || data.waUrl;
  if (!url || data.consent === true) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "wa.me") return;
  root.querySelector(".whatsapp-verification").innerHTML =
    `<p>${tr("One more step: open WhatsApp and send the prepared START message from this phone. Saving this form alone does not subscribe you. Return and refresh this page after sending.", "Un paso más: abre WhatsApp y envía el mensaje START preparado desde este teléfono. Guardar este formulario no completa la suscripción. Después, vuelve y actualiza esta página.")}</p><a class="button" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${tr("Verify In WhatsApp", "Verificar en WhatsApp")} ↗</a>`;
}
