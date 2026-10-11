# Pages and how the family uses them

All routes below exist. Guest routes have matching `/es/` versions and language links. Admin routes are family-only after the administrator sign-in (emailed link, Google or Microsoft, then an authenticator code); their static shells contain no private data. Who can sign in is decided in Notion: see `ACCOUNT-ACCESS.md`.

| Route | Purpose and workflow |
|---|---|
| `/` | Invitation artwork, confirmed date, countdown, RSVP and navigation |
| `/sophia/` | Biography and family message; approved copy belongs in `site/content.mjs` |
| `/details/` | Complete schedule, calendar links and links to venue pages |
| `/ceremony/` | Ceremony time and confirmed church/parking details when supplied |
| `/reception/` | AMZ address and map directions |
| `/rsvp/` | Opens with the private invitation link or typed code (RSVP only), or for a signed-in guest once their household's link is issued; uses current Notion household allocations; per-event attendance and contact corrections |
| `/rsvp/confirmed/` | Shows only a durably saved answer; edit response and add to calendar |
| `/account/` | Sign-in with the household's Notion email (emailed link, Google or Microsoft); contact details, WhatsApp updates, private family replies and sign-out on all devices |
| `/court/` | Approved court names, roles and portraits |
| `/padrinos/` | Public thank-you to the padrinos, once the family approves it |
| `/gallery/` | Approved photos and videos, for signed-in guests |
| `/share/` | Photo and video upload for signed-in guests; printable generic QR for tables |
| `/registry/` | Gift registry links the family adds |
| `/travel/` | Travel guidance and approved hotel links |
| `/faq/` | Invitation allocation, deadline, editing, photos and pending attire |
| `/guestbook/` | Well-wishes from signed-in guests; only approved messages are public |
| `/contact/` | Family mailbox link and a contact form for signed-in guests |
| `/whatsapp/`, `/sms/` | How the WhatsApp and SMS updates work and how to opt in or out |
| `/privacy/`, `/terms/`, `/sms-terms/` | Privacy policy, media policy and SMS terms |
| `/thank-you/` | After-event message and optional highlight-video link |
| `/404/`, `/404.html` | Themed missing-page recovery, actual HTTP 404 for unknown URLs |
| `/admin/login/` | Administrator sign-in: the main Email of a Notion row with Administrator Eligible ticked (or an owner), plus an authenticator code |
| `/admin/` | Overview: head counts by event, household statuses, Notion sync and differences, guest requests |
| `/admin/guests/` | Invitations: current Notion households; issue, reissue and revoke links; invitation and reminder email batches; Notion differences (keep Notion's or write the website's); CSV import/export |
| `/admin/access/` | Guest access: who has signed in, administrators from Notion, authenticator resets and recovery codes (owner) |
| `/admin/content/` | Accounting & godparents: Budget and Godparents records kept in step with Notion |
| `/admin/documents/` | Documents attached to accounting and godparent records |
| `/admin/site/` | Website & event: event details, albums and page previews |
| `/admin/notifications/` | The family's inbox: RSVPs, security notes, Notion sync problems and differences |
| `/admin/seating/` | Whole-household dinner seating, duplicate/capacity checks |
| `/admin/photos/` | Review uploads before publishing |
| `/admin/guestbook/` | Moderate well-wishes; read and answer contact messages |
| `/admin/updates/` | Communications: bilingual site announcements; email drafts and batches; SMS and WhatsApp composers. Every message is previewed and sent by a person |
| `/admin/history/` | Record history |

Sign-in links and RSVP receipts are the only emails sent without a person pressing Send (owner decision 7 in `docs/v1/access-model.md`). They go only to an address on the household's Notion row, never to one typed into a form. Each household gets at most 5 automatic receipts a day; later ones wait as drafts in Communications. No bulk campaign or scheduled reminder is ever sent automatically. No meal choices are invented; menu selections require family-supplied options before implementation. Separate dietary/accessibility/song requests are currently collected in one optional request field.

A route being present does not imply its family content or provider account setup is complete. See `VALIDATION.md`.
