# Notion invitation integration

This branch includes the executable adapter in `server/notion.mjs`. It requires a dedicated API-token connection limited to the existing Invitations source database. The user-created personal access token remains stored in Secret Manager version 1 until replaced; it is not approved for public runtime use.

## Source and ownership

The existing database contains one household per row. Organizer-controlled `Adults/Teens` is a number; `Kids` is rich text. A blank or non-numeric Kids field means unknown allocation, not zero. Such rows cannot receive a website invitation until reviewed. Existing `RSVP` is left alone because it contains invitation-delivery states such as Not sent.

Before issuing links, the family reviews each household and marks eligible ceremony, dinner and dance events in the admin portal. A private 256-bit link is generated and stored as a hash. Guests cannot change their invited capacity, household identity or event eligibility. Link rotation and revocation invalidate earlier guest sessions.

## Response projection

The admin schema action adds only missing, compatible website columns: Website RSVP, response ID/time, ceremony/dinner/dance adult and child counts, contact email, phone, address, requests and Website account. It rejects existing columns with incompatible types. The family can compare contact corrections with original contact fields before merging them; the integration does not silently overwrite the invitation allocation or delivery status. Website account projects the verified contact name/email and access settings; editing this Notion projection does not grant website access. See ACCOUNT-ACCESS.md.

The API commits a response in the private durable Google ledger before acknowledging it or drafting a receipt. Idempotency keys prevent repeated submissions from duplicating responses/outbox items. Optimistic previous-response checks prevent two open forms overwriting one another. Notion projection failures leave the committed receipt accepted and visibly pending; the admin dashboard retries pending records. Latest ledger responses drive dashboard totals. Original Notion source rows are preserved.

## Live validation still required

Store the dedicated connection token in a new Secret Manager version, verify access to the source database and denial to unrelated pages, then test with one clearly identified disposable household. Record all schema additions and the fixture ID privately before modifying anything. Never commit real guest rows or invitation links. Archive only the disposable fixture after verifying count changes, projection, edits and retries. The unit/integration tests currently use provider fixtures; they do not prove a live Notion write occurred.

CSV import creates up to 50 new rows per reviewed batch. Explicit adult/child counts are required. An interrupted provider create can be ambiguous, so the app stops and asks the organizer to check Notion before retrying. Existing households are edited through their direct Notion links to keep a single allocation owner.
