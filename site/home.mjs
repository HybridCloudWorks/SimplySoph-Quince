// The home page by phase (site/lifecycle.mjs homeState, on the server's clock
// from site/now.mjs). The built page is the RSVP-open state; this redraws it:
//   rsvp-open    "Time left to RSVP" and "Please RSVP by", RSVP first; a
//                household that replied sees "You replied ✓ · you can change it
//                until …" instead, with the schedule first
//   rsvp-closed  "Until the celebration", the schedule first
//   day-of       "Today is the day!", what is next, directions first (Google
//                Maps, with Apple Maps and Waze beside it)
//   live         Now / Next from the schedule; "Share your photos" leads from
//                dinner (the family's shareFrom)
//   after        "Thank you for celebrating with us." in place of the
//                invitation's line, then the photos, sharing and a note for
//                Sophia; no RSVP, countdown, past schedule or invitation art
//   archived     the photos only
// The newest announcement, dated, sits under the status; older ones below.
import { watch, lifecycle, answer, serverReply, sessionStatus } from "./now.mjs";
import { date, dayMonth, time, timeRange } from "./datetime.mjs";
import { terms, say, registerFor } from "./lexicon.mjs";
import { mapLinks, newTab, arrow, pageHref, escapeHtml as esc } from "./celebration.mjs";

export function startHome({ lang, content }) {
  const es = lang === "es",
    tr = (en, spanish) => (es ? spanish : en),
    // The hosts speak to the household here (ustedes).
    t = (entry) => say(entry, lang, registerFor("")),
    $ = (selector) => document.querySelector(selector),
    hero = $("[data-home]");
  if (!hero) return;
  const nodes = {
    line: $("[data-hero-line]"),
    actions: $("[data-home-actions]"),
    replyBy: $("[data-reply-by]"),
    status: $("[data-home-status]"),
    countdown: $("[data-countdown]"),
    schedule: $("[data-home-schedule]"),
    invitation: $("[data-home-invitation]"),
    note: $("[data-home-note]"),
  };
  const choices = document.createElement("p");
  choices.className = "map-choices";
  choices.hidden = true;
  nodes.actions?.after(choices);
  nodes.choices = choices;
  // Redraw only what changed (compared as the browser writes it), so the
  // built page is kept as it is when it is already right, and focus and screen
  // readers are left alone.
  const parse = document.createElement("template");
  const put = (node, html) => {
    if (!node) return;
    node.hidden = !html;
    parse.innerHTML = html;
    if (parse.innerHTML !== node.innerHTML) node.innerHTML = html;
  };
  const show = (node, visible) => node && (node.hidden = !visible);
  // The invitation's line ("Please join us…") until the party is over; then
  // the thanks (the family can change the sentence; this is the default).
  const invitationLine = nodes.line?.innerHTML ?? "";
  const day = (ms) => date(ms, lang, { weekday: true, year: false });
  const units = es
    ? [["día", "días"], ["hora", "horas"], ["minuto", "minutos"]]
    : [["day", "days"], ["hour", "hours"], ["minute", "minutes"]];
  // "Time left to RSVP 29 days 14 hours 59 minutes", in whole minutes rounded
  // up; returns the markup and the instant the minutes change.
  function countdown(label, target, now) {
    const minutes = Math.ceil((target - now) / 60000),
      values = [Math.floor(minutes / 1440), Math.floor(minutes / 60) % 24, minutes % 60];
    return [
      `<p class="countdown-label">${label}</p> <p class="countdown-values">${values
        .map((v, i) => `<span><strong>${v}</strong> ${units[i][v === 1 ? 0 : 1]}</span>`)
        .join(" ")}</p>`,
      target - (minutes - 1) * 60000,
    ];
  }
  const part = (c, key) =>
    ({
      ceremony: [t(terms.ceremonyLong), c.ceremony.name],
      dinner: [t(terms.dinner), c.reception.name],
      reception: [t(terms.receptionDance), c.reception.name],
    })[key];
  const nowLine = (c, p) => {
    const [name, place] = part(c, p.part);
    return `<p class="now-next"><span class="now-next-label">${tr("Now", "Ahora")}</span> ${esc(name)} · ${esc(timeRange(p.start, p.end, lang, { nbsp: true }))} · ${esc(place)}</p>`;
  };
  const nextLine = (c, p) => {
    const [name, place] = part(c, p.part);
    return `<p class="now-next"><span class="now-next-label">${tr("Next", "Después")}</span> ${esc(name)} · ${esc(time(p.start, lang, { nbsp: true }))} · ${esc(place)}</p>`;
  };
  const replied = (yes, until) =>
    `<p class="home-replied">${
      yes
        ? tr("You replied", "Ya respondieron") + ' <span aria-hidden="true">✓</span>'
        : tr("Thank you for letting us know", "Gracias por avisarnos")
    }${
      until
        ? " · " +
          (yes
            ? tr(`you can change it until ${day(until)}`, `pueden cambiar su respuesta hasta el ${day(until)}`)
            : tr(`you can change your RSVP until ${day(until)}`, `pueden cambiar su respuesta hasta el ${day(until)}`))
        : ""
    }</p>`;
  const page = (route, label, primary, hash = "") =>
    `<a${primary ? ' class="button burgundy"' : ""} href="${pageHref(route, lang)}${hash}">${label}${primary ? "" : arrow}</a>`;
  function action(key, primary, c) {
    if (key.startsWith("directions:")) {
      const place = key.slice(11);
      return `<a${primary ? ' class="button burgundy"' : ""} href="${esc(mapLinks(c[place].address).google)}" target="_blank" rel="noopener noreferrer">${
        place === "ceremony"
          ? tr("Directions to the ceremony", "Cómo llegar a la ceremonia")
          : tr("Directions to the reception", "Cómo llegar a la recepción")
      }${newTab(lang)}</a>`;
    }
    return {
      rsvp: () => page("rsvp", t(terms.rsvpAction), primary),
      "change-rsvp": () => page("rsvp", t(terms.changeRsvp), primary),
      schedule: () => page("details", tr("See the schedule", "Ver el programa"), primary),
      share: () => page("share", t(terms.sharePhotos), primary, "#media-upload"),
      gallery: () => page("gallery", tr("See the photos", "Ver las fotos"), primary),
      note: () => page("guestbook", t(terms.leaveNote), primary),
    }[key]();
  }

  function render(s, now) {
    const m = lifecycle();
    if (!s || !m) return;
    const c = content(),
      st = s.status,
      over = s.phase === "after" || s.phase === "archived",
      yes = answer() !== "no";
    hero.dataset.phase = s.phase;
    put(nodes.line, over ? tr("Thank you for celebrating with us.", "Gracias por celebrar con nosotros.") : invitationLine);
    put(nodes.actions, s.actions.map((key, i) => action(key, i === 0, c)).join(""));
    const directions = s.actions.find((key) => key.startsWith("directions:"));
    if (directions) {
      const links = mapLinks(c[directions.slice(11)].address);
      put(
        nodes.choices,
        `${tr("Also in", "También en")} <a href="${esc(links.apple)}" target="_blank" rel="noopener noreferrer">Apple Maps${newTab(lang)}</a> · <a href="${esc(links.waze)}" target="_blank" rel="noopener noreferrer">Waze${newTab(lang)}</a>`,
      );
    } else put(nodes.choices, "");
    put(
      nodes.replyBy,
      s.showReplyBy ? tr(`Please RSVP by ${day(m.deadline)}`, `Por favor, confirmen a más tardar el ${day(m.deadline)}`) : "",
    );
    let status = "",
      clock = "",
      wake = null;
    if (st.kind === "replied") status = replied(yes, st.until);
    if (st.kind === "event-countdown" && st.replied) status = replied(yes, null);
    if (st.kind === "reply-countdown")
      [clock, wake] = countdown(tr("Time left to RSVP", "Tiempo para confirmar"), st.target, now);
    if (st.kind === "event-countdown")
      [clock, wake] = countdown(tr("Until the celebration", "Falta para la celebración"), st.target, now);
    const today = `<p class="countdown-label">${tr("Today is the day!", "¡Hoy es el gran día!")}</p>`;
    if (st.kind === "today") {
      clock = today;
      if (st.next) status = nextLine(c, st.next);
    }
    if (st.kind === "now-next") {
      if (st.today) clock = today;
      status = (st.now && st.now.part !== "between" ? nowLine(c, st.now) : "") + (st.next ? nextLine(c, st.next) : "");
    }
    put(nodes.status, status);
    put(nodes.countdown, clock);
    show(nodes.schedule, s.showSchedule);
    show(nodes.invitation, !over);
    show(nodes.note, !s.actions.includes("note"));
    // A countdown changes once a minute; with reduced motion it is set once
    // per visit and only changes at the boundaries.
    return matchMedia("(prefers-reduced-motion: reduce)").matches ? null : wake;
  }
  watch(render);

  // Signed in: the server says whether this household replied (only that; a
  // background check that does not keep the session open).
  sessionStatus().then((session) => session?.kind === "guest" && serverReply(session.household));
  announcements(lang, tr);
}

// The newest announcement under the status line, dated; older ones lower down.
// On /es/, a part that has no Spanish shows the English, marked as English.
async function announcements(lang, tr) {
  const latest = document.querySelector("[data-latest-update]"),
    older = document.querySelector("[data-announcements]");
  let list = [];
  try {
    const res = await fetch("/api/public", { credentials: "same-origin" });
    if (res.ok) list = (await res.json()).announcements || [];
  } catch {
    /* No announcements during an outage. */
  }
  const es = lang === "es";
  const text = (a, field, tag, extra = "") => {
    const spanish = es && a[field + "Es"],
      english = es && !spanish;
    return `<${tag}${extra}${english ? ' lang="en"' : ""}>${esc(spanish || a[field])}</${tag}>`;
  };
  const item = (a, heading, cls) =>
    `<article class="${cls}"><p class="update-date"><time datetime="${esc(a.publishedAt)}">${tr(`Posted ${dayMonth(a.publishedAt, "en")}`, `Publicado el ${dayMonth(a.publishedAt, "es")}`)}</time></p>${text(a, "title", heading)}${text(a, "text", "p")}</article>`;
  if (latest) {
    latest.innerHTML = list[0] ? item(list[0], "h2", "latest-update") : "";
    latest.hidden = !list[0];
  }
  if (older) older.innerHTML = list.slice(1).map((a) => item(a, "h3", "notice")).join("");
}
