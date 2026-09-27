# Pages and how the family uses them

All routes below exist. Guest routes have matching `/es/` versions and language links. Admin routes are family-only after Google sign-in and authenticator MFA; their static shells contain no private data.

| Route | Purpose and workflow |
|---|---|
| `/` | Invitation artwork, confirmed date, countdown, RSVP and navigation |
| `/sophia/` | Biography and family message; approved copy belongs in `site/content.mjs` |
| `/details/` | Complete schedule and links to venue pages |
| `/ceremony/` | Ceremony time and confirmed church/parking details when supplied |
| `/reception/` | AMZ address and map directions |
| `/rsvp/` | Exchange high-entropy invitation link; use current Notion household allocations; review per-event attendance and contact corrections |
| `/rsvp/confirmed/` | Show only a durably saved receipt; edit response and add calendar |
| `/court/` | Approved court names, roles and portraits |
| `/padrinos/` | Approved sponsor names and roles |
| `/gallery/` | Moderated photographs |
| `/share/` | Private-invitation photo upload; printable generic QR for tables |
| `/gifts/` | Family-approved registry links |
| `/travel/` | Travel guidance and approved hotel links |
| `/faq/` | Invitation allocation, deadline, editing, photos and pending attire |
| `/guestbook/` | Authenticated well-wishes; only approved messages are public |
| `/contact/` | Family mailbox link and private authenticated contact form |
| `/privacy/` | Actual collection, providers, choices and retention requirements |
| `/terms/` | Photo permission, moderation and removal requests |
| `/thank-you/` | After-event message and optional highlight-video link |
| `/404/`, `/404.html` | Themed missing-page recovery, actual HTTP 404 for unknown URLs |
| `/admin/login/` | Google account allowlist plus TOTP MFA |
| `/admin/` | Latest active-household counts by event; pending Notion sync and dietary/accessibility/song requests |
| `/admin/guests/` | Current Notion households; direct Notion editing; CSV import/export; invitation generation, rotation, revocation and invitation drafts |
| `/admin/seating/` | Whole-household dinner seating, duplicate/capacity checks |
| `/admin/photos/` | Review private uploads before publishing |
| `/admin/guestbook/` | Moderate well-wishes and view private contact messages |
| `/admin/updates/` | Bilingual site announcements; invitation/reminder/details/change/thank-you drafts; preview and explicitly send individual messages |

RSVP receipts and changes create durable email drafts after storage succeeds. Sending requires configured Microsoft access and an organizer’s recipient review. No bulk campaign or scheduled reminder is silently enabled. No meal choices are invented; menu selections require family-supplied options before implementation. Separate dietary/accessibility/song requests are currently collected in one optional request field.

A route being present does not imply its family content or provider account setup is complete. See `VALIDATION.md`.
