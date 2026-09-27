# Notion integration blueprint

**Status: server foundations implemented and tested; live connection pending.** `server/` contains invitation/session validation, RSVP validation, and a read-only schema inspector. See `server/README.md`. The family supplied its private planning page; browser sign-in and selection of the actual guest database are pending. An empty event Notion secret container is prepared in Google Secret Manager. The public website remains a demo with no guest records or live-save endpoint.

**Hosting decision:** see GOOGLE-SETUP.md. The family selected Google; Secret Manager will hold the Notion token and Cloud Run will host the secure adapter. A small server-only Firestore store is planned for durable coordination. Neither the adapter nor that store is implemented yet.

## Smallest useful architecture

```text
Guest's browser — static HTML / CSS / JavaScript
       |
       | HTTPS: exchange invitation token, read own invitation, submit answers
       v
Small server endpoint — auth, validation, deadline, retries, persistence checks
       |
       | private Notion API connection
       v
Private Notion workspace — Households + Guests + RSVP Submissions
       ^
       |
Family organizers use Notion's own authenticated interface
```

Use Google AI Studio to continue editing. Host the static directory on the selected static host; deploy the API on an appropriate server/serverless host. If using AI Studio's Cloud Run deployment, keep the site assets static and put the small API in the server portion. No runtime AI features are needed.

Do not put `NOTION_TOKEN`, a database dump, invitation-token registry, or guest contact information in client JavaScript. Use a server environment/secret store for `NOTION_TOKEN`, allowed origin, data source IDs, invitation signing/hashing keys, and any session secret. Notion explicitly requires keeping the token out of source control and sharing the target pages with the connection. [Notion authorization](https://developers.notion.com/guides/get-started/authorization).

The future Notion connector granted to this chat will help inspect/map the database. A deployed website separately needs its own appropriately scoped server connection; a chat connection alone does not run the website's sync.

## Data model

Use immutable IDs, not names or email addresses, as identity. More than one person may share a name, and a household's email can change. Preserve property IDs once mapped. Resolve the existing database's actual data source(s) and API version during implementation instead of assuming a legacy database-query endpoint or inventing identifiers.

### Households — one row per invitation

| Property | Notion type | Owner / use |
|---|---|---|
| Household | Title | Organizer; display label |
| Household ID | Rich text | Immutable server-generated ID |
| Contact name | Rich text | Organizer/guest correction |
| Email | Email | Invitation and coordination contact |
| Phone | Phone | Optional contact |
| Address line 1 / 2 | Rich text | Optional postal invitation / thank-you address |
| City / State / Postal code / Country | Rich text | Keep postal code as text, including leading zeros |
| Preferred language | Select | English / Spanish / Other |
| Guests | Relation → Guests | Named invitees and allowed plus-one slots |
| Invitation status | Select | Draft / Ready / Sent / Delivery failed / Cancelled |
| Sent at | Date | Actual dispatch time, not a guessed timestamp |
| RSVP deadline | Date | Server-enforced cutoff; event default may apply |
| Latest committed submission | Relation → RSVP Submissions | Canonical accepted response |
| RSVP status | Select/derived | Pending / Partial / Responded / Declined |
| Last response at | Date | Server-set timestamp |
| Needs follow-up | Checkbox | Family action queue |
| Internal notes | Rich text | Private; never return to a guest |

Store token hashes in restricted server storage, or a separately restricted integration-only data source. Do not put raw invitation links in publicly shared Notion pages. A code such as `SOPHIA-DEMO` is deliberately not a secure production code.

### Guests — one row per person or authorized plus-one slot

| Property | Notion type | Owner / use |
|---|---|---|
| Guest name | Title | Organizer; guest can fill only an explicitly allowed empty plus-one slot |
| Guest ID | Rich text | Immutable ID |
| Household | Relation → Households | Invitation entitlement boundary |
| Guest category | Select | Adult / Child; no birthdate needed for headcounts |
| Invited to ceremony / dinner / dance | Checkbox | Organizer-owned eligibility |
| Ceremony / Dinner / Dance RSVP | Select | Pending / Yes / No / Not invited; derived from latest committed submission |
| Meal choice | Select | Only add confirmed caterer choices |
| Dietary notes | Rich text | Optional and restricted |
| Accessibility request | Rich text | Optional and restricted |
| Table | Rich text | Organizer-owned, optional later |
| Last synced submission ID | Rich text | Reconciliation marker |

For first release, use named guests and no open-ended guest-count input. Plus-ones should be explicitly allocated by the family, with server enforcement. A dropdown maximum in the browser alone is insufficient.

### RSVP Submissions — one immutable response snapshot per successful attempt

| Property | Notion type | Use |
|---|---|---|
| Submission | Title | Human-readable reference |
| Submission ID | Rich text | Unique idempotency identifier |
| Household | Relation | Which invitation owns it |
| Previous submission ID | Rich text | Stale-response detection |
| Submitted at | Date | Server timestamp |
| Source | Select | Guest / Organizer |
| State | Select | Staged / Committed / Needs reconciliation |
| Response payload | Rich text or page blocks | Validated snapshot of guest IDs, event answers, and contact corrections; obey Notion length limits |
| Sync error | Rich text | Sanitized operational detail, never credentials |

These response snapshots are the attendance history; Guests columns are convenient reporting projections. Do not treat partly updated guest rows as a committed household response. Notion does not give this design a cross-page transaction or compare-and-swap guarantee.

Implement per-household serialized writes and a durable idempotency/reconciliation record in the API's storage before promising safe concurrent editing. Persist the full validated response first, then advance the household's committed-response reference and update reporting rows. A crash between steps must be recoverable. Retrying the same submission ID must not create a second logical response. Until the commit point is durable, show a pending/error state rather than success. If the API host has no durable coordination primitive, retain demo mode instead of pretending in-memory locks are sufficient.

This can remain a very small operational store; there is no need for a general-purpose custom admin application. If the eventual existing Notion schema supports a simpler safe record layout, adapt after inspecting it.

## Data ownership and sync behavior

| Data | Direction | Conflict rule |
|---|---|---|
| Invitees, capacities, eligible events, deadline | Notion → server → authorized household | Organizer wins; guest cannot change entitlement |
| Contact corrections and attendance | Guest → server → Notion | Validate current invitation and previous response; serialize writes |
| Table assignments / internal notes | Notion only | Never exposed by the public API |
| Guest reporting columns | Committed response → Notion Guests | Rebuildable; reconcile using submission ID |
| Organizer-entered phone reply | Controlled response path → same commit mechanism | Avoid manual edits to derived RSVP cells |
| Email delivery | Future delivery provider → Notion | Record actual queued/sent/delivered/bounced states separately from attendance |

For a lean first release, read current invitation data when opened and again on submission. No background polling or webhook is necessary for a current-on-open flow. If later caching or a live dashboard is added, use verified Notion webhooks and fetch the current record; handle duplicates and out-of-order delivery. [Notion webhooks](https://developers.notion.com/reference/webhooks).

## Proposed API contract

These endpoints are a specification for the next phase, not working routes in the starter.

| Endpoint | Request | Response / behavior |
|---|---|---|
| `POST /api/invitation-session` | `{ token }` in body | Validate random household token; issue short-lived Secure, HttpOnly session cookie; generic rejection for invalid/expired/revoked tokens |
| `GET /api/invitation` | Session cookie | Return only household display name, eligible guest IDs/names/events, guest-editable contact fields, last accepted answers, deadline, and response version |
| `POST /api/rsvp` | Session + CSRF protection + idempotency key + prior version + validated answers | Commit response; return receipt only after durable acceptance; replays return the same logical receipt |
| `DELETE /api/invitation-session` | Session | Clear guest session |

Example request body, with sample IDs only:

```json
{
  "previousSubmissionId": null,
  "guests": [
    {"guestId":"sample-1","ceremony":"yes","dinner":"yes","dance":"yes"},
    {"guestId":"sample-2","ceremony":"no","dinner":"yes","dance":"yes"}
  ],
  "contact": {"email":"alex@example.com","phone":"","address":null},
  "requests": ""
}
```

No client-supplied household ID grants access. Resolve the household from the verified session. Reject unknown guest IDs, duplicate guests, added plus-ones, uninvited event replies, invalid answer enums, oversized text, expired deadlines, and stale response versions. All-declined is a valid response. Preserve entered answers in memory when a transient error occurs so a guest can retry.

Return `401` for missing/invalid session, `403` for forbidden actions, `409` for stale response, `422` for field errors, `429` for throttling, and `503` for a temporary upstream/storage failure. Give guests friendly messages and organizers sanitized diagnostics. Never log invitation tokens or full RSVP/contact payloads.

## Guest access

- Generate cryptographically random, high-entropy household tokens; store only a hash when using opaque tokens. Allow expiry and revocation.
- A private link is a bearer credential: anyone it is forwarded to can access that household. Explain this to the family; add verified email/OTP only if their privacy needs justify it.
- Prefer token in a URL fragment, exchange it once over HTTPS, remove it from the address bar, and retain only an HttpOnly session. Use `Referrer-Policy: no-referrer` and no third-party analytics on the RSVP path.
- Enforce CSRF/origin controls for cookie-authenticated writes, rate-limit token exchanges and updates, and use exact allowed CORS origins where frontend/API origins differ.
- Guest records must never be shipped as static assets or made available through a public name-search endpoint.
- Keep public event details separate from private guest information. If even the event details must be restricted, static public hosting alone does not meet that requirement.

## Operational requirements

Respect Notion's API limits; queue writes and retry transient errors with bounded exponential backoff, using `Retry-After` on rate limiting. Surface persistent failures for reconciliation. Validate payload length before calling Notion. [Notion request limits](https://developers.notion.com/reference/request-limits).

Use a test household first. Required live tests: invalid token; cross-household access; expired/revoked invite; mixed event answers; all-declined; duplicate submit; stale browser tab; guest removed after form opened; deadline boundary in America/Chicago; Notion timeout and rate-limit response; crash between commit/projection steps; page refresh and reopening saved response. Verify the actual Notion rows and receipt, not just a success toast.

## What is needed next

1. The existing Notion database/page link and access to inspect it; identify who should have organizer access.
2. A schema mapping approved against the actual records; avoid replacing the database with CSV samples.
3. Host selection for the static site and small API, plus server-side secret configuration through the host's secure settings.
4. Date is confirmed as Friday, January 15, 2027 (America/Chicago). Still needed: RSVP deadline, eligible event rules, and a real organizer contact.
5. One test household for end-to-end verification before real invitations are enabled.

The sample CSVs only illustrate columns. Notion CSV import does not establish relations, formulas, rollups, API permissions, or correct property types automatically. Configure those deliberately. Remove sample rows before importing real guests.
