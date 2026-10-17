import { api, esc, es, tr, route, submit } from "./client.js";
import { terms } from "./lexicon.mjs";

// The program's one name: "WhatsApp updates" / "Avisos por WhatsApp".
const programName = () => esc(es ? terms.whatsappProgram.es : terms.whatsappProgram.en);

// Which channels the server really has on (GET /api/config `channels`). An
// older API, or one that can't be reached, reports nothing: nothing is offered.
async function channels() {
  try {
    return (await api("config")).channels || {};
  } catch {
    return {};
  }
}
// For a US or Canadian number: SMS, but only while the server says SMS is on.
function usNumberMessage(live) {
  const sms =
    live.sms && live.smsKeyword && live.smsNumber
      ? tr(
          ` For a US or Canadian number, text ${live.smsKeyword} to ${live.smsNumber} to get text messages instead.`,
          ` Para un número de Estados Unidos o Canadá, envía ${live.smsKeyword} al ${live.smsNumber} para recibir mensajes de texto.`,
        )
      : "";
  return (
    tr(
      "WhatsApp updates are for numbers outside the US and Canada.",
      "Los avisos por WhatsApp son para números fuera de Estados Unidos y Canadá.",
    ) + sms
  );
}

// Guests write numbers the way they say them: "+52 55 1234 5678",
// "00 52 …" or "1-817-555-0199". Keep the + and the digits; the server checks
// the number itself (and refuses +1, which gets the SMS pointer). Ten digits
// without a country code could be the US or Mexico, so ask for it instead of
// guessing.
export function whatsappNumber(value) {
  let v = String(value ?? "")
    .trim()
    .replace(/[\s().\- ]/g, "");
  if (v.startsWith("00")) v = "+" + v.slice(2);
  if (/^1\d{10}$/.test(v)) v = "+" + v;
  if (/^\+[1-9]\d{6,14}$/.test(v)) return v;
  throw new Error(
    /^\d{7,}$/.test(v)
      ? tr(
          "Add the country code at the start, like +52 for Mexico.",
          "Agrega el código de país al inicio, como +52 para México.",
        )
      : tr(
          "Check the number: write + and the country code, then the number, like +52 55 1234 5678.",
          "Revisa el número: escribe + y el código de país, y luego el número, como +52 55 1234 5678.",
        ),
  );
}

// The WhatsApp card on My account and on the RSVP confirmation. It appears
// only while the server reports WhatsApp as live; otherwise the card (and the
// <details> around it on the confirmation) is removed.
export async function whatsappPreferences(root, defaultPhone = "") {
  const holder = root.closest("details") || root;
  holder.hidden = true;
  const live = await channels();
  if (!live.whatsapp) {
    holder.remove();
    return;
  }
  holder.hidden = false;
  root.innerHTML = `<h3>${programName()}</h3><p role="status">${tr("Loading preferences…", "Cargando preferencias…")}</p>`;
  try {
    const data = await api("whatsapp/consent");
    render(root, data, defaultPhone, live);
  } catch (error) {
    root.innerHTML = `<h3>${programName()}</h3><p role="alert">${esc(error.message)}</p>`;
  }
}

function render(root, data, defaultPhone, live) {
  const preference = data.preference || data;
  // A household's US or Canadian phone is never offered for WhatsApp.
  const phone = preference.phone || (/^\+1/.test(defaultPhone) ? "" : defaultPhone);
  const active =
    preference.consent === true && preference.syncState === "synced";
  const language = preference.language || (es ? "es" : "en");
  root.innerHTML = `<h3>${programName()}</h3><p>${tr("For family and friends outside the US and Canada: optional updates from Simply Soph Media about Sophia’s invitation, RSVP and celebration. WhatsApp is separate from email and SMS. Your RSVP does not require subscribing.", "Para familiares y amigos fuera de Estados Unidos y Canadá: avisos opcionales de Simply Soph Media sobre la invitación, las respuestas y la celebración de los XV de Sophia. WhatsApp es independiente del correo y de los SMS. No necesitas suscribirte para confirmar tu asistencia.")}</p><p role="status">${active ? tr("Subscribed. Your phone is verified.", "Suscripción activa. Tu teléfono está verificado.") : tr("Not subscribed until your phone is verified in WhatsApp.", "Tu suscripción empieza cuando verifiques tu teléfono en WhatsApp.")}</p><form><label><span id="whatsapp-phone-label">${tr("WhatsApp phone","Teléfono de WhatsApp")}</span><input type="tel" name="phone" inputmode="tel" autocomplete="tel" value="${esc(phone)}" placeholder="+52 55 1234 5678" maxlength="24" required aria-labelledby="whatsapp-phone-label" aria-describedby="whatsapp-phone-hint"><span class="hint" id="whatsapp-phone-hint">${tr("Include the country code, like +52 for Mexico. Spaces and dashes are fine.", "Incluye el código de país, como +52 para México. Puedes usar espacios y guiones.")}</span></label><label>${tr("Message language","Idioma de mensajes")}<select name="language"><option value="en"${language === "en" ? " selected" : ""}>English</option><option value="es"${language === "es" ? " selected" : ""}>Español</option></select></label><label class="check"><input type="checkbox" name="consent" required>${tr("I agree to receive invitation links, RSVP reminders and event updates from Simply Soph Media on WhatsApp. Frequency varies. Data charges may apply. I can send STOP to unsubscribe or HELP for assistance.", "Acepto recibir por WhatsApp enlaces de invitación, recordatorios para confirmar y avisos del evento de Simply Soph Media. La frecuencia varía. Pueden aplicarse cargos de datos. Puedo enviar BAJA o STOP para cancelar, y AYUDA o HELP para recibir ayuda.")}</label><p><a class="target" href="${route("whatsapp")}">${tr("How WhatsApp updates work", "Cómo funcionan los avisos por WhatsApp")}</a> · <a class="target" href="${route("privacy")}">${tr("Privacy policy","Política de privacidad")}</a></p><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Save and verify in WhatsApp","Guardar y verificar en WhatsApp")}</button></form><div class="whatsapp-verification" aria-live="polite"></div>${preference.consent === true ? `<button type="button" class="plain-button" data-whatsapp-stop>${tr("Stop WhatsApp updates","Cancelar los avisos por WhatsApp")}</button>` : ""}`;
  submit(root.querySelector("form"), async (form) => {
    const number = whatsappNumber(form.get("phone"));
    let result;
    try {
      result = await api("whatsapp/consent", {
        phone: number,
        language: form.get("language"),
        consent: form.get("consent") === "on",
      });
    } catch (e) {
      // The server refuses +1 numbers; point to SMS when SMS is live.
      if (e.code === "WHATSAPP_US_NUMBER") e.message = usNumberMessage(live);
      throw e;
    }
    render(root, result, number, live);
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
        render(root, result, phone, live);
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
    `<p>${tr("One more step: open WhatsApp and send the prepared START message from this phone. Saving this form alone does not subscribe you. Return and refresh this page after sending.", "Un paso más: abre WhatsApp y envía el mensaje START preparado desde este teléfono. Guardar este formulario no completa la suscripción. Después, vuelve y actualiza esta página.")}</p><a class="button outline" href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${tr("Verify in WhatsApp","Verificar en WhatsApp")} <span aria-hidden="true">↗</span></a>`;
}

// The /whatsapp/ page describes the program at all times (it is the program's
// public description), but offers the sign-up only while WhatsApp is live, and
// mentions SMS only while SMS is live.
export async function whatsappProgramPage() {
  const signup = document.querySelector("[data-whatsapp-signup]");
  if (!signup) return;
  signup.hidden = true;
  let config = null;
  try {
    config = await api("config");
  } catch {
    return; // Unknown: no sign-up button, and no claim either way.
  }
  const live = config.channels;
  if (!live) return; // An API from before `channels`: the same.
  signup.hidden = !live.whatsapp;
  const off = document.querySelector("[data-whatsapp-off]");
  if (off) off.hidden = !!live.whatsapp;
  for (const offer of document.querySelectorAll("[data-sms-offer]")) offer.hidden = !live.sms;
}
