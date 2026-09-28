# Twilio SMS Setup — SimplySoph Mis XV

Prepared September 28, 2026. Owner will finish account/API setup in about 24 hours. SMS destinations: **United States and Canada only**. Email stays with Microsoft 365 (`misxv@simplysoph.com`). Guest sign-in continues by email link; Twilio Verify is not needed for this scope.

## Keyword Registration Update

The owner now identifies the operator as **Simply Soph Media** and the event sender as **+16827868002**, using the Sole Proprietor A2P campaign flow. See [current keywords, exact replies and consent description](sms-campaign-registration.md). Earlier trial/no-number observations below are historical, not current ownership checks. Keyword consent handling and public SMS pages are now implemented; provider configuration and live acceptance tests remain pending.

## Previous Deployment Status

Release `c2f4953` passed both GitHub CI runs and 105 automated tests on September 28, 2026. Static admin controls were published to `misxv-simplysoph`; the live JavaScript matches the local release byte-for-byte. Cloud Run revision `misxv-api-00009-6xn` serves 100 percent of traffic. The public unsigned callback test returns `403 TWILIO_SIGNATURE_INVALID`; `/api/config` remains healthy with email configured. SMS remains disabled with no Twilio credentials bound, and no SMS was sent. Local browser review used a synthetic household, not guest records.

Live console verification after owner sign-in found only “My first Twilio account,” marked Trial, and its unfiltered Active Numbers page showed no Twilio numbers. The reported approved sender has not been located. Before credential activation, resolve whether the approved sender belongs to a different login or complete sender setup for this account. SendGrid domain/sender approval does not approve an SMS number. No number purchase, account upgrade or messaging registration was submitted.

The website prepares SMS drafts from selected Notion distribution groups/people with a US/Canada phone, SMS consent/date and no opt-out. **Live sending is disabled.** Server dispatch, administrator review, segment estimates, signed HTTP callbacks and durable STOP suppression are implemented. Dispatch re-reads Notion, claims an attempt before the provider call, and does not retry uncertain responses. Adding credentials alone does not activate sending: both `SMS_ENABLED=true` and `SMS_ACTIVATION_REVIEWED=true` are required after acceptance review. No Twilio account, number, service, API key or Google secret was provisioned by this code change.

Admin → Announcements & Emails → SMS Drafts → Review SMS displays the recipient, message and estimated segments. Exact rates are not yet configured, so the UI does not invent a dollar quote. Dispatch is one reviewed draft at a time. Incoming messages do not submit an RSVP: guests follow their private invitation link to the website. Email account verification remains unchanged. International WhatsApp is a separate next phase in [whatsapp-setup.md](whatsapp-setup.md).

Callback paths, once this release is deployed: `https://misxv.simplysoph.com/api/twilio/status` and `https://misxv.simplysoph.com/api/twilio/inbound`. Configure Advanced Opt-Out on the dedicated service; Twilio handles its standard replies and this application returns empty TwiML to avoid duplicate replies. STOP is suppressed locally first and projected to Notion's SMS Opt Out field for matching households. Pending failures can be retried from the admin page. Verified START/UNSTOP now records explicit keyword consent. Provider message timestamps reject stale opt-ins; suppression is cleared only after matching Notion records are updated successfully. Delivery status is distinct from provider acceptance. A process crash after claiming a send requires reconciliation, never a reset to draft.

Run `npm run sms:setup` to print an offline configuration checklist. It prints field names and presence/format status only, never credential values, and makes no network calls. A complete report is not proof of working credentials, verification or delivery. Do not paste values into terminal commands, chat or GitHub.

## Owner Checklist For Tomorrow

1. Sign in or create your account in the [Twilio Console](https://console.twilio.com/). Enable account MFA and use a family-controlled email. Prefer a dedicated event project/subaccount if the account will serve other projects. Record its exact identity privately.
2. Review the actual number/message charges and account billing before purchasing anything. Configure usage alerts; alerts are not spending caps.
3. Complete a truthful Compliance Profile and confirm Twilio supports this private family-event use case. The current toll-free purchase flow requires a business, nonprofit or sole-proprietor profile. **Do not invent a business, tax ID or consent history.** If none fits, ask Twilio which registration path supports the event before buying a number.
4. Once eligibility is confirmed, obtain one SMS-capable toll-free number dedicated to the event and submit verification. A paid account and approved toll-free verification are required for US/Canada texting. Submission can take longer than one day to be approved. Follow [Twilio's current console guide](https://www.twilio.com/docs/messaging/compliance/toll-free/console-onboarding).
5. Create a Messaging Service named **SimplySoph Mis XV** and attach only that event number. Limit [SMS Geo Permissions](https://www.twilio.com/docs/messaging/guides/sms-geo-permissions) to the United States and Canada. Configure [Advanced Opt-Out](https://www.twilio.com/docs/messaging/tutorials/advanced-opt-out) for STOP/START/HELP and appropriate English/Spanish responses. We will verify behavior before activation.
6. Create a dedicated API key named **misxv-2027-runtime**, using the narrowest permissions supported for the required messaging operations. Avoid a Main key. Keep the API secret and account Auth Token out of chat. Follow [Twilio API key documentation](https://www.twilio.com/docs/iam/api-keys/key-resource-v2010).
7. Return here with **“Twilio account ready”**, sender verification status, and whether you used a separate event account/subaccount. We will prepare the Google secret slots and guide you through entering the values. Do not configure callback URLs until their signed handlers are deployed and tested.

## Credential Handoff

The two Secret Manager containers were created empty on September 28, 2026 after the owner reported their account and sender approved. They are inventoried for retirement review. Credential versions, runtime access grants and environment bindings are still pending. All values must belong to the same selected Twilio account/subaccount. An API key secret authenticates outbound API requests; the account Auth Token is separately required to validate Twilio webhook signatures.

| Runtime Setting                | Planned Storage                              | Purpose                               |
| ------------------------------ | -------------------------------------------- | ------------------------------------- |
| `TWILIO_ACCOUNT_SID`           | Cloud Run environment (starts `AC`)          | Dedicated account/subaccount identity |
| `TWILIO_MESSAGING_SERVICE_SID` | Cloud Run environment (starts `MG`)          | Dedicated sender pool                 |
| `TWILIO_API_KEY_SID`           | Cloud Run environment (starts `SK`)          | Dedicated API key identity            |
| `TWILIO_API_KEY_SECRET`        | Secret Manager `misxv-twilio-api-key-secret` | Outbound messaging authentication     |
| `TWILIO_AUTH_TOKEN`            | Secret Manager `misxv-twilio-auth-token`     | Incoming webhook signature validation |

Use Google project `simplysoph-66c78`, signed in as `saulpatinojr@gmail.com`. Create and inventory the two secrets only during credential handoff. Grant access only to the event runtime service account, pin deployed secret versions, and never put values into browser code, committed `.env` files or screenshots. Runtime consumes these settings when populated; empty placeholders do not activate sending.

## Messaging Registration Draft

Use-case description to adapt truthfully: “Optional event updates for invited guests attending Sophia's quinceañera on January 15, 2027. Messages concern RSVP reminders, schedule or venue updates, and event information. No purchased lists or third-party marketing.”

Provide Twilio with the actual opt-in path and evidence once implemented and reviewed. Existing guest phone numbers, an invitation, or an email RSVP do not establish SMS consent. Do not submit the draft below as evidence of a live consent form.

Proposed unchecked opt-in copy: “Send me optional SimplySoph Mis XV event updates by text at this number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Text updates are optional and are not required to RSVP.” Link the reviewed privacy/terms pages next to the checkbox and provide a Spanish equivalent. Store the consent text version, timestamp, source and phone alongside the Notion consent fields.

Example message, for registration/review only: “SimplySoph Mis XV: Please RSVP by October 31 at https://misxv.simplysoph.com/rsvp/. Reply STOP to opt out or HELP for help.” Do not include private invitation credentials in public examples. Actual messages require recipient review; longer messages and Unicode may use multiple billable segments.

## Activation Work After Credentials Are Ready

- Acceptance-test the implemented admin/MFA-protected reviewed send action. It persists an attempt before dispatch, deduplicates campaign destinations and never blindly retries uncertain responses. Provider acceptance is not delivery.
- Keep sending off until sender approval, callback verification and acceptance tests pass. Preserve draft-only behavior when credentials are missing. Do not enable bulk sending merely because credentials exist.
- Link SMS drafts to their Notion household/source selection. At dispatch, re-read the current phone, consent/date, group membership and opt-out; recheck access/revocation and deduplicate the final destination. Older drafts lacking this provenance must be regenerated.
- Enforce US/Canada server-side and in Twilio Geo Permissions. A `+1` prefix alone is insufficient because it also covers other countries/territories. Use maintained phone-country metadata and fail closed for ambiguous destinations. Preview message segments and cost before sending.
- Deploy and verify the implemented signature-validated inbound and delivery callbacks using the exact public HTTPS URL. Test forged requests, mismatched account/service/message identities and duplicate callbacks. Callback authentication is separate from browser session/CSRF rules.
- Persist STOP suppression immediately in the website ledger and write it to Notion with retry tracking. An unavailable Notion update must not permit further sends. HELP returns approved family support details; START must not bypass consent/eligibility checks. Test carrier/provider opt-out behavior too.
- Test with mock provider calls first. Then review and send only an explicitly approved test to an owner-controlled phone. Verify STOP, HELP, opt-in handling, delivery failures, repeated callbacks, timeout handling and Notion projection before guest distribution. No guest messages are part of setup.

## February 1, 2027 Review And Event Cleanup

This is a **review date, not automatic deletion**. Before provisioning, capture a scoped baseline and extend the resource inventory validator/tests to support Twilio resources. Record each new number, Messaging Service, API key, Google secret and permission immediately in `ops/event-resources.json` with exact identity, creation evidence, dependencies and removal checks. Keep credentials and guest exports out of that file.

After the family approves retirement: stop dispatch and callbacks, settle in-flight messages, export approved records privately, release the event number to stop its recurring charge, delete the event Messaging Service, revoke the event API key, remove event secret versions/bindings and event-only permissions, and review remaining charges. Remove a dedicated subaccount only after checking its contents. Preserve shared Twilio accounts, Microsoft 365 email, the Google project, domain and Notion family records. Releasing a number may be irreversible; confirm the exact number at cleanup. Follow `CLEANUP.md` and reconcile the live inventory before any deletion.
