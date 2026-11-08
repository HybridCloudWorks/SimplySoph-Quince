// Reset one household to "never invited" (any administrator; POST
// /api/admin/household-reset). For rehearsing the guest journey with the
// family's own test households: the next SOPHIA, link or batch treats them as
// brand new. Runs inside one ledger transaction (no side effects); the Notion
// columns the website wrote are cleared afterwards (notion.resetProjection).
//
// Removed: the invitation and every private link minted for it, its RSVP
// answers and the Notion difference awaiting a choice, its sign-ins
// (sessions, verified accounts, profile), the emails, texts and WhatsApp
// messages drafted or sent to it with their send-once claims, its SMS and
// WhatsApp opt-in bindings (and the SOPHIA receipt of its phone), its
// notifications, its seat at a table, and its contact and guestbook messages.
//
// Kept on purpose: a STOP (an opt-out is never undone by the website), the
// event log and the audit trail (history of what happened, plus this reset),
// and uploaded photos and videos (removed one by one on Photo & video review).
import { hash } from "./auth.mjs";

const byHousehold = (collection, id) =>
  Object.entries(collection || {}).filter(([, v]) => v?.householdId === id);

export function resetHouseholdState(s, id, phones = []) {
  const removed = {};
  const drop = (name, entries) => {
    for (const [key] of entries) delete s[name][key];
    if (entries.length) removed[name] = entries.length;
  };
  const invite = s.invitations?.[id];
  if (invite) {
    delete s.invitations[id];
    removed.invitations = 1;
  }
  drop("invitationLinks", byHousehold(s.invitationLinks, id));
  drop(
    "responses",
    Object.entries(s.responses || {}).filter(
      ([key, r]) => r?.householdId === id || key === invite?.latestSubmissionId,
    ),
  );
  if (s.drift?.[id]) {
    delete s.drift[id];
    removed.drift = 1;
  }
  const accounts = byHousehold(s.accounts, id).map(([key]) => key);
  drop(
    "sessions",
    Object.entries(s.sessions || {}).filter(
      ([, v]) => v?.householdId === id || (v?.accountId && accounts.includes(v.accountId)),
    ),
  );
  drop("accounts", byHousehold(s.accounts, id));
  if (s.profiles?.[id]) {
    delete s.profiles[id];
    removed.profiles = 1;
  }
  drop("outbox", byHousehold(s.outbox, id));
  for (const [drafts, claims] of [
    ["smsDrafts", "smsClaims"],
    ["whatsappDrafts", "whatsappClaims"],
  ]) {
    const mine = byHousehold(s[drafts], id),
      ids = new Set(mine.map(([key]) => key));
    drop(claims, Object.entries(s[claims] || {}).filter(([, draftId]) => ids.has(draftId)));
    drop(drafts, mine);
  }
  // The automatic invitation's send-once claim is per phone.
  for (const phone of phones) {
    const claim = hash(JSON.stringify(["auto-invite", phone]));
    if (s.smsClaims?.[claim]) drop("smsClaims", [[claim]]);
  }
  for (const map of ["smsConsentPhones", "whatsappConsentPhones"])
    if (s[map]?.[id]) {
      delete s[map][id];
      removed[map] = 1;
    }
  // The SOPHIA receipt of the household's phone goes, so the next SOPHIA is a
  // first opt-in again (welcome text, automatic invitation). A STOP stays.
  for (const phone of phones) {
    const key = hash(phone);
    if (s.smsPreferences?.[key]?.type === "START") {
      delete s.smsPreferences[key];
      if (s.smsSuppression?.[key]) delete s.smsSuppression[key];
      removed.smsPreferences = (removed.smsPreferences || 0) + 1;
    }
  }
  drop("notifications", byHousehold(s.notifications, id));
  drop("messages", byHousehold(s.messages, id));
  for (const table of Object.values(s.tables || {}))
    if (Array.isArray(table.households) && table.households.includes(id)) {
      table.households = table.households.filter((h) => h !== id);
      removed.tables = (removed.tables || 0) + 1;
    }
  return removed;
}
