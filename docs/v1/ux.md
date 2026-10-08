# UX recommendations: invitation and RSVP

Goal: a guest RSVPs in **≤3 taps** from any invitation. An organizer sends to a whole group with **one preview and one confirm**.

## Today (measured from code)

**Guest, email, first visit:** open the email, tap **View invitation** (auto-opens), fill up to 6 count dropdowns, tap **Review**, tap **Save**. That is **about 7–15 taps**. Registering an account adds about 6 steps plus a switch to the inbox.

| Friction / dead end | Where |
|---|---|
| **Registering breaks the household link.** The original invitation link then fails silently, showing a code form with the raw token. "Edit response" leads to a sign-in wall | `application.mjs` ~L534, `guest.js` ~L297-305 |
| WhatsApp opt-in is only on the registered account page. That means about 10 steps: RSVP, register, verify, My Account, phone, consent, save, WhatsApp, START, refresh | `guest.js` ~L67-80 |
| WhatsApp invitation links fail for anyone who opted in on the site, because opting in required registering | follows from row 1 |
| SMS drafts are one shared text per batch, with no per-household link | `application.mjs` ~L1531 |
| Accept and decline show the same page. Calendar offers all 3 events regardless of invitation or attendance | `experience.js` ~L15-25 |
| "Notion" and a raw UUID receipt shown to guests | `guest.js` ~L230 |
| A 30-minute session plus a long form can lose the draft | `guest.js` |

**Organizer, one email invitation:** about 10 actions per household (create link → draft → review → confirm → send). The link is shown once, and reminders need it pasted back. In practice about 40 invitations per hour, against a 120 POST/hour per-admin limit.

## Target

| Step | Guest | Taps |
|---|---|---|
| 1 | Open the invitation (email button / SMS link / WhatsApp template link) | 1 |
| 2 | Page opens with **Attending (N)** / **Can't attend** preselected from the email's quick-answer link | — |
| 3 | **Confirm** | 1 |
| (opt) | Adjust counts with steppers | +1 |

Nothing saves automatically on page load, so link-scanning bots can't RSVP. After confirming, the page changes with the answer (see the state table in [architecture.md](architecture.md)).

**Organizer:**

1. Guests & Invitations → select a group.
2. **Send invitation**. Channel order per household: email, then WhatsApp if eligible, then SMS if eligible.
3. Preview one sample per language. The page shows recipients and the households being skipped, with the reason.
4. Type the count to confirm. The server mints each link and sends at about 1/s.

Resend rules: skip households that responded or opted out; at least 72 h between messages; at most 3 reminders. Suggested reminder dates: Oct 17, 24 and 29.

## Prioritized recommendations

| # | Recommendation | Effort | Files | Priority |
|---|---|---|---|---|
| 1 | Keep link sessions working after registration (RSVP-scoped); clear message when a link is rejected | S–M | `application.mjs` L501-558, `accounts.mjs`, `guest.js` | **P0** |
| 2 | Server-minted links in email invitations and reminders; `{link}` placeholder for SMS | M | `application.mjs`, `admin.js`, `admin-audience.js` | **P0** |
| 3 | Everyone attending / No one can attend buttons; email quick-answer links; merge the review step into the form | S | `guest.js`, `emails/templates.mjs` | **P0** |
| 4 | Per-household status column and filters; record `openedAt` | M | `application.mjs`, `admin.js` | **P0** |
| 5 | Copy fixes: garbled Spanish characters (`templates.mjs` L158); "use your original code" text; sign-in/receipt links always English; remove "Notion"/UUID from guest copy | S | templates, `accounts.mjs`, `guest.js` | **P0** |
| 6 | WhatsApp/SMS opt-in on the confirmation page for link sessions | S | `guest.js`, `guest-whatsapp.js` | P1 |
| 7 | Bulk send with sample preview and typed-count confirm (replaces one-by-one; needs family sign-off on dropping per-recipient review) | M | `admin.js`, `application.mjs` | P1 |
| 8 | Add RSVPs to the Notifications inbox; dashboard auto-refresh (ETag polling) | S | `application.mjs` ~L828, `admin.js` | P1 |
| 9 | Confirmation page that changes with the answer; calendar for the events they're attending only | S–M | `guest.js`, `experience.js` | P1 |
| 10 | Keep RSVP drafts in sessionStorage; quietly re-open the invitation when the session expires | S | `guest.js` | P1 |
| 11 | "Maybe" status; dietary/accessibility fields (needs the menu from the family) | M | `rsvp-validation.mjs`, Notion | P2 |
| 12 | Event-day: livestream, gallery and upload prompts | M | — | P2 |

## Accessibility, mobile and i18n

- Move focus to the new heading after page-content swaps. Add `role="status"` to success notices.
- Add `autocomplete` and `inputmode` to name, email, tel and address fields. Make the account phone field `type="tel"`. Accept spaces in WhatsApp numbers and normalize them.
- Replace the six count dropdowns with steppers.
- Mark the decorative "↗" in links with `aria-hidden`.
- Add a QR code to paper invitations instead of the 16-character typed code.
- Spanish: use the informal form consistently. Replace "Estás invitado" with "Te invitamos" (gender-neutral).
- Admin screens are English-only. Consider Spanish for delegates (P2).
