import test from "node:test";
import assert from "node:assert/strict";
import { statusOf, statusForAnswer, wasSent, statusNames, statusOptions } from "../server/status.mjs";

const id = "12345678-1234-1234-1234-123456789012";
const row = (extra = {}) => ({
  id,
  phone: "+18175550100",
  invitationStatus: "",
  notionCounts: {},
  ...extra,
});
const answered = (attending) => ({
  invitations: { [id]: { id, latestSubmissionId: "r1" } },
  responses: {
    r1: {
      submittedAt: "2026-10-01T00:00:00Z",
      attendance: {
        ceremony: { adultsTeens: attending ? 1 : 0, kids: 0 },
        dinner: { adultsTeens: 0, kids: 0 },
        dance: { adultsTeens: 0, kids: 0 },
      },
    },
  },
});
const empty = () => ({ invitations: {}, responses: {} });

test("the five Status options and their colors", () => {
  assert.deepEqual(statusNames, ["Missing", "Waiting", "Invited", "Attending", "Not Attending"]);
  assert.deepEqual(
    statusOptions.map((o) => o.color),
    ["gray", "yellow", "blue", "green", "red"],
  );
});

test("no phone number means Missing, before anything else is looked at", () => {
  for (const phone of ["", "   ", undefined, null]) {
    const s = { ...answered(true), outbox: { a: { householdId: id, type: "invitation", state: "accepted" } } };
    assert.equal(statusOf(s, row({ phone })), "Missing", JSON.stringify(phone));
  }
});

test("an answer wins over sends: Attending or Not Attending, from the website or from Notion's RSVP column", () => {
  const sent = { outbox: { a: { householdId: id, type: "invitation", state: "accepted" } } };
  assert.equal(statusOf({ ...answered(true), ...sent }, row()), "Attending");
  assert.equal(statusOf({ ...answered(false), ...sent }, row()), "Not Attending");
  // Yes or No typed into Notion after a phone call; "Not sent" is not an answer.
  assert.equal(statusOf({ ...empty(), ...sent }, row({ invitationStatus: "Yes" })), "Attending");
  assert.equal(statusOf({ ...empty(), ...sent }, row({ invitationStatus: "No" })), "Not Attending");
  assert.equal(statusOf({ ...empty(), ...sent }, row({ invitationStatus: "Not sent" })), "Invited");
});

test("sent on any channel means Invited; drafts, failures and tests do not count", () => {
  const taken = ["accepted", "unknown", "sending"],
    notTaken = ["draft", "failed", "rejected"];
  for (const state of taken) {
    assert.equal(statusOf({ ...empty(), outbox: { a: { householdId: id, type: "invitation", state } } }, row()), "Invited", "email " + state);
    assert.equal(statusOf({ ...empty(), outbox: { a: { householdId: id, type: "reminder", state, generation: 3 } } }, row()), "Invited", "reminder " + state);
    assert.equal(statusOf({ ...empty(), smsDrafts: { a: { householdId: id, state, acceptedAt: 1 } } }, row()), "Invited", "sms " + state);
    assert.equal(statusOf({ ...empty(), whatsappDrafts: { a: { householdId: id, state } } }, row()), "Invited", "whatsapp " + state);
  }
  for (const state of notTaken) {
    assert.equal(statusOf({ ...empty(), outbox: { a: { householdId: id, type: "invitation", state } } }, row()), "Waiting", "email " + state);
    assert.equal(statusOf({ ...empty(), smsDrafts: { a: { householdId: id, state } } }, row()), "Waiting", "sms " + state);
    assert.equal(statusOf({ ...empty(), whatsappDrafts: { a: { householdId: id, state } } }, row()), "Waiting", "whatsapp " + state);
  }
  // Receipts and other mail types, other households, and tests to the organizer's phone.
  assert.equal(statusOf({ ...empty(), outbox: { a: { householdId: id, type: "receipt", state: "accepted" } } }, row()), "Waiting");
  assert.equal(statusOf({ ...empty(), outbox: { a: { householdId: "other", type: "invitation", state: "accepted" } } }, row()), "Waiting");
  assert.equal(statusOf({ ...empty(), smsDrafts: { a: { test: true, householdId: null, state: "accepted" } } }, row()), "Waiting");
  assert.equal(wasSent({ outbox: {}, smsDrafts: {}, whatsappDrafts: {} }, id), false);
  assert.equal(wasSent({}, id), false);
});

test("otherwise Waiting, and a link alone is not a send", () => {
  assert.equal(statusOf({ invitations: { [id]: { id, active: true } }, responses: {} }, row()), "Waiting");
  assert.equal(statusOf(empty(), row()), "Waiting");
});

test("the status written with an RSVP projection follows the same rules", () => {
  assert.equal(statusForAnswer(row({ phone: "" }), true), "Missing");
  assert.equal(statusForAnswer(row(), true), "Attending");
  assert.equal(statusForAnswer(row(), false), "Not Attending");
  // Held back: the family's own Yes/No in Notion decides; otherwise nothing.
  assert.equal(statusForAnswer(row({ invitationStatus: "Yes" }), null), "Attending");
  assert.equal(statusForAnswer(row({ invitationStatus: "No" }), null), "Not Attending");
  assert.equal(statusForAnswer(row({ invitationStatus: "Not sent" }), null), null);
});
