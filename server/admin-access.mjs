import { notionOutage } from "./notion.mjs";
// The ticked Notion row whose main Email is this address. Only the main Email
// makes someone an administrator (owner decision 3): Additional Emails let other
// household members sign in as guests, never as admins (re-audit). An address on
// two rows is ambiguous and is not an admin.
export function adminRow(rows, address) {
  const found = rows.filter((r) => !r.archived && r.email === address);
  return found.length === 1 && found[0].administratorEligible ? found[0] : null;
}
// Who is an administrator, decided by Notion (owner decision, Oct 10 2026):
//   - the break-glass owner(s) in ADMIN_EMAILS, the one approved exception, and
//   - anyone whose main Email is on a Notion row with "Administrator Eligible" ticked.
// Unticking the box revokes access on the next request. Admins still enter their
// authenticator code at sign-in (owner decision 1).
export function createAdminAccess({ notion, adminEmails, now }) {
  const confirmed = new Map(), // rowId|email -> until; a short positive cache only
    lastConfirmed = new Map(); // rowId|email -> when Notion last said yes
  const isOwner = (email) => adminEmails.includes(email);
  // Called at sign-in. The link request uses the 30-second cached list, so a
  // stranger typing addresses cannot force a Notion read each time; opening the
  // link and entering the code read Notion fresh.
  async function find(address, { fresh = true } = {}) {
    if (isOwner(address)) return { id: "owner:" + address, email: address };
    const row = adminRow(await notion.list({ fresh }), address);
    if (!row) return null;
    return { id: "admin:" + address, email: address, rowId: row.id };
  }
  // Called on every request that carries an admin session. A Notion failure is
  // raised (503) instead of signing the admin out over a brief outage.
  async function stillAdmin(session) {
    if (!session.rowId) return isOwner(session.email);
    const k = session.rowId + "|" + session.email;
    if (confirmed.get(k) > now()) return true;
    let rows;
    try {
      rows = await notion.list({ fresh: true });
    } catch (e) {
      // During a Notion outage, an admin Notion confirmed in the last 15 minutes
      // keeps working (NOTION-6). The first answer after the outage applies any
      // change. When only this site is throttled (NOTION_429), the box can still
      // be unticked in Notion, so a removed admin keeps access for at most 15
      // minutes after their last confirmation: the accepted cost of the fallback.
      if (notionOutage(e) && lastConfirmed.get(k) > now() - 900000) return true;
      throw e;
    }
    const ok = adminRow(rows, session.email)?.id === session.rowId;
    if (ok) {
      confirmed.set(k, now() + 5000);
      lastConfirmed.set(k, now());
    } else {
      confirmed.delete(k);
      lastConfirmed.delete(k);
    }
    return ok;
  }
  return { find, stillAdmin, isOwner };
}
