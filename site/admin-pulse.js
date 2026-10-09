import { api } from "./client.js";

// Keeps an open admin tab current without reloading: every 30 s while the tab
// is visible it asks for a small change token and the unread count. It never
// sends anything; it only reads.
const INTERVAL_MS = 30000;

function badge(unread) {
  const link = document.querySelector('nav a[href="/admin/notifications/"], a[href="/admin/notifications/"]');
  if (!link) return;
  let mark = link.querySelector("[data-unread]");
  if (!unread) {
    mark?.remove();
    return;
  }
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "badge";
    mark.dataset.unread = "";
    link.append(" ", mark);
  }
  mark.textContent = String(unread);
  mark.setAttribute("aria-label", `${unread} unread`);
}

export function startPulse(onChange) {
  let token = null,
    stopped = false;
  async function tick() {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      const p = await api("admin/pulse");
      badge(p.unread);
      // onChange returns false when it could not apply the change yet (for
      // example someone is typing); the same change is then retried next time.
      if (token && p.token !== token && (await onChange()) === false) return;
      token = p.token;
    } catch (e) {
      // A signed-out or revoked session stops polling; other errors retry next tick.
      if (e.status === 401 || e.status === 403) stopped = true;
    }
  }
  setInterval(tick, INTERVAL_MS);
  document.addEventListener("visibilitychange", tick);
  tick();
}

// For pages where re-rendering would lose work (selections, open forms).
export function activityBanner(root, refresh) {
  if (root.querySelector("[data-new-activity]")) return;
  const note = document.createElement("p");
  note.className = "notice";
  note.dataset.newActivity = "";
  note.setAttribute("role", "status");
  note.append("New activity since this list loaded. ");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "plain-button";
  button.textContent = "Refresh list";
  button.onclick = refresh;
  note.append(button);
  root.prepend(note);
}
