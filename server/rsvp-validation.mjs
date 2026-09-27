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
function validateInvitation(invitation, now) {
  if (!invitation || invitation.active !== true) fail(403, 'INVITATION_INACTIVE');
  const deadline = invitation.deadline;
  if (typeof deadline !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(deadline)
    || !Number.isFinite(Date.parse(deadline))) fail(503, 'DEADLINE_NOT_CONFIGURED');
  if (now >= Date.parse(deadline)) fail(403, 'RSVP_CLOSED');
}
function validateContact(value) {
  keys(value, ['email', 'phone', 'address']);
  const email = text(value.email, 254);
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\r\n]/.test(email))) fail(422, 'INVALID_EMAIL');
  return {email, phone:text(value.phone, 40), address:value.address === null ? null : text(value.address, 500)};
}
export function validateRsvp(input, invitation, now = Date.now()) {
  validateInvitation(invitation, now);
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
  const contact = validateContact(input.contact);
  return {previousSubmissionId:input.previousSubmissionId, guests, contact, requests:text(input.requests, 1000)};
}

// Existing Notion Invitations rows represent households, not a roster of people.
// Organizer-owned capacities are independent of each event's attendance counts.
export function validateHouseholdRsvp(input, invitation, now = Date.now()) {
  validateInvitation(invitation, now);
  keys(input, ['previousSubmissionId', 'attendance', 'contact', 'requests']);
  if (!Object.hasOwn(input, 'previousSubmissionId') || input.previousSubmissionId !== (invitation.latestSubmissionId ?? null)) fail(409, 'RESPONSE_CHANGED');
  const categories = ['adultsTeens', 'kids'];
  const capacity = invitation.capacity;
  if (!object(capacity) || categories.some(k => !Number.isSafeInteger(capacity[k]) || capacity[k] < 0 || capacity[k] > 50)
    || capacity.adultsTeens + capacity.kids < 1 || capacity.adultsTeens + capacity.kids > 50) fail(503, 'INVITATION_NOT_CONFIGURED');
  keys(input.attendance, events);
  const attendance = {};
  for (const event of events) {
    if (typeof invitation.invited?.[event] !== 'boolean') fail(503, 'INVITATION_NOT_CONFIGURED');
    const answer = input.attendance[event];
    keys(answer, categories);
    for (const category of categories) {
      if (!Number.isSafeInteger(answer[category]) || answer[category] < 0 || answer[category] > capacity[category]) fail(422, 'INVALID_ATTENDANCE_COUNT');
      if (!invitation.invited[event] && answer[category] !== 0) fail(422, 'EVENT_NOT_INVITED');
    }
    attendance[event] = {adultsTeens:answer.adultsTeens, kids:answer.kids};
  }
  return {previousSubmissionId:input.previousSubmissionId, attendance, contact:validateContact(input.contact), requests:text(input.requests, 1000)};
}
