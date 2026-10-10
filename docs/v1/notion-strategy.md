# Notion integration strategy

## Decision: Notion owns the family's data, the ledger owns what guests do

We evaluated three models:

| Model | Verdict |
|---|---|
| **(a) Notion = guest list and planning; ledger = guest actions and security; one-way projection to `Website …` columns** | **Chosen.** It is already mostly implemented, the family keeps working in Notion, and every field has exactly one editor |
| (b) App is the only source of truth; Notion becomes a report | Rejected. It means rebuilding guest-list and budget editors on the website, and pushes the family back to typing data twice |
| (c) Two-way sync via Notion webhooks | Rejected for v1. Webhook payloads carry IDs only, so every event needs a fetch. Every field editable on both sides needs conflict rules. Too much machinery for about 200 households. Webhooks may later be used only to **clear the cache** |

## Who edits what (no double entry)

| Data | Edited in | Visible in Notion as |
|---|---|---|
| Household, contacts, capacity, groups | Notion | Source columns |
| **Invited events** (ceremony/dinner/dance) | **Notion** (new checkboxes; today these live only in the ledger) | `Invited Ceremony/Dinner/Dance` |
| Budget, godparents | Notion (website shows a read-only view with "Open in Notion") | Source |
| Admin eligibility | Ledger role (Admin Center) | `Website role` (read-only) |
| Invitation links, delivery status | Ledger | `Website invitation` (Issued / Emailed / Revoked + date) |
| RSVP answers, contact corrections | Guest on the website | `Website RSVP`, `Website …` (read-only) |
| SMS / WhatsApp consent | Guest's keyword message → ledger | `SMS Consent`, `SMS Opt Out` (read-only projection; **no longer an input**) |
| Event details (venues, times, deadline) | Admin Center → ledger | `Event Summary` page (scheduled one-way update) |

Rule: **`Website …` columns are written only by the app.** A drift report flags manual edits and re-projects.

## Gaps found

1. **Rate limits.** The runtime client has no throttle and no 429/Retry-After handling; every non-2xx becomes a 503. Every guest page view reads Notion live. `notion.list()` runs on dashboard, guests and accounts views and on every consent sync.
2. **Manual retries only.** Pending projections wait until someone clicks Retry Sync (batches of 10/25).
3. **Schema coupling.** Source column names are hard-coded and never validated. Renaming `Kids` breaks every household.
4. **Hard-coded IDs.** Planning data-source IDs and the site URL are hard-coded in `planning-notion.mjs`; the Invitations source comes from env.
5. **Guest CSV import** has no stable import ID, so a re-import duplicates rows.
6. **Stale templates.** `notion-templates/` describes a Households/Guests/Submissions model that does not exist.
7. **SMS consent input.** A Notion checkbox could grant SMS eligibility. **Fixed in this change** (see the Twilio gap analysis).

## Changes, in order

| # | Change | Files | Priority |
|---|---|---|---|
| 1 | Shared limiter (~2.5 req/s) and 429/5xx backoff with Retry-After; map 403/404 to clear codes | `server/notion.mjs` (reuse `notion-schema.mjs` backoff) | P0 |
| 2 | 30–60 s roster cache for `list()`/`read()`; always fresh on RSVP submit and invitation exchange | `server/notion.mjs` | P0 |
| 3 | Startup and dashboard schema assertion: source columns exist with the right types; read by property ID with name fallback | `server/notion.mjs`, `notion-schema.mjs` | P1 |
| 4 | Cloud Scheduler (OIDC) → internal route every 10 min to drain pending projections in bounded batches | new route, `application.mjs` | P1 |
| 5 | Move invited events to Notion checkboxes (one-time copy, then read from Notion) | `application.mjs`, `notion.mjs` | P1: **copy done** (the website writes `Invited …` on every status change). Reading them back as the source of truth needs a family decision: an accidental untick would change what a household may RSVP for, so it should come with a guard (never remove an event a household already answered) |
| 6 | `Website invitation` status column written on issue, send and revoke | `notion.mjs` | **Done:** projects the dashboard status (Issued / Emailed / Opened / Attending / Declined / Revoked) with its date |
| 7 | Drift report: compare Notion `Website response ID`/version with the ledger and re-project | new admin view | P2 |
| 8 | Planning read from Notion; remove the website write-back | `planning*.mjs` | P2 |
| 9 | Remove guest CSV import (Notion has its own) or add a stable import ID | `application.mjs` | P2 |
| 10 | Rewrite `NOTION-INTEGRATION.md` around the ownership table; delete stale `notion-templates/` | docs | P2 |

## Tests to add

- 429 with Retry-After is retried and paced. A long wait returns pending, never a guest-facing error.
- A burst of 20 guest reads makes at most N Notion calls. A capacity cut in Notion still applies at RSVP submit.
- A renamed or retyped source column fails the schema assertion and blocks invitation issuance.
- A Notion-only SMS checkbox is not eligible (**added in this change**).
- The scheduled retry route rejects calls without OIDC and drains in bounded batches.
- **Verify live** on the disposable household: real 429 behavior during a scripted burst, and the column migrations.
