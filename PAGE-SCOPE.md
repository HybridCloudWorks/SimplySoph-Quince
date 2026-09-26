# Final page scope

Decision: five guest pages plus a themed 404 at launch. Keep organizer tools in private Notion. Preserve a single shared header, design, RSVP flow, and translation structure. Do not build 28 independent pages.

This document supersedes the earlier one-page recommendation in WEBSITE-PLAN.md. That document retains research and content inventory; this is the final route/scope authority.

## Launch routes

| Route | Page | Contents and use |
|---|---|---|
| `/` | Home | Invitation, Sophia's introduction, date/city, short schedule, RSVP link. Date confirmed: Friday, January 15, 2027; countdown remains a follow-up |
| `/details/` | Event Details | Full schedule, ceremony/reception addresses, maps, dress code, parking, accessibility, arrival and travel information |
| `/rsvp/` | RSVP | Secure household access in live version; named guest attendance by event; relevant contact corrections; optional dietary/accessibility requests; review, receipt, and edit in one flow |
| `/faq/` | FAQ & Contact | Deadline, children/plus-ones, attire, arrival, photography, and a monitored family contact. No extra contact-form backend initially |
| `/privacy/` | Guest privacy | Plain-language data use, organizer contact, retention, service providers, and guest correction/removal process. Current preview notice must be replaced with actual live practices before collecting data |
| `/404.html` | Not found | Useful links to Home, Details, and RSVP; server/host must return HTTP 404 |

The routes are directory-based static pages so links work without a client router. The RSVP confirmation is not an independently accessible public page: it requires a verified save result. Date is confirmed as Friday, January 15, 2027. Add `.ics`/Google Calendar in the calendar implementation phase; do not invent event end times.

## Decision on every proposed page

| # | Proposal | Decision |
|---|---|---|
| 1 | Home | Keep |
| 2 | Our Story / Meet Sophia | Merge a short family-approved message into Home; no invented biography |
| 3 | Event Details | Keep as combined logistics hub |
| 4 | Ceremony | Merge into Event Details |
| 5 | Reception | Merge into Event Details |
| 6 | RSVP | Keep; use named invitees and allowed plus-one slots, not unrestricted party size. Meal choice only if catered options exist; song requests optional later |
| 7 | RSVP Confirmation | Form state, not a separate public route |
| 8 | Court of Honor | Defer; combine with the celebration story when names/photos and consent are supplied |
| 9 | Padrinos | Defer; one acknowledgments section is enough when roles/names are confirmed |
| 10 | Gallery | Phase 2: `/gallery/` after approved photographs are available |
| 11 | Guest Photo Upload | Defer; use a restricted external album or later upload service with moderation/storage rather than building it into the static launch |
| 12 | Gifts | Optional small Home/FAQ section with supplied external links; no money-processing feature |
| 13 | Travel & Stay | Merge confirmed information into Event Details |
| 14 | FAQ | Keep and combine Contact |
| 15 | Guestbook | Remove from launch; adds spam prevention, personal data, storage, and moderation with little planning value |
| 16 | Contact | Merge into FAQ as a monitored email/reply contact; no form until needed |
| 17 | Admin Login | Use Notion workspace login and its available account protections; no custom `/admin/login` |
| 18 | Dashboard | Notion views/rollups for per-event counts and outstanding replies |
| 19 | Guest List Manager | Notion and a restricted server invitation-generation/import operation |
| 20 | Seating Chart | Notion Table field + table view; no visual drag-and-drop editor initially |
| 21 | Photo Moderation | Deferred with uploads |
| 22 | Guestbook Moderation | Removed with guestbook |
| 23 | Announcements | Notion approval queue + future email service; public notices shown in Details/Home when needed |
| 24 | Language Toggle | Shared EN/ES content layer, not a standalone page. Recommend full parity if family confirms bilingual scope; current starter is English |
| 25 | Privacy | Keep |
| 26 | Photo Consent / Terms | Defer with uploads. Add specific photo rules when that feature exists; avoid empty boilerplate |
| 27 | 404 | Keep |
| 28 | Thank You | Post-event phase: `/thank-you/`, family message + approved album/highlights; optional homepage swap |

## Private Notion views

Households, Guests, RSVP Submissions, Email Queue, and Email Delivery Log. Saved views: missing contact details, ready to invite, pending/partial RSVP, dinner count, dietary/accessibility requests, seating, messages awaiting approval, and bounced/suppressed recipients. Site copy stays in the repository for the first release; editing a Notion announcement does not magically publish it without a configured publishing process.

## Domain and service decision

One custom domain can serve the website, mail, and an API. The family selected **Google Workspace email**, with **Gmail API** as the proposed transport, **Cloud Run** for hosting, **Cloud Domains/Cloud DNS** for the domain workflow, and **Secret Manager** for credentials. Domain availability/purchase, account provisioning, DNS changes, and real dispatch remain pending concrete account/domain/budget inputs. See GOOGLE-SETUP.md for the current setup sequence; EMAIL-PLAN.md retains message workflows and provider comparisons.
