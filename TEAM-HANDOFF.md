# SimplySoph Quince — team handoff

## Shared working agreement

Use a shared ChatGPT Project for requirements, approved content, decisions and reviews. Use GitHub as the source of truth for implementation. Use the private Notion Invitations database for the guest list. Keep API tokens and mail credentials in Google Secret Manager, never in Project uploads, chats, issues, code or screenshots.

Repository: https://github.com/saulpatinojr/SimplySoph-Quince

Published starter: https://misxv.simplysoph.com

The website is incomplete. The family explicitly requested the full multi-page scope below, real invitation validation, saved RSVPs, attendance counts and email. Do not treat the earlier five-page starter or reduced launch plan as the final scope. A new route, mock dashboard or success toast alone does not fulfill a feature.

## Confirmed details

- Sophia's quinceañera: **Friday, January 15, 2027**, Fort Worth, Texas.
- RSVP deadline: **October 31, 2026**, configured at **11:59 PM America/Chicago**, UTC offset **-05:00** on that date.
- Ceremony: 4:00 PM. Church exact name/address still requires confirmation.
- Dinner: 6:30–7:30 PM. Location still requires confirmation.
- Reception/dance: starts 7:30 PM, AMZ Event Center, 5103 Azle Ave, Unit 200, Fort Worth, TX 76114, as supplied on the invitation.
- Theme: burgundy, antique gold, cream, roses and a storybook atmosphere.
- Invitation artwork incorrectly says Saturday. Website must use Friday.
- Host: dedicated Firebase Hosting site `misxv-simplysoph`, project `simplysoph-66c78`.
- DNS: Hostinger. Domain email: Microsoft 365. Event mailbox: `misxv@simplysoph.com`.
- Every event resource must have a documented removal path; preserve the family's existing project, root domain, original database and other services.

## Current verified state

- Five guest routes plus a themed 404 are published: Home, Details, RSVP, FAQ and Privacy. They are separate generated documents but lack the requested broader page architecture.
- October 31 deadline is published on RSVP and FAQ and included in English/Spanish email previews.
- RSVP remains an in-memory demonstration. No real response has been accepted or saved by the website.
- 30 local checks pass for the starter, server security foundations, household count validation, schema inspection, email rendering and cleanup boundaries.
- The user stored Notion token version 1 in event Secret Manager secret `misxv-notion-token`. Token value is not in this repository.
- Read-only API metadata inspection succeeded against the actual Invitations database. No guest rows were changed.
- The observed token `simplysoph` is a **personal access token**, not the prepared dedicated API-token connection. Review its access before attaching it to a public runtime. Prefer a dedicated connection restricted to Invitations. Never claim the PAT is restricted to that database without evidence.
- API schema: Guest = title; Adults/Teens = number; Kids = rich text; Email = email; Phone = phone number; RSVP = select; Role = select; Invited by = people. Private property/source IDs are held outside version control.
- Kids needs deliberate parsing/normalization; blank values cannot silently mean unlimited seats. Existing RSVP values include `Not sent`, so delivery state and attendance must remain separate.
- Server foundations are not deployed endpoints. There is no event-specific API service, durable response store or rate limiter yet.
- M365 event mailbox and organizer delegation exist. Graph app authorization and sender authentication review are unfinished. No emails have been sent.

## Required page scope and completion criteria

| Page | Route | Required outcome |
|---|---|---|
| Home | `/` | Invitation artwork, introduction, accurate countdown and prominent RSVP link |
| Meet Sophia | `/sophia` | Family-approved bio and messages; do not invent personal history |
| Event details | `/details` | Schedule and confirmed dress code, links to venue pages |
| Ceremony | `/ceremony` | Confirmed church, address, directions, parking and etiquette |
| Reception | `/reception` | Supplied venue/address, verified entrance and parking information |
| RSVP | `/rsvp` | Secure private invitation access, household capacity limits, event attendance and optional requests |
| Confirmation | `/rsvp/confirmed` | Durable receipt, edit link and calendar download; never show saved confirmation before storage succeeds |
| Court | `/court` | Approved names/photos and roles; do not publish Notion placeholders |
| Padrinos | `/padrinos` | Approved acknowledgements by role |
| Gallery | `/gallery` | Approved pre-event photos, event collection afterward |
| Share photos | `/share` | Authenticated uploads, consent, file limits and moderation; table QR link |
| Gifts | `/gifts` | Family-selected links and wording; no invented payment destination |
| Travel | `/travel` | Verified travel/hotel guidance, no unsupported rates or booking claims |
| FAQ | `/faq` | Deadline, policies, arrival, attire and photography guidance |
| Guestbook | `/guestbook` | Real saved messages with moderation before public display |
| Contact | `/contact` | Family contact and working form with abuse protection |
| Admin sign-in | `/admin/login` | Real authentication and MFA; no hard-coded password or client-only protection |
| Dashboard | `/admin` | Authorized live totals from accepted responses, clear sync state |
| Guest manager | `/admin/guests` | Authorized import/export, reviewable edits, secure invite generation/revocation |
| Seating | `/admin/seating` | Persisted assignments, capacity checks, no public guest list |
| Photo moderation | `/admin/photos` | Authorized approve/remove workflow and audit trail |
| Guestbook moderation | `/admin/guestbook` | Authorized approve/remove workflow |
| Announcements | `/admin/updates` | Site publishing plus reviewable recipient/audience and email dispatch controls |
| Spanish | `/es/*` | Complete guest-page parity and language switch preserving destination |
| Privacy | `/privacy` | Accurate actual collection, providers, contact and retention terms |
| Photo terms | `/terms` | Clear sharing consent, moderation and removal process before uploads open |
| Error | `/404` + HTTP 404 | Accessible recovery links and correct status for missing routes |
| Thank you | `/thank-you` | Family-approved post-event message and optional highlights |

## Suggested work assignments

1. **Content and visual design:** approved copy, biography, portraits, court/padrinos, attire, venue guidance, gifts and EN/ES translations. Work on content without accessing the guest database.
2. **Guest website:** page templates, route navigation, mobile accessibility, countdown/calendar, RSVP frontend and honest loading/error states. Preserve the design palette while making this a complete multi-page site.
3. **RSVP and Notion:** scoped connection, schema mapping, private invitation credentials, durable transactions, idempotency, stale-edit protection, category-specific capacities, rate limiting and reconciliation. Do not overwrite invitation capacities with attendance.
4. **Admin and email:** real MFA-backed access, private administrative APIs, mailbox-scoped mail authorization, review/send controls, delivery tracking and cleanup inventory.

These are human team assignments, not agents already running. Assign names in the shared Project. Use one owner per work area and separate Git branches/PRs. Only the release owner deploys accepted changes.

## Development and release

Use Node 24. Run `npm run check`; preview with `npm start`. `npm run emails:preview` renders samples without sending. `npm run cleanup:plan` generates a manual review, not deletion.

Keep `dist/`, `work/`, guest data, secrets and local environment files out of Git. The repository is public, so do not add private source IDs or operational guest exports. Static hosting is not authentication.

Before live invitations: verify one explicitly approved test household end to end; reopening persistence; invalid/revoked links; cross-household access; over-capacity counts; all-declined; concurrent submissions; deadline boundary; Notion outage/retry; mail retry and duplicate-send protection. Use only an explicitly authorized email recipient for the first delivery test. Do not send a campaign as part of testing.

Deploy only the event Hosting target. Review `PUBLISHING.md`, `NOTION-INTEGRATION.md`, `M365-EMAIL.md`, `CLEANUP.md` and `ops/event-resources.json` before touching infrastructure. Preserve the default Firebase site and unrelated resources. The existing root SPF needs review before M365 sending; do not replace unrelated DNS records blindly.

## Shared Project instructions to paste

> Build and maintain Sophia's multi-page quinceañera website using the SimplySoph-Quince GitHub repository as the code source of truth. Read TEAM-HANDOFF.md and the latest repository state first. The event is Friday January 15, 2027; RSVP deadline October 31, 2026 at 11:59 PM America/Chicago. Keep private guest information in Notion and all tokens in Secret Manager. Do not invent family content or report demo features as live. Separate private admin functions from public pages. Use branches and pull requests, assign one owner per change, test real persistence before confirming responses, and record every event resource's removal procedure. Preserve existing family services. Coordinate deployment and actual email sending with the release owner.
