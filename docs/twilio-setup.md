# Twilio runbook: SMS and WhatsApp

This is the only current Twilio guide. It replaces `twilio-runtime-status.md` and `whatsapp-setup.md`, which mixed point-in-time logs with stale plans. **Treat every live Twilio claim as unverified until the acceptance steps below are completed and recorded.** The gap analysis is in [v1/twilio-gap-analysis.md](v1/twilio-gap-analysis.md). The exact campaign field values are in [sms-campaign-registration.md](sms-campaign-registration.md).

## What the code does

| Concern | SMS (US/Canada 10DLC) | WhatsApp (international) |
|---|---|---|
| Opt-in | Guest texts `SOPHIA` (or `START`/`UNSTOP`) to +1 682-786-8002. It only counts when Twilio classifies it `OptOutType=START`, the message timestamp is confirmed via the REST API, Notion is updated and the phone matches an invited household (`server/sms.mjs`) | Guest records WhatsApp consent on the website, then sends `START` from that phone (`server/whatsapp.mjs`) |
| Eligibility to send | `smsKeywordConsent()`: synced START receipt + phone bound to the household + not suppressed. **A Notion checkbox alone is never enough** | Synced START + matching consent record + approved template |
| Message content | Must start with `Simply Soph Media:` and contain `STOP` (`smsCompliantText()`); enforced at draft and review | Approved Content API template with one private-link variable |
| Sending | One reviewed draft at a time; send attempt claimed before the provider call; uncertain results are never retried | Same |
| Opt-out | Twilio Advanced Opt-Out replies; app suppresses locally first, then projects to Notion | `STOP`/`BAJA`, local suppression first |
| Callbacks | `POST /api/twilio/inbound`, `POST /api/twilio/status` | `POST /api/whatsapp/inbound`, `POST /api/whatsapp/status` |
| Signature URL | `PUBLIC_ORIGIN` + fixed path (never the Host header), so it validates behind the Firebase Hosting rewrite. URLs must match exactly: no trailing slash, no query string | Same |
| Activation gates | `SMS_ENABLED=true` **and** `SMS_ACTIVATION_REVIEWED=true` **and** `TWILIO_AUTH_TOKEN`; startup fails if a flag is set without the transport | `WHATSAPP_ENABLED`, `WHATSAPP_ACTIVATION_REVIEWED`, `WHATSAPP_FROM`, `WHATSAPP_TEMPLATES_JSON` |

Inbound texts never submit an RSVP or sign anyone in. Guests always RSVP on the website with their private link.

## Runtime settings

| Setting | Where | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Cloud Run env | Must be the account that owns the campaign **and** the WhatsApp sender. Callbacks from any other account return 403 |
| `TWILIO_MESSAGING_SERVICE_SID` | Cloud Run env | Must be the service linked to the A2P campaign. Callbacks from any other service return 403 |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | env / Secret Manager | Restricted key. Needs Messages **read** (verifying START timestamps). Messages **create** is granted only at activation |
| `TWILIO_AUTH_TOKEN` | Secret Manager, pinned version | Validates webhook signatures. Rotating it breaks callbacks until the new version is deployed |
| `WHATSAPP_FROM` | Cloud Run env | `+16827868002` |
| `WHATSAPP_TEMPLATES_JSON` | Cloud Run env | JSON array of **approved** templates only. Invalid JSON stops startup |

Find the live identifiers in `ops/event-resources.json`. Never put values in Git, chat, screenshots or browser code. `npm run sms:setup` prints an offline checklist with presence/format only.

## Console configuration (verify every item; do not trust earlier notes)

1. **One account.** Confirm which Twilio account owns +16827868002, the Sole Proprietor brand, the A2P campaign and the WhatsApp sender. Make all runtime settings point to that account.
2. **One Messaging Service.** The event uses only **Sole Proprietor A2P Messaging Service** (`MG6d6cc68fbd2ca1c60f35b7698a467049`), and `TWILIO_MESSAGING_SERVICE_SID` is set to it. It must contain only +16827868002 and is the service the campaign registers against. The earlier empty service (`MG64189f3…`) was deleted on 2026-10-09.
3. **Advanced Opt-Out** on that service:
   - Opt-in keywords: `SOPHIA`, `START`, `UNSTOP`. Reply = `smsProgram.confirmation`.
   - Help keywords: `HELP`, `INFO`. Reply = `smsProgram.help`.
   - Opt-out: Twilio's standard set. Reply = `smsProgram.stop`.

   Paste these replies from `site/sms-program.mjs` exactly. **VERIFY:** a real text of `SOPHIA` from a handset must arrive at `/api/twilio/inbound` with `OptOutType=START`. If Twilio does not classify the custom keyword that way, the app will ignore it.
4. **Integration:** inbound "Send a webhook" → `https://misxv.simplysoph.com/api/twilio/inbound`; status callback → `https://misxv.simplysoph.com/api/twilio/status`.
5. **Geo permissions:** United States and Canada only for SMS.
6. **WhatsApp sender:** callbacks to `/api/whatsapp/inbound` and `/api/whatsapp/status`. Confirm the WhatsApp sender is not part of the SMS Messaging Service.

## Acceptance (record date, tester and result for each)

1. Unsigned POST to each callback returns 403. A correctly signed malformed POST returns 422 and writes nothing.
2. From an owner handset matching a disposable Notion test household: `SOPHIA` → confirmation reply arrives once (no duplicate from the app); ledger shows a synced START; Notion `SMS Consent` updates.
3. `HELP` → help reply. `STOP` → opt-out reply; the draft review now returns `SMS_OPTED_OUT`; Notion `SMS Opt Out` is set.
4. `START` again → re-subscribed only after Notion sync.
5. With a brand-compliant draft, grant Messages create, set both SMS flags on, send **one** reviewed message to the owner phone. Verify `accepted` → `delivered` in the ledger.
6. Turn the flags back off until the family approves the first real campaign.

## Known limits

- **10DLC covers US carriers.** Canada generally works from a US long code. Puerto Rico, USVI and Guam numbers are rejected by the code today. Use WhatsApp or email for every other country.
- **Meta blocks marketing templates to US numbers.** WhatsApp is for international guests only.
- **Webhook latency.** A START waits on a Twilio REST call and a Notion write before replying. Twilio times out after 15 s (error 11200). Watch the Twilio debugger during acceptance.
- **MMS STOP.** Only `SM…` message IDs are accepted. A STOP sent as MMS is still enforced by Twilio, but is not recorded locally.

## Retirement

After the family approves retirement: turn off both flags, settle in-flight messages, export approved records privately, release the event number, delete only the event Messaging Service(s), revoke the event API key, remove event secret versions and bindings, and review remaining charges. Preserve shared Twilio/Meta accounts. Follow `CLEANUP.md` and reconcile `ops/event-resources.json` before any deletion.
