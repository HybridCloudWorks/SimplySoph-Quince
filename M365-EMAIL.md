# Event email using the existing Microsoft 365 tenant

The family confirmed that **Hostinger manages simplysoph.com DNS** and **Microsoft 365 already hosts its email**. This supersedes the proposed Google Workspace/Gmail sender. Keep website hosting and application secrets in Google; keep existing mail in Microsoft 365. No additional domain or Workspace purchase is needed for this architecture. The admin session and organizer Exchange Online Plan 1 assignment have now been verified. The event shared mailbox has been created without purchasing another license.

## Recommended sender

**Created September 26, 2026: Sophia Mis XV — misxv@simplysoph.com.** Signed in as the family-designated administrator. The shared-mailbox list was empty before creation. Mailbox ID: `6d086684-0c76-404d-be9f-ef9a7992a8c5`. It is registered in `ops/event-resources.json` with a scoped baseline and cleanup steps. Organizer membership/send-as access and app sending are not configured yet. A shared mailbox generally needs no separate mailbox license up to 50 GB, but users accessing it need licensed Exchange Online mailboxes; archive/hold or other advanced features can change licensing requirements. Do not buy another subscription before checking the existing plan. [Microsoft shared-mailbox requirements](https://learn.microsoft.com/en-us/microsoft-365/admin/email/about-shared-mailboxes).

An alias is an alternative if all replies should go into an existing inbox. It provides less separation for cleanup, and sending from an alias requires tenant configuration to be checked. The dedicated shared mailbox is the preferred event boundary.

## Application delivery

- Prefer **Microsoft Graph sendMail** from the Google-hosted backend. SMTP is not required. Do not use basic-auth passwords or embed mail credentials in the browser. [Graph sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail?view=graph-rest-1.0).
- Create a dedicated Entra app only after tenant/admin access is available. Scope application sending to the event mailbox through **Exchange Online Application RBAC**; verify the event mailbox is allowed and a different mailbox is denied. Avoid parallel tenant-wide grants that would bypass this restriction: Entra application permissions and Exchange RBAC grants can be additive. [Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).
- Use an appropriately scoped federation or certificate credential; if a certificate private key is needed, keep it in Google Secret Manager. Register both the credential and Entra/Exchange objects for cleanup. The Google runtime service account alone cannot send as a Microsoft mailbox.
- Reuse the seven EN/ES email templates, durable outbox and recipient eligibility checks. Graph returns **202 Accepted**, which is not delivery confirmation and supplies no message body. Do not describe it as a delivered receipt or assume it returns a Gmail-style message ID. Record an application intent ID and provider request metadata. After an ambiguous timeout, reconcile rather than blindly retrying.
- Check tenant sending limits and throttling before setting batches. Monitor replies and bounces through the family inbox; automated mailbox reading would need additional narrowly scoped access. No invitation/reminder dispatch is authorized merely by this infrastructure setup.

## DNS and cleanup

Preserve Microsoft 365 MX records and existing SPF, DKIM and DMARC. Check them before adding or adjusting anything; never replace them with Google Workspace records. Website DNS at Hostinger is a separate change for **misxv.simplysoph.com**. Mail sent by Microsoft 365 does not require Google to become the domain's mail provider.

At event end, stop queued messages, export wanted correspondence, revoke the dedicated app's access/credentials, remove the exact event RBAC grants/app registration, remove the event alias/mailbox if approved, and remove its stored credentials. Do not cancel the tenant subscription or delete an existing organizer mailbox. Retention policies and recipients' copies may remain. Add exact IDs and evidence to the event inventory before provisioning is considered complete.

Pending: organizer mailbox permissions, mailbox-scoped application sending, Hostinger DNS access, Notion database access, and final retention window. No email was sent. No passwords, access tokens or private keys should be pasted into chat or committed.
