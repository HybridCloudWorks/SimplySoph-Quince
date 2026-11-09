// The household filters of Admin → Invitations and the SMS tab
// (site/admin-filter.mjs): the Notion Status column's values, "No status" for
// rows without one, and the AND of text, link status and Notion status.
import test from "node:test";
import assert from "node:assert/strict";
import {
  householdMatches,
  matchesNotionStatus,
  notionStatusNames,
  notionStatusOf,
  notionStatusOptions,
  NO_NOTION_STATUS,
} from "../site/admin-filter.mjs";
import { statusNames } from "../server/status.mjs";

test("the filter offers exactly the five Notion statuses the website writes, plus All and No status", () => {
  assert.deepEqual(notionStatusNames, statusNames);
  assert.deepEqual(
    notionStatusOptions.map(([value]) => value),
    ["", ...statusNames, NO_NOTION_STATUS],
  );
});

test("a missing or empty notionStatus (an API older than 3) reads as no status", () => {
  assert.equal(notionStatusOf({}), "");
  assert.equal(notionStatusOf({ notionStatus: "" }), "");
  assert.equal(notionStatusOf({ notionStatus: null }), "");
  assert.equal(notionStatusOf({ notionStatus: "Waiting" }), "Waiting");
  assert.equal(notionStatusOf(undefined), "");
});

test("All matches every row; a value matches only that value; No status matches the rows without one", () => {
  const waiting = { notionStatus: "Waiting" },
    none = { notionStatus: "" },
    old = {};
  for (const row of [waiting, none, old]) assert.ok(matchesNotionStatus(row, ""));
  assert.ok(matchesNotionStatus(waiting, "Waiting"));
  assert.ok(!matchesNotionStatus(waiting, "Invited"));
  assert.ok(!matchesNotionStatus(none, "Waiting"));
  assert.ok(matchesNotionStatus(none, NO_NOTION_STATUS));
  assert.ok(matchesNotionStatus(old, NO_NOTION_STATUS));
  assert.ok(!matchesNotionStatus(waiting, NO_NOTION_STATUS));
});

test("text, link status and Notion status combine with AND", () => {
  const row = { status: "sent", notionStatus: "Waiting" },
    words = "Rivera Family Invitation emailed Notion: Waiting";
  assert.ok(householdMatches(row, {}, words));
  assert.ok(householdMatches(row, { text: "rivera", status: "sent", notionStatus: "Waiting" }, words));
  assert.ok(householdMatches(row, { text: "  RIVERA " }, words), "text is trimmed and case-insensitive");
  assert.ok(!householdMatches(row, { text: "morales" }, words));
  assert.ok(!householdMatches(row, { status: "opened" }, words));
  assert.ok(!householdMatches(row, { notionStatus: "Invited" }, words));
  assert.ok(!householdMatches(row, { text: "rivera", status: "sent", notionStatus: "Invited" }, words), "one failing filter hides the row");
  assert.ok(householdMatches({ status: "issued" }, { notionStatus: NO_NOTION_STATUS }));
});

test("the Texted filter keeps the households already texted, or the ones still to text", () => {
  const texted = { status: "issued", textedAt: 1790000000000 },
    left = { status: "issued", textedAt: null };
  assert.ok(householdMatches(texted, { texted: "texted" }));
  assert.ok(!householdMatches(left, { texted: "texted" }));
  assert.ok(householdMatches(left, { texted: "not-texted" }));
  assert.ok(!householdMatches(texted, { texted: "not-texted" }));
  assert.ok(householdMatches(texted, { texted: "" }) && householdMatches(left, {}));
  // With the link status too (AND): linked but not texted yet.
  assert.ok(householdMatches(left, { texted: "not-texted", status: "issued" }));
  assert.ok(!householdMatches(left, { texted: "not-texted", status: "sent" }));
});
