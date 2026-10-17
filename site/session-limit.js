// A session that ends while its page is open (WCAG 2.2.1 Timing Adjustable).
// Loaded only by the pages that need it (the RSVP, the share page), so the
// home page stays light (tests/home-weight.test.mjs).
//
// GET /api/session says how long this page's guest or table card session has
// left (expiresIn; site/client.js keeps it in `session`) and, unless it is a
// background check (?poll=1), renews it in its last 15 minutes.
// sessionLimit() keeps it while the guest uses `form` (a check-in in those 15
// minutes, at most once a minute, or every 5 minutes to learn early that it
// ended elsewhere); two minutes before the end it warns in the page-wide
// note, with a button that keeps it; and once it is over it calls
// ended(data), with what GET /api/session said. The end is always confirmed
// with the server first (?poll=1, which renews nothing), so a page whose
// uploads or other tabs kept the session going is never told it ended. One
// limit per page.
import { api, notify, clearNote, markBusy, announce, tr, session } from "./client.js";

const WARN = 120000;
let limit = null;
const noted = () => document.querySelector("#status [data-session-note]");
// `words`: warn(minutes), keep (the button), kept (said once kept), final
// (said when it can't be kept any longer).
export function sessionLimit({ kind, form, ended, words }) {
  limit?.stop();
  let timer = 0,
    asked = 0,
    warned = false,
    confirming = false,
    stopped = false;
  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    if (warned && noted()) clearNote();
    form?.removeEventListener("input", active);
    form?.removeEventListener("change", active);
    document.removeEventListener("visibilitychange", tick);
    if (session.seen === seen) session.seen = null;
    if (limit?.stop === stop) limit = null;
  };
  const end = (data = {}) => {
    if (stopped) return;
    stop();
    ended(data);
  };
  function seen(data) {
    if (data.kind !== kind) end(data);
    else tick();
  }
  const note = (text, action) => {
    notify(text, action);
    document.querySelector("#status > span")?.setAttribute("data-session-note", "");
  };
  function tick() {
    if (stopped || confirming || !session.ends) return;
    clearTimeout(timer);
    const left = session.ends - Date.now();
    if (left > WARN) {
      if (warned) unwarn();
      timer = setTimeout(tick, left - WARN);
      return;
    }
    // Asked with ?poll=1, so the question itself renews nothing.
    confirming = true;
    api("session?poll=1").then(
      () => {
        confirming = false;
        const now = session.ends - Date.now();
        if (stopped) return;
        if (now <= 0) return end();
        if (now <= WARN && !warned) {
          warned = true;
          note(words.warn(Math.max(1, Math.ceil(now / 60000))), { label: words.keep, onClick: keep });
        }
        if (now > WARN && warned) unwarn();
        timer = setTimeout(tick, now <= WARN ? now : now - WARN);
      },
      () => {
        // Offline: ask again in a minute, and say nothing yet.
        confirming = false;
        timer = setTimeout(tick, 60000);
      },
    );
  }
  function unwarn() {
    warned = false;
    if (noted()) clearNote();
  }
  async function keep(e) {
    const button = e.currentTarget,
      before = session.ends;
    button.dataset.busy = tr("One moment…", "Un momento…");
    const done = markBusy(button, null);
    try {
      await api("session");
    } catch {
      /* offline: the note stays, and so does its button */
    }
    done();
    if (stopped) return;
    if (session.ends > before + 60000) {
      unwarn();
      announce(words.kept);
      // It can't run longer (a link's 2 hours, the table card's window).
    } else if (session.ends > Date.now()) note(words.final);
    tick();
  }
  function active() {
    const since = Date.now() - asked;
    if (stopped || !session.ends || !(since >= 300000 || (since >= 60000 && session.ends - Date.now() < 900000))) return;
    asked = Date.now();
    api("session").catch(() => {});
  }
  form?.addEventListener("input", active);
  form?.addEventListener("change", active);
  document.addEventListener("visibilitychange", tick);
  session.seen = seen;
  limit = { stop };
  tick();
  return stop;
}
