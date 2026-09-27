# RSVP backend preparation

These server-only modules are tested foundations. They are **not deployed endpoints** and do not make the public RSVP demo live. Static builds copy only the site assets; none of this code or its secrets goes into `dist/`.

- `invitation-security.mjs`: 256-bit invitation tokens, hash verification, one-hour signed sessions, revocation/rotation checks against a fresh trusted invitation, exact-origin CSRF checks, Secure/HttpOnly cookies. Persist only token hashes. The caller must verify the token before issuing a session and reread the invitation on every authenticated request. Rate limiting is still required at the endpoint/store layer.
- `rsvp-validation.mjs`: selected household-count mode enforces separate adult/teen and child capacities for each event; optional named-guest mode enforces exact membership. Both enforce per-event eligibility, complete answers, stale versions, explicit-offset deadline, field allowlists and size limits. The durable transaction must repeat the eligibility/version check before committing. This module alone does not serialize writes.
- `notion-schema.mjs`: read-only database/data-source metadata inspection pinned to Notion API `2025-09-03`. No row queries or write methods. GET retries are bounded; a long Retry-After is surfaced to the caller instead of sleeping indefinitely. Provider error bodies and tokens are not logged.

## Inspect the actual Notion schema

Provide `NOTION_TOKEN` through an authorized secret injection mechanism and `NOTION_DATABASE_ID` through server configuration, then run `npm run notion:inspect`. Do not place the token in a command argument, source file, public browser configuration or chat. Output goes to ignored `work/notion/schema.json`, not stdout. It contains property names/types/IDs, so keep it private too.

Browser sign-in is complete. The planning page's actual **Invitations** source database has been identified, with household rows and Adults/Teens and Kids counts. A planning page or linked-view ID is not automatically the source database ID. Grant the connection explicit access to Invitations and map actual API property IDs before any writes. See `NOTION-INTEGRATION.md` for the observed columns and proposed mapping.

Google Secret Manager container `projects/424903425639/secrets/misxv-notion-token` is created with no version/value. It has no new runtime access grant. Enter the existing dedicated Notion connection token through the Google console; record the version number without exposing the value. Do not reuse a broadly authorized unrelated connection.

## Remaining launch work

1. Create the prepared dedicated API-token connection with read/update access only to Invitations; store its token securely and inspect API metadata. No insert-content, workspace-user email or comment access is required for the selected projection design.
2. Confirm the RSVP deadline and actual invited events. Map database/data-source/property IDs privately.
3. Implement durable household transactions, idempotency, shared rate limits, reconciliation/outbox and privacy retention. Add access tests against the real store and a fixture household.
4. Deploy a dedicated API identity/service with access only to its event secret and storage. Use Hosting `/api/**` rewrites only once the service exists. API responses must be `private, no-store`; Hosting passes only the `__session` cookie to Cloud Run.
5. Wire the frontend to the live API and verify the complete saved-response journey, including concurrent/stale edits and provider failures. Keep demo mode until that passes.
6. Separately configure mailbox-scoped Graph authorization and email authentication, then test sending only to a user-authorized recipient. No email was sent during preparation.

References: [Notion internal connections](https://developers.notion.com/guides/get-started/internal-connections), [database retrieval](https://developers.notion.com/reference/retrieve-database), [data-source metadata](https://developers.notion.com/reference/retrieve-a-data-source), [retry requirements](https://developers.notion.com/reference/request-limits), [Hosting cookies and caching](https://firebase.google.com/docs/hosting/manage-cache).
