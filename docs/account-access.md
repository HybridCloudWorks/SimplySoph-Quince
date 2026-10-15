# Guest and administrator access

The model, in one table. The decision record is [v1/access-model.md](v1/access-model.md).

| Who | How they get in | What they can do |
|---|---|---|
| Anyone | No sign-in | Read every public page |
| Invited household | Private invitation link (SMS, WhatsApp, email) or typed code | RSVP only. The answer goes to the **RSVP** column in Notion (Yes/No) with head counts |
| Signed-in guest | The email on their household's Notion row (`Email`, or the comma-separated `Additional Emails` column), proven by an emailed one-time link, Google or Microsoft | Uploads, guestbook, messages with the family, contact details, WhatsApp opt-in, and the RSVP once the household's invitation has been issued |
| Administrator | The row's main `Email` only, with the same sign-in at `/admin/login/`, plus an authenticator code | The admin portal |
| Break-glass owner (`ADMIN_EMAILS`) | Same as an administrator | Everything, plus owner-only actions: Notion schema, import, authenticator resets, recovery codes, history |

## Managing access (all in Notion)

- **Let a guest sign in:** put their email in the household's **Email** (or **Additional Emails**) in Notion. Nothing else is needed: no registration, no grant, and no invitation link yet. The RSVP opens once the household's invitation is issued.
- **Make someone an administrator:** tick **Administrator Eligible** on their row, with their address in the row's main **Email**. Additional Emails never make someone an administrator. Their first sign-in uses the emailed link; they scan a QR code with Google Authenticator or Microsoft Authenticator, and you get a note in Notifications. After that, Google or Microsoft also work.
- **Remove an administrator:** untick the box. Their session ends on their next click, and you get a note in Notifications. If the box is still unticked a day later, the scheduled drain removes their authenticator, so ticking them again after that means a fresh setup. Ticking it again within the day keeps everything. If Notion shows no ticked row at all (say the column was renamed), nobody is removed.
- **A lost phone:** the owner opens **Admin → Guest access → Reset authenticator** with a current code from their own app. That person sets up a new authenticator at their next sign-in.
- **The owner's own lost phone:** create recovery codes ahead of time on **Admin → Guest access → Your recovery codes** and keep them away from the phone. At sign-in, a recovery code goes in place of the authenticator code; it works once, ends the lost phone's admin sessions and Microsoft link, and leads straight into setting up a new authenticator. The old authenticator keeps working only until the new one is set up.
- **Reissuing or revoking a link:** reissuing (say, after a link was forwarded) ends that link's sessions but keeps everyone who signed in with their email. Revoking the invitation ends every session for that household.

## Sign-in details

- **Invitation links and codes** open the RSVP only. Contact details stay hidden, and every other page asks for the email sign-in.
- **Emailed links:**
  - 256-bit secrets, hashed at rest, and not kept in the mailbox's Sent Items.
  - Expire after 15 minutes and work once.
  - Sent only to an email on the guest list. Unknown addresses get the same response, after the same delay, and no email.
  - At most 3 links per address every 15 minutes. Only links actually sent count, so nobody can lock someone else out.
- **Google and Microsoft:**
  - Sign-ins use a one-time, purpose-bound ticket.
  - A guest sign-in never creates an admin session; admins sign in at `/admin/login/`.
  - Microsoft can stand in for the admin authenticator code only after a linked sign-in that passed the code, and only when Microsoft confirms two-step sign-in.
  - Work accounts must be members of the simplysoph.com tenant with a verified email domain.
  - Google accepts Gmail and Google Workspace addresses only, and Microsoft personal accounts only Microsoft's own addresses (Outlook, Hotmail, Live, MSN). Neither provider vouches for who owns other addresses registered in their accounts, so a recycled address could be taken over; those addresses use the emailed link.
  - The first guest sign-in binds that Microsoft or Google account to the email. A different provider account for the same email is refused; the emailed link still works.
- **Authenticator codes:** 5 tries per sign-in. Ten wrong codes for one administrator within an hour pause that administrator's sign-ins for an hour, including sign-ins already open, and you get a note in Notifications. During a pause the owner can still sign in with a recovery code. A linked Microsoft account whose two-step sign-in Microsoft confirmed stands in for the code, so it is not paused.
- **Sessions:**
  - Guests signed in with their email stay signed in while they use the site: 30 minutes after their last visit, at most 12 hours after signing in. Removing their email from the Notion row ends their access on their next request.
  - Invitation-link sessions (RSVP only) also stay open while the guest is answering: 30 minutes after their last step, at most 2 hours after opening the link. Reissuing or revoking the link ends them at once.
  - Administrator sessions last 30 minutes.
  - **Sign out on all devices** (My account) ends every guest sign-in of that person. **Sign out everywhere** (admin menu) ends their admin and guest sign-ins alike.
  - The cookie is HttpOnly, Secure, SameSite=Strict and scoped to `/api`.
  - Every write needs the CSRF header and the site's Origin. Uploads without a current session are refused before they are read, and each server handles at most 3 uploads at once.

## Data

- **Notion is the roster:** names, emails, capacities and admin flags.
- **The private ledger keeps:**
  - Sign-in records: who signed in and when, with no permissions.
  - Sessions.
  - Sealed authenticator secrets and hashed recovery codes.
  - RSVPs, messages and photos.
- **RSVP receipts** go only to the signed-in email or the household's Notion Email, never to an address typed into the form.
