// My account, signed in: the household's RSVP first, then contact details,
// WhatsApp and messages with us; signing out of every device comes last.
// site/guest.js loads this only for that page (tests/home-weight.test.mjs),
// and hands over what the two share in `page`.
import { api, esc, tr, term, lang, route, field, submit, focusOn, announce } from "./client.js";
import { forgetReply, terms } from "./experience.js";
import { date, dayMonth } from "./datetime.mjs";

const whatsapp = () => import("./guest-whatsapp.js");
// "contact us" in a sentence, as a link to Contact (R-075).
const contactUs = (words) => `<a href="${route("contact")}">${words}</a>`;
function rsvpStatus(inv, page) {
  const r = inv.response,
    open = page.rsvpOpen(inv),
    title = `<h3>${term(terms.yourRsvp)}</h3>`,
    closedOn = esc(date(inv.deadline, lang, { year: false }));
  let body;
  if (!inv.invitationReady)
    body = `<p>${tr("Your invitation hasn’t been sent yet. The RSVP opens here once we send it.", "Tu invitación aún no se ha enviado. Podrás confirmar tu asistencia aquí cuando te la enviemos.")}</p>`;
  else if (!r)
    body = open
      ? `<p>${tr("We haven’t received your RSVP yet.", "Aún no recibimos tu respuesta.")}</p>${page.replyBy(inv.deadline)}<p><a class="button burgundy" href="${route("rsvp")}">${term(terms.rsvpAction)}</a></p>`
      : `<p>${tr(`RSVPs closed on ${closedOn}. To RSVP now, please ${contactUs("contact us")}.`, `Las respuestas cerraron el ${closedOn}. Para confirmar tu asistencia ahora, ${contactUs("escríbenos")}.`)}</p>`;
  else {
    // "Ceremony: 2 adults/teens, 1 child · Dinner: …" (R-090).
    const coming = page.invitedEvents(inv).filter(
        (e) => r.attendance[e].adultsTeens + r.attendance[e].kids > 0,
      ),
      answer = coming.length
        ? coming.map((e) => `${page.eventNames[e]}: ${page.people(r.attendance[e])}`).join(" · ")
        : tr("not attending", "no asistirán"),
      saved = esc(dayMonth(r.submittedAt, lang));
    body = `<p>${answer} — ${tr(`saved ${saved}`, `guardada el ${saved}`)}</p>${
      open
        ? `<p><a class="button outline" href="${route("rsvp")}">${term(terms.changeRsvp)}</a></p>`
        : `<p>${tr(`The RSVP deadline has passed. To change your RSVP, please ${contactUs("contact us")}.`, `La fecha límite ya pasó. Para cambiar tu respuesta, ${contactUs("escríbenos")}.`)}</p>`
    }`;
  }
  return `<section class="card rsvp-status">${title}${body}</section>`;
}
let threadTimer;
export async function accountPage(inv, page) {
  const data = await api("account");
  let { profile } = await api("profile");
  const signedInAs = data.account.email,
    // As on the confirmation; no list of what's coming after a "no".
    next = await page.whatsNext({}, !(inv.response && !page.attendingOf(inv).length));
  page.show(
    `<h2>${esc(data.account.name)}</h2><p class="hint">${tr("Signed in as", "Entraste con")} ${esc(signedInAs)}</p>${rsvpStatus(inv, page)}<div class="row-actions"><a href="${route("reception")}">${tr("Directions", "Cómo llegar")}</a><button id="guest-logout" class="plain-button">${tr("Sign out", "Cerrar sesión")}</button></div><form id="profile-form"><h3>${tr("Contact details", "Datos de contacto")}</h3>${field(tr("Contact email", "Correo de contacto"), "email", { type: "email", value: profile.contact.email, autocomplete: "email", hint: tr(`We use it to reach you about the celebration. You still sign in with ${signedInAs}.`, `Lo usamos para escribirte sobre la celebración. Sigues entrando con ${signedInAs}.`) })}${field(tr("Phone", "Teléfono"), "phone", { type: "tel", inputmode: "tel", autocomplete: "tel", value: profile.contact.phone, max: 40 })}${field(tr("Mailing address", "Dirección postal"), "address", { value: profile.contact.address || "", max: 500, autocomplete: "street-address" })}<p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Save contact details", "Guardar datos")}</button><p class="saved-note" role="status"></p></form>${next}<section id="whatsapp-preferences" class="card" hidden></section><div id="family-chat"></div><div class="account-sign-out"><p class="hint">${tr("Signed in on a computer or phone that isn’t yours?", "¿Entraste en una computadora o teléfono que no es tuyo?")}</p><button id="guest-logout-all" class="button outline">${tr("Sign out on all devices", "Cerrar sesión en todos los dispositivos")}</button></div>`,
  );
  document.querySelector("#guest-logout").onclick = async () => {
    await api("logout", {});
    page.dropAllDrafts();
    forgetReply();
    location.reload();
  };
  document.querySelector("#guest-logout-all").onclick = async () => {
    await api("logout-all", {});
    page.dropAllDrafts();
    forgetReply();
    location.reload();
  };
  const profileForm = document.querySelector("#profile-form"),
    profileNote = profileForm.querySelector(".saved-note");
  submit(profileForm, async (f) => {
    profileNote.textContent = "";
    ({ profile } = await api("profile", {
      ...Object.fromEntries(f),
      version: profile.version,
    }));
    // Said next to the button, where the guest is.
    profileNote.textContent = tr("Contact details saved.", "Datos guardados.");
    focusOn(profileNote);
  });
  await (await whatsapp()).whatsappPreferences(
    document.querySelector("#whatsapp-preferences"),
    profile.contact.phone,
  );
  const box = document.querySelector("#family-chat");
  // Our replies say who wrote them: "Sophia’s family:" (R-090).
  const messagesHtml = (thread) =>
    thread.messages
      .map(
        (m) =>
          `<article class="card"><p>${esc(m.text)}</p>${m.replies.map((r) => `<blockquote><strong>${esc(term(terms.familyReplyLabel))}</strong> ${esc(r.text)}</blockquote>`).join("")}</article>`,
      )
      .join("");
  // The last markup drawn: the browser normalizes innerHTML (quotes, entities),
  // so comparing with it would redraw the thread every minute.
  const first = await api("messages");
  let shown = messagesHtml(first);
  // The thread is not a live region: redrawing it would read the whole thread
  // again. Only replies that weren't there before are announced, one by one.
  const replyKeys = (thread) =>
    thread.messages.flatMap((m) => m.replies.map((r, i) => [`${m.id}#${i}`, r.text]));
  const heard = new Set(replyKeys(first).map(([key]) => key));
  const announceNew = (thread) => {
    const fresh = replyKeys(thread).filter(([key]) => !heard.has(key));
    for (const [key] of fresh) heard.add(key);
    if (fresh.length)
      announce(
        fresh
          .map(([, text]) => tr("We replied: ", "Te respondimos: ") + text)
          .join(" "),
      );
  };
  box.innerHTML = `<h3>${tr("Messages with us", "Mensajes con nosotros")}</h3><div id="thread">${shown}</div><p class="hint">${tr("New replies appear here while this page is open.", "Las respuestas nuevas aparecen aquí mientras esta página esté abierta.")}</p><form id="family-message"><label>${tr("Your message", "Tu mensaje")}<textarea name="text" required maxlength="2000"></textarea></label><p role="alert" class="error"></p><button type="submit" class="button burgundy" data-busy="${tr("Sending…", "Enviando…")}">${tr("Send message", "Enviar mensaje")}</button><p class="saved-note" role="status"></p></form>`;
  const messageForm = document.querySelector("#family-message"),
    messageNote = messageForm.querySelector(".saved-note");
  submit(messageForm, async (f) => {
    messageNote.textContent = "";
    await api("messages", {
      kind: "contact",
      name: data.account.name,
      text: f.get("text"),
    });
    // Only the thread is redrawn; the guest stays at the form.
    const thread = await api("messages");
    document.querySelector("#thread").innerHTML = shown = messagesHtml(thread);
    announceNew(thread);
    messageForm.reset();
    messageNote.textContent = tr(
      "Sent. Our reply will appear here.",
      "Enviado. Nuestra respuesta aparecerá aquí.",
    );
    focusOn(messageNote);
  });
  // FLOW-8: check for replies once a minute while the page is visible. Only
  // the thread is redrawn, so a message being typed is never lost.
  clearInterval(threadTimer);
  threadTimer = setInterval(async () => {
    const thread = document.querySelector("#thread");
    if (!thread) return clearInterval(threadTimer);
    if (document.visibilityState !== "visible") return;
    try {
      // ?poll=1: a background check does not keep the guest signed in.
      const now = await api("messages?poll=1"),
        html = messagesHtml(now);
      if (html !== shown) thread.innerHTML = shown = html;
      announceNew(now);
    } catch {
      clearInterval(threadTimer); // signed out or offline: stop quietly
    }
  }, 60000);
}
