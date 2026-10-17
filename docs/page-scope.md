# Pages and how the family uses them

All routes below exist. Guest routes have matching `/es/` versions and language links. Admin routes are family-only after the administrator sign-in (emailed link, Google or Microsoft, then an authenticator code); their static shells contain no private data. Who can sign in is decided in Notion: see [account-access.md](account-access.md).

## How guests find the pages

The header has one link per section, named the same as the page it opens: **Schedule**, **Travel** (once it has content, see below), **Photos**, **Gifts**, **Questions** and **Contact**, then **Sign in** (it opens My account and reads **My account** once signed in; administrators sign in at `/admin/login/` instead, which no guest page links to), the language switch (**Español** / **English**, shortened to **ES** / **EN** on phones) and **RSVP**. On screens narrower than 1080px the links sit behind a **Menu** button so the header stays one 64px row. A section's other pages (the ceremony and reception under Schedule; sharing and the guestbook under Photos) are listed under its page titles. The policies and message programs are in the footer.

Pages that wait for the family's words are built but not linked from anywhere until their content exists in `family` in `site/content.mjs` (`waitsFor` there decides): **Sophia** (her story, the parents' letter or the moments), the **court of honor**, the **padrinos**, **Travel** (hotels or the airport note) and, after the event, **Thank you** (the note or the highlight video). Once one is filled in, the next build adds a **Sophia**, **Travel** (in its place after Schedule, and linked from the Schedule's "Good to know") or **Thank you** link to the header and lists Sophia's filled pages together; nothing else needs changing. Visited directly while empty, these pages end with the RSVP and the schedule rather than a dead end. `npm run check` fails if any page links to one that is still empty.

| Route | Purpose and workflow |
|---|---|
| `/` | Name, date, RSVP and the reply-by date first (the reply-by line goes at the deadline; the RSVP button stays, for the closed note and the saved answer); a countdown to the RSVP deadline (then to the celebration, gone after it); the day's schedule linking each venue; Sophia's words; the invitation artwork, whose alt text carries its schedule |
| `/sophia/` | Biography and family message; approved copy belongs in `site/content.mjs`. Linked once it has content |
| `/details/` | **Schedule**: each part of the day with its time, venue page, address, map, calendar file and Google Calendar link; "What to expect" once the family picks the traditions of the day; a small "Good to know" box (dress code or the promise to post it, the drive between the two places, and parking, children and a link to Travel once supplied) |
| `/ceremony/` | Ceremony time and confirmed church/parking details when supplied; calendar files in the page's language (`/calendar/es/…` on Spanish pages) |
| `/reception/` | AMZ address and map directions |
| `/rsvp/` | Opens with the private invitation link, or the link or code pasted into the form (RSVP only), or for a signed-in guest once their household's link is issued. States the household's allocation from Notion and the reply-by date; **Everyone's coming** / **We can't make it** go straight to the review, as do the invitation email's quick-answer links; or per-event counts, asking only about the invited events (each with its time and place) and about children only when the invitation includes them. Nothing is saved before **Save my RSVP**. Answers in progress stay in the browser tab through a reload, a language switch or Back (kept per household, used only while they fit the invitation, and cleared by signing out), and while the guest keeps working the link session stays open (up to 2 hours) |
| `/rsvp/confirmed/` | Shows only a durably saved answer, when it was saved and until when it can change; calendars and directions for the events they attend, and "What's next" (what the site will still post and by when, and how news reaches them: text messages and WhatsApp only while the server has them live), or a thank-you and the guestbook for a household that can't come |
| `/account/` | **Sign in** while signed out: the email where the household got its invitation first (emailed link, Google or Microsoft), returning to the page the guest started from, in either language, then one line for an invitation link or code (which open the RSVP) with the code box folded; a used or expired link offers a new one. **My account** once signed in (the header item too): the household's RSVP and a way to change it, contact details, WhatsApp updates, private family replies, and sign-out on all devices |
| `/court/` | Approved court names, roles and portraits. Linked once it has content |
| `/padrinos/` | Public thank-you to the padrinos, once the family approves it. Linked once it has content |
| `/gallery/` | **Photos**: the family's portraits, once supplied, open the page by album for everyone; then approved photos and videos, for signed-in guests. Signed out: one sign-in panel that returns here; nothing approved yet: a "Share your photos" empty state; album cards and the photo and video sections appear only when they have media |
| `/share/` | **Share your photos**: photo and video upload for signed-in guests, straight from a phone (photos up to 40 MB, videos up to 300 MB and 60 s, sent in resumable pieces with progress). The printable generic QR for tables opens `/share/#media-upload`; signed out, the page explains the steps with a line in the other language, and the sign-in returns to it |
| `/registry/` | **Gifts**: registry links the family adds |
| `/travel/` | Travel guidance and approved hotel links. Linked once it has hotels or an airport note |
| `/faq/` | **Questions**: invitation allocation, the deadline with a link to the RSVP (after it, that RSVPs are closed), editing, photos and pending attire |
| `/guestbook/` | Well-wishes from signed-in guests; only approved messages are public |
| `/contact/` | Family mailbox link first, where a reply appears (by email; in My account for a message sent on the site), and an optional line from the event settings naming who reads the messages. Signed out, a quiet email sign-in to send a message here; signed in, a link to the household's thread on My account (one thread, no second form) |
| `/whatsapp/`, `/sms/` | How the WhatsApp and SMS updates work and how to opt in or out |
| `/privacy/`, `/terms/`, `/sms-terms/` | Privacy policy, media policy and SMS terms |
| `/thank-you/` | After-event message and optional highlight-video link. Linked once either exists |
| `/404/`, `/404.html` | Missing-page recovery with RSVP, Schedule and Home, actual HTTP 404 for unknown URLs. Hosting serves the one `/404.html`; under `/es/` it shows its Spanish copy (`site/not-found.js`) |
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

Sign-in links, RSVP receipts and the registered SMS welcome after a first SOPHIA are the only messages to guests sent without a person pressing Send (owner decisions 7 and 16 in [v1/access-model.md](v1/access-model.md)); WhatsApp answers only the STOP, START and HELP keywords on its own, and Twilio answers SMS STOP and HELP. The family's own notification emails (to `NOTIFICATION_EMAILS`) are also automatic and never go to guests. They go only to an address on the household's Notion row, never to one typed into a form. Each household gets at most 5 automatic receipts a day; later ones wait as drafts in Communications. No bulk campaign or scheduled reminder is ever sent automatically. No meal choices are invented; menu selections require family-supplied options before implementation. Separate dietary/accessibility/song requests are currently collected in one optional request field.

A route being present does not imply its family content or provider account setup is complete. See [validation.md](history/validation.md).
