# RSVP backend preparation

These server-only modules are tested foundations. They are **not deployed endpoints** and do not make the public RSVP demo live. Static builds copy only the site assets; none of this code or its secrets goes into `dist/`.

- `invitation-security.mjs`: 256-bit invitation tokens, hash verification, one-hour signed sessions, revocation/rotation checks against a fresh trusted invitation, exact-origin CSRF checks, Secure/HttpOnly cookies. Persist only token hashes. The caller must verify the token before issuing a session and reread the invitation on every authenticated request. Rate limiting is still required at the endpoint/store layer.
- `rsvp-validation.mjs`: exact named guest membership, per-event eligibility, complete answers, stale-version checks, explicit-offset deadline, field allowlists and size limits. The durable transaction must repeat the eligibility/version check before committing. This module alone does not serialize writes.
- `notion-schema.mjs`: read-only database/data-source metadata inspection pinned to Notion API `2025-09-03`. No row queries or write methods. GET retries are bounded; a long Retry-After is surfaced to the caller instead of sleeping indefinitely. Provider error bodies and tokens are not logged.

## Inspect the actual Notion schema

Provide `NOTION_TOKEN` through an authorized secret injection mechanism and `NOTION_DATABASE_ID` through server configuration, then run `npm run notion:inspect`. Do not place the token in a command argument, source file, public browser configuration or chat. Output goes to ignored `work/notion/schema.json`, not stdout. It contains property names/types/IDs, so keep it private too.

The family supplied a planning **page** link. Inspect that page after sign-in and select its actual guest database before running the inspector. A planning page ID is not automatically a database ID. Linked databases may need explicit access to the source database. Preserve existing records and map property IDs after inspection.

Google Secret Manager container `projects/424903425639/secrets/misxv-notion-token` is created with no version/value. It has no new runtime access grant. Enter the existing dedicated Notion connection token through the Google console; record the version number without exposing the value. Do not reuse a broadly authorized unrelated connection.

## Remaining launch work

1. Sign in to the planning workspace, inspect schema, and scope a dedicated internal connection to the required databases. Start read-only; add update/insert capabilities only for the final sync design. No workspace-user email access or comments are required.
2. Confirm the RSVP deadline and actual invited events. Map database/data-source/property IDs privately.
3. Implement durable household transactions, idempotency, shared rate limits, reconciliation/outbox and privacy retention. Add access tests against the real store and a fixture household.
4. Deploy a dedicated API identity/service with access only to its event secret and storage. Use Hosting `/api/**` rewrites only once the service exists. API responses must be `private, no-store`; Hosting passes only the `__session` cookie to Cloud Run.
5. Wire the frontend to the live API and verify the complete saved-response journey, including concurrent/stale edits and provider failures. Keep demo mode until that passes.
6. Separately configure mailbox-scoped Graph authorization and email authentication, then test sending only to a user-authorized recipient. No email was sent during preparation.

References: [Notion internal connections](https://developers.notion.com/guides/get-started/internal-connections), [database retrieval](https://developers.notion.com/reference/retrieve-database), [data-source metadata](https://developers.notion.com/reference/retrieve-a-data-source), [retry requirements](https://developers.notion.com/reference/request-limits), [Hosting cookies and caching](https://firebase.google.com/docs/hosting/manage-cache).
