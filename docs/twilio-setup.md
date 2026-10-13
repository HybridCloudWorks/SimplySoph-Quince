# Twilio guide: text messages (SMS) and WhatsApp

This guide covers text messages to guests in the US and Canada. WhatsApp, for guests outside the US, has its own guide: [whatsapp-activation.md](whatsapp-activation.md). The exact wording carriers approved is in [sms-campaign-registration.md](sms-campaign-registration.md).

**Where things stand (October 13, 2026):** carriers approved the SMS program (campaign `CMc4a08f…`), sending is switched on, the owner's handset test (SOPHIA, HELP, STOP, START) reached the website correctly, and a test text from the page was delivered to the owner's phone with both Twilio status callbacks received. SMS is accepted and ready for the family's first real batch. Everything below happens on one page: **Admin → Communications → SMS reminders** ([misxv.simplysoph.com/admin/updates/?tab=sms](https://misxv.simplysoph.com/admin/updates/?tab=sms)).

## How texting works, in one paragraph

A guest joins by texting **SOPHIA** to **+1 682-786-8002** from their own phone. That text is the consent record; nothing on the website or in Notion can enroll anyone. The website matches the phone to the household whose **Phone** in Notion is that number, and mirrors the result into Notion's SMS columns for the family's records. A guest leaves by texting **STOP**. Every outgoing text starts with "Simply Soph Media:" and includes STOP, and goes out only after a person confirms it on the SMS page.

## The SMS page

**Who can be texted.** Every household in Notion is listed with one of these statuses:

| Status | Meaning | What makes it textable |
|---|---|---|
| Subscribed | Texted SOPHIA from the phone on their Notion row | Nothing; tick it and send |
| Hasn't texted SOPHIA yet | No keyword from that phone | Ask them to text SOPHIA to +1 682-786-8002 |
| Texted SOPHIA · matching to this row | The keyword arrived before the row or its phone existed | Press **Match texted phones to their rows now** |
| Opted out (texted STOP) | STOP from that phone, or **SMS Opt Out** ticked by hand in Notion | They text SOPHIA or START again |
| Not a US/Canada number | The campaign only covers US carriers | Use WhatsApp or email |
| No phone in Notion | Empty Phone column | Add the phone (with `+1`) to their Notion row |

**Send a test to my phone.** Text SOPHIA from your own phone, enter that number, confirm, send. No guest row is involved. Use this whenever you want to see what guests see.

**Text guests.** Tick the subscribed households (or **Select all subscribed**, or distribution groups), write the message, press **Review before sending**. The batch panel shows the exact message and every recipient. Tick the review box, type the number of texts, press **Confirm and send**. Keep the tab open until it says done; closing it or pressing **Stop** halts sending. `{link}` becomes each household's private RSVP link.

**Recent text batches** shows every batch with how many texts were accepted, rejected or still waiting, and **Latest five texts** lets you review and send one text at a time.

## First-time welcome text

Twilio only answers an opt-in keyword after a STOP, so a brand-new subscriber would hear nothing. The website therefore replies to a first SOPHIA with the registered confirmation (owner decision, 2026-10-12). After a STOP, Twilio's own opt-in reply takes over, so nobody gets two welcomes.

The opt-in reply in Twilio's Opt-Out Management was aligned with the registered text (with the Terms and Privacy links) on 2026-10-12, so both paths send the same words.

## If something looks wrong

- **Someone texted SOPHIA but shows "Hasn't texted SOPHIA yet":** the phone they texted from is not the Phone on their Notion row (or it lacks `+1`). Fix the row, then press **Match texted phones to their rows now**.
- **A text shows "rejected":** Twilio refused it; the record shows Twilio's error code. The first live test failed this way because the website's API key had Messages **read** only; it now has **create** too (Console → Settings → API keys & auth tokens, key `SK4b53d3…`). If it happens again, check that permission first, then the number's status in **Monitor → Logs → Messaging**.
- **A text shows "unknown":** the website could not tell whether Twilio sent it. It is never retried automatically; look it up in Twilio's message logs before deciding.
- **No reply to a guest's HELP or STOP:** those replies come from Twilio's Advanced Opt-Out settings, not the website. Check them in Opt-Out Management.
- **Twilio error 11200:** the website answered a keyword too slowly (it writes to Notion before replying). Report it; the fix is to answer first and mirror later.

---

## Reference (for whoever maintains the website)

### What the code does

| Concern | SMS (US/Canada 10DLC) | WhatsApp (international) |
|---|---|---|
| Opt-in | Guest texts `SOPHIA` (or `START`/`UNSTOP`) to +1 682-786-8002. It counts when Twilio classifies it `OptOutType=START` and the message timestamp is confirmed via the REST API (`server/sms.mjs`). The receipt is bound to the household whose Notion Phone matches; Notion's SMS columns are a mirror, not a gate | Guest records WhatsApp consent on the website, then sends `START` from that phone (`server/whatsapp.mjs`) |
| Eligibility to send | `smsKeywordConsent()`: newest keyword is START and the phone is bound to the household. A hand-ticked **SMS Opt Out** in Notion blocks. **A Notion consent checkbox alone never enrolls** | Synced START + matching consent record + approved template |
| Welcome reply | On a first START (no earlier STOP known) the inbound webhook answers with TwiML carrying `smsProgram.confirmation`; otherwise `<Response/>` | Twilio/Meta keyword replies |
| Message content | Must start with `Simply Soph Media:` and contain `STOP` (`smsCompliantText()`); enforced at draft and review | Approved Content API template with one private-link variable |
| Sending | Per text: review token, claim before the provider call, uncertain results never retried. Per batch (`confirmBatch`/`sendBatch`): typed count must equal the pending drafts; chunks of 10 per request with a 2-minute lease; stale or opted-out drafts are archived, never sent | One reviewed draft at a time |
| Test to self | `sendTest`: any US/CA phone whose newest keyword is START; no household row | — |
| Opt-out | Twilio Advanced Opt-Out replies; the app records STOP first, then mirrors to Notion | `STOP`/`BAJA`, local suppression first |
| Callbacks | `POST /api/twilio/inbound`, `POST /api/twilio/status` | `POST /api/whatsapp/inbound`, `POST /api/whatsapp/status` |
| Signature URL | `PUBLIC_ORIGIN` + fixed path (never the Host header), so it validates behind the Firebase Hosting rewrite. URLs must match exactly: no trailing slash, no query string | Same |
| Activation gates | `SMS_ENABLED=true` **and** `SMS_ACTIVATION_REVIEWED=true` **and** `TWILIO_AUTH_TOKEN`; startup fails if a flag is set without the transport. Both are **true** on the live revision since 2026-10-12 | `WHATSAPP_ENABLED`, `WHATSAPP_ACTIVATION_REVIEWED`, `WHATSAPP_FROM`, `WHATSAPP_TEMPLATES_JSON` |

Inbound texts never submit an RSVP or sign anyone in. Guests always RSVP on the website with their private link.

### Runtime settings

| Setting | Where | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Cloud Run env | Must be the account that owns the campaign **and** the WhatsApp sender. Callbacks from any other account return 403 |
| `TWILIO_MESSAGING_SERVICE_SID` | Cloud Run env | Must be the service linked to the A2P campaign. Callbacks from any other service return 403 |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | env / Secret Manager | Restricted key. Needs Messages **read** (verifying START timestamps) and **create** (sending) |
| `TWILIO_AUTH_TOKEN` | Secret Manager, pinned version | Validates webhook signatures. Rotating it breaks callbacks until the new version is deployed |
| `WHATSAPP_FROM` | Cloud Run env | `+16827868002` |
| `WHATSAPP_TEMPLATES_JSON` | Cloud Run env | JSON array of **approved** templates only. Invalid JSON stops startup |

Find the live identifiers in `ops/event-resources.json`. Never put secret values in Git, chat, screenshots or browser code. `npm run sms:setup` prints an offline checklist with presence/format only.

### Twilio settings that must stay as they are

1. **One account** owns +16827868002, the Sole Proprietor brand, the A2P campaign and the WhatsApp sender. All runtime settings point to it.
2. **One Messaging Service:** **Sole Proprietor A2P Messaging Service** (`MG6d6cc68fbd2ca1c60f35b7698a467049`), set as `TWILIO_MESSAGING_SERVICE_SID`. It contains only +16827868002 and is the service the campaign is registered against. The earlier empty service (`MG64189f3…`) was deleted on 2026-10-09.
3. **Advanced Opt-Out** on that service, with replies pasted exactly from `site/sms-program.mjs`:
   - Opt-in keywords: `SOPHIA`, `START`, `UNSTOP`. Reply = `smsProgram.confirmation`.
   - Help keywords: `HELP`, `INFO`. Reply = `smsProgram.help`.
   - Opt-out: Twilio's standard set. Reply = `smsProgram.stop`.

   These match the approved campaign; changing any of them makes the live program differ from what carriers approved. Verified 2026-10-12 from the owner's handset: a texted `SOPHIA` arrives as `OptOutType=START`.
4. **Integration:** inbound "Send a webhook" → `https://misxv.simplysoph.com/api/twilio/inbound`; status callback → `https://misxv.simplysoph.com/api/twilio/status`.
5. **Geo permissions:** United States and Canada only for SMS.
6. **WhatsApp sender:** callbacks to `/api/whatsapp/inbound` and `/api/whatsapp/status`. The WhatsApp sender is not part of the SMS Messaging Service.

### Technical checks

- An unsigned POST to each callback returns 403. A correctly signed but malformed POST returns 422 and writes nothing. Both are covered by the automated tests (`tests/sms.test.mjs`, `tests/sms-http.test.mjs`, `tests/application.test.mjs`).
- Twilio times out after 15 s (error 11200). A START waits on a Twilio REST call and a Notion write before replying; watch **Monitor → Logs → Errors** after the first real guests subscribe.
- Never click **Continue registration** on Twilio's A2P overview page: it deletes the approved campaign.

### Known limits

- **10DLC covers US carriers.** Canada generally works from a US long code. Puerto Rico, USVI and Guam numbers are rejected by the code today. Use WhatsApp or email for every other country.
- **Meta blocks marketing templates to US numbers.** WhatsApp is for international guests only.
- **MMS STOP.** Only `SM…` message IDs are accepted. A STOP sent as MMS is still enforced by Twilio, but is not recorded locally.
- **Double welcome.** A phone that texted STOP before the website existed, then SOPHIA, gets Twilio's reply and the website's. Harmless and rare.

### Retirement

After the family approves retirement: turn off both flags, settle in-flight messages, export approved records privately, release the event number, delete only the event Messaging Service(s), revoke the event API key, remove event secret versions and bindings, and review remaining charges. Preserve shared Twilio/Meta accounts. Follow `CLEANUP.md` and reconcile `ops/event-resources.json` before any deletion.
