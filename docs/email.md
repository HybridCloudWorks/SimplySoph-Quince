# Email

How the website sends email today. Every setting is listed in [deployment.md](deployment.md#configuration); this guide explains how they fit together.

## How it works

- **Sender.** Every email comes from the shared mailbox `misxv@simplysoph.com` in the family's Microsoft 365, sent through Microsoft Graph. The address is fixed in the code, and replies arrive in that mailbox.
- **Permission.** A dedicated Entra app (`M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET`) may send only as that mailbox: Exchange application RBAC is scoped to it, and there is no tenant-wide `Mail.Send`. The client secret's expiry must reach past the event.
- **Standby.** SendGrid takes over only when Microsoft will not issue a sign-in token, before anything is submitted. A send whose outcome is uncertain is never repeated through the other provider, so nobody gets a duplicate. Click and open tracking are off, so links are not rewritten. Mail sent through SendGrid does not appear in Sent Items. The owner kept the standby through the event and moved SendGrid's Email API to a paid plan on October 13, 2026. Details are in [sendgrid-setup.md](sendgrid-setup.md).

SendGrid is Twilio's email service, but it is a separate account; text messages and WhatsApp do not use it.

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
