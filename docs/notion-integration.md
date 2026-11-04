# Notion invitation integration

The adapter is `server/notion.mjs`. It uses a dedicated API connection (`NOTION_TOKEN` in Secret Manager) that should be shared only with the Invitations database and the Budget and Godparents databases the admin keeps in step.

## Source and ownership

The existing database contains one household per row. Organizer-controlled `Adults/Teens` is a number; `Kids` is rich text. A blank or non-numeric Kids field means unknown allocation, not zero. Such rows cannot receive a website invitation until reviewed.

`RSVP` belongs to the family. When a household answers on the website, the website sets it to Yes (anyone attending) or No. A family member can also type Yes or No for an answer taken by phone; the website then counts Notion's head counts for that household. Other values, such as Not sent, are not answers.

`Email` and the comma-separated `Additional Emails` decide who can sign in for a household, and `Administrator Eligible` on a row's main `Email` makes that person an administrator. See [account-access.md](account-access.md).

Before issuing links, the family reviews each household and marks eligible ceremony, dinner and dance events in the admin portal. A private 256-bit link is generated and stored as a hash. Guests cannot change their invited capacity, household identity or event eligibility. Link rotation and revocation invalidate earlier guest sessions.

## Response projection

The owner's schema action ("Prepare RSVP columns in Notion" on the Overview) adds only missing, compatible columns: Additional Emails, Website response ID and time, ceremony/dinner/dance adult and kid counts, Website contact email, phone, address and requests, and the SMS and WhatsApp consent columns. It rejects existing columns with incompatible types. A website answer writes `RSVP`, the head counts and the Website columns; it never changes the invitation allocation (`Adults/Teens`, `Kids`) or the row's own `Email` and `Phone`. The family can compare contact corrections with the original contact fields before merging them.

The API commits a response in the private durable Google ledger before acknowledging it or sending a receipt. Idempotency keys prevent repeated submissions from duplicating responses/outbox items. Optimistic previous-response checks prevent two open forms overwriting one another. If Notion cannot be read, the RSVP is refused with a retryable error and nothing is saved. If only the write fails, the answer is saved and visibly pending; the scheduled drain (every 10 minutes) and Retry on the Overview write it later. A retry never writes over head counts the family changed in Notion after the answer was given: it writes the Website columns only and leaves the difference to the check below. A change Notion refuses outright (a missing column, a deleted row) is marked failed and reported once in Notifications.

The drain also compares each answered household's Notion RSVP and head counts with the website's answer. A difference is reported once in Notifications and shown on Invitations, where an admin keeps Notion's version or writes the website's answer again. Dashboard totals, seating and reminders use the answer the family goes by: the website's, or Notion's for phone answers and kept differences. Original Notion source rows are preserved.

## Status column

`Status` is a select column the website keeps up to date for every household, so the family can see at a glance where things stand without opening the admin pages. Its five values, and the rules behind them in the order they are tried (the first that fits wins):

1. **Missing**: the row has no phone number.
2. **Attending** or **Not Attending**: the household has answered, on the website or by Yes/No typed into the RSVP column.
3. **Invited**: an invitation or reminder was sent on any channel (an email the mail service accepted, or a text or WhatsApp message the provider took), under any link generation. Tests to the organizer's own phone do not count.
4. **Waiting**: everything else, including a household whose link exists but was never sent.

The website owns this column: a value changed by hand is set back at the next check. It is updated every 10 minutes by the scheduled drain (up to 25 rows a run, skipping rows edited in the last 2 minutes), right after an RSVP is written (in the same write as the answer), right after an emailed invitation batch, a text batch or a WhatsApp message is sent (best effort; the drain catches up if Notion is down), and from **Check statuses now** on Admin → Invitations, which checks every household and says how many it updated. None of these sends anything to a guest.

**Phone and Country Code.** The website reads a household's number from **Phone** together with **Country Code** (a number column: 1 for the US and Canada, 52 for Mexico, and so on). Ten digits with no code, or with 1, read as a US/Canada number; a number already written with "+" is kept as it is. Anything else (seven digits, an email address in the Phone cell) is left as typed and the pages say it needs review. Only US and Canada numbers can be texted by the SMS program.

The admin pages work from it too: Admin → Invitations shows each household's Status under its link status and filters by it (with "No status" for rows without one), and "select all" covers only the households in view; the SMS tab shows it beside the texting status and filters the household list by it, so the family can pick, say, the Waiting households that are Subscribed. The API sends it as `notionStatus` (`GET /api/admin/guests` and `/api/admin/audience?channel=sms`, API contract 3).

The family created the column with the Missing, Invited and Attending options. The owner presses **Prepare RSVP columns in Notion** on the Overview once: it adds the two options the website also needs, **Waiting** (yellow) and **Not Attending** (red), keeping the existing options and their colors exactly as they are. Until the column exists, the website writes no status. If the website writes a status before the owner has pressed the button, Notion creates that option with a default color; the button then leaves it as it is.

## Checking the database's columns

`npm run notion:inspect` reads the database's structure (its data sources and columns, never guest rows) and saves it to `work/notion/schema.json`, which git ignores. Run it when a column may have been renamed or the website reports a schema problem, and compare the result with the columns above. It needs the website's Notion token and the database ID or URL. In PowerShell, take the token from Secret Manager rather than pasting it:

```powershell
$env:NOTION_TOKEN = gcloud secrets versions access latest --secret=misxv-notion-token --project=simplysoph-66c78
$env:NOTION_DATABASE_ID = '<database ID or URL>'
npm run notion:inspect
Remove-Item Env:NOTION_TOKEN
```

## Live validation still required

Store the dedicated connection token in a new Secret Manager version, verify access to the source database and denial to unrelated pages, then test with one clearly identified disposable household. Record all schema additions and the fixture ID privately before modifying anything. Never commit real guest rows or invitation links. Archive only the disposable fixture after verifying count changes, projection, edits and retries. The unit/integration tests currently use provider fixtures; they do not prove a live Notion write occurred.

CSV import creates up to 50 new rows per reviewed batch. Explicit adult/child counts are required. An interrupted provider create can be ambiguous, so the app stops and asks the organizer to check Notion before retrying. Existing households are edited through their direct Notion links to keep a single allocation owner.
