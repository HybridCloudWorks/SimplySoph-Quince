# Guest accounts and page access

The family selected one-time email links. First visit: invitation code/private link → save RSVP/contact information → enter contact name and email → verify the emailed link. Later visits: enter that email and use a new link. No guest password or passkey is required.

The current invitation database is household-based, so one verified contact account manages each household. It is not a separate account for every attending child/adult. An email can belong to only one household. Changing the RSVP contact email does not change the verified sign-in email. Sign-in email recovery requires organizer identity checks and a reviewed operator recovery; there is no unverified self-service overwrite.

## Organizer workflow

- `/admin/access/`: enable/disable an account and check Registry/gifts, Padrinos, Costs, and Family administration independently. Optional permissions start unchecked. Changes are checked by the server on every request and apply to active sessions. These are the selected restricted sections; ordinary event information remains public, and core RSVP/contact/photo/guestbook submission flows remain invitation-authenticated.
- `/admin/content/`: write English/Spanish registry, padrino and cost content and HTTPS links. These records live in the private ledger and are never embedded in the static HTML or browser JavaScript. Only the matching permission or an authenticated family administrator can retrieve them. Do not put private photos/files into public `/assets/`; private attachments are not supported by this editor yet.
- Only an owner (`ADMIN_EMAILS`) can grant or remove administration. **Granting needs a current code from the owner's own authenticator**; removing does not, and it also deletes that person's authenticator.
- **Authenticator setup is owner-gated.** Owners set up their own. Everyone else (delegates in `ADMIN_DELEGATE_EMAILS`, and guests granted administration) can set one up only within **24 hours after an owner allows it** in **Admin → Guest Access → Authenticator setup**. The window works once. **Reset** deletes a lost authenticator and ends that person's admin sessions. This stops whoever first completes someone's sign-in from claiming their admin account.
- Each authenticator setup appears in the in-app Notifications inbox (no email). Role and authenticator changes are kept in an append-only history shown on the same page.
- Changing the Notion schema and importing rows are owner-only. A page checkbox alone never creates an admin session. Owners keep using Google, Microsoft or an email link, plus MFA (see below).
- `/account/` (and `/es/account/`): contact edits, RSVP edits, directions, allowed-page links and a private household/family message thread. Replies are saved in the site and appear when the guest refreshes. They do not automatically send notification emails.

## Microsoft and Google sign-in

Optional alternatives to the emailed link. Administrators and guests stay separate: each has its own entry point, its own server route, and a sealed one-time ticket naming its purpose, so a guest sign-in can never be replayed as an admin sign-in.

| | Guests (`/account/`) | Administrators (`/admin/login/`) |
|---|---|---|
| Accounts accepted | Microsoft personal accounts, simplysoph.com work accounts, Google | Microsoft personal accounts, simplysoph.com work accounts; Google for owners (unchanged) |
| Who gets in | The registered account whose verified email matches. SSO never creates an account; registration still starts from the invitation | Owners, delegates and guests holding Family administration: the same people the emailed admin link admits |
| Session | Always a guest session, even for an account that holds the admin permission | Admin session |
| Authenticator code | Not used | **Always asked the first time.** Later it is skipped only when Microsoft proves MFA (`amr` contains `mfa`) **and** that same Microsoft account was linked by an earlier sign-in that passed the code. Google always needs the code; the owner-gated first setup still applies |

- **Microsoft:** the browser uses the authorization-code flow with PKCE; no client secret exists. The server checks the token signature against Microsoft's keys, the audience, the tenant (personal accounts or simplysoph.com only), the issuer, the expiry and the single-use nonce.
- **Why the first admin sign-in asks for the code:** someone who took over an admin's mailbox could create a new Microsoft account for that address and turn on its MFA. Linking only after the authenticator passes means that account never qualifies. A different Microsoft account for the same admin email simply gets the code, and passing it relinks.
- **Guest binding:** the first guest SSO sign-in binds that Microsoft or Google account to the email. A different provider account presenting the same email later is refused (`SSO_ACCOUNT_CHANGED`); the emailed link still works. An owner's **Reset** of an administrator's authenticator also clears that person's Microsoft link.
- **Work accounts** must be members of the simplysoph.com tenant (not B2B guests) with a verified email domain; Google and Microsoft tokens carry a one-time, purpose-bound nonce on both routes.
- **Setup:** see DEPLOYMENT.md, Provisioning 7. Until `MICROSOFT_CLIENT_ID` is set, the Microsoft buttons do not appear.

## Data and security

Notion remains the authoritative invited-capacity source. Contact details and a `Website account` projection (name, verified email, enabled state, page permissions, verification time) are pushed to the same Invitations row. The private Google ledger stores accounts, permissions, session records, contact profiles and committed RSVP receipts as well. This is a synchronization design, not a claim that the website backend stores no PII. Notion edits to the projected account column do not grant website access; use the admin controls.

Invitation links have 256-bit random secrets; manually entered codes have 80 bits and are rate-limited. Once a household account is verified, earlier code sessions are invalidated and a typed code cannot reopen it. The private **link** still opens an **RSVP-only** session, so "Edit response" and WhatsApp links keep working. That session can view and submit the RSVP, sign in and log out; every other route treats it as signed out. Contact details are hidden from it, and the server keeps the registered contact and receipt address whatever the request contains. Contact edits, private pages, messages and the gallery still require the verified email sign-in. Email links have 256-bit secrets, hashed at rest, a 15-minute expiry, and atomic single use. The email lookup index uses a keyed HMAC. Tokens are URL fragments removed before use; visiting the link does not consume it until the user presses Continue. Disabled/revoked accounts and invitations cannot redeem links. Responses to anonymous sign-in requests use the same generic body for known and unknown addresses; provider latency can still differ. Global and per-address budgets limit email abuse, but production monitoring is still required.

Requested sign-in emails are transactional and sent immediately through the configured event mailbox. They do not wait in the organizer campaign outbox. Missing email configuration fails closed. An ambiguous send is never retried automatically; the guest may request a fresh link subject to rate limits. No live email has been sent during implementation tests.

## Deployment and cleanup

Prepare the new Notion column before opening registration. Verify the Microsoft mailbox-scoped application, real link delivery, token expiry/reuse, code rejection after registration, denied/granted/revoked page access, and email-plus-MFA administration through the production hostname. The local synthetic-provider browser checks do not replace this acceptance.

Account data, hashed email challenges, MFA seeds, profiles, private page content and conversation replies are all inside the dedicated event ledger. Export only the family-selected records, close login/submissions, revoke provider access, and retire the dedicated bucket under `CLEANUP.md`. The Notion account projection is an event-added column to include in the reviewed retention decision. Original Notion invitation rows remain protected.
