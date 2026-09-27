export class RsvpError extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const fail = (status, code) => { throw new RsvpError(status, code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, allowed) {
  if (!object(value) || Object.keys(value).some(k => !allowed.includes(k))) fail(422, 'INVALID_FIELDS');
}
function text(value, max) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(422, 'INVALID_TEXT');
  return value.trim();
}
export const events = Object.freeze(['ceremony', 'dinner', 'dance']);

// invitation is trusted server data freshly read at submission, never client input.
// The durable transaction MUST repeat the version/entitlement checks before commit.
export function validateRsvp(input, invitation, now = Date.now()) {
  if (!invitation || invitation.active !== true) fail(403, 'INVITATION_INACTIVE');
  const deadline = invitation.deadline;
  if (typeof deadline !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(deadline)
    || !Number.isFinite(Date.parse(deadline))) fail(503, 'DEADLINE_NOT_CONFIGURED');
  if (now >= Date.parse(deadline)) fail(403, 'RSVP_CLOSED');
  keys(input, ['previousSubmissionId', 'guests', 'contact', 'requests']);
  if (!Object.hasOwn(input, 'previousSubmissionId') || input.previousSubmissionId !== (invitation.latestSubmissionId ?? null)) fail(409, 'RESPONSE_CHANGED');
  if (!Array.isArray(invitation.guests) || !invitation.guests.length || invitation.guests.length > 50
    || new Set(invitation.guests.map(g => g.id)).size !== invitation.guests.length) fail(503, 'INVITATION_NOT_CONFIGURED');
  if (!Array.isArray(input.guests) || input.guests.length !== invitation.guests.length) fail(422, 'GUEST_LIST_CHANGED');
  const byId = new Map(invitation.guests.map(g => [g.id, g]));
  const seen = new Set();
  const guests = input.guests.map(answer => {
    keys(answer, ['guestId', ...events]);
    const guest = byId.get(answer.guestId);
    if (!guest || seen.has(answer.guestId)) fail(422, 'GUEST_LIST_CHANGED');
    seen.add(answer.guestId);
    const result = {guestId:guest.id};
    for (const event of events) {
      if (typeof guest.invited?.[event] !== 'boolean') fail(503, 'INVITATION_NOT_CONFIGURED');
      if (guest.invited[event]) {
        if (!['yes', 'no'].includes(answer[event])) fail(422, 'ANSWER_REQUIRED');
        result[event] = answer[event];
      } else {
        if (Object.hasOwn(answer, event) && answer[event] !== 'not-invited') fail(422, 'EVENT_NOT_INVITED');
        result[event] = 'not-invited';
      }
    }
    return result;
  });
  keys(input.contact, ['email', 'phone', 'address']);
  const email = text(input.contact.email, 254);
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email))) fail(422, 'INVALID_EMAIL');
  const contact = {email, phone:text(input.contact.phone, 40), address:input.contact.address === null ? null : text(input.contact.address, 500)};
  return {previousSubmissionId:input.previousSubmissionId, guests, contact, requests:text(input.requests, 1000)};
}
