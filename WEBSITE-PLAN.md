> Historical planning/deployment record. The new multi-page branch is described by README.md, PAGE-SCOPE.md and DEPLOYMENT.md. Five-page/demo-only descriptions below refer to the earlier published release, not the current implementation.

# Sophia's quinceañera website plan

Prepared September 26, 2026. Scope: a lean guest site built with Google AI Studio, using Notion for private organizer records.

**Updated scope:** after the family's route-list review, `PAGE-SCOPE.md` is the final authority: five guest routes plus 404, with Notion as admin. The one-page direction below records the initial research recommendation; source sections are now shared across generated static routes.

## Direction

Use a single mobile-friendly guest page with five navigable sections. Keep the RSVP confirmation as a state of the form. Start with Notion itself as the private admin application; a second custom dashboard would duplicate work at this stage.

Visual direction: burgundy `#651625`, deep wine `#360d16`, gold `#E9C77B`, parchment `#FBF5E9`, dark text `#351E21`. Use flowing script for Sophia's name, a classic serif for headings, and plain sans-serif for readable instructions and forms. The original invitation supplies the roses, gown, and gold detail without adding a heavy animation or photo carousel. Its illustration should not be presented as a verified photograph of Sophia.

## What established sites do well

These are feature benchmarks, not a ranking or a recommendation to purchase a platform. Official product pages were reviewed; paid workflows and account dashboards were not tested.

| Reference | Useful pattern | How Sophia's site uses it |
|---|---|---|
| [Joy online RSVP](https://withjoy.com/online-rsvp/) | Household grouping, attendance by event, guest/plus-one controls, custom questions, editable replies | One invitation per household; named guests answer separately for ceremony, dinner, and reception; optional dietary/accessibility questions |
| [Zola wedding websites](https://www.zola.com/wedding-planning/website) | Central schedule, locations, attire, travel information, FAQ, and RSVP | Put practical information next to the invitation; keep maps one tap away and avoid making guests search through messages |
| [Paperless Post quinceañera invitations](https://www.paperlesspost.com/cards/category/quinceanera-invitations) | Quinceañera-specific visual designs, digital distribution by email/text/link, and RSVP tracking | Carry the printed theme into the site and distribute one private household link by the family's chosen channel |

Recommended adaptation: invitation-led warmth with practical guest logistics. Do not add wedding-specific registries, a wedding party, honeymoon funds, public guest lists, or open guest-name search automatically.

## Pages, purpose, and use

| Page / section | Why it is needed | What guests or organizers do | Priority |
|---|---|---|---|
| Welcome / `#home` | Establish whose celebration it is and where to respond | See Sophia's name, confirmed date, Fort Worth, invitation, and RSVP button | Built |
| Celebration / `#celebration` | Separate ceremony, dinner, and dance | Check local start times and locations; later save confirmed events to calendar | Built; calendar deferred |
| Directions / `#directions` | Avoid confusion between church and reception | Open verified map links; read parking, accessibility, and travel instructions | Built with missing details labeled |
| RSVP / `#rsvp` | Collect accurate attendance without duplicating households | Open private invitation; answer per person and per event; verify contact details; review and submit | Demo built; secure live integration next |
| Questions / `#questions` | Reduce repeat texts to the family | Find deadline, attire, children/plus-one policy, parking, contact, and privacy details | Built with provisional answers |
| Confirmation / RSVP state | Make receipt and updates explicit | See saved attendance and timestamp; reopen to edit before deadline | Demo built; durable receipt next |
| Private organizer workspace / Notion | Coordinate invitations, responses, contacts, and headcounts | View pending replies, missing addresses, counts, dietary requests, and delivery status | Schema proposed; not connected |
| Photos & memories | Share real approved photos or a post-event album | View family-approved photos after content is supplied | Optional later |
| Gifts / acknowledgments | State family preferences if desired | Follow an approved external registry link or see padrinos acknowledgments | Optional; do not invent |
| Travel | Help guests coming from outside Fort Worth | Read confirmed hotel/transport information | Keep within Directions unless it grows |

## Invitation facts and unresolved details

| Item | Supplied information | Treatment |
|---|---|---|
| Honoree | Sophia; Mis XV | Used as supplied |
| Date | Printed artwork: Saturday, January 15, 2027 | Family confirmed Friday, January 15, 2027. Website updated; original artwork weekday still needs correction |
| Ceremony | 4:00 PM, Lady of Guadalupe Church | Keep exact supplied name; full church identity/address still needed |
| Dinner | 6:30–7:30 PM | Dinner venue not explicitly stated; confirm whether AMZ hosts it |
| Dance | Starts 7:30 PM, AMZ Event Center | Used as supplied; ending time unknown |
| Reception address | 5103 Azle Ave, Unit 200, Fort Worth, TX 76114, United States | Map search link based on invitation; verify pin before sending |
| Timezone | Event is in Fort Worth | Use `America/Chicago` for calendar and deadline logic |
| Language | Invitation mostly English | English starter; bilingual English/Spanish is an available next step after preference confirmed |

The family confirmed Friday, January 15, 2027. Future calendar files must use this date and real start/end details rather than guessing a party ending time. Do not guess a church location from its name.

## Guest journey

1. Family creates a household and its named invitees in Notion.
2. Secure service generates a unique random invitation link. The family shares that link or its QR code with the household.
3. Guest opens the site, reviews the event, and accesses only their invitation.
4. Guest selects yes/no for each named person's eligible events, supplies relevant contact corrections, and optionally requests accommodations.
5. Guest reviews the household's answers. The backend validates entitlement and deadline and commits the response.
6. Confirmation appears only when storage has succeeded. Guest can reopen the same invitation to edit before the cutoff.
7. Organizers see updated attendance in Notion. Telephone replies are entered through the same controlled response workflow so they do not get overwritten.

Invitation email addresses are not a mailing-list subscription. Contact collection, invitation sending, and delivery tracking are different features. Notion stores records; an email/SMS provider would send messages. The initial build sends nothing. Add messaging only after sender, channel, templates, and dispatch are authorized.

## Organizer workflow in Notion

Create saved views for **All households**, **Ready to invite**, **Missing email/address**, **Awaiting RSVP**, **Partially answered**, **Attending dinner**, **Declined**, **Dietary/accessibility requests**, and **Needs follow-up**. Count people, not household rows. Show separate ceremony, dinner, and dance counts. Include invitation capacity versus accepted guests and distinguish Pending from No.

Use optional planning databases for **Tasks** (owner, due date, status), **Vendors & budget** (quote, deposit, balance, due date, contact), and **Run of show** (time, activity, person responsible). These stay private and do not require public pages.

## Build sequence

1. **Starter — delivered:** invitation-derived design; responsive guest sections; household RSVP demo; this research and implementation handoff.
2. **Content completion:** date confirmed as Friday, January 15, 2027; resolve venues and add deadline, family contact, attire, language, children/plus-one policy, parking, and accessibility details. Confirm meal options only if the caterer requires them.
3. **Notion connection:** inspect the existing database before changing it; map field IDs/types and relations; create a separate test household; implement authenticated invitation access, persistence, and edits using the contract in `NOTION-INTEGRATION.md`.
4. **Guest launch:** choose hosting/domain; verify final address pins and calendar; test on mobile and with a family member; send one test invitation and verify saved Notion results; open real RSVPs only after that passes.
5. **Event operations:** family checks pending replies and meal counts, sends authorized reminders, finalizes the caterer count, and exports a restricted day-of list.
6. **After the event:** optional album and thank-you tracking; close RSVPs; revoke invitation access and remove unneeded contact/accommodation data under the family's agreed retention plan.

## Launch checks

- Date confirmed as Friday, January 15, 2027. Website text is updated; correct the original invitation artwork weekday before distribution.
- Remove provisional answers only after supplying confirmed replacements.
- Test invited and uninvited access, mixed household attendance, declined-all response, plus-one limits, edit-after-save, and closed-deadline behavior.
- Verify a guest can never retrieve or change another household's record.
- Verify Notion errors, timeouts, repeated submissions, and refreshes never produce a false success or duplicate records.
- Review keyboard focus, labels, contrast, 200% text size, mobile widths, and reduced-motion behavior.
- Include a concise guest privacy explanation and a real organizer contact; keep accommodation information restricted to people who need it.
- Publish only the guest website assets. A hidden admin URL or `noindex` does not secure private data.
- If event details themselves should be private, put the full site behind server-enforced invitation/session access; static HTML remains visible to anyone with its URL.

## Technical reference

[Google AI Studio Build documentation](https://ai.google.dev/gemini-api/docs/aistudio-build-mode) describes code export, GitHub import/sync, and deployment options. Use AI Studio as the development tool; this site does not need Gemini calls at runtime. A strict static host can serve the guest interface, while a small separate server handles Notion access. Choosing AI Studio's server deployment path instead changes the hosting architecture; it does not justify exposing secrets in browser code.
