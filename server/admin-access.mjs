import { rosterMatch } from "./accounts.mjs";
// Who is an administrator, decided by Notion (owner decision, Oct 10 2026):
//   - the break-glass owner(s) in ADMIN_EMAILS, the one approved exception, and
//   - anyone whose email is on a Notion row with "Administrator Eligible" ticked.
// Unticking the box revokes access on the next request. Admins still enter their
// authenticator code at sign-in (owner decision 1).
export function createAdminAccess({ notion, adminEmails, now }) {
  const confirmed = new Map(); // rowId|email -> until; a short positive cache only
  const isOwner = (email) => adminEmails.includes(email);
  // Called at sign-in. Reads Notion fresh so a just-ticked box works at once.
  async function find(address) {
    if (isOwner(address)) return { id: "owner:" + address, email: address };
    const row = rosterMatch(await notion.list({ fresh: true }), address);
    if (!row?.administratorEligible) return null;
    return { id: "admin:" + address, email: address, rowId: row.id };
  }
  // Called on every request that carries an admin session. A Notion failure is
  // raised (503) instead of signing the admin out over a brief outage.
  async function stillAdmin(session) {
    if (!session.rowId) return isOwner(session.email);
    const k = session.rowId + "|" + session.email;
    if (confirmed.get(k) > now()) return true;
    const row = await notion.read(session.rowId, { fresh: true });
    const ok =
      !row.archived &&
      row.administratorEligible &&
      rosterMatch([row], session.email)?.id === row.id;
    if (ok) confirmed.set(k, now() + 5000);
    else confirmed.delete(k);
    return ok;
  }
  return { find, stillAdmin, isOwner };
}
