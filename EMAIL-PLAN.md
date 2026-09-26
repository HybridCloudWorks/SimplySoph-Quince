# Invitations and email delivery

Recommendation: one domain + Resend's server-side HTTPS API + Notion tracking. SMTP is available for compatibility but unnecessary for a new JavaScript backend. Do not buy multiple sending services for this event.

## Domain structure

Use a short family-approved domain; `simplysophia.example` below is a reserved example, not an available or registered domain.

| Purpose | Example | Notes |
|---|---|---|
| Guest website | `https://simplysophia.example` | Static site, HTTPS, one canonical www/apex redirect |
| Sending identity | `Sophia & Family <invitations@notify.simplysophia.example>` | Verified sending subdomain isolates mail configuration |
| Reply-To | `family@simplysophia.example` | Must be a real monitored mailbox or forwarding alias |
| API | `https://simplysophia.example/api/*` or `api.simplysophia.example` | Secure Notion and email operations only |

A sending API is not automatically a family inbox. Keep replies going to an existing monitored mailbox until a custom mailbox/alias is configured. There is no need to buy a mailbox per sender name.

Register a domain only after the family chooses it. Configure the exact provider-issued SPF/return-path and DKIM records, then DMARC for the sending identity; verify alignment before tightening DMARC policy. Preserve existing website and mailbox records, and do not replace root MX records merely to add outbound sending. Use the provider's actual record names/values rather than invented generic DNS records. [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).

## Provider comparison

Official pages checked September 26, 2026; verify account limits before sending.

| Provider | Fit | Relevant constraint |
|---|---|---|
| **Resend — recommended** | Straightforward API/SMTP, message events, branded HTML/text, code-based workflow | Published free daily limit is 100 emails. A one-day invitation wave plus confirmations may exceed it. [Pricing](https://resend.com/pricing), [SMTP](https://resend.com/docs/send-with-smtp) |
| **Postmark** | Strong transactional/broadcast separation and delivery tooling | Developer tier lists 100 emails/month; published 10K Basic plan is $15/month. Batch announcements and response receipts use appropriate separate streams. [Pricing](https://postmarkapp.com/pricing), [Streams](https://postmarkapp.com/developer/) |
| **Brevo** | Useful if the family wants a campaign editor and contact tools alongside SMTP/API | Published free limit is 300/day, without rollover; reaching the cap can delay messages. [Free limits](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan), [SMTP](https://help.brevo.com/hc/en-us/articles/7924908994450-Send-transactional-emails-using-Brevo-SMTP) |

Choose the plan from **households/email recipients**, not guest headcount. Example planning estimate: 150 households × invitation, RSVP receipt, final details, and thank-you = about 600 messages, plus pending-only reminders, edits, and testing. Monthly volume is modest, but invitation day could exceed a free daily cap. Do not quote a guaranteed total until household count, send dates, hosting, domain, and inbox needs are known.

## Message sequence

| Message | Recipient | Trigger / timing | Content | Dispatch rule |
|---|---|---|---|---|
| Invitation | Primary contact per invited household | Once final event details and live RSVP are verified | Sophia's message, date, key details, private invitation link, deadline | Family approves audience and content before a send |
| RSVP receipt | Responding household | After durable accepted response | Per-event answer summary, edit link, family contact | Automatic only after explicitly enabling live receipts |
| RSVP update receipt | Responding household | After accepted edit | Updated response and timestamp | One per committed version; deduplicate retries |
| RSVP reminder | Pending/partial households only | Suggested 7 days and 2 days before the agreed deadline | Deadline, private link, short help message | Optional approved schedule; recheck response status just before dispatch |
| Final event details | Attending households | Suggested 3–5 days before | Confirmed venue/parking/arrival/attire | Family-approved batch; personalize for eligible events |
| Important change | Affected households only | When a confirmed change occurs | What changed, new details, reply contact | Explicit approval each time; do not silently overwrite an old announcement |
| Thank-you / album | Family-approved recipients | Suggested 2–7 days after | Personal thank-you and approved album | Approved batch; no public unmoderated photo link |
| Delivery issue alert | Organizer only | Bounce, complaint, persistent failure | Reference and action needed | Suppress failing addresses; never retry complaints/hard bounces automatically |

Do not send reminders to declined or completed households. If a guest has opted out of optional updates, skip reminders/thank-you campaigns; handle essential coordination through the family's agreed channel. No marketing subscription is inferred from an invitation email address. Match the provider's transactional/broadcast rules and provide preference/opt-out handling where appropriate.

## Implementation flow

1. Store approved send intent in a restricted Email Queue, with template key/version, household, language, audience rule, due time, approved-by/at, and status.
2. Server worker reads an approved queued item and rechecks recipient eligibility, current address, response state, cancellation, suppression, event date, and deadline.
3. Render the approved template as HTML and plain text. Send a separate message to each household; never reveal the guest list in To/CC.
4. Persist a durable unique key such as `invitation/household-id/template-v1` or `receipt/submission-id`. Acquire/claim it before sending. Retrying must reuse it and consult the durable log.
5. Submit via Resend's API with a provider idempotency key. Store provider message ID and accepted time. Resend keys currently cover 24 hours, so the application must deduplicate beyond that window. [Idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).
6. A verified webhook updates delivered, bounced, complained, or failed status and suppression. Deduplicate event IDs and tolerate event reordering. API acceptance is not inbox delivery, and delivery is not proof the guest read the invitation. [Resend webhooks](https://resend.com/docs/webhooks/introduction).
7. Notion displays status for family follow-up. A transient Notion sync failure must not resend an already accepted email. Reconcile by internal send ID and provider message ID.

No public frontend route may send arbitrary emails, choose recipients, or supply freeform From/subject/HTML. Server validates a fixed template and derives the recipient from the authorized household or approved organizer action. Keep `RESEND_API_KEY`, webhook secret, and sender settings server-side. A Notion checkbox alone is not an authenticated public sending endpoint.

## Notion email fields

Email Queue: Queue ID, Household relation, Template key, Template version, Locale, Due at, Audience rule, Approval status, Approved by, Approved at, Send state, Dedupe key, Cancelled.

Email Delivery Log: Send ID, Queue relation, Provider message ID, Accepted at, Delivered at, Bounced at, Complaint at, Failure code, Last webhook event ID. Restrict these records; minimize retained content. Keep operational state distinct from guest RSVP status.

## Templates included

`emails/templates.mjs` contains English and Spanish draft copy for invitation, receipt, update, reminder, details, change, and thank-you. It creates HTML/text payloads only; there is deliberately no send function. `npm run emails:preview` writes sample messages under `work/email-previews/` with reserved example links. The preview script performs no network requests.

Review wording with the family before activation. Never place a full mailing address, dietary request, or guest list in an email. Receipts can direct guests to their private response page for sensitive details. Disable click tracking on private invitation/edit links, avoid tokens in subject lines, and do not mark an invitation as opened based solely on tracking pixels.

## Before enabling delivery

Choose and configure domain/sender/Reply-To; verify SPF/DKIM/DMARC; select plan/capacity; approve bilingual wording and audience; test one authorized address; verify branded HTML and plain text, reply handling, safe private links, provider acceptance, delivery webhook, duplicate/retry behavior, and Notion status. Only then activate the specifically authorized invitation batch or receipt/reminder automation.

This task prepares code and a plan. It does not create a sender account, purchase a domain, change DNS, send messages, or schedule a live automation.
