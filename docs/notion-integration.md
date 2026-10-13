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

## Live validation still required

Store the dedicated connection token in a new Secret Manager version, verify access to the source database and denial to unrelated pages, then test with one clearly identified disposable household. Record all schema additions and the fixture ID privately before modifying anything. Never commit real guest rows or invitation links. Archive only the disposable fixture after verifying count changes, projection, edits and retries. The unit/integration tests currently use provider fixtures; they do not prove a live Notion write occurred.

CSV import creates up to 50 new rows per reviewed batch. Explicit adult/child counts are required. An interrupted provider create can be ambiguous, so the app stops and asks the organizer to check Notion before retrying. Existing households are edited through their direct Notion links to keep a single allocation owner.
