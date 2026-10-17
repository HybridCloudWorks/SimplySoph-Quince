# Email

How the website sends email today. Every setting is listed in [deployment.md](deployment.md#configuration); this guide explains how they fit together.

## How it works

- **Sender.** Every email comes from the shared mailbox `misxv@simplysoph.com` in the family's Microsoft 365, sent through Microsoft Graph. The address is fixed in the code, and replies arrive in that mailbox.
- **Permission.** A dedicated Entra app (`M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`) may send only as that mailbox: Exchange application RBAC is scoped to it, and there is no tenant-wide `Mail.Send`. The client secret's expiry must reach past the event.
- **Standby.** SendGrid takes over only when Microsoft will not issue a sign-in token, before anything is submitted. A send whose outcome is uncertain is never repeated through the other provider, so nobody gets a duplicate. Click and open tracking are off, so links are not rewritten. Mail sent through SendGrid does not appear in Sent Items. The owner kept the standby through the event and moved SendGrid's Email API to a paid plan on October 13, 2026. Details are in [sendgrid-setup.md](sendgrid-setup.md).

SendGrid is Twilio's email service, but it is a separate account; text messages and WhatsApp do not use it.

## Text and HTML

Every email built from a template (invitation, reminder, update, details, change, thank-you, RSVP receipt, sign-in link) has a plain-text version as well as its HTML, and a message an organizer writes has their words as typed. Mail programs that do not show HTML use the text, and spam filters count HTML-only mail against it (SpamAssassin's `MIME_HTML_ONLY`, for example). What each provider sends:

| Provider | Sign-in link | Every other email with a text version |
|---|---|---|
| Microsoft 365 (Graph) | HTML only, as before, and **not** kept in Sent Items | Text and HTML in one message (text first), kept in Sent Items |
| SendGrid standby | Text and HTML | Text and HTML |

**The Sent Items rule.** Graph's JSON form of `sendMail` carries a single body (HTML or text); text and HTML travel together only in its MIME form, and Microsoft documents that a MIME send is saved to Sent Items: the `saveToSentItems` switch exists only in the JSON form ([sendMail reference](https://learn.microsoft.com/graph/api/user-sendmail), [MIME messages](https://learn.microsoft.com/graph/outlook-send-mime-message)). A sign-in link must never sit in the shared mailbox, where anyone with access could use it, so it keeps the HTML-only JSON send with `saveToSentItems` off. Every other email is kept in Sent Items anyway, so it gains its text version. `server/mail.mjs` enforces this, and `tests/mail.test.mjs` pins it.

Also worth knowing:

- In the MIME form the website writes the sender name: "Sophia's Quinceañera", the name SendGrid already uses. A sign-in link sent through Graph shows the mailbox's own display name from Microsoft 365.
- A draft saved before this change (in Communications or a group of emails) has no text version kept, so it goes out HTML only.
- Family notifications, the administrator sign-in link and the "we answered your message" notice have no text version yet; they stay HTML only.

## What is sent, and who presses Send

| Message | When it is sent |
|---|---|
| Invitation, reminder, update, details, change, thank-you | Only after a person previews and confirms it (**Admin → Invitations**) |
| Sign-in link | When a guest or administrator asks for one, in the guest's language. Not kept in Sent Items |
| RSVP receipt | After an RSVP, only to an address on the household's Notion row; at most 5 automatic receipts per household a day (later ones wait as drafts in Communications). It repeats the answer for the events on the invitation and says to open the invitation email again to change it before the deadline (`npm run emails:preview` shows a sample) |
| Family notifications | To `NOTIFICATION_EMAILS` (default: `ADMIN_EMAILS`), never to guests |

Nothing else is sent automatically (owner decision 7 in [v1/access-model.md](v1/access-model.md)).

## Domain authentication

DNS for simplysoph.com is served by Cloudflare; the domain is registered at Hostinger. The exact records, and which ones other mail depends on, are in `ops/shared-domain-changes.json`.

- **SPF:** one record at the root authorizes Microsoft 365 and Firebase (`include:spf.protection.outlook.com include:_spf.firebasemail.com ~all`, checked October 13, 2026). Never add a second root SPF record. SendGrid uses its own return-path subdomain with its own SPF.
- **DKIM:** Microsoft signs with `selector1` and `selector2`, SendGrid with `s1` and `s2`. All are CNAMEs, set to DNS only in Cloudflare.
- **DMARC:** `p=none`, with reports going to Cloudflare's DMARC Management (enabled October 13, 2026). Whether to start quarantining spoofed mail is decided after reviewing those reports.

## Before the first real send

Send one reviewed email to a test address you own and check that:

- it arrives in the inbox, not spam
- the Spanish version renders correctly
- the headers show SPF and DKIM passing
- it appears in Sent Items (sign-in links deliberately do not)

This is the email item in the acceptance gate in [deployment.md](deployment.md#acceptance-gate-before-any-real-invitation).

## Owner check after the next API deploy

The text version reaches guests only after the API is deployed again; API deploys are manual ([deployment.md](deployment.md#deploy-the-api)). Nothing here could be tried against the real Microsoft 365 or SendGrid before then, so check it once, with an address you own:

1. Send yourself one RSVP receipt or one invitation (**Admin → Invitations**), and ask for one sign-in link from a Spanish page (`/es/account/`).
2. Open each message's source (Outlook on the web: **⋯ → View → View message source**; Gmail: **⋮ → Show original**).
3. Receipt or invitation: `Content-Type: multipart/alternative`, a `text/plain` part before a `text/html` part, the subject reads correctly with its accents and "·" (in Spanish, for example "Su respuesta se actualizó · Los XV de Sophia"), the sender reads "Sophia's Quinceañera", and the message is in Sent Items.
4. Sign-in link: one HTML body as before, the Spanish subject "Tu enlace para entrar · Los XV de Sophia", and the message is **not** in Sent Items.

If the receipt or invitation shows `failed` in Communications instead, Microsoft refused it before sending, so nobody received it: route traffic back to the previous revision ([deployment.md](deployment.md#release-and-rollback); the previous API ignores the stored text versions) and report it.

## If something goes wrong

- **A message shows `unknown` or `sending`:** it is never retried automatically. Look for it in Sent Items, or in SendGrid's activity for a standby send, before deciding whether to send again.
- **Microsoft refuses the app** (for example an expired client secret): sends fail before anything is submitted, and the SendGrid standby takes over. Renew the secret in Entra, add it as a new Secret Manager version, and deploy the API with that version pinned ([deployment.md](deployment.md#deploy-the-api)).
- **To switch the standby off** (PowerShell):

  ```powershell
  gcloud run services update misxv-api --region=us-central1 --project=simplysoph-66c78 '--update-env-vars=SENDGRID_FALLBACK_ENABLED=false'
  ```

## After the event

Follow [cleanup.md](cleanup.md). In order:

1. Export the mail the family wants to keep.
2. Remove the Exchange app-role assignment and the Entra app.
3. Remove the mailbox, if the family approves.
4. For SendGrid: downgrade the Email API plan, revoke the key, and remove its secret ([sendgrid-setup.md](sendgrid-setup.md#retirement-review)).

Keep any DNS records that other mail still uses.
