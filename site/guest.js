import { whatsappPreferences } from "./guest-whatsapp.js";
import { mediaUpload } from "./media-upload.js";
import { experienceReady, eventContent, liveContent } from "./experience.js";
import {
  registryCards,
  contactTopics,
  contactTopicsEn,
  contactTopicsEs,
  calendarLink,
  localTime,
} from "./celebration.mjs";
import {
  api,
  esc,
  es,
  tr,
  route,
  field,
  submit,
  checkForm,
  focusOn,
  linkFragment,
  reloadOnNewLink,
} from "./client.js";
import {
  startMicrosoft,
  microsoftReturn,
  finishMicrosoft,
  ssoRow,
  googleButton,
} from "./sso.js";
const portal = document.querySelector("#portal");
const eventNames = {
  ceremony: tr("Ceremony", "Ceremonia"),
  dinner: tr("Dinner", "Cena"),
  dance: tr("Reception & dance", "Recepción y baile"),
};
// The page's own title ("Your invitation · Sophia"); a step's heading goes in front.
const pageTitle = document.title;
let settled = false;
// Puts a step in the portal and names it in the tab title. After the first
// step (the page load), focus moves to the new heading or message, so
// keyboard and screen-reader users land on what changed.
function show(html, { focus = settled } = {}) {
  portal.innerHTML = html;
  settled = true;
  const heading = portal.querySelector("h2");
  document.title = heading ? `${heading.textContent.trim()} · ${pageTitle}` : pageTitle;
  if (focus)
    focusOn(
      heading ||
        portal.querySelector("[role=alert]:not(:empty),[role=status]:not(:empty),.notice"),
    );
}
const statusError = (message) =>
  `<p class="notice" role="alert">${esc(message)}</p><a href="${route("contact")}">${tr("Contact us", "Escríbenos")}</a>`;
let configured = null;
const config = () =>
  (configured ??= api("config").catch((e) => {
    configured = null;
    throw e;
  }));
// Dates as the family reads them, in Central time (the deadline is 11:59 PM
// Central, which is already the next day in some time zones).
const dateIn = (iso, options) =>
  new Date(iso)
    .toLocaleDateString(es ? "es-US" : "en-US", { timeZone: "America/Chicago", ...options })
    .replace(es ? /^(\p{L}+),/u : /$^/, "$1");
const monthDay = (iso) => dateIn(iso, { month: "long", day: "numeric" });
// Same cut-off as the server: at the deadline itself, answers are closed.
const rsvpOpen = (inv) => Date.now() < Date.parse(inv.deadline);
// "Please reply by Sunday, November 15", on the form and the code entry, until
// the deadline passes.
function replyBy(deadline) {
  if (!(Date.now() < Date.parse(deadline))) return "";
  const day = esc(dateIn(deadline, { weekday: "long", month: "long", day: "numeric" }));
  return `<p class="deadline">${tr(`Please reply by <strong>${day}</strong>.`, `Fecha límite para responder: <strong>${day}</strong>.`)}</p>`;
}
const adults = (n) =>
  `${n} ${n === 1 ? tr("adult/teen", "adulto/joven") : tr("adults/teens", "adultos/jóvenes")}`;
const children = (n) => `${n} ${n === 1 ? tr("child", "niño") : tr("children", "niños")}`;
const people = (v) =>
  [v.adultsTeens && adults(v.adultsTeens), v.kids && children(v.kids)]
    .filter(Boolean)
    .join(", ") || tr("not attending", "no asistirán");
// Only the events on the household's invitation are asked about or listed.
const invitedEvents = (inv) => Object.keys(eventNames).filter((e) => inv.invited[e]);
function summary(attendance, inv) {
  return `<ul class="summary-list">${invitedEvents(inv)
    .map((e) => `<li><strong>${eventNames[e]}:</strong> ${people(attendance[e])}</li>`)
    .join("")}</ul>`;
}
// After an emailed sign-in link, the guest comes back to the page they asked
// from; server/accounts.mjs keeps the same list. My account can be opened for
// another page with ?return=share.
const returnPages = ["account", "rsvp", "share", "guestbook", "contact", "gallery"];
function returnPage() {
  const view = portal.dataset.view.split("/")[0],
    asked = new URLSearchParams(location.search).get("return");
  const page =
    view === "account" && returnPages.includes(asked)
      ? asked
      : returnPages.includes(view)
        ? view
        : "account";
  return (es ? "es/" : "") + page;
}
// My account opened for another page keeps it when the language changes, so
// the sign-in still brings the guest back there.
const returnAsked = new URLSearchParams(location.search).get("return"),
  languageSwitch = document.querySelector(".lang-switch");
if (portal?.dataset.view === "account" && returnPages.includes(returnAsked) && languageSwitch)
  languageSwitch.setAttribute("href", languageSwitch.getAttribute("href") + "?return=" + returnAsked);
// Opens the page a sign-in started from ("es/share"), unless it is this one.
function goBack(name) {
  const m = /^(es\/)?([a-z]+)$/.exec(name || "");
  if (!m || !returnPages.includes(m[2]) || m[2] === "account") return false;
  location.assign("/" + name + "/");
  return true;
}
// Two ways in, matching the owner's model: the private invitation link or code
// opens the RSVP; signing in with the household's email (emailed link, Microsoft
// or Google) opens everything else. There is no registration step.
const emailSignInHtml = () =>
  `<h2>${tr("Sign in with your email", "Entra con tu correo")}</h2><form id="email-login">${field(tr("Email", "Correo electrónico"), "email", { type: "email", required: true, autocomplete: "email", hint: tr("Use the email where you received your invitation. We’ll email you a one-time link — no password needed.", "Usa el correo donde recibiste tu invitación. Te enviaremos un enlace de un solo uso; no necesitas contraseña.") })}<p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Email my sign-in link", "Enviar enlace de acceso")}</button></form>`;
function wireEmailSignIn() {
  submit(document.querySelector("#email-login"), async (data) => {
    await api("auth/email/request", { email: data.get("email"), return: returnPage() });
    // The same answer whether or not the address is on the list.
    show(
      `<div class="notice" role="status"><h2>${tr("Check your email", "Revisa tu correo")}</h2><p>${tr("If this email is on the guest list, a sign-in link is on its way. Check your inbox and spam folder; the link expires in 15 minutes.", "Si este correo está en la lista de invitados, te enviamos un enlace de acceso. Revisa tu bandeja de entrada y el correo no deseado; el enlace vence en 15 minutos.")}</p></div><p><a href="${esc(location.pathname + location.search)}">${tr("Back to sign-in", "Volver al acceso")}</a></p>`,
    );
  });
  // Microsoft returns only to My account, so the buttons live there.
  if (document.body.dataset.route === "account") ssoChoices();
  else
    portal.insertAdjacentHTML(
      "beforeend",
      `<p><a href="${route("account")}?return=${returnPage().replace(/^es\//, "")}">${tr("Sign in with Microsoft or Google instead", "O entra con Microsoft o Google")}</a></p>`,
    );
}
// What a guest may paste: the whole link, with or without https:// (even
// wrapped in <> or split over lines by a mail app), the part after the #, or
// the code from the invitation. Returns the credential and any quick answer.
function invitationFrom(text) {
  let value = String(text)
    .replace(/\s+/g, "")
    .replace(/^[<"']+|[>"'.,;]+$/g, "");
  const at = value.indexOf("#");
  if (at >= 0) {
    const address = value.slice(0, at);
    if (address) {
      let url = null;
      try {
        url = new URL(/^https?:\/\//i.test(address) ? address : "https://" + address);
      } catch {
        /* not an address: refused below */
      }
      if (url?.host !== location.host)
        throw new Error(
          tr(
            "Use the link from your invitation to this website.",
            "Usa el enlace de tu invitación a este sitio.",
          ),
        );
    }
    value = value.slice(at + 1);
  } else if (/[/:]/.test(value))
    throw new Error(
      tr(
        "This link is missing its private part (after the #). Use the RSVP button in your invitation email, or type the code from your invitation.",
        "A este enlace le falta su parte privada (después del #). Usa el botón para responder de tu correo de invitación, o escribe el código de tu invitación.",
      ),
    );
  const [token, answer] = value.split(".");
  return { token, answer: ["yes", "no"].includes(answer) ? answer : null };
}
function accessForm(value = "", reason = "") {
  show(
    `${reason ? `<p class="notice" role="alert">${esc(reason)}</p>` : ""}${anyDraft() ? `<p class="notice" role="status">${tr("Your answers are kept in this tab. Open your invitation email again, or paste its link below, to finish.", "Tus respuestas siguen guardadas en esta pestaña. Abre de nuevo tu correo de invitación, o pega el enlace aquí abajo, para terminar.")}</p>` : ""}<h2>${tr("Open your invitation", "Abre tu invitación")}</h2><p>${tr("The private link in your invitation opens your RSVP. You can also paste that link, or type the code from your invitation, below.", "El enlace privado de tu invitación abre tu respuesta. También puedes pegar ese enlace, o escribir el código de tu invitación, aquí abajo.")}</p><form id="access">${field(tr("Invitation link or code", "Enlace o código de invitación"), "token", { value, required: true, max: 1000, hint: tr("For example misxv.simplysoph.com/rsvp/#… from your invitation email or message.", "Por ejemplo misxv.simplysoph.com/rsvp/#… de tu correo o mensaje de invitación."), attrs: 'autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"' })}<p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Continue", "Continuar")}</button></form><hr>${emailSignInHtml()}`,
  );
  config()
    .then((c) =>
      portal.querySelector("#access")?.insertAdjacentHTML("beforebegin", replyBy(c.deadline)),
    )
    .catch(() => {});
  submit(document.querySelector("#access"), async (data) => {
    const { token, answer } = invitationFrom(data.get("token"));
    await api("invitation-session", { token });
    if (answer) quickAnswer = answer;
    await showPortal();
  });
  wireEmailSignIn();
}
// Signed out on a page for messages or uploads: the email sign-in, and on the
// contact page a reminder that plain email works too.
function signedOut(view) {
  show(
    `<p class="notice">${
      view === "contact"
        ? tr(
            "You can email us at the address above. To send a message here, sign in with your email.",
            "Puedes escribirnos al correo de arriba. Para enviar un mensaje aquí, entra con tu correo.",
          )
        : tr("Sign in with your email to continue.", "Entra con tu correo para continuar.")
    }</p>${emailSignInHtml()}`,
  );
  wireEmailSignIn();
}
// An invitation link opens only the RSVP; anything else asks for the email sign-in.
function signInOnly() {
  show(
    `<p class="notice">${tr("Your invitation link opens your RSVP. To share photos, send messages or update your details, sign in with your email.", "Tu enlace de invitación abre tu respuesta. Para compartir fotos, enviar mensajes o actualizar tus datos, entra con tu correo.")}</p>${emailSignInHtml()}`,
  );
  wireEmailSignIn();
}
async function ssoChoices() {
  let cfg;
  try {
    cfg = await config();
  } catch {
    return;
  }
  if (!cfg.microsoftClientId && !cfg.clientId) return;
  portal.insertAdjacentHTML(
    "beforeend",
    `<div class="sso-choices"><h2>${tr("Or sign in with", "O entra con")}</h2>${ssoRow({
      microsoft:
        cfg.microsoftClientId &&
        tr("Sign in with Microsoft", "Iniciar sesión con Microsoft"),
      google: !!cfg.clientId,
      note: tr(
        "Use the Microsoft or Google account with the email where you received your invitation. No code or password needed.",
        "Usa la cuenta de Microsoft o Google con el correo donde recibiste tu invitación. No necesitas código ni contraseña.",
      ),
    })}<p class="error" role="alert" id="sso-error"></p></div>`,
  );
  // Sign-in problems are shown here, next to the buttons.
  const failed = (message) => {
    const box = portal.querySelector("#sso-error");
    if (box) box.textContent = message;
  };
  const back = returnPage();
  const ms = portal.querySelector('[data-sso="microsoft"]');
  if (ms)
    ms.onclick = () =>
      startMicrosoft(cfg.microsoftClientId, "guest", back).catch((e) =>
        failed(e.message),
      );
  if (cfg.clientId)
    googleButton(
      portal.querySelector('[data-sso="google"]'),
      cfg.clientId,
      "guest",
      async (credential, ticket) => {
        try {
          await api("auth/sso/guest", { provider: "google", credential, ticket });
          if (!goBack(back)) await showPortal();
        } catch (e) {
          failed(e.message);
        }
      },
      failed,
    );
}
// My account: the household's RSVP first, then contact details, WhatsApp and
// messages; signing out of every device comes last.
function rsvpStatus(inv) {
  const r = inv.response,
    open = rsvpOpen(inv),
    title = `<h3>${tr("Your RSVP", "Tu respuesta")}</h3>`;
  let body;
  if (!inv.invitationReady)
    body = `<p>${tr("Your invitation hasn’t been sent yet. The RSVP opens here once we send it.", "Tu invitación aún no se ha enviado. Podrás responder aquí cuando te la enviemos.")}</p>`;
  else if (!r)
    body = open
      ? `<p>${tr("You haven’t replied yet.", "Aún no has respondido.")}</p>${replyBy(inv.deadline)}<p><a class="button burgundy" href="${route("rsvp")}">${tr("RSVP now", "Responder ahora")}</a></p>`
      : `<p>${tr("You didn’t reply before the deadline. To answer now, please contact us.", "No respondiste antes de la fecha límite. Para responder ahora, escríbenos.")}</p>`;
  else {
    const coming = invitedEvents(inv).filter(
        (e) => r.attendance[e].adultsTeens + r.attendance[e].kids > 0,
      ),
      answer = coming.length
        ? coming.map((e) => `${eventNames[e]} ${people(r.attendance[e])}`).join(" · ")
        : tr("not attending", "no asistirán"),
      saved = esc(dateIn(r.submittedAt, { month: "short", day: "numeric" }));
    body = `<p>${answer} — ${tr(`saved ${saved}`, `guardada el ${saved}`)}</p>${
      open
        ? `<p><a class="button outline" href="${route("rsvp")}">${tr("Change your RSVP", "Cambiar tu respuesta")}</a></p>`
        : `<p>${tr("The RSVP deadline has passed. To change your answer, please contact us.", "La fecha límite ya pasó. Para cambiar tu respuesta, escríbenos.")}</p>`
    }`;
  }
  return `<section class="card rsvp-status">${title}${body}</section>`;
}
async function accountPage(inv) {
  const data = await api("account");
  let { profile } = await api("profile");
  const signedInAs = data.account.email;
  show(
    `<h2>${esc(data.account.name)}</h2><p class="hint">${tr("Signed in as", "Entraste con")} ${esc(signedInAs)}</p>${rsvpStatus(inv)}<div class="row-actions"><a href="${route("reception")}">${tr("Directions", "Cómo llegar")}</a><button id="guest-logout" class="plain-button">${tr("Sign out", "Cerrar sesión")}</button></div><form id="profile-form"><h3>${tr("Contact details", "Datos de contacto")}</h3>${field(tr("Contact email", "Correo de contacto"), "email", { type: "email", value: profile.contact.email, autocomplete: "email", hint: tr(`We use it to reach you about the celebration. You still sign in with ${signedInAs}.`, `Lo usamos para escribirte sobre la celebración. Sigues entrando con ${signedInAs}.`) })}${field(tr("Phone", "Teléfono"), "phone", { type: "tel", inputmode: "tel", autocomplete: "tel", value: profile.contact.phone, max: 40 })}${field(tr("Mailing address", "Dirección postal"), "address", { value: profile.contact.address || "", max: 500, autocomplete: "street-address" })}<p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Save contact details", "Guardar datos")}</button><p class="saved-note" role="status"></p></form><section id="whatsapp-preferences" class="card"></section><div id="family-chat"></div><div class="account-sign-out"><p class="hint">${tr("Signed in on a computer or phone that isn’t yours?", "¿Entraste en una computadora o teléfono que no es tuyo?")}</p><button id="guest-logout-all" class="button outline">${tr("Sign out on all devices", "Cerrar sesión en todos los dispositivos")}</button></div>`,
  );
  document.querySelector("#guest-logout").onclick = async () => {
    await api("logout", {});
    dropAllDrafts();
    location.reload();
  };
  document.querySelector("#guest-logout-all").onclick = async () => {
    await api("logout-all", {});
    dropAllDrafts();
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
  await whatsappPreferences(
    document.querySelector("#whatsapp-preferences"),
    profile.contact.phone,
  );
  const box = document.querySelector("#family-chat");
  const messagesHtml = (thread) =>
    thread.messages
      .map(
        (m) =>
          `<article class="card"><p>${esc(m.text)}</p>${m.replies.map((r) => `<blockquote><strong>${tr("Family", "Familia")}:</strong> ${esc(r.text)}</blockquote>`).join("")}</article>`,
      )
      .join("");
  // The last markup drawn: the browser normalizes innerHTML (quotes, entities),
  // so comparing with it would redraw, and re-announce, the thread every minute.
  let shown = messagesHtml(await api("messages"));
  box.innerHTML = `<h3>${tr("Messages with us", "Mensajes con nosotros")}</h3><div id="thread" aria-live="polite">${shown}</div><p class="hint">${tr("New replies appear here while this page is open.", "Las respuestas nuevas aparecen aquí mientras esta página esté abierta.")}</p><form id="family-message"><label>${tr("Your message", "Tu mensaje")}<textarea name="text" required maxlength="2000"></textarea></label><p role="alert" class="error"></p><button type="submit" class="button burgundy">${tr("Send message", "Enviar mensaje")}</button><p class="saved-note" role="status"></p></form>`;
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
    document.querySelector("#thread").innerHTML = shown = messagesHtml(await api("messages"));
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
      const html = messagesHtml(await api("messages?poll=1"));
      if (html !== shown) thread.innerHTML = shown = html;
    } catch {
      clearInterval(threadTimer); // signed out or offline: stop quietly
    }
  }, 60000);
}
let threadTimer;
// "Your invitation includes up to 2 adults/teens and 1 child."
function allocation(capacity) {
  const most = adults(capacity.adultsTeens),
    kids = capacity.kids ? children(capacity.kids) : "";
  return tr(
    `Your invitation includes up to ${most}${kids ? ` and ${kids}` : ""}.`,
    `Su invitación incluye hasta ${most}${kids ? ` y ${kids}` : ""}.`,
  );
}
// "Ceremony · 4:00 PM · Our Lady of Guadalupe Church", from the event settings.
function eventLegend(e) {
  const c = eventContent,
    start = { ceremony: c.ceremony.start, dinner: c.dinner.start, dance: c.reception.start }[e],
    place = e === "ceremony" ? c.ceremony.name : c.reception.name;
  return `<span class="event-name">${eventNames[e]}</span> <span class="event-when">· ${esc(localTime(start, es ? "es" : "en"))} · ${esc(place)}</span>`;
}
function countField(event, key, max, value) {
  const label = key === "kids" ? tr("Children", "Niños") : tr("Adults / teens", "Adultos / jóvenes");
  return `<label>${label}<select name="${event}.${key}" id="rsvp-${event}-${key}" required data-label="${esc(`${eventNames[event]} – ${label}`)}" data-check="${esc(tr("Choose how many for:", "Elijan cuántos para:"))}"><option value="">${tr("Choose a number", "Elegir cantidad")}</option>${Array.from({ length: max + 1 }, (_, n) => `<option value="${n}"${String(n) === String(value) ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
}
// Set from an email quick-answer link (#token.yes / #token.no): the page opens
// on the review step with every count filled in. Nothing is saved until the
// guest taps Save, so a link scanner opening the link cannot RSVP.
let quickAnswer = null;
// The RSVP on screen, for Back and Forward between the form and the review.
let current = null;
// Everyone on the invitation ("yes") or nobody ("no"), for each invited event.
function everyone(inv, answer) {
  const attendance = {};
  for (const e of invitedEvents(inv))
    attendance[e] =
      answer === "yes"
        ? { adultsTeens: inv.capacity.adultsTeens, kids: inv.capacity.kids }
        : { adultsTeens: 0, kids: 0 };
  return attendance;
}
// The answers shown in the form: { attendance, contact, requests }.
function startingValues(inv) {
  return {
    attendance: structuredClone(inv.response?.attendance || {}),
    contact: inv.contactHidden ? null : { ...inv.contact },
    requests: inv.response?.requests || "",
  };
}
const chosen = (n) => n !== "" && n !== null && n !== undefined;
const complete = (inv, values) =>
  invitedEvents(inv).every(
    (e) =>
      chosen(values.attendance?.[e]?.adultsTeens) &&
      (!inv.capacity.kids || chosen(values.attendance[e].kids)),
  );
// What is saved: every event (zero for those not on the invitation, and for
// children when the invitation has none).
function answerFrom(inv, values) {
  const attendance = {};
  for (const e of Object.keys(eventNames)) {
    const v = inv.invited[e] ? values.attendance?.[e] : null;
    attendance[e] = {
      adultsTeens: Number(v?.adultsTeens) || 0,
      kids: inv.capacity.kids ? Number(v?.kids) || 0 : 0,
    };
  }
  return {
    previousSubmissionId: inv.previousSubmissionId,
    attendance,
    contact: inv.contactHidden
      ? { email: "", phone: "", address: null }
      : {
          email: values.contact?.email || "",
          phone: values.contact?.phone || "",
          address: values.contact?.address || null,
        },
    requests: values.requests || "",
  };
}
// The answers being filled in stay in this tab (sessionStorage), per
// household, so a reload, a switch to the other language or Back keeps them;
// a successful save clears them. Only answers are kept, never a link or code.
// Without the household's id (an API older than this page) nothing is kept,
// so one household's answers can never fill another's form in the same tab.
const draftKey = (inv) => (inv.householdId ? "misxv-rsvp:" + inv.householdId : null);
// A kept draft is used only if it fits this invitation: its events, and no
// more people than the seats saved for each.
const seats = (n, most) => n === "" || (Number.isInteger(Number(n)) && n >= 0 && n <= most);
function fits(inv, draft) {
  const attendance = draft?.attendance;
  return (
    !!attendance &&
    typeof attendance === "object" &&
    Object.entries(attendance).every(
      ([e, v]) =>
        invitedEvents(inv).includes(e) &&
        seats(v?.adultsTeens ?? "", inv.capacity.adultsTeens) &&
        seats(v?.kids ?? "", inv.capacity.kids),
    ) &&
    typeof (draft.requests ?? "") === "string" &&
    typeof (draft.contact ?? {}) === "object"
  );
}
function readDraft(inv) {
  const key = draftKey(inv);
  if (!key) return null;
  try {
    const draft = JSON.parse(sessionStorage.getItem(key));
    if (draft === null || fits(inv, draft)) return draft;
    sessionStorage.removeItem(key);
  } catch {
    /* storage is off or the draft is damaged: start from the saved answer */
  }
  return null;
}
function keepDraft(inv, values) {
  if (!draftKey(inv)) return;
  try {
    sessionStorage.setItem(draftKey(inv), JSON.stringify(values));
  } catch {
    /* storage is off: the form still works, it just isn't kept */
  }
}
function dropDraft(inv) {
  if (!draftKey(inv)) return;
  try {
    sessionStorage.removeItem(draftKey(inv));
  } catch {
    /* nothing was kept */
  }
}
// Signing out leaves none of the household's answers (contact details
// included) in this tab for the next person to use it.
function dropAllDrafts() {
  try {
    for (const key of Object.keys(sessionStorage))
      if (key.startsWith("misxv-rsvp")) sessionStorage.removeItem(key);
  } catch {
    /* nothing was kept */
  }
}
function anyDraft() {
  try {
    return Object.keys(sessionStorage).some((k) => k.startsWith("misxv-rsvp:"));
  } catch {
    return false;
  }
}
function formValues(form, inv) {
  const data = new FormData(form),
    attendance = {};
  for (const e of invitedEvents(inv))
    attendance[e] = {
      adultsTeens: data.get(e + ".adultsTeens") ?? "",
      kids: inv.capacity.kids ? (data.get(e + ".kids") ?? "") : 0,
    };
  return {
    attendance,
    contact: inv.contactHidden
      ? null
      : {
          email: data.get("email") || "",
          phone: data.get("phone") || "",
          address: data.get("address") || "",
        },
    requests: data.get("requests") || "",
  };
}
// The session ended while the page was open (a long pause, or a newer link
// opened elsewhere). The answers stay on the page and in this tab. Once the
// guest opens their invitation, or signs in, again in any tab, coming back to
// this one picks up that session, and Save works.
function timedOut(inv, box) {
  const alert = box.querySelector(".error[role=alert]"),
    note = box.querySelector(".resume-note");
  alert.textContent = inv.contactHidden
    ? tr(
        "Your invitation link timed out. Open your invitation email again; your answers are kept here.",
        "El enlace de su invitación venció. Abran de nuevo su correo de invitación; sus respuestas siguen aquí.",
      )
    : tr(
        "Your sign-in timed out. Sign in again; your answers are kept here.",
        "Tu acceso venció. Vuelve a entrar; tus respuestas siguen aquí.",
      );
  if (!inv.contactHidden) {
    const a = document.createElement("a");
    a.href = route("account") + "?return=rsvp";
    a.target = "_blank";
    a.textContent = tr("Sign in in a new tab", "Entrar en otra pestaña");
    alert.append(" ", a);
  }
  if (alert.dataset.waiting) return;
  alert.dataset.waiting = "1";
  const stop = () => {
    delete alert.dataset.waiting;
    removeEventListener("focus", resume);
    document.removeEventListener("visibilitychange", resume);
  };
  async function resume() {
    if (!alert.isConnected) return stop();
    if (document.visibilityState !== "visible") return;
    let now;
    try {
      if ((await api("session")).kind !== "guest") return;
      now = await api("invitation");
    } catch {
      return;
    }
    if (now.householdId !== inv.householdId) return;
    stop();
    // A different kind of session (say, an email sign-in instead of the
    // link) shows other fields: check the form again rather than save blind.
    if (now.contactHidden !== inv.contactHidden) {
      rsvpForm(now, readDraft(now) || current.values);
      return;
    }
    inv.previousSubmissionId = now.previousSubmissionId;
    alert.textContent = "";
    note.textContent = tr(
      "You’re back in, and your answers are still here.",
      "Ya volvieron a entrar y sus respuestas siguen aquí.",
    );
  }
  addEventListener("focus", resume);
  document.addEventListener("visibilitychange", resume);
}
// While a guest fills in the form, the page checks in now and then: that
// request keeps the session open (link and email sessions renew while used).
// If the session has already ended, say so now rather than after Save.
let checkedAt = Date.now();
function stillHere(inv, form) {
  if (Date.now() - checkedAt < 300000) return;
  checkedAt = Date.now();
  api("session").then(
    (s) => {
      if (s.kind !== "guest" && form.isConnected) timedOut(inv, form);
    },
    () => {},
  );
}
// The server's own test for a contact email (server/rsvp-validation.mjs), so
// the form catches "name@family" too, not only an address without an @.
const emailPattern = 'pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"';
function rsvpForm(inv, values, { restored = false } = {}) {
  current = { inv, values };
  const contact = values.contact || inv.contact || {};
  show(
    `<h2>${esc(inv.name)}</h2><p class="allocation">${allocation(inv.capacity)}</p>${replyBy(inv.deadline)}${restored ? `<p class="notice" role="status">${tr("We kept the answers you started.", "Guardamos las respuestas que empezaron.")}</p>` : ""}<div class="quick-answers"><button type="button" class="button burgundy" data-quick="yes">${tr("Everyone’s coming", "Vamos todos")}</button><button type="button" class="button outline" data-quick="no">${tr("We can’t make it", "No podremos asistir")}</button></div><p>${tr("Or choose how many will come to each part of the celebration.", "O elijan cuántos irán a cada parte de la celebración.")}</p><form id="response">${invitedEvents(
      inv,
    )
      .map(
        (e) =>
          `<fieldset><legend>${eventLegend(e)}</legend><div class="field-grid">${countField(e, "adultsTeens", inv.capacity.adultsTeens, values.attendance?.[e]?.adultsTeens)}${inv.capacity.kids ? countField(e, "kids", inv.capacity.kids, values.attendance?.[e]?.kids) : ""}</div></fieldset>`,
      )
      .join("")}${
      inv.contactHidden
        ? `<p class="hint">${tr("To change your contact details, sign in with your email on My account.", "Para cambiar sus datos de contacto, entren con su correo en Mi cuenta.")}</p>`
        : `<div class="field-grid">${field(tr("Email", "Correo electrónico"), "email", { type: "email", value: contact.email, autocomplete: "email", attrs: emailPattern })}${field(tr("Phone (optional)", "Teléfono (opcional)"), "phone", { type: "tel", inputmode: "tel", value: contact.phone, max: 40, autocomplete: "tel" })}</div>${field(tr("Mailing address (optional)", "Dirección postal (opcional)"), "address", { value: contact.address || "", max: 500, autocomplete: "street-address" })}`
    }<label>${tr("Dietary/accessibility needs or song request (optional)", "Necesidades alimentarias/de accesibilidad o canción (opcional)")}<textarea name="requests" maxlength="1000">${esc(values.requests || "")}</textarea></label><p class="resume-note" role="status"></p><p class="error" role="alert"></p><button class="button burgundy" type="submit">${tr("Review response", "Revisar respuesta")}</button></form>`,
  );
  const form = portal.querySelector("#response");
  const keep = () => {
    current.values = formValues(form, inv);
    keepDraft(inv, current.values);
    stillHere(inv, form);
  };
  form.addEventListener("input", keep);
  form.addEventListener("change", keep);
  for (const button of portal.querySelectorAll("[data-quick]"))
    button.addEventListener("click", () => {
      // The button fills the counts; the contact details typed are checked
      // here, since the review has no field to fix them in.
      if (!checkForm(form, (control) => control.tagName !== "SELECT")) return;
      const quick = { ...formValues(form, inv), attendance: everyone(inv, button.dataset.quick) };
      keepDraft(inv, quick);
      review(inv, quick);
    });
  submit(form, async () => {
    const answers = formValues(form, inv);
    keepDraft(inv, answers);
    review(inv, answers);
  });
}
// The review step has its own history entry, so the browser's Back returns
// to the form instead of leaving the site.
function review(inv, values, { push = true } = {}) {
  current = { inv, values };
  const input = answerFrom(inv, values),
    details = [
      !inv.contactHidden &&
        input.contact.email &&
        `<p>${tr("Contact email", "Correo de contacto")}: ${esc(input.contact.email)}</p>`,
      input.requests &&
        `<p>${tr("Needs or song request", "Necesidades o canción")}: ${esc(input.requests)}</p>`,
    ]
      .filter(Boolean)
      .join("");
  show(
    `<h2>${tr("Review your response", "Revisen su respuesta")}</h2>${summary(input.attendance, inv)}${details}<p class="resume-note" role="status"></p><p class="error" role="alert"></p><div class="row-actions"><button type="button" id="confirm" class="button burgundy">${tr("Save my RSVP", "Guardar mi respuesta")}</button><button type="button" id="edit" class="button outline">${tr("Change counts", "Cambiar cantidades")}</button></div>`,
  );
  if (push) {
    // The entry left behind is the form's, even when an in-page link (the
    // skip link's #main) made it.
    if (history.state?.rsvp !== "form") history.replaceState({ rsvp: "form" }, "");
    history.pushState({ rsvp: "review" }, "");
  }
  const alert = portal.querySelector("[role=alert]"),
    note = portal.querySelector(".resume-note"),
    save = portal.querySelector("#confirm");
  portal.querySelector("#edit").onclick = () => {
    if (history.state?.rsvp === "review") history.back();
    else rsvpForm(inv, values);
  };
  // One key per reviewed answer: tapping Save twice still saves once.
  const key = crypto.randomUUID();
  let busy = false;
  save.onclick = async () => {
    if (busy) return;
    busy = true;
    // aria-disabled, not disabled: disabling the focused button would drop focus.
    save.setAttribute("aria-disabled", "true");
    alert.replaceChildren();
    note.textContent = "";
    try {
      await api("rsvp", answerFrom(inv, values), { headers: { "Idempotency-Key": key } });
      dropDraft(inv);
      try {
        sessionStorage.setItem("misxv-rsvp-saved", "1");
      } catch {
        /* the confirmation just won't take focus */
      }
      location.assign(route("rsvp/confirmed"));
      return;
    } catch (err) {
      if (["SIGN_IN_REQUIRED", "CSRF_REJECTED"].includes(err.code)) timedOut(inv, portal);
      else alert.textContent = err.message;
    }
    busy = false;
    save.removeAttribute("aria-disabled");
  };
}
// Only the RSVP's own entries change the step: an in-page anchor (the skip
// link) adds an entry without one and leaves the step on screen.
addEventListener("popstate", (e) => {
  const step = e.state?.rsvp;
  if (!current || portal?.dataset.view !== "rsvp" || !["form", "review"].includes(step)) return;
  const { inv } = current,
    values = readDraft(inv) || current.values;
  if (step === "review") {
    if (complete(inv, values)) review(inv, values, { push: false });
  } else rsvpForm(inv, values);
});
function rsvpClosed(inv) {
  const until = monthDay(inv.deadline);
  const answered = inv.response
    ? `<p>${tr("Your saved answer:", "Su respuesta guardada:")}</p>${summary(inv.response.attendance, inv)}`
    : "";
  return `<div class="notice"><h2>${tr("RSVPs are closed", "Las respuestas están cerradas")}</h2><p>${tr(`RSVPs closed on ${until}. To answer or change your answer now, please contact us.`, `Las respuestas cerraron el ${until}. Para responder o cambiar su respuesta, escríbannos.`)}</p>${answered}<p><a class="button burgundy" href="${route("contact")}">${tr("Contact us", "Escríbannos")}</a></p></div>`;
}
// The page after saving adapts to the answer: attending households get only
// the calendars and directions they need; declining households get a warm note.
const calendarKind = { ceremony: "ceremony", dinner: "dinner", dance: "reception" };
function confirmation(inv, session) {
  const r = inv.response,
    attending = invitedEvents(inv).filter(
      (e) => r.attendance[e].adultsTeens + r.attendance[e].kids > 0,
    ),
    open = rsvpOpen(inv),
    savedOn = esc(dateIn(r.submittedAt, { month: "short", day: "numeric" })),
    until = monthDay(inv.deadline);
  const saved = `<p class="saved-note">${
    open
      ? tr(
          `Saved ${savedOn} · you can change it until ${until}`,
          `Guardada el ${savedOn} · pueden cambiarla hasta el ${until}`,
        )
      : tr(`Saved ${savedOn}`, `Guardada el ${savedOn}`)
  }</p>`;
  const edit = open
    ? `<p><a class="button outline" href="${route("rsvp")}">${tr("Edit response", "Editar respuesta")}</a></p>`
    : `<p>${tr("The RSVP deadline has passed. To change your answer, please contact us.", "La fecha límite ya pasó. Para cambiar su respuesta, escríbannos.")}</p><p><a href="${route("contact")}">${tr("Contact us", "Escríbannos")}</a></p>`;
  if (!attending.length)
    return `<div class="notice success"><h2>${tr("Thank you for letting us know.", "Gracias por avisarnos.")}</h2><p>${tr("We’ll miss you, and thank you for your love.", "Los vamos a extrañar; gracias por su cariño.")}</p></div>${saved}<p>${tr("Would you like to leave Sophia a note?", "¿Les gustaría dejarle un mensaje a Sophia?")}</p>${
      // The guestbook is for signed-in guests; an invitation link only answers the RSVP.
      session.verified
        ? ""
        : `<p class="hint">${tr("Writing in the guestbook needs a quick sign-in with your email. The link we send brings you right back to the guestbook.", "Para escribir en el libro de firmas hay que entrar con su correo. El enlace que les enviamos los lleva directo al libro de firmas.")}</p>`
    }<p><a class="button burgundy" href="${route("guestbook")}">${tr("Write in the guestbook", "Escribir en el libro de firmas")}</a></p>${edit}`;
  const calendars = attending
    .map(
      (e) =>
        `<div><strong>${eventNames[e]}</strong>${calendarLink(calendarKind[e], eventContent, es ? "es" : "en", liveContent)}</div>`,
    )
    .join("");
  const places = [
    attending.includes("ceremony") &&
      `<a href="${route("ceremony")}">${tr("Ceremony location & parking", "Ubicación y estacionamiento de la ceremonia")}</a>`,
    attending.some((e) => e !== "ceremony") &&
      `<a href="${route("reception")}">${tr("Dinner & reception location", "Ubicación de la cena y recepción")}</a>`,
  ]
    .filter(Boolean)
    .join("");
  // WhatsApp opt-in changes data, so it needs the email sign-in; an
  // invitation-link session is pointed to My account instead.
  const whatsapp =
    session.scope === "rsvp"
      ? ""
      : `<details class="card"><summary>${tr("Optional: get event updates on WhatsApp", "Opcional: recibe novedades del evento por WhatsApp")}</summary><section id="whatsapp-preferences"></section></details>`;
  const account = `<p><a href="${route("account")}">${session.verified ? tr("Open my account", "Abrir mi cuenta") : tr("Sign in with your email for photos and messages", "Entra con tu correo para fotos y mensajes")}</a></p>`;
  return `<div class="notice success"><h2>${tr("We can’t wait to celebrate with you!", "¡Los esperamos con mucha ilusión!")}</h2><p>${tr("Thank you", "Gracias")}, ${esc(inv.name)}.</p></div>${summary(r.attendance, inv)}${saved}<h3>${tr("Add to your calendar", "Agregar al calendario")}</h3><div class="calendar-actions">${calendars}</div><h3>${tr("Getting there", "Cómo llegar")}</h3><div class="row-actions">${places}</div>${edit}${whatsapp}${account}`;
}
// Set just before the page moves to the confirmation after a save, so the
// confirmation takes focus then (and not when opened from a bookmark).
function justSaved() {
  try {
    const saved = sessionStorage.getItem("misxv-rsvp-saved") === "1";
    sessionStorage.removeItem("misxv-rsvp-saved");
    return saved;
  } catch {
    return false;
  }
}
async function showPortal() {
  if (!portal) return;
  const session = await api("session");
  const view = portal.dataset.view;
  if (session.kind !== "guest") {
    // The invitation code only opens the RSVP, so pages for messages and
    // uploads offer the email sign-in alone (UI-11).
    if (["rsvp", "rsvp/confirmed", "account"].includes(view)) accessForm();
    else signedOut(view);
    return;
  }
  if (session.scope === "rsvp" && !["rsvp", "rsvp/confirmed"].includes(view)) {
    signInOnly();
    return;
  }
  const inv = await api("invitation");
  if (view === "account") {
    await accountPage(inv);
    return;
  }
  // Signed in before the family issued this household's invitation link.
  if (view.startsWith("rsvp") && !inv.invitationReady) {
    show(
      `<p class="notice">${tr("Your invitation hasn’t been sent yet. The RSVP opens here once we send it. You can already share photos and write to us from My account.", "Tu invitación aún no se ha enviado. Podrás responder aquí cuando te la enviemos. Ya puedes compartir fotos y escribirnos desde Mi cuenta.")}</p><a href="${route("account")}">${tr("My account", "Mi cuenta")}</a>`,
    );
    return;
  }
  if (view === "rsvp") {
    // After the deadline the server refuses every save, so show why instead of
    // a form that would only be refused after it is filled in.
    if (!rsvpOpen(inv)) {
      show(rsvpClosed(inv));
      return;
    }
    const draft = readDraft(inv);
    if (quickAnswer) {
      const values = { ...(draft || startingValues(inv)), attendance: everyone(inv, quickAnswer) };
      quickAnswer = null;
      keepDraft(inv, values);
      // Back from the review returns to the form, filled in the same way.
      review(inv, values);
    } else if (history.state?.rsvp === "review" && draft && complete(inv, draft))
      review(inv, draft, { push: false });
    else rsvpForm(inv, draft || startingValues(inv), { restored: !!draft });
    return;
  }
  if (view === "rsvp/confirmed") {
    if (!inv.response) {
      show(
        `<p>${tr("No saved RSVP was found for this invitation.", "No encontramos una respuesta guardada para esta invitación.")}</p><a href="${route("rsvp")}">RSVP</a>`,
      );
      return;
    }
    show(confirmation(inv, session), { focus: justSaved() });
    const updates = portal.querySelector("#whatsapp-preferences");
    if (updates) whatsappPreferences(updates, inv.contact.phone || "");
    return;
  }
  if (view === "share") {
    mediaUpload(portal, eventContent.albums);
    return;
  }
  if (["contact", "guestbook"].includes(view)) {
    show(
      `<form id="message">${field(tr("Your display name", "Nombre para mostrar"), "name", { required: true, max: 100, autocomplete: "name" })}${view === "contact" ? `${field(tr("Email", "Correo electrónico"), "email", { type: "email", required: true, value: inv.contact.email, autocomplete: "email" })}<label>${tr("Topic", "Tema")}<select name="topic">${contactTopics.map((t, i) => `<option value="${esc(t)}">${esc(es ? contactTopicsEs[i] : contactTopicsEn[i])}</option>`).join("")}</select></label>` : ""}<label>${tr("Message", "Mensaje")}<textarea name="text" maxlength="2000" required></textarea></label>${view === "guestbook" ? `<label class="check"><input type="checkbox" name="consent" required>${tr("We may publish this name and message after we read them.", "Podemos publicar este nombre y este mensaje después de leerlos.")}</label>` : ""}<p class="error" role="alert"></p><button class="button burgundy" type="submit">${tr("Send message", "Enviar mensaje")}</button></form>`,
    );
    submit(document.querySelector("#message"), async (data) => {
      await api("messages", {
        kind: view,
        email: data.get("email"),
        topic: data.get("topic"),
        name: data.get("name"),
        text: data.get("text"),
        consent: data.has("consent"),
      });
      show(
        `<p class="notice success" role="status">${view === "guestbook" ? tr("Thank you! Your note will appear here once we’ve read it.", "¡Gracias! Tu mensaje aparecerá aquí cuando lo hayamos leído.") : tr("Thank you. We got your message and will reply soon.", "Gracias. Recibimos tu mensaje y te responderemos pronto.")}</p>`,
      );
    });
  }
}
// Back from the confirmation can bring this page back as it was left (the
// back/forward cache), mid-save; draw it again from the server instead.
addEventListener("pageshow", (e) => {
  if (e.persisted && portal)
    showPortal().catch((err) => show(statusError(err.message)));
});
async function publicContent() {
  const nodes = document.querySelectorAll(
    "[data-guestbook],[data-announcements]",
  );
  if (!nodes.length) return;
  try {
    const data = await api("public");
    for (const box of nodes) {
      if (box.hasAttribute("data-guestbook"))
        box.innerHTML = data.messages
          .map(
            (m) =>
              `<article class="card"><blockquote>${esc(m.text)}</blockquote><p>— ${esc(m.name)}</p></article>`,
          )
          .join("");
      if (box.hasAttribute("data-announcements"))
        box.innerHTML = data.announcements
          .map(
            (a) =>
              `<article class="notice"><h3>${esc(es && a.titleEs ? a.titleEs : a.title)}</h3><p>${esc(es && a.textEs ? a.textEs : a.text)}</p></article>`,
          )
          .join("");
    }
  } catch {
    for (const box of nodes)
      box.innerHTML = box.hasAttribute("data-announcements")
        ? ""
        : `<p class="hint">${tr("This collection is not available yet.", "Esta colección aún no está disponible.")}</p>`;
  }
}
await experienceReady;
reloadOnNewLink();
let fragment = linkFragment();
const microsoft =
  portal && document.body.dataset.route === "account" ? microsoftReturn() : null;
if (microsoft) {
  portal.innerHTML = `<p role="status">${tr("Finishing Microsoft sign-in…", "Terminando el acceso con Microsoft…")}</p>`;
  try {
    const cfg = await api("config");
    const { back, ...proof } = await finishMicrosoft(cfg.microsoftClientId, "guest", microsoft);
    await api("auth/sso/guest", { provider: "microsoft", ...proof });
    fragment = "";
    if (!goBack(back)) await showPortal();
  } catch (e) {
    accessForm("", e.message);
  }
} else if (portal && fragment && document.body.dataset.route === "account") {
  history.replaceState(null, "", location.pathname);
  show(
    `<h2>${tr("Confirm sign-in", "Confirmar acceso")}</h2><p>${tr("Continue only if you requested this email link.", "Continúa solo si solicitaste este enlace por correo.")}</p><form id="email-verify"><p class="error" role="alert"></p><button type="submit" class="button burgundy">${tr("Continue", "Continuar")}</button></form>`,
  );
  submit(document.querySelector("#email-verify"), async () => {
    const { returnTo } = await api("auth/email/verify", { token: fragment });
    fragment = "";
    // Back to the page the sign-in was asked from; the name comes from the
    // link's record on the server and is checked against the list here.
    if (!goBack(returnTo)) await showPortal();
  });
} else if (portal && fragment && document.body.dataset.route === "rsvp") {
  history.replaceState(null, "", location.pathname);
  const [linkToken, answer] = fragment.split(".");
  fragment = linkToken;
  if (["yes", "no"].includes(answer)) quickAnswer = answer;
  try {
    await api("invitation-session", { token: fragment });
    fragment = "";
    await showPortal();
  } catch (e) {
    // Say why instead of silently showing the raw token in the code form.
    accessForm(
      "",
      e.code === "INVALID_INVITATION"
        ? tr(
            "This invitation link isn't working. It may be incomplete or replaced by a newer link; open your most recent invitation email or contact us.",
            "Este enlace de invitación no funciona. Puede estar incompleto o haber sido reemplazado por uno más reciente; abre tu correo de invitación más reciente o escríbenos.",
          )
        : e.message,
    );
  }
} else if (portal) {
  try {
    await showPortal();
  } catch (e) {
    show(statusError(e.message));
  }
}
await publicContent();


// The guests' gallery shows one clear state: a sign-in panel (photos and
// videos are for signed-in guests only), a friendly "nothing yet", or the
// approved media, with album cards and sections only for what exists.
async function gallery() {
  const state = document.querySelector("[data-gallery-state]"),
    photos = document.querySelector("[data-gallery]"),
    videos = document.querySelector("[data-videos]"),
    cards = document.querySelector("[data-gallery-albums]");
  if (!state || !photos || !videos || !cards) return;
  const panel = (title, text, href, action) => {
    state.innerHTML = `<div class="notice gallery-panel"><h2>${esc(title)}</h2><p>${esc(text)}</p>${href ? `<a class="button burgundy" href="${esc(href)}">${esc(action)}</a>` : ""}</div>`;
  };
  let items;
  try {
    // Only a verified sign-in (or an administrator) may see media; anyone else
    // gets the sign-in panel without a refused request in the console.
    const session = await api("session");
    if (session.kind !== "admin" && !session.verified) {
      panel(
        tr("Our guests’ photos and videos", "Las fotos y videos de nuestros invitados"),
        tr(
          "We share them privately with our guests. Sign in with the email where you received your invitation to see them and to add your own.",
          "Los compartimos en privado con nuestros invitados. Entra con el correo donde recibiste tu invitación para verlos y para agregar los tuyos.",
        ),
        route("account") + "?return=gallery",
        tr("Sign in to see the gallery", "Entra para ver la galería"),
      );
      return;
    }
    items = (await api("gallery")).media;
  } catch (e) {
    panel(
      tr("The gallery isn’t available right now", "La galería no está disponible por ahora"),
      e.message,
    );
    return;
  }
  if (!items.length) {
    panel(
      tr("Nothing here yet", "Todavía no hay nada aquí"),
      tr(
        "Photos and videos from the celebration appear here once we’ve reviewed them. Took some? Share them with us.",
        "Las fotos y videos de la celebración aparecen aquí cuando los revisamos. ¿Tomaste algunos? Compártelos con nosotros.",
      ),
      route("share"),
      tr("Share your photos", "Comparte tus fotos"),
    );
    return;
  }
  state.hidden = true;
  document.querySelector("[data-gallery-share]")?.removeAttribute("hidden");
  const name = (id) => {
    const album = eventContent.albums.find((a) => a.id === id);
    return album ? (es ? album.es : album.en) : "";
  };
  const counted = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  // A card for each album with something in it (a real cover, never a
  // placeholder), and only when there is more than one to choose between.
  const albums = eventContent.albums
    .map((a) => ({ ...a, rows: items.filter((p) => p.album === a.id) }))
    .filter((a) => a.rows.length);
  if (albums.length > 1) {
    cards.innerHTML = `<div class="album-grid">${albums
      .map((a, i) => {
        const cover = a.rows.find((p) => p.kind === "photo")?.url || a.rows.find((p) => p.poster)?.poster,
          shots = a.rows.filter((p) => p.kind === "photo").length,
          clips = a.rows.length - shots;
        return `<button type="button" class="album-card album-${i % 3}" data-album="${esc(a.id)}" aria-pressed="false"><span class="album-art" aria-hidden="true">${cover ? `<img src="${esc(cover)}" alt="" loading="lazy">` : ""}</span><span class="album-title">${esc(name(a.id))} <small>${esc(
          [
            shots && counted(shots, tr("photo", "foto"), tr("photos", "fotos")),
            clips && counted(clips, "video", "videos"),
          ]
            .filter(Boolean)
            .join(" · "),
        )}</small></span><span class="album-overlay" aria-hidden="true">${tr("Show this album", "Ver este álbum")}</span></button>`;
      })
      .join("")}</div>`;
    cards.hidden = false;
  }
  const figure = (p) => {
    // No empty caption box under media that has none.
    const caption = p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : "",
      download = `<a href="${esc(p.url)}?download=1" download>${tr("Download", "Descargar")}</a>`;
    return p.kind === "video"
      ? `<figure><video controls playsinline preload="${p.poster ? "none" : "metadata"}"${p.poster ? ` poster="${esc(p.poster)}"` : ""} src="${esc(p.url)}"></video>${caption}${download}</figure>`
      : `<figure><img loading="lazy" alt="${esc(p.caption || tr("Photo from the celebration", "Foto de la celebración"))}" src="${esc(p.url)}">${caption}${download}</figure>`;
  };
  function render(album = "") {
    const rows = items.filter((p) => !album || p.album === album);
    for (const [kind, node] of [
      ["photo", photos],
      ["video", videos],
    ]) {
      const mine = rows.filter((p) => p.kind === kind);
      node.innerHTML = mine.map(figure).join("");
      // The videos section (and the photos one) only when it has something.
      node.closest("section").hidden = !mine.length;
    }
    const label = document.querySelector("[data-album-label]");
    if (label) label.textContent = album ? name(album) : albums.length > 1 ? tr("All albums", "Todos los álbumes") : "";
    for (const b of cards.querySelectorAll("[data-album]"))
      b.setAttribute("aria-pressed", String(b.dataset.album === album));
  }
  cards.addEventListener("click", (e) => {
    const b = e.target.closest("[data-album]");
    if (!b) return;
    render(b.getAttribute("aria-pressed") === "true" ? "" : b.dataset.album);
    [photos, videos]
      .map((node) => node.closest("section"))
      .find((section) => !section.hidden)
      ?.scrollIntoView({ block: "start" });
  });
  render();
}
await gallery();
