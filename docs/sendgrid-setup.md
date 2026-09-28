# SendGrid Email Fallback

Microsoft 365 remains the primary sender, `misxv@simplysoph.com`. The SendGrid adapter supports the same private, single-recipient messages. Click/open tracking is disabled so invitation and sign-in links are not rewritten. Provider acceptance is not proof of inbox delivery.

## Credential Handoff

1. Sign in to SendGrid and complete sender/domain verification for simplysoph.com. Add its current account-specific authentication records in Cloudflare as DNS-only records. Keep Microsoft MX, SPF and selector1/selector2 DKIM records. Do not create a second root SPF or DMARC record. SendGrid's return-path subdomain has its own SPF configuration.
2. Create a dedicated event API key with Mail Send permission only. The owner must enter the new credential; never paste it into chat, source code or a command line.
3. Store it in Google Secret Manager as `misxv-sendgrid-api-key` in `simplysoph-66c78`. This name is planned, not yet provisioned. Inventory the key, secret version and secret-level runtime grant; pin the version on Cloud Run.
4. After domain authentication and the credential are verified, use `MAIL_PROVIDER=m365` and explicitly enable `SENDGRID_FALLBACK_ENABLED=true`. Bind `SENDGRID_API_KEY` from the pinned secret. Startup refuses an enabled SendGrid provider without its key.
5. Send only a reviewed owner test, inspect delivery/authentication headers and exercise an authentication-failure mock before enabling guest mail. No setup code sends messages automatically.

Fallback is deliberately limited to Microsoft token acquisition failures, before a message is submitted. A timeout or uncertain response after submission must not trigger a second provider, which could duplicate an invitation or sign-in message. Microsoft rejection also does not trigger fallback. An operator can select `MAIL_PROVIDER=sendgrid` for future messages after review. Do not reset previously accepted, sending or unknown jobs to draft. The outbox records the provider on successful acceptance.

The existing Microsoft configuration is still required at startup so returning to Microsoft does not require rebuilding credentials. SendGrid does not replace the Microsoft mailbox or incoming mail routing. Messages sent by SendGrid will not appear in Microsoft Sent Items; use the website outbox and SendGrid activity for reconciliation.

## Retirement Review

February 1, 2027 is a review/export date, not automatic deletion. Disable fallback, reconcile in-flight messages, revoke the dedicated API key and remove its event secret/binding after approval. Remove SendGrid domain authentication/link-branding records only if no other sender uses them. Preserve shared Microsoft, Firebase, Cloudflare, the domain and the Google project.

Reference: [SendGrid Mail Send API](https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send).
