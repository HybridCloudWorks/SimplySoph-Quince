// Shared steps for the RSVP journeys.

// An event's fieldset, named like "Ceremony · 4:00 PM · Our Lady of Guadalupe Church".
export const eventGroup = (page, name) =>
  page
    .getByRole("main")
    .getByRole("group", {
      name: new RegExp("^" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " · "),
    });

// Chooses the counts for each event fieldset: { event: [adultsTeens, kids] }.
// Leave kids out for an invitation without children.
export async function chooseCounts(
  page,
  counts,
  labels = ["Adults / teens", "Children"],
) {
  for (const [legend, [adultsTeens, kids]] of Object.entries(counts)) {
    const event = eventGroup(page, legend);
    await event.getByLabel(labels[0]).selectOption(String(adultsTeens));
    if (kids !== undefined)
      await event.getByLabel(labels[1]).selectOption(String(kids));
  }
}

export const responsesOf = async (harness, household) =>
  Object.values((await harness.ledger.read()).responses).filter(
    (r) => r.householdId === household.id,
  );
