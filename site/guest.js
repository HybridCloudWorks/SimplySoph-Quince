import { noteSentence, noteWords, visibilityOf } from "./notes.mjs";
import { returnPages } from "./nav.js";
// The clock runtime (site/now.mjs) and the lexicon come through
// experience.js, which already loads them, so this page's first scripts
// arrive in as few round trips as before.
import {
  experienceReady,
  eventContent,
  liveContent,
  clockReady,
  serverConfig,
  rsvpOpenNow,
  rsvpDeadline,
  rememberReply,
  watch,
  lifecycleState,
  terms,
  sessionStatus,
} from "./experience.js";
import { calendarActions } from "./celebration.mjs";
import {
  api,
  esc,
  es,
  lang,
  register,
  tr,
  term,
  route,
  field,
  submit,
  checkForm,
  focusOn,
  linkFragment,
  reloadOnNewLink,
  markBusy,
  sayError,
  mentionsUs,
  cardEnded,
} from "./client.js";
import { date, dayMonth, time, at } from "./datetime.mjs";
import { clock, answer as deviceReply, remembersReplies } from "./now.mjs";
// The upload form, the WhatsApp choices, the gallery and "What's next"
// load only on the pages that show them, so every other page (the home
// page above all) stays light (tests/home-weight.test.mjs).
const uploads = () => import("./media-upload.js");
const whatsapp = () => import("./guest-whatsapp.js");
const promises = () => import("./promises.mjs");
// Microsoft and Google sign-in, only where their buttons or return are.
const sso = () => import("./sso.js");
const portal = document.querySelector("#portal");
// Shared wording (site/lexicon.mjs) comes in this page's language and, in
// Spanish, its form of address: tr(en, { tu, ustedes }) and term(entry)
// (site/client.js), so the same step speaks to the household on the RSVP
// (ustedes) and to one person on My account (tú).
const eventNames = {
  ceremony: term(terms.ceremony),
  dinner: term(terms.dinner),
  dance: term(terms.receptionDance),
};
// The page's own title ("RSVP · Sophia’s Quinceañera"); once the guest acts,
// the step's heading goes in front (R-073).
let pageTitle = document.title;
let settled = false;
// The RSVP step's session limit, stopped when another step replaces it.
let stopLimit = null;
// Puts a step in the portal. A step the guest moved to (any after the page
// load, or the confirmation right after a save) is named in the tab title and
// takes focus, its heading or message, so keyboard and screen-reader users
// land on what changed. "contact us" in a step's alert becomes a link
// (client.js sayError).
function show(html, { focus = settled } = {}) {
  stopLimit?.();
  stopLimit = null;
  portal.innerHTML = html;
  settled = true;
  const heading = portal.querySelector("h2");
  document.title = heading && focus ? `${heading.textContent.trim()} · ${pageTitle}` : pageTitle;
  for (const el of portal.querySelectorAll("[role=alert]:not(:empty)"))
    if (!el.children.length) sayError(el, el.textContent);
  if (focus)
    focusOn(
      heading ||
        portal.querySelector("[role=alert]:not(:empty),[role=status]:not(:empty),.notice"),
    );
}
// A page that could not be drawn: why, and a way to reach us (once).
const statusError = (message) =>
  `<p class="notice" role="alert">${esc(message)}</p>${mentionsUs(message) ? "" : `<a href="${route("contact")}">${term(terms.contactUs)}</a>`}`;
// GET /api/config, fetched once for the page by site/now.mjs (which also
// takes the server's clock from it).
const config = serverConfig;
// Dates are written by site/datetime.mjs, in Fort Worth time (the deadline is
// 11:59 PM there, already the next day in some time zones): "Sunday,
// November 15" / "domingo 15 de noviembre".
const deadlineDay = (iso) => date(iso, lang, { year: false });
// Same cut-off as the server, on the server's clock (site/now.mjs): a phone
// that runs fast can still answer until the real deadline.
const rsvpOpen = (inv) => rsvpOpenNow(inv.deadline);
// The page after the party speaks in the past tense (site/lifecycle.mjs).
const partyOver = () => ["after", "archived"].includes(lifecycleState()?.phase);
// "Please RSVP by Sunday, November 15.", on the form, the code entry and My
// account, until the deadline passes (site/lexicon.mjs rsvpBy: "confirmen su
// asistencia" to the household, "confirma tu asistencia" on My account).
function replyBy(deadline) {
  if (!rsvpOpenNow(deadline)) return "";
  return `<p class="deadline">${term(terms.rsvpBy)} <strong>${esc(deadlineDay(deadline))}</strong>.</p>`;
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
// The events someone in the household is coming to, by the saved answer.
const attendingOf = ({ invited, response: r }) =>
  Object.keys(eventNames).filter((e) => invited[e] && r.attendance[e].adultsTeens + r.attendance[e].kids > 0);
// "What's next" (site/promises.mjs): what is still to come (data-coming, from
// the build) unless `pending` is false, and the channels the server has live;
// `photos`: where the photos will be, for a household that is not coming.
async function whatsNext(session, pending = true, { photos = false } = {}) {
  try {
    const [m, cfg] = await Promise.all([promises(), config().catch(() => ({}))]);
    return m.whatsNext({
      // Nothing is promised "soon" on the day itself (or after it).
      coming: pending && ["rsvp-open", "rsvp-closed"].includes(lifecycleState()?.phase ?? "rsvp-open") ? JSON.parse(portal.dataset.coming || "{}") : {},
      channels: cfg.channels,
      linkSession: session.scope === "rsvp",
      photos,
      lang,
      register,
      now: clock(),
    });
  } catch {
    return "";
  }
}
function summary(attendance, inv) {
  return `<ul class="summary-list">${invitedEvents(inv)
    .map((e) => `<li><strong>${eventNames[e]}:</strong> ${people(attendance[e])}</li>`)
    .join("")}</ul>`;
}
// After an emailed sign-in link, the guest comes back to the page they asked
// from; server/accounts.mjs keeps the same list. My account can be opened for
// another page with ?return=share.
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
// (My account opened for another page keeps it when the language changes:
// site/nav.js, so the link is right as soon as the page shows.)
// Opens the page a sign-in started from ("es/share"), unless it is this one.
function goBack(name) {
  const m = /^(es\/)?([a-z]+)$/.exec(name || "");
  if (!m || !returnPages.includes(m[2]) || m[2] === "account") return false;
  location.assign("/" + name + "/");
  return true;
}
// Two ways in, matching the owner's model: the private invitation link or code
// opens the RSVP; signing in with the household's email (emailed link, Microsoft
// or Google) opens everything else. There is no registration step. In
// Spanish it speaks as the page does (to the household on the RSVP).
const emailSignInHtml = ({
  heading = tr("Sign in with your email", { tu: "Entra con tu correo", ustedes: "Entren con su correo" }),
  button = tr("Email my sign-in link", "Enviar enlace de acceso"),
  intro = "",
} = {}) =>
  `<h2>${heading}</h2>${intro}<form id="email-login">${field(tr("Email", "Correo electrónico"), "email", { type: "email", required: true, autocomplete: "email", hint: tr("Use the email where you received your invitation. We’ll email you a one-time link — no password needed.", { tu: "Usa el correo donde recibiste tu invitación. Te enviaremos un enlace de un solo uso; no necesitas contraseña.", ustedes: "Usen el correo donde recibieron su invitación. Les enviaremos un enlace de un solo uso; no necesitan contraseña." }) })}<p role="alert" class="error"></p><button type="submit" class="button burgundy" data-busy="${tr("Sending…", "Enviando…")}">${button}</button></form>`;
// Under "Check your email", for someone whose address isn't on the list (a
// teen, a plus-one): the same words for every address, so nothing says who
// is on it (R-023).
const ours = `<a class="target" href="mailto:misxv@simplysoph.com">misxv@simplysoph.com</a>`;
const nothingYet = () =>
  tr(
    `Nothing after a few minutes? Try the email where you got your invitation, or write to us at ${ours} and we’ll add yours.`,
    { tu: `¿No llega en unos minutos? Prueba con el correo donde recibiste tu invitación o escríbenos a ${ours} y agregamos el tuyo.`, ustedes: `¿No llega en unos minutos? Prueben con el correo donde recibieron su invitación o escríbannos a ${ours} y agregamos el suyo.` },
  );
function wireEmailSignIn() {
  submit(document.querySelector("#email-login"), async (data) => {
    await api("auth/email/request", { email: data.get("email"), return: returnPage() });
    // The same answer whether or not the address is on the list.
    show(
      `<div class="notice" role="status"><h2>${tr("Check your email", { tu: "Revisa tu correo", ustedes: "Revisen su correo" })}</h2><p>${tr("If this email is on the guest list, a sign-in link is on its way. Check your inbox and spam folder; the link expires in 15 minutes.", { tu: "Si este correo está en la lista de invitados, te enviamos un enlace de acceso. Revisa tu bandeja de entrada y el correo no deseado; el enlace vence en 15 minutos.", ustedes: "Si este correo está en la lista de invitados, les enviamos un enlace de acceso. Revisen su bandeja de entrada y el correo no deseado; el enlace vence en 15 minutos." })}</p><p class="nothing-yet">${nothingYet()}</p></div><p><a class="target" href="${esc(location.pathname + location.search)}">${tr("Back to sign-in", "Volver al acceso")}</a></p>`,
    );
  });
  // Microsoft returns only to My account, so the buttons live there; other
  // pages link to it, naming only the providers this server offers guests.
  if (document.body.dataset.route === "account") ssoChoices();
  else {
    const back = returnPage().replace(/^es\//, "");
    config()
      .then((cfg) => {
        const { microsoft, google } = providers(cfg);
        const label = microsoft
          ? google
            ? tr("Sign in with Microsoft or Google instead", { tu: "O entra con Microsoft o Google", ustedes: "O entren con Microsoft o Google" })
            : tr("Sign in with Microsoft instead", { tu: "O entra con Microsoft", ustedes: "O entren con Microsoft" })
          : google
            ? tr("Sign in with Google instead", { tu: "O entra con Google", ustedes: "O entren con Google" })
            : "";
        if (label && !portal.querySelector("[data-sso-link]"))
          portal
            .querySelector("#email-login")
            ?.insertAdjacentHTML(
              "afterend",
              `<p data-sso-link><a class="target" href="${route("account")}?return=${back}">${label}</a></p>`,
            );
      })
      .catch(() => {});
  }
}
// The sign-in providers offered to guests: Google when configured, Microsoft
// when configured and GUEST_MICROSOFT_SIGN_IN is not off (an API from before
// that switch says nothing, and kept offering it).
const providers = (cfg) => ({
  microsoft: !!cfg.microsoftClientId && cfg.guestMicrosoft !== false,
  google: !!cfg.clientId,
});
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
          tr("Use the link from your invitation to this website.", {
            tu: "Usa el enlace de tu invitación a este sitio.",
            ustedes: "Usen el enlace de su invitación a este sitio.",
          }),
        );
    }
    value = value.slice(at + 1);
  } else if (/[/:]/.test(value))
    throw new Error(
      tr("This link is missing its private part (after the #). Use the RSVP button in your invitation email, or type the code from your invitation.", {
        tu: `A este enlace le falta su parte privada (después del #). Usa el botón “${terms.rsvpAction.es}” de tu correo de invitación o escribe el código de tu invitación.`,
        ustedes: `A este enlace le falta su parte privada (después del #). Usen el botón “${terms.rsvpAction.es}” de su correo de invitación o escriban el código de su invitación.`,
      }),
    );
  const [token, answer] = value.split(".");
  return { token, answer: ["yes", "no"].includes(answer) ? answer : null };
}
function accessForm(value = "", reason = "") {
  // After the deadline the RSVP pages say so first (the link or code below
  // still opens the household's saved answer).
  const onRsvp = portal.dataset.view.startsWith("rsvp"),
    closed = onRsvp && !rsvpOpenNow(),
    // This device's note that the family replied (site/now.mjs, the one the
    // home page reads): a bookmarked RSVP opened after the session ended
    // says so instead of asking for an RSVP (QA-07). The note holds yes or
    // no and when, never the counts, so the page shows no counts.
    replied = onRsvp ? deviceReply() : null,
    repliedNote = replied
      ? `<div class="notice" role="status"><p class="home-replied">${
          replied === "yes"
            ? tr("You replied", "Ya respondieron") + ' <span aria-hidden="true">✓</span>'
            : tr("Thank you for letting us know", "Gracias por avisarnos")
        }</p><p>${
          closed
            ? tr("This device remembers that your family replied. To see your RSVP, open your invitation link again, from the email or message we sent you, or paste it below.", {
                tu: "Este dispositivo recuerda que tu familia ya respondió. Para ver tu respuesta, abre de nuevo tu enlace de invitación, del correo o mensaje que te enviamos, o pégalo aquí abajo.",
                ustedes: "Este dispositivo recuerda que su familia ya respondió. Para ver su respuesta, abran de nuevo su enlace de invitación, del correo o mensaje que les enviamos, o péguenlo aquí abajo.",
              })
            : tr("This device remembers that your family replied. To see or change your RSVP, open your invitation link again, from the email or message we sent you, or paste it below.", {
                tu: "Este dispositivo recuerda que tu familia ya respondió. Para ver o cambiar tu respuesta, abre de nuevo tu enlace de invitación, del correo o mensaje que te enviamos, o pégalo aquí abajo.",
                ustedes: "Este dispositivo recuerda que su familia ya respondió. Para ver o cambiar su respuesta, abran de nuevo su enlace de invitación, del correo o mensaje que les enviamos, o péguenlo aquí abajo.",
              })
        }</p></div>`
      : "",
    alert = reason ? `<p class="notice" role="alert">${esc(reason)}</p>` : "",
    codeForm = `<form id="access">${field(tr("Invitation link or code", "Enlace o código de invitación"), "token", { value, required: true, max: 1000, hint: term(terms.invitationCodeHint), attrs: 'autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off"' })}<p class="error" role="alert"></p><button type="submit" class="button burgundy" data-busy="${tr("Checking…", "Comprobando…")}">${tr("Continue", "Continuar")}</button></form>`;
  show(
    onRsvp
      ? `${alert}${closed ? closedNote(rsvpDeadline()) : ""}${repliedNote}${anyDraft() ? `<p class="notice" role="status">${tr("Your answers are kept in this tab. Open your invitation email again, or paste its link below, to finish.", { tu: "Tus respuestas siguen guardadas en esta pestaña. Abre de nuevo tu correo de invitación, o pega el enlace aquí abajo, para terminar.", ustedes: "Sus respuestas siguen guardadas en esta pestaña. Abran de nuevo su correo de invitación, o peguen el enlace aquí abajo, para terminar." })}</p>` : ""}<h2>${tr("Open your invitation", { tu: "Abre tu invitación", ustedes: "Abran su invitación" })}</h2><p>${tr("The private link in your invitation opens your RSVP. You can also paste that link, or type the code from your invitation, below.", { tu: "El enlace privado de tu invitación abre tu respuesta. También puedes pegar ese enlace, o escribir el código de tu invitación, aquí abajo.", ustedes: "El enlace privado de su invitación abre su respuesta. También pueden pegar ese enlace, o escribir el código de su invitación, aquí abajo." })}</p>${codeForm}<hr>${emailSignInHtml()}`
      : // Signed out, My account is "Sign in" (R-041): the email sign-in
        // first, in the first phone screen, then one line for an invitation
        // link or code, which open the RSVP, with the code box folded.
        `${alert}${emailSignInHtml()}<div class="invitation-way" data-invitation-way><hr><p>${tr(`Have an invitation link or code? It opens <a href="${route("rsvp")}">your RSVP</a>.`, `¿Tienes un enlace o código de invitación? Con él puedes abrir <a href="${route("rsvp")}">tu respuesta</a>.`)}</p><details><summary>${tr("Type the code from your invitation", "Escribe el código de tu invitación")}</summary>${codeForm}</details></div>`,
  );
  if (!closed && !replied)
    portal.querySelector("#access")?.insertAdjacentHTML("beforebegin", replyBy(rsvpDeadline()));
  submit(document.querySelector("#access"), async (data) => {
    const { token, answer } = invitationFrom(data.get("token"));
    await api("invitation-session", { token });
    if (answer) quickAnswer = answer;
    // A code typed on My account opens the RSVP it belongs to.
    if (onRsvp) await showPortal();
    else location.assign(route("rsvp"));
  });
  wireEmailSignIn();
}
// Signed out on a page for messages or uploads: the email sign-in. The share
// page's own steps already say to sign in (scripts/build-pages.mjs), so it is
// said once there (R-088); `alert` is a note that replaces it, such as why a
// table card did not open the upload. Contact leads with its address and says
// where replies appear (built), so sending a message here is a quiet second
// choice under it (R-084).
function signedOut(view, alert = "") {
  if (view === "contact" && !alert)
    show(
      emailSignInHtml({
        heading: tr("Or write to us from My account", "O escríbenos desde Mi cuenta"),
        intro: `<p>${tr("Sign in with your email first; then you can write to us from My account.", "Primero entra con tu correo; después podrás escribirnos desde Mi cuenta.")}</p>`,
      }),
    );
  else
    show(
      (alert
        ? `<p class="notice" role="alert">${esc(alert)}</p>`
        : view === "share"
          ? ""
          : view === "guestbook"
            ? // A household that answered by its invitation link can send its
              // one note from that link, with no sign-in (QA-07).
              `<p class="notice">${tr("Answered with your invitation link? Open it again and you can send Sophia one note from it without signing in. Or sign in with your email.", "¿Respondiste con tu enlace de invitación? Ábrelo de nuevo y podrás enviarle a Sophia un mensaje desde él sin entrar con tu correo. O entra con tu correo.")}</p>`
            : `<p class="notice">${tr("Sign in with your email to continue.", "Entra con tu correo para continuar.")}</p>`) +
        emailSignInHtml(),
    );
  wireEmailSignIn();
}
// The printed table card opens /share/#party=<code>. The code is read once,
// taken out of the address bar (so it is not kept in history or shared by
// copying the address) and traded for an upload-only session. Someone
// already signed in shares as their family instead.
async function fromTableCard(code) {
  try {
    const session = await api("session");
    if (!(session.kind === "guest" && session.verified))
      await api("party-session", { token: code }, { typed: false });
    await showPortal();
  } catch (e) {
    signedOut("share", cardRefusal(e));
  }
}
function cardRefusal(e) {
  const opens = Date.parse(e.details?.opensAt);
  if (e.code === "PARTY_NOT_OPEN" && Number.isFinite(opens))
    return tr(
      `Sharing from the table card opens on ${date(opens, lang, { year: false })} ${at(opens, lang, { nbsp: true })}. Until then, guests on our list can share here.`,
      `Se podrá compartir desde la tarjeta de la mesa a partir del ${date(opens, lang, { year: false })} ${at(opens, lang, { nbsp: true })}. Mientras tanto, los invitados de nuestra lista pueden compartir aquí.`,
    );
  if (e.code === "PARTY_CLOSED")
    return tr(
      "Sharing from the table card has closed. Guests on our list can still share here.",
      "Ya no se puede compartir desde la tarjeta de la mesa. Los invitados de nuestra lista todavía pueden compartir aquí.",
    );
  return e.message;
}
// An invitation link opens only the RSVP; anything else asks for the email sign-in.
function signInOnly() {
  show(
    `<p class="notice">${tr("Your invitation link opens your RSVP. To share photos, send messages or update your details, sign in with your email.", "Tu enlace de invitación abre tu respuesta. Para compartir fotos, enviar mensajes o actualizar tus datos, entra con tu correo.")}</p>${emailSignInHtml()}`,
  );
  wireEmailSignIn();
}
async function ssoChoices() {
  let cfg, ssoRow, googleButton, startMicrosoft;
  try {
    cfg = await config();
    if (!providers(cfg).microsoft && !providers(cfg).google) return;
    ({ ssoRow, googleButton, startMicrosoft } = await sso());
  } catch {
    return;
  }
  const offered = providers(cfg);
  const which = offered.microsoft
    ? offered.google
      ? tr("Microsoft or Google", "Microsoft o Google")
      : "Microsoft"
    : "Google";
  // Right under the email sign-in, above the line for invitation codes.
  const way = portal.querySelector("[data-invitation-way]");
  (way || portal).insertAdjacentHTML(
    way ? "beforebegin" : "beforeend",
    `<div class="sso-choices"><h2>${tr("Or sign in with", "O entra con")}</h2>${ssoRow({
      microsoft:
        offered.microsoft && tr("Sign in with Microsoft", "Continuar con Microsoft"),
      google: offered.google,
      note: tr(
        `Use the ${which} account with the email where you received your invitation. No code or password needed.`,
        `Usa la cuenta de ${which} con el correo donde recibiste tu invitación. No necesitas código ni contraseña.`,
      ),
    })}<p class="error" role="alert" id="sso-error"></p></div>`,
  );
  // Sign-in problems are shown here, next to the buttons.
  const failed = (message) => {
    const box = portal.querySelector("#sso-error");
    if (box) sayError(box, message);
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
// My account, signed in (site/guest-account.js, loaded only there), with what
// it shares with this page.
const account = () => import("./guest-account.js");
const accountPage = async (inv) =>
  (await account()).accountPage(inv, {
    show,
    replyBy,
    rsvpOpen,
    invitedEvents,
    eventNames,
    people,
    dropAllDrafts,
    whatsNext,
    attendingOf,
    partyOver,
  });
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
  return `<span class="event-name">${eventNames[e]}</span> <span class="event-when">· ${esc(time(start, lang, { nbsp: true }))} · ${esc(place)}</span>`;
}
// The children's age cut-off, once the family sets one (built into the page).
const age = Number(portal?.dataset.childAge) || 0;
function countField(event, key, max, value) {
  const label =
      key === "kids"
        ? tr("Children", "Niños") + (age ? tr(` (under ${age})`, ` (menores de ${age} años)`) : "")
        : tr("Adults / teens", "Adultos / jóvenes") + (age ? tr(` (${age} and older)`, ` (${age} años o más)`) : ""),
    // The note under a count left empty names its event, so the notes down
    // the form are not six identical lines.
    note = `${eventNames[event]}: ${key === "kids" ? tr("choose how many children.", "falta elegir cuántos niños.") : tr("choose how many adults/teens.", "falta elegir cuántos adultos/jóvenes.")}`;
  return `<label>${label}<select name="${event}.${key}" id="rsvp-${event}-${key}" required data-label="${esc(`${eventNames[event]} – ${label}`)}" data-check="${esc(tr("Choose how many for:", "Elegir cuántos para:"))}" data-error="${esc(note)}"><option value="">${tr("Choose a number", "Elegir cantidad")}</option>${Array.from({ length: max + 1 }, (_, n) => `<option value="${n}"${String(n) === String(value) ? " selected" : ""}>${n}</option>`).join("")}</select></label>`;
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
    : tr("Your sign-in timed out. Sign in again; your answers are kept here.", {
        tu: "Tu acceso venció. Vuelve a entrar; tus respuestas siguen aquí.",
        ustedes: "Su acceso venció. Vuelvan a entrar; sus respuestas siguen aquí.",
      });
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
// While the RSVP is on screen, a session that is about to end says so in
// time to keep it (WCAG 2.2.1): filling in the form keeps it, and two minutes
// before the end the page offers to (site/session-limit.js). If it ends
// anyway, the step says so now rather than after Save, and keeps the answers.
async function rsvpLimit(inv, box) {
  const { sessionLimit } = await import("./session-limit.js");
  // Another step may have replaced this one while the module loaded.
  if (!box.isConnected) return;
  stopLimit?.();
  stopLimit = sessionLimit({
    kind: "guest",
    form: box.matches("form") ? box : box.querySelector("form"),
    ended: () => box.isConnected && timedOut(inv, box),
    words: {
      warn: (n) =>
        tr(`Still there? For your security, this page stops saving in ${n} ${n === 1 ? "minute" : "minutes"}.`, {
          tu: `¿Sigues ahí? Por seguridad, esta página dejará de guardar en ${n} ${n === 1 ? "minuto" : "minutos"}.`,
          ustedes: `¿Siguen ahí? Por seguridad, esta página dejará de guardar en ${n} ${n === 1 ? "minuto" : "minutos"}.`,
        }),
      keep: tr("Keep going", "Continuar"),
      kept: tr("You have more time.", { tu: "Tienes más tiempo.", ustedes: "Tienen más tiempo." }),
      final: tr("This page can’t be kept open any longer. Your answers stay here even if it stops saving.", {
        tu: "Esta página ya no se puede mantener abierta más tiempo. Tus respuestas se quedan aquí aunque deje de guardar.",
        ustedes: "Esta página ya no se puede mantener abierta más tiempo. Sus respuestas se quedan aquí aunque deje de guardar.",
      }),
    },
  });
}
// The server's own test for a contact email (server/rsvp-validation.mjs), so
// the form catches "name@family" too, not only an address without an @.
const emailPattern = 'pattern="[^\\s@]+@[^\\s@]+\\.[^\\s@]+"';
function rsvpForm(inv, values, { restored = false } = {}) {
  current = { inv, values };
  const contact = values.contact || inv.contact || {};
  show(
    `<h2>${esc(inv.name)}</h2><p class="allocation">${allocation(inv.capacity)}</p>${replyBy(inv.deadline)}${restored ? `<p class="notice" role="status">${tr("We kept the answers you started.", "Recuperamos las respuestas que ya habían empezado.")}</p>` : ""}<div class="quick-answers"><button type="button" class="button burgundy" data-quick="yes">${term(terms.everyoneComing)}</button><button type="button" class="button outline" data-quick="no">${term(terms.cantMakeIt)}</button></div><p>${tr("Or choose how many will come to each part of the celebration.", "O elijan cuántos irán a cada parte de la celebración.")}</p><form id="response">${invitedEvents(
      inv,
    )
      .map(
        (e) =>
          `<fieldset data-check-group="${esc(eventNames[e])}"><legend>${eventLegend(e)}</legend><div class="field-grid">${countField(e, "adultsTeens", inv.capacity.adultsTeens, values.attendance?.[e]?.adultsTeens)}${inv.capacity.kids ? countField(e, "kids", inv.capacity.kids, values.attendance?.[e]?.kids) : ""}</div></fieldset>`,
      )
      .join("")}${
      inv.contactHidden
        ? `<p class="hint">${tr("To change your contact details, sign in with your email on My account.", "Para cambiar sus datos de contacto, entren con su correo en Mi cuenta.")}</p>`
        : `<div class="field-grid">${field(tr("Email", "Correo electrónico"), "email", { type: "email", value: contact.email, autocomplete: "email", attrs: emailPattern })}${field(tr("Phone (optional)", "Teléfono (opcional)"), "phone", { type: "tel", inputmode: "tel", value: contact.phone, max: 40, autocomplete: "tel" })}</div>${field(tr("Mailing address (optional)", "Dirección postal (opcional)"), "address", { value: contact.address || "", max: 500, autocomplete: "street-address" })}`
    }<label>${tr("Anything we should know? Allergies, accessibility needs, or a song you’d love to hear (optional)", "¿Algo que debamos saber? Alergias, necesidades de accesibilidad o una canción que les gustaría escuchar (opcional)")}<textarea name="requests" maxlength="1000">${esc(values.requests || "")}</textarea></label><p class="resume-note" role="status"></p><p class="error" role="alert"></p><button class="button burgundy" type="submit">${term(terms.reviewRsvp)}</button></form>`,
  );
  const form = portal.querySelector("#response");
  rsvpLimit(inv, form);
  const keep = () => {
    current.values = formValues(form, inv);
    keepDraft(inv, current.values);
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
        `<p>${tr("Anything we should know", "Algo que debamos saber")}: ${esc(input.requests)}</p>`,
    ]
      .filter(Boolean)
      .join("");
  // The review names the household, as the form does (a quick-answer link
  // opens straight here), and says before Save when it replaces an answer.
  // Save stays in the phone's first screen (R-129): the answer follows it.
  show(
    `<h2>${tr(terms.reviewRsvp.en, "Revisen su respuesta")}</h2><p><strong>${esc(inv.name)}</strong></p>${inv.response ? `<p>${tr("This replaces your saved RSVP.", "Esto reemplaza su respuesta guardada.")}</p>` : ""}<p class="resume-note" role="status"></p><p class="error" role="alert"></p><div class="row-actions"><button type="button" id="confirm" class="button burgundy">${term(terms.saveRsvp)}</button><button type="button" id="edit" class="button outline">${tr("Change counts", "Cambiar cantidades")}</button></div>${summary(input.attendance, inv)}${details}`,
  );
  if (push) {
    // The entry left behind is the form's, even when an in-page link (the
    // skip link's #main) made it.
    if (history.state?.rsvp !== "form") history.replaceState({ rsvp: "form" }, "");
    history.pushState({ rsvp: "review" }, "");
  }
  rsvpLimit(inv, portal);
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
    alert.replaceChildren();
    note.textContent = "";
    // The same busy state as every form (client.js): "Saving…", aria-busy on
    // the step, announced; it stays until the confirmation page opens.
    const done = markBusy(save, portal);
    try {
      // The page's language picks the receipt's (an older API ignores it).
      const input = answerFrom(inv, values),
        saved = await api("rsvp", input, {
          headers: { "Idempotency-Key": key, "X-Page-Language": lang },
        });
      dropDraft(inv);
      // This device remembers that the household replied (yes or no, nothing
      // else), for the home page on the next visit (site/now.mjs).
      rememberReply(
        Object.values(input.attendance).some((v) => v.adultsTeens + v.kids > 0) ? "yes" : "no",
        saved.submittedAt,
      );
      try {
        sessionStorage.setItem("misxv-rsvp-saved", "1");
      } catch {
        /* the confirmation just won't take focus */
      }
      location.assign(route("rsvp/confirmed"));
      return;
    } catch (err) {
      // Not busy any more before the error is written, so it is announced.
      done();
      if (["SIGN_IN_REQUIRED", "CSRF_REJECTED"].includes(err.code)) timedOut(inv, portal);
      // Saved a moment too late: the closed note the deadline brings, with
      // the server's answer and no Save (R-168).
      else if (err.code === "RSVP_CLOSED") {
        stopClosing?.();
        show(rsvpClosed(inv, err.message));
      } else sayError(alert, err.message);
    }
    busy = false;
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
// "RSVPs are closed", with the household's saved answer when there is one.
// Signed out, it leads the /rsvp/ page from the deadline on. After a save
// refused as too late, the server's words (`refused`, whose "contact us" is
// the link) take the place of ours and of the button.
// After the party it asks for nothing: no contact sentence or button.
function closedNote(deadline, answered = "", refused = "") {
  const until = esc(deadlineDay(deadline)),
    over = partyOver();
  return `<div class="notice"><h2>${tr("RSVPs are closed", "Ya no se reciben respuestas")}</h2>${
    refused
      ? `<p role="alert">${esc(refused)}</p>`
      : `<p>${
          over
            ? tr(`RSVPs closed on ${until}.`, `El plazo para confirmar terminó el ${until}.`)
            : tr(`RSVPs closed on ${until}. To reply or change your RSVP now, please contact us.`, `El plazo para confirmar terminó el ${until}. Para confirmar su asistencia o cambiar su respuesta, escríbannos.`)
        }</p>`
  }${answered}${refused || over ? "" : `<p><a class="button burgundy" href="${route("contact")}">${term(terms.contactUs)}</a></p>`}</div>`;
}
function rsvpClosed(inv, refused) {
  return closedNote(
    inv.deadline,
    inv.response
      ? `<p>${tr("Your saved RSVP:", "Su respuesta guardada:")}</p>${summary(inv.response.attendance, inv)}`
      : "",
    refused,
  );
}
// A form left open across the deadline turns into the closed note when the
// deadline passes on the server's clock, without a reload (site/now.mjs wakes
// at the boundary). A save that races it still gets the server's refusal.
let stopClosing = null;
function closeAtDeadline(inv) {
  stopClosing?.();
  stopClosing = watch(() => {
    if (rsvpOpen(inv) || portal.dataset.view !== "rsvp") return;
    if (!portal.querySelector("#response, #confirm")) return;
    stopClosing?.();
    stopClosing = null;
    show(rsvpClosed(inv));
  });
}
// The page after saving adapts to the answer: attending households get only
// the calendars and directions they need; declining households get a warm note.
const calendarKind = { ceremony: "ceremony", dinner: "dinner", dance: "reception" };
function confirmation(inv, session, next = "") {
  const r = inv.response,
    attending = attendingOf(inv),
    open = rsvpOpen(inv),
    // After the party: thanks in the past tense, the photos, and no calendar
    // files, directions or changes for a day that is over.
    over = partyOver(),
    savedOn = esc(dayMonth(r.submittedAt, lang)),
    until = esc(deadlineDay(inv.deadline));
  const saved = `<p class="saved-note">${
    open
      ? tr(
          `Saved ${savedOn} · you can change it until ${until}`,
          `Guardada el ${savedOn} · pueden cambiarla hasta el ${until}`,
        )
      : tr(`Saved ${savedOn}`, `Guardada el ${savedOn}`)
  }</p>`;
  const edit = over
    ? ""
    : open
      ? `<p><a class="button outline" href="${route("rsvp")}">${term(terms.changeRsvp)}</a></p>`
      : `<p>${tr("The RSVP deadline has passed. To change your RSVP, please contact us.", "La fecha límite ya pasó. Para cambiar su respuesta, escríbannos.")}</p><p><a class="target" href="${route("contact")}">${term(terms.contactUs)}</a></p>`;
  // The same link on both confirmations (and under the home page's quote).
  const note = `<p class="note-link"><a class="target" href="${route("guestbook")}">${esc(term(terms.leaveNote))}<span class="arrow" aria-hidden="true">→</span></a></p>`;
  // WhatsApp opt-in changes data, so it needs the email sign-in; an
  // invitation-link session is pointed to My account instead (in `next`).
  const whatsapp =
    session.scope === "rsvp" || over
      ? ""
      : // Shown only while WhatsApp is live (site/guest-whatsapp.js removes it otherwise).
        `<details class="card" hidden><summary>${tr("Optional: WhatsApp updates", "Opcional: avisos por WhatsApp")}</summary><section id="whatsapp-preferences"></section></details>`;
  const account = `<p><a class="target" href="${route("account")}">${session.verified ? tr("Open my account", "Abrir mi cuenta") : tr("Sign in with your email to see photos and send us messages", { tu: "Entra con tu correo para ver fotos y enviarnos mensajes", ustedes: "Entren con su correo para ver fotos y enviarnos mensajes" })}</a></p>`;
  if (!attending.length)
    // The note page takes this household's note straight from the invitation
    // link (one per link), or from an email sign-in: no second sign-in.
    return `<div class="notice success"><h2>${tr("Thank you for letting us know.", "Gracias por avisarnos.")}</h2><p>${
      over
        ? tr("We missed you, and we send you our love.", "Los extrañamos y les mandamos todo nuestro cariño.")
        : tr("We’ll miss you, and we send you our love.", "Los vamos a extrañar y les mandamos todo nuestro cariño.")
    }</p></div>${saved}${note}${edit}${over ? "" : `${next}${whatsapp}${account}`}`;
  const calendars = attending
    .map(
      (e) =>
        `<div><strong>${eventNames[e]}</strong>${calendarActions(calendarKind[e], eventContent, lang, liveContent)}</div>`,
    )
    .join("");
  // Each link names only the events this household is coming to, and says
  // "parking" once there is parking to show (data-parking-posted, from the build).
  const dinner = attending.includes("dinner"),
    dance = attending.includes("dance");
  const places = [
    attending.includes("ceremony") &&
      `<a href="${route("ceremony")}">${"parkingPosted" in portal.dataset ? tr("Ceremony location & parking", "Ubicación y estacionamiento de la ceremonia") : tr("Ceremony location", "Ubicación de la ceremonia")}</a>`,
    (dinner || dance) &&
      `<a href="${route("reception")}">${dinner && dance ? tr("Dinner & reception location", "Ubicación de la cena y la recepción") : dinner ? tr("Dinner location", "Ubicación de la cena") : tr("Reception location", "Ubicación de la recepción")}</a>`,
  ]
    .filter(Boolean)
    .join("");
  if (over)
    return `<div class="notice success"><h2>${tr("Thank you for celebrating with us!", "¡Gracias por celebrar con nosotros!")}</h2><p>${tr("Thank you", "Gracias")}, ${esc(inv.name)}.</p></div>${summary(r.attendance, inv)}${saved}<div class="row-actions"><a class="button burgundy" href="${route("gallery")}">${term(terms.seePhotos)}</a><a href="${route("share")}">${esc(term(terms.sharePhotos))}<span class="arrow" aria-hidden="true">→</span></a></div>${note}${account}`;
  return `<div class="notice success"><h2>${tr("We can’t wait to celebrate with you!", "¡Los esperamos con mucha ilusión!")}</h2><p>${tr("Thank you", "Gracias")}, ${esc(inv.name)}.</p></div>${summary(r.attendance, inv)}${saved}<h3>${tr("Add to your calendar", "Agregar al calendario")}</h3><div class="calendar-actions">${calendars}</div><h3>${tr("Getting there", "Cómo llegar")}</h3><div class="row-actions">${places}</div>${edit}${note}${next}${whatsapp}${account}`;
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
  labelled = true;
  accountLabels(session);
  const view = portal.dataset.view;
  // In through the table card: the upload form, and nothing else anywhere
  // (every other page treats the card's session as signed out).
  if (session.kind === "party" && view === "share") {
    (await uploads()).mediaUpload(portal, eventContent.albums, { party: true });
    return;
  }
  if (session.kind !== "guest") {
    // The invitation code only opens the RSVP, so pages for messages and
    // uploads offer the email sign-in alone (UI-11).
    if (["rsvp", "rsvp/confirmed", "account"].includes(view)) accessForm();
    // A phone whose table card session ended (a reload after a long pause, a
    // new card, the window's close) is told how to come back: the card.
    else if (view === "share" && session.partyEnded)
      signedOut(view, session.partyEnded === "closed" ? cardRefusal({ code: "PARTY_CLOSED" }) : cardEnded(session.partyEnded));
    else signedOut(view);
    return;
  }
  // In with the invitation link, the household can still leave Sophia one note.
  if (session.scope === "rsvp" && view === "guestbook") {
    await noteForm(session);
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
      `<p class="notice">${tr("Your invitation hasn’t been sent yet. The RSVP opens here once we send it. You can already share photos and write to us from My account.", {
        tu: "Tu invitación aún no se ha enviado. Podrás confirmar tu asistencia aquí cuando te la enviemos. Ya puedes compartir fotos y escribirnos desde Mi cuenta.",
        ustedes: "Su invitación aún no se ha enviado. Podrán confirmar su asistencia aquí cuando se la enviemos. Ya pueden compartir fotos y escribirnos desde Mi cuenta.",
      })}</p><a class="target" href="${route("account")}">${term(terms.myAccount)}</a>`,
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
    closeAtDeadline(inv);
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
        `<p>${tr("No saved RSVP was found for this invitation.", "No encontramos una respuesta guardada para esta invitación.")}</p><a class="target" href="${route("rsvp")}">${term(terms.rsvpAction)}</a>`,
      );
      return;
    }
    // A household that is not coming still hears how news and the photos
    // reach them (QA-05), without what to wear or where to park.
    const next = partyOver()
      ? ""
      : attendingOf(inv).length
        ? await whatsNext(session)
        : await whatsNext(session, false, { photos: true });
    show(confirmation(inv, session, next), { focus: justSaved() });
    const updates = portal.querySelector("#whatsapp-preferences");
    if (updates) (await whatsapp()).whatsappPreferences(updates, inv.contact.phone || "");
    return;
  }
  if (view === "share") {
    (await uploads()).mediaUpload(portal, eventContent.albums);
    return;
  }
  if (view === "guestbook") {
    await noteForm(session);
    return;
  }
  // One thread with the family (R-085): a signed-in guest writes from My
  // account, where our replies appear, instead of a second form here.
  if (view === "contact")
    show(
      `<h2>${tr("Your messages with us", "Tus mensajes con nosotros")}</h2><p>${tr("You’re signed in, so write to us from My account: your messages and our replies are kept together there.", "Ya entraste, así que escríbenos desde Mi cuenta: ahí quedan juntos tus mensajes y nuestras respuestas.")}</p><p><a class="button burgundy" href="${route("account")}">${tr("Write to us in My account", "Escríbenos en Mi cuenta")}</a></p>`,
    );
}
// The header's sign-in item, and My account's own name, follow the session
// (R-041, R-042): "Sign in" as built, "My account" once signed in with an
// email. An invitation link opens only the RSVP, so it is not a sign-in.
// The page's own check of the session (showPortal) is newer than the one
// every page asks for as it opens (now.mjs sessionStatus), so it wins.
const accountHeading = document.body.dataset.route === "account" && document.querySelector(".page-heading h1");
let labelled = false;
function accountLabels(session) {
  const name = term(session?.kind === "guest" && session.verified ? terms.myAccount : terms.signIn),
    item = document.querySelector(".site-header .nav-signin a");
  if (item) item.textContent = name;
  if (!accountHeading || accountHeading.textContent === name) return;
  pageTitle = pageTitle.replace(accountHeading.textContent, name);
  document.title = document.title.replace(accountHeading.textContent, name);
  accountHeading.textContent = name;
}
// Who can read approved notes: the family's switch from /api/site (read by
// experience.js), "guests" until it answers (site/notes.mjs).
const noteVisibility = () => visibilityOf(liveContent ? eventContent : null);
// "Leave Sophia a note": from an email sign-in, or once per invitation link
// from the link itself (POST /api/guestbook-note), so a household that just
// answered by its link needs no second sign-in. The box is a real choice,
// unticked by default, worded for who would see the note.
async function noteForm(session) {
  const viaLink = session.scope === "rsvp";
  let name = "";
  if (viaLink)
    try {
      name = (await api("invitation")).name || "";
    } catch {
      /* the name stays for the guest to type */
    }
  const visibility = noteVisibility();
  show(
    `<h2>${esc(term(terms.leaveNote))}</h2>${viaLink ? `<p class="hint">${tr("You’re here with your invitation link, so you can send one note from it without signing in. To write more, sign in with your email.", "Entraste con tu enlace de invitación, así que puedes enviar un mensaje desde él sin entrar con tu correo. Para escribir más, entra con tu correo.")}</p>` : ""}<form id="message">${field(tr("Your name, as you’d like it to appear", "Tu nombre, como quieres que aparezca"), "name", { required: true, max: 100, autocomplete: "name", value: name })}<label>${tr("Your note", "Tu mensaje")}<textarea name="text" maxlength="2000" required></textarea></label><label class="check"><input type="checkbox" name="consent" aria-describedby="note-consent-hint">${esc(noteSentence("consent", visibility, lang))}</label><p class="hint" id="note-consent-hint">${esc(noteWords.consentHint[lang])}</p><p class="error" role="alert"></p><button class="button burgundy" type="submit" data-busy="${tr("Sending…", "Enviando…")}">${esc(term(terms.sendNote))}</button></form>`,
  );
  submit(document.querySelector("#message"), async (data) => {
    const note = {
      name: data.get("name"),
      text: data.get("text"),
      consent: data.has("consent"),
      // The wording the writer saw; the server never shows the note wider.
      audience: visibility,
    };
    await (viaLink ? api("guestbook-note", note) : api("messages", { kind: "guestbook", ...note }));
    // Said for who will really see it (R-024): with notes for signed-in
    // guests (site/notes.mjs), a household in by its invitation link does
    // not see the notes here itself.
    // It takes focus (show), which announces it once: no live region too.
    show(
      `<p class="notice success">${
        !note.consent
          ? tr("Thank you! Sophia will read your note; it won’t appear on this page.", "¡Gracias! Sophia leerá tu mensaje; no aparecerá en esta página.")
          : visibility === "public" || !viaLink
            ? tr("Thank you! Your note will appear here once we’ve read it.", "¡Gracias! Tu mensaje aparecerá aquí cuando lo hayamos leído.")
            : tr("Thank you! Once we’ve read your note, it will appear here for guests who sign in.", "¡Gracias! Cuando lo hayamos leído, tu mensaje aparecerá aquí para los invitados que entran al sitio.")
      }</p>`,
    );
  });
}
// Back from the confirmation can bring this page back as it was left (the
// back/forward cache), mid-save; draw it again from the server instead.
addEventListener("pageshow", (e) => {
  if (e.persisted && portal)
    showPortal().catch((err) => show(statusError(err.message)));
});
// Every sentence that says who can read the notes (the note page, Privacy)
// follows the family's switch; the built text is the default ("guests").
function noteAudience() {
  const visibility = noteVisibility();
  for (const el of document.querySelectorAll("[data-note-audience]"))
    el.textContent = noteSentence(el.dataset.noteAudience, visibility, lang);
}
// The notes on "A note for Sophia", above the way to leave one: from
// /api/public while the family has made them public, otherwise only for a
// verified sign-in (or an administrator) from /api/guestbook.
async function notesForSophia() {
  const box = document.querySelector("[data-notes]");
  if (!box) return;
  try {
    let notes = [];
    if (noteVisibility() === "public") notes = (await api("public")).messages;
    else {
      const session = await api("session");
      if (session.kind === "admin" || session.verified) notes = (await api("guestbook")).messages;
    }
    box.innerHTML = notes
      .map(
        (m) =>
          `<article class="card"><blockquote>${esc(m.text)}</blockquote><p>— ${esc(m.name)}</p></article>`,
      )
      .join("");
  } catch {
    box.innerHTML = `<p class="hint">${tr("Notes for Sophia aren’t available right now.", "Los mensajes para Sophia no están disponibles por ahora.")}</p>`;
  }
}
sessionStatus().then((session) => labelled || accountLabels(session));
await experienceReady;
// The server's clock and RSVP deadline (both requests started with the page).
await clockReady;
noteAudience();
// Privacy says what this device keeps after an RSVP as the family's switch
// has it (site/now.mjs): built as "remember", the default.
for (const el of document.querySelectorAll("[data-device-reply]"))
  el.hidden = el.dataset.deviceReply !== (remembersReplies() ? "remember" : "off");
// Questions: "When do I need to RSVP?" answers while RSVPs are open, once
// they have closed, and after the party (when nothing asks for an RSVP), and
// "Can I change my RSVP?" goes then; all on the server's clock.
const rsvpAnswers = document.querySelectorAll("[data-rsvp-while]");
if (rsvpAnswers.length)
  watch(() => {
    const now = partyOver() ? "over" : rsvpOpenNow() ? "open" : "closed";
    for (const el of rsvpAnswers) el.hidden = !el.dataset.rsvpWhile.split(" ").includes(now);
  });
if (document.querySelector("[data-whatsapp-signup]")) (await whatsapp()).whatsappProgramPage();
reloadOnNewLink();
let fragment = linkFragment();
const microsoft =
  portal && document.body.dataset.route === "account" && /state=/.test(location.hash)
    ? (await sso()).microsoftReturn()
    : null;
if (microsoft) {
  portal.innerHTML = `<p role="status">${tr("Finishing Microsoft sign-in…", "Terminando el acceso con Microsoft…")}</p>`;
  try {
    const cfg = await api("config");
    const { back, ...proof } = await (await sso()).finishMicrosoft(cfg.microsoftClientId, "guest", microsoft);
    await api("auth/sso/guest", { provider: "microsoft", ...proof });
    fragment = "";
    if (!goBack(back)) await showPortal();
  } catch (e) {
    accessForm("", e.message);
  }
} else if (portal && fragment && document.body.dataset.route === "account") {
  history.replaceState(null, "", location.pathname);
  show(
    `<h2>${tr("Confirm sign-in", "Confirmar acceso")}</h2><p>${tr("Continue only if you requested this email link.", "Continúa solo si solicitaste este enlace por correo.")}</p><form id="email-verify"><p class="error" role="alert"></p><button type="submit" class="button burgundy" data-busy="${tr("Signing in…", "Entrando…")}">${tr("Continue", "Continuar")}</button></form>`,
  );
  submit(document.querySelector("#email-verify"), async () => {
    let returnTo;
    try {
      ({ returnTo } = await api("auth/email/verify", { token: fragment }, { typed: false }));
    } catch (e) {
      if (e.code !== "EMAIL_LINK_INVALID") throw e;
      // The link was already used (it works once) or is past its 15 minutes.
      // The server answers both alike (server/accounts.mjs), so the page says
      // both, and offers a new link in one step, not a Continue that can no
      // longer work (R-078).
      show(
        emailSignInHtml({
          heading: tr("Get a new sign-in link", "Pide un enlace nuevo"),
          button: tr("Send me a new link", "Enviar un enlace nuevo"),
          intro: `<p class="notice" role="alert">${tr("This sign-in link has expired or was already used. Each link works once, within 15 minutes.", "Este enlace de acceso ya venció o ya se usó. Cada enlace funciona una sola vez, durante 15 minutos.")}</p>`,
        }),
      );
      wireEmailSignIn();
      return;
    }
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
    await api("invitation-session", { token: fragment }, { typed: false });
    fragment = "";
    await showPortal();
  } catch (e) {
    // Say why instead of silently showing the raw token in the code form.
    accessForm(
      "",
      e.code === "INVALID_INVITATION"
        ? tr(
            "This invitation link isn't working. It may be incomplete or replaced by a newer link; open your most recent invitation email or contact us.",
            { tu: "Este enlace de invitación no funciona. Puede estar incompleto o haber sido reemplazado por uno más reciente; abre tu correo de invitación más reciente o escríbenos.", ustedes: "Este enlace de invitación no funciona. Puede estar incompleto o haber sido reemplazado por uno más reciente; abran su correo de invitación más reciente o escríbannos." },
          )
        : e.message,
    );
  }
} else if (portal && /^party=/.test(fragment) && document.body.dataset.route === "share") {
  history.replaceState(null, "", location.pathname);
  const code = fragment.slice(6);
  fragment = "";
  await fromTableCard(code);
} else if (portal) {
  try {
    await showPortal();
  } catch (e) {
    show(statusError(e.message));
  }
}
await notesForSophia();


// The guests' gallery, only on its page (site/guest-gallery.js).
if (document.querySelector("[data-gallery-state]")) await (await import("./guest-gallery.js")).gallery();
