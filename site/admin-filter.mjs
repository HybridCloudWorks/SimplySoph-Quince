// Filters shared by Admin → Invitations and the SMS tab: the Notion Status
// column (server/status.mjs) as the family sees it in Notion, and the one rule
// that decides whether a household row stays in view. Pure functions, so the
// page's own markup and the unit tests use the same decision.

// The five values the website writes to Notion, plus "No status" for a row
// whose column or value is empty (an API older than 3 sends no field at all).
export const notionStatusNames = ["Missing", "Waiting", "Invited", "Attending", "Not Attending"];
export const NO_NOTION_STATUS = "none";
export const notionStatusOptions = [
  ["", "All Notion statuses"],
  ...notionStatusNames.map((name) => [name, name]),
  [NO_NOTION_STATUS, "No status"],
];

// A row's Notion status as a word for the page: "" from a missing or empty field.
export const notionStatusOf = (row) =>
  typeof row?.notionStatus === "string" ? row.notionStatus : "";

// Does one row match the chosen Notion status? "" (All) matches every row;
// "none" matches the rows without a status.
export function matchesNotionStatus(row, wanted) {
  if (!wanted) return true;
  const value = notionStatusOf(row);
  return wanted === NO_NOTION_STATUS ? value === "" : value === wanted;
}

// Every filter on Admin → Invitations at once (AND): the typed text against
// the row's words, the link status, the Texted mark ("texted" or "not-texted"
// from Share by text), and the Notion status.
export function householdMatches(row, { text = "", status = "", notionStatus = "", texted = "" } = {}, words = "") {
  const needle = text.trim().toLowerCase();
  if (needle && !String(words).toLowerCase().includes(needle)) return false;
  if (status && row.status !== status) return false;
  if (texted === "texted" && !row.textedAt) return false;
  if (texted === "not-texted" && row.textedAt) return false;
  return matchesNotionStatus(row, notionStatus);
}
