import { error } from "./auth.mjs";
import { smsDestination } from "./twilio.mjs";
import { hash } from "./auth.mjs";
export const validEmail = (email) =>
  typeof email === "string" &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export function recipientName(row) {
  if (row.lastName || row.firstName)
    return [row.lastName, row.firstName].filter(Boolean).join(", ");
  if (row.name.includes(",")) return row.name;
  const words = row.name.trim().split(/\s+/);
  return words.length > 1 ? `${words.pop()}, ${words.join(" ")}` : row.name;
}
export function audience(rows, selection, state, channel = "email") {
  if (
    !Array.isArray(selection.groups) ||
    !Array.isArray(selection.ids) ||
    selection.groups.length > 100 ||
    selection.ids.length > 2000 ||
    selection.groups.some((x) => typeof x !== "string" || x.length > 100)
  )
    throw error(422, "INVALID_AUDIENCE");
  const available = rows.filter(
    (r) => !r.archived && state.invitations[r.id]?.active !== false,
  );
  if (selection.ids.some((id) => !available.some((r) => r.id === id)))
    throw error(409, "AUDIENCE_CHANGED");
  const chosen = available.filter(
    (r) =>
      selection.ids.includes(r.id) ||
      (r.distributionGroups || []).some((g) => selection.groups.includes(g)),
  );
  const seen = new Set(),
    recipients = [];
  for (const r of chosen) {
    const destination =
      channel === "email"
        ? r.email?.trim().toLowerCase()
        : r.phone?.replace(/[ ()-]/g, "");
    let smsAllowed = false;
    if (channel === "sms") {
      try {
        smsDestination(destination);
        smsAllowed =
          !state.smsSuppression?.[hash(destination)] &&
          (!state.smsConsentPhones?.[r.id] ||
            state.smsConsentPhones[r.id] === destination);
      } catch {}
    }
    const eligible =
      channel === "email"
        ? validEmail(destination)
        : smsAllowed && r.smsConsent && r.smsConsentAt && !r.smsOptOut;
    if (!eligible || seen.has(destination)) continue;
    seen.add(destination);
    recipients.push({ ...r, destination, displayName: recipientName(r) });
  }
  return recipients.sort((a, b) => a.displayName.localeCompare(b.displayName));
}
