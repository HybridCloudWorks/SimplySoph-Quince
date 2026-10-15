import { api, esc, es, tr, route, submit } from "./client.js";

// Guests write numbers the way they say them: "+1 (817) 555-0199",
// "+52 55 1234 5678", "00 52 …" or "1-817-555-0199". Keep the + and the
// digits; the server checks the number itself. Ten digits without a country
// code could be the US or Mexico, so ask for it instead of guessing.
export function whatsappNumber(value) {
  let v = String(value ?? "")
    .trim()
    .replace(/[\s().\- ]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (/^1\d{10}$/.test(v)) v = "+" + v;
  if (/^\+[1-9]\d{6,14}$/.test(v)) return v;
  throw new Error(
    /^\d{7,}$/.test(v)
      ? tr(
          "Add the country code at the start: +1 for the US and Canada, +52 for Mexico.",
          "Agrega el código de país al inicio: +1 para EE. UU. y Canadá, +52 para México.",
        )
      : tr(
          "Check the number: write + and the country code, then the number, like +1 817 555 0199.",
          "Revisa el número: escribe + y el código de país, y luego el número, como +1 817 555 0199.",
        ),
  );
}

export async function whatsappPreferences(root, defaultPhone = "") {
  root.innerHTML = `<h3>${tr("WhatsApp updates", "Actualizaciones por WhatsApp")}</h3><p role="status">${tr("Loading preferences…", "Cargando preferencias…")}</p>`;
  try {
    const data = await api("whatsapp/consent");
    render(root, data, defaultPhone);
  } catch (error) {
    root.innerHTML = `<h3>${tr("WhatsApp updates", "Actualizaciones por WhatsApp")}</h3><p role="alert">${esc(error.message)}</p>`;
  }
}

function render(root, data, defaultPhone) {
  const preference = data.preference || data;
  const phone = preference.phone || defaultPhone;
  const active =
    preference.consent === true && preference.syncState === "synced";
  const language = preference.language || (es ? "es" : "en");
  root.innerHTML = `<h3>${tr("WhatsApp updates", "Actualizaciones por WhatsApp")}</h3><p>${tr("Optional updates from Simply Soph Media about Sophia’s invitation, RSVP and celebration. WhatsApp is separate from email and SMS. Your RSVP does not require subscribing.", "Actualizaciones opcionales de Simply Soph Media sobre la invitación, respuesta y celebración de Sophia. WhatsApp es independiente del correo y SMS. No necesitas suscribirte para confirmar asistencia.")}</p><p role="status">${active ? tr("Subscribed. Your phone is verified.", "Suscripción activa. Tu teléfono está verificado.") : tr("Not subscribed until your phone is verified in WhatsApp.", "No estarás suscrito hasta verificar tu teléfono en WhatsApp.")}</p><form><label><span id="whatsapp-phone-label">${tr("WhatsApp phone","Teléfono de WhatsApp")}</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" value="${esc(phone)}" placeholder="+1 817 555 0199" maxlength="24" required aria-labelledby="whatsapp-phone-label" aria-describedby="whatsapp-phone-hint"><span class="hint" id="whatsapp-phone-hint">${tr("Include the country code: +1 for the US and Canada, +52 for Mexico. Spaces and dashes are fine.", "Incluye el código de país: +1 para EE. UU. y Canadá, +52 para México. Puedes usar espacios y guiones.")}</span></label><label>${tr("Message language","Idioma de mensajes")}<select name="language"><option value="en"${language === "en" ? " selected" : ""}>English</option><option value="es"${language === "es" ? " selected" : ""}>Español</option></select></label><label class="check"><input type="checkbox" name="consent" required>${tr("I agree to receive invitation links, RSVP reminders and event updates from Simply Soph Media on WhatsApp. Frequency varies. Data charges may apply. I can send STOP to unsubscribe or HELP for assistance.", "Acepto recibir enlaces de invitación, recordatorios de asistencia y actualizaciones del evento de Simply Soph Media por WhatsApp. La frecuencia varía. Pueden aplicarse cargos de datos. Puedo enviar STOP para cancelar o HELP para ayuda.")}</label><p><a href="${route("whatsapp")}">${tr("WhatsApp program details", "Detalles del programa de WhatsApp")}</a> · <a href="${route("privacy")}">${tr("Privacy policy","Política de privacidad")}</a></p><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Save and verify in WhatsApp","Guardar y verificar en WhatsApp")}</button></form><div class="whatsapp-verification" aria-live="polite"></div>${preference.consent === true ? `<button type="button" class="plain-button" data-whatsapp-stop>${tr("Unsubscribe from WhatsApp","Cancelar suscripción de WhatsApp")}</button>` : ""}`;
  submit(root.querySelector("form"), async (form) => {
    const number = whatsappNumber(form.get("phone"));
    const result = await api("whatsapp/consent", {
      phone: number,
      language: form.get("language"),
      consent: form.get("consent") === "on",
    });
    render(root, result, number);
    verification(root, result);
  });
  root
    .querySelector("[data-whatsapp-stop]")
    ?.addEventListener("click", async (event) => {
      // currentTarget is gone after the first await; aria-disabled keeps focus.
      const button = event.currentTarget;
      if (button.getAttribute("aria-disabled")) return;
      button.setAttribute("aria-disabled", "true");
      try {
        const result = await api("whatsapp/consent", {
          phone,
          language,
          consent: false,
        });
        render(root, result, phone);
      } catch (error) {
        root.querySelector(".error[role=alert]").textContent = error.message;
        button.removeAttribute("aria-disabled");
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
    `<p>${tr("One more step: open WhatsApp and send the prepared START message from this phone. Saving this form alone does not subscribe you. Return and refresh this page after sending.", "Un paso más: abre WhatsApp y envía el mensaje START preparado desde este teléfono. Guardar este formulario no completa la suscripción. Después, vuelve y actualiza esta página.")}</p><a class="button outline" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${tr("Verify in WhatsApp","Verificar en WhatsApp")} ↗</a>`;
}
