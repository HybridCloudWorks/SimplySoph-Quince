# Guest and administrator access

The model, in one table. The decision record is [docs/v1/access-model.md](docs/v1/access-model.md).

| Who | How they get in | What they can do |
|---|---|---|
| Anyone | No sign-in | Read every public page |
| Invited household | Private invitation link (SMS, WhatsApp, email) or typed code | RSVP only. The answer goes to the **RSVP** column in Notion (Yes/No) with head counts |
| Signed-in guest | The email on their household's Notion row (`Email`, or the comma-separated `Additional Emails` column), proven by an emailed one-time link, Google or Microsoft | Uploads, guestbook, messages with the family, contact details, WhatsApp opt-in |
| Administrator | The same email sign-in at `/admin/login/`, plus an authenticator code | The admin portal |
| Break-glass owner (`ADMIN_EMAILS`) | Same as an administrator | Everything, plus owner-only actions: Notion schema, import, authenticator resets, history |

## Managing access (all in Notion)

- **Let a guest sign in:** put their email in the household's **Email** (or **Additional Emails**) in Notion. Nothing else is needed: no registration and no grant.
- **Make someone an administrator:** tick **Administrator Eligible** on their row and make sure the row has their email. At their first sign-in they scan a QR code with Google Authenticator or Microsoft Authenticator, and you get a note in Notifications.
- **Remove an administrator:** untick the box. Their session ends on their next click, and they can't sign in to the admin pages again.
- **A lost phone:** the owner opens **Admin → Guest access → Reset authenticator** with a current code from their own app. That person sets up a new authenticator at their next sign-in.

## Sign-in details

- **Invitation links and codes** open the RSVP only. Contact details stay hidden, and every other page asks for the email sign-in.
- **Emailed links:**
  - 256-bit secrets, hashed at rest.
  - Expire after 15 minutes and work once.
  - Sent only to an email on the guest list. Unknown addresses get the same response and no email.
- **Google and Microsoft:**
  - Sign-ins use a one-time, purpose-bound ticket.
  - A guest sign-in never creates an admin session; admins sign in at `/admin/login/`.
  - Microsoft can stand in for the admin authenticator code only after a linked sign-in that passed the code, and only when Microsoft confirms two-step sign-in.
  - Work accounts must be members of the simplysoph.com tenant with a verified email domain.
  - The first guest sign-in binds that Microsoft or Google account to the email. A different provider account for the same email is refused; the emailed link still works.
- **Sessions:**
  - Last 30 minutes.
  - The cookie is HttpOnly, Secure, SameSite=Strict and scoped to `/api`.
  - Every write needs the CSRF header and the site's Origin.

## Data

- **Notion is the roster:** names, emails, capacities and admin flags.
- **The private ledger keeps:**
  - Sign-in records: who signed in and when, with no permissions.
  - Sessions.
  - Sealed authenticator secrets.
  - RSVPs, messages and photos.
- **RSVP receipts** go only to the signed-in email or the household's Notion Email, never to an address typed into the form.
