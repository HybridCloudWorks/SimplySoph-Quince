const events = ["ceremony", "dinner", "dance"];
const zero = () => ({ adultsTeens: 0, kids: 0 });

// The answer the family goes by for one household, shared by the dashboard,
// Invitations, seating and reminders (re-audit N2). Normally the website's
// latest RSVP. Notion's RSVP column and head counts count instead when Notion
// has an answer ("Yes" or "No") and either the website has none (an RSVP taken
// by phone and typed into Notion) or an admin chose to keep Notion's version
// of a difference (/api/admin/drift). Any other RSVP value, such as "Not sent",
// is not an answer. Null when neither has one.
export function attendanceOf(s, row) {
  const invite = s.invitations[row.id],
    response = invite ? s.responses[invite.latestSubmissionId] : null,
    drift = s.drift?.[row.id],
    notionAnswer = ["Yes", "No"].includes(row.invitationStatus),
    keptNotion = !!drift?.accepted && drift.accepted === drift.signature;
  if (notionAnswer && (!response || keptNotion)) {
    const yes = row.invitationStatus === "Yes";
    return {
      source: "notion",
      attending: yes,
      attendance: Object.fromEntries(
        events.map((e) => [
          e,
          yes
            ? {
                adultsTeens: row.notionCounts?.[e]?.adultsTeens ?? 0,
                kids: row.notionCounts?.[e]?.kids ?? 0,
              }
            : zero(),
        ]),
      ),
      respondedAt: null,
    };
  }
  if (!response) return null;
  return {
    source: "website",
    attending: Object.values(response.attendance).some((v) => v.adultsTeens + v.kids > 0),
    attendance: response.attendance,
    respondedAt: response.submittedAt,
  };
}

// Dinner seats one household needs (seating plans the dinner).
export const dinnerSeats = (answer) =>
  answer?.attendance.dinner
    ? answer.attendance.dinner.adultsTeens + answer.attendance.dinner.kids
    : 0;
