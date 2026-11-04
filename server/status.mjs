import { attendanceOf } from "./attendance.mjs";

// The Notion "Status" column (a select) is owned by the website: it says, per
// household, where things stand, and is recomputed from the ledger and the
// Notion row by the scheduled drain, right after sends and RSVPs, and from
// "Check statuses now" on Invitations. A value typed by hand is set back at
// the next check. Options in display order, with the colors the schema
// action gives the ones it adds (the family's own options keep theirs).
export const statusOptions = [
  { name: "Missing", color: "gray" },
  { name: "Waiting", color: "yellow" },
  { name: "Invited", color: "blue" },
  { name: "Attending", color: "green" },
  { name: "Not Attending", color: "red" },
];
export const statusNames = statusOptions.map((o) => o.name);

// The provider took the message, or may have (mail-batches.mjs `accepted`,
// linkOpens in application.mjs): sent, as far as the family is concerned.
const taken = (d) => ["accepted", "unknown", "sending"].includes(d?.state);

// Has this household been sent an invitation or reminder on any channel?
// Email: an invitation or reminder in the outbox, any link generation. SMS and
// WhatsApp: any draft for the household the provider took. Tests to the
// organizer's own phone (test: true, no household) never count.
export function wasSent(s, householdId) {
  if (
    Object.values(s.outbox || {}).some(
      (j) =>
        j.householdId === householdId &&
        ["invitation", "reminder"].includes(j.type) &&
        taken(j),
    )
  )
    return true;
  for (const drafts of [s.smsDrafts, s.whatsappDrafts])
    if (
      Object.values(drafts || {}).some(
        (d) => !d.test && d.householdId === householdId && taken(d),
      )
    )
      return true;
  return false;
}

// First rule that matches wins:
// 1. no phone number on the Notion row: Missing;
// 2. answered (website, or Yes/No typed into Notion's RSVP column):
//    Attending or Not Attending;
// 3. sent an invitation or reminder on any channel: Invited;
// 4. otherwise Waiting.
export function statusOf(s, row) {
  if (!String(row.phone ?? "").trim()) return "Missing";
  const answer = attendanceOf(s, row);
  if (answer) return answer.attending ? "Attending" : "Not Attending";
  if (wasSent(s, row.id)) return "Invited";
  return "Waiting";
}

// The status an RSVP projection writes alongside the answer (notion.project):
// the same rules, from the row's phone and the answer being written, or
// Notion's own Yes/No when the website's answer is held back.
export function statusForAnswer(row, attending) {
  if (!String(row.phone ?? "").trim()) return "Missing";
  if (typeof attending === "boolean") return attending ? "Attending" : "Not Attending";
  if (row.invitationStatus === "Yes") return "Attending";
  if (row.invitationStatus === "No") return "Not Attending";
  return null;
}
