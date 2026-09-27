# Guest accounts and page access

The family selected one-time email links. First visit: invitation code/private link → save RSVP/contact information → enter contact name and email → verify the emailed link. Later visits: enter that email and use a new link. No guest password or passkey is required.

The current invitation database is household-based, so one verified contact account manages each household. It is not a separate account for every attending child/adult. An email can belong to only one household. Changing the RSVP contact email does not change the verified sign-in email. Sign-in email recovery requires organizer identity checks and a reviewed operator recovery; there is no unverified self-service overwrite.

## Organizer workflow

- `/admin/access/`: enable/disable an account and check Registry/gifts, Padrinos, Costs, and Family administration independently. Optional permissions start unchecked. Changes are checked by the server on every request and apply to active sessions. These are the selected restricted sections; ordinary event information remains public, and core RSVP/contact/photo/guestbook submission flows remain invitation-authenticated.
- `/admin/content/`: write English/Spanish registry, padrino and cost content and HTTPS links. These records live in the private ledger and are never embedded in the static HTML or browser JavaScript. Only the matching permission or an authenticated family administrator can retrieve them. Do not put private photos/files into public `/assets/`; private attachments are not supported by this editor yet.
- Only a bootstrap organizer authorized by `ADMIN_EMAILS` can grant/remove administration. A guest granted administration must verify email and complete authenticator MFA before admin APIs accept the session. A page checkbox alone never creates an admin session. Bootstrap organizers continue using Google plus MFA.
- `/account/` (and `/es/account/`): contact edits, RSVP edits, directions, allowed-page links and a private household/family message thread. Replies are saved in the site and appear when the guest refreshes. They do not automatically send notification emails.

## Data and security

Notion remains the authoritative invited-capacity source. Contact details and a `Website account` projection (name, verified email, enabled state, page permissions, verification time) are pushed to the same Invitations row. The private Google ledger stores accounts, permissions, session records, contact profiles and committed RSVP receipts as well. This is a synchronization design, not a claim that the website backend stores no PII. Notion edits to the projected account column do not grant website access; use the admin controls.

Invitation links have 256-bit random secrets; manually entered codes have 80 bits and are rate-limited. Once a household account is verified, code sessions are invalidated and the code cannot reopen it. Email links have 256-bit secrets, hashed at rest, a 15-minute expiry, and atomic single use. The email lookup index uses a keyed HMAC. Tokens are URL fragments removed before use; visiting the link does not consume it until the user presses Continue. Disabled/revoked accounts and invitations cannot redeem links. Responses to anonymous sign-in requests use the same generic body for known and unknown addresses; provider latency can still differ. Global and per-address budgets limit email abuse, but production monitoring is still required.

Requested sign-in emails are transactional and sent immediately through the configured event mailbox. They do not wait in the organizer campaign outbox. Missing email configuration fails closed. An ambiguous send is never retried automatically; the guest may request a fresh link subject to rate limits. No live email has been sent during implementation tests.

## Deployment and cleanup

Prepare the new Notion column before opening registration. Verify the Microsoft mailbox-scoped application, real link delivery, token expiry/reuse, code rejection after registration, denied/granted/revoked page access, and email-plus-MFA administration through the production hostname. The local synthetic-provider browser checks do not replace this acceptance.

Account data, hashed email challenges, MFA seeds, profiles, private page content and conversation replies are all inside the dedicated event ledger. Export only the family-selected records, close login/submissions, revoke provider access, and retire the dedicated bucket under `CLEANUP.md`. The Notion account projection is an event-added column to include in the reviewed retention decision. Original Notion invitation rows remain protected.
