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
- **The owner's own lost phone:** create recovery codes ahead of time on **Admin → Guest access → Your recovery codes** and keep them away from the phone. At sign-in, a recovery code goes in place of the authenticator code; it works once and leads straight into setting up a new authenticator.

## Sign-in details

- **Invitation links and codes** open the RSVP only. Contact details stay hidden, and every other page asks for the email sign-in.
- **Emailed links:**
  - 256-bit secrets, hashed at rest.
  - Expire after 15 minutes and work once.
  - Sent only to an email on the guest list. Unknown addresses get the same response, after the same delay, and no email.
  - At most 3 links per address every 15 minutes. Only links actually sent count, so nobody can lock someone else out.
- **Google and Microsoft:**
  - Sign-ins use a one-time, purpose-bound ticket.
  - A guest sign-in never creates an admin session; admins sign in at `/admin/login/`.
  - Microsoft can stand in for the admin authenticator code only after a linked sign-in that passed the code, and only when Microsoft confirms two-step sign-in.
  - Work accounts must be members of the simplysoph.com tenant with a verified email domain.
  - Google sign-in accepts Gmail and Google Workspace addresses only. Google does not vouch for who owns other addresses in a Google account, so a recycled address could be taken over. Hotmail and Outlook addresses use the Microsoft button; any address can use the emailed link.
  - The first guest sign-in binds that Microsoft or Google account to the email. A different provider account for the same email is refused; the emailed link still works.
- **Sessions:**
  - Guests signed in with their email stay signed in while they use the site: 30 minutes after their last visit, at most 12 hours after signing in, and only while that email is still on their Notion row. Invitation-link sessions (RSVP only) last 30 minutes.
  - Administrator sessions last 30 minutes.
  - **Sign out on all devices** (My account) and **Sign out everywhere** (admin menu) end every session of that person.
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
