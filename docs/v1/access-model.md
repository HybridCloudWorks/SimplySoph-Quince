# Access model (decision record, October 10, 2026)

**Status:** accepted by the owner. This supersedes the ledger-as-source-of-truth model in `admin-center.md` and the registration and page-permission model in the earlier `ACCOUNT-ACCESS.md`.

## Context

A seven-agent audit on October 10, 2026 counted 11 sign-in paths and 7 sources of "who is an admin". The owner asked for a simpler model: "This should not be this complicated."

## Decision

| Who | How they get in | What they can do |
|---|---|---|
| Anyone | No sign-in | Read every public page |
| Invited household | Private invitation link (SMS, WhatsApp, email) or typed code | RSVP only. The RSVP is written to the family's **RSVP** column in Notion (Yes/No) along with head counts |
| Signed-in guest | An email on their household's Notion row (`Email`, or comma-separated `Additional Emails`), proven by an emailed one-time link, Google or Microsoft | Everything that changes data: uploads, guestbook, messages, contact details, WhatsApp opt-in |
| Administrator | Same email sign-in at `/admin/login/`, **plus** an authenticator code (QR setup on first sign-in) | The admin portal. Granted by ticking **Administrator Eligible** on their Notion row; unticking ends their session on the next request |
| Break-glass owner | `ADMIN_EMAILS` (one address), plus an authenticator code | Everything, including owner-only actions: Notion schema, import, authenticator resets, history. The one approved exception outside Notion |

## Owner decisions

1. Admins keep an authenticator code. Microsoft can stand in for it only after a linked sign-in that passed the code (see `ACCOUNT-ACCESS.md`).
2. Keep one break-glass owner outside Notion.
3. The admin field is the existing **Administrator Eligible** checkbox. It was not renamed, because the code reads it by that name.
4. Guest identity is the Notion row's Email, plus an optional **Additional Emails** column.
5. Invitation links and codes are RSVP-only.
6. RSVPs write the family's **RSVP** column. "Website RSVP" is no longer written.
7. Sign-in links are sent automatically on the guest's own request. Receipts go only to a verified address (the signed-in email or the Notion Email), never to an address typed into the form.
8. Page permissions (gifts, padrinos, costs) are removed. The registry is public, and costs and the padrinos planning list are admin-only.
12. The automatic Notion retry (Cloud Scheduler drain) is turned on.

## Removed

- Guest registration.
- The `RSVP_FIRST` rule.
- The `EMAIL_SIGN_IN_REQUIRED` rule for codes.
- `ADMIN_DELEGATE_EMAILS`.
- The ledger "admin" permission and its grant screen.
- `/api/auth/step-up`.
- Owner-opened 24-hour setup windows (`mfaSetup`).
- Page permissions and `/api/pages/*`.
- Private page content (`/api/admin/pages`).
- The "Website account" Notion projection.
- The `/costs/` and `/gifts/` pages.

## Consequences

- Notion becomes the key to admin access. Restrict who can edit the Invitations database and turn on two-step sign-in for the workspace. Every authenticator setup is reported in the Notifications inbox.
- Households without an Email in Notion can still RSVP with their link, but can't sign in for photos and messages until one is added.
- Each admin request reads that person's Notion row (with a 5-second cache). If Notion is unreachable, admin pages return an error instead of signing the admin out. The break-glass owner keeps working.
