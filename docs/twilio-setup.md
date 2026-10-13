# Twilio guide: text messages (SMS) and WhatsApp

This guide covers text messages to guests in the US and Canada. WhatsApp, for guests outside the US, has its own guide: [whatsapp-activation.md](whatsapp-activation.md). The exact wording carriers approved is in [sms-campaign-registration.md](sms-campaign-registration.md).

**Where things stand (October 12, 2026):** carriers approved the SMS program (campaign `CMc4a08f…`). Sending is still switched off. Follow steps 1–6 once to prove everything works, then leave sending off until the family approves the first real text.

## Is this a test, or my real data?

There is no separate test copy of the website. You test on the live site, the live Twilio number and your real Notion guest list. That is safe:

- **Nothing is replaced.** No RSVP, head count, email or other guest detail changes.
- **You add one fake guest row** with your own phone number, and delete it at the end.
- **Only three SMS columns are written:** `SMS Consent`, `SMS Consent Date` and `SMS Opt Out`, and only on Notion rows whose **Phone** is your number. If your number is also on a real household's row, that row gets the same ticks (step 2 checks this).
- **The website keeps a private record of each keyword you text** (SOPHIA, STOP, START). That is on purpose: carriers expect proof that each person opted in. The record holds no message text.
- **One real text is sent, to you.** It costs a few cents.
- **No guest can receive a text.** A phone becomes textable only after its owner texts SOPHIA, and even then nothing goes out until a person reviews that exact message and presses **Send**.

## Before you start

- About 30 minutes, your US mobile phone, and access to Notion, the [admin site](https://misxv.simplysoph.com/admin/login/), the [Twilio Console](https://console.twilio.com) and PowerShell with `gcloud`.
- Twilio's Console has a new layout and a legacy one. If a menu path below doesn't match what you see, type the page name into the Console's search bar.
- **Never click Continue registration** on Twilio's A2P overview page. It deletes the approved campaign.

## Step 1. Check the campaign and the number in Twilio

1. Open Twilio's approval email and click **Manage Campaign in Trust Hub**. The campaign starting `CMc4a08f` should show **Verified**.
2. In the Twilio Console, open **Messaging → Services → Sole Proprietor A2P Messaging Service → Sender Pool**. It should list exactly one number: **+1 682-786-8002**. If it's missing, click **Add Senders** and add that number. Don't add any other number.

## Step 2. Add a test guest in Notion

1. In the Notion **Invitations** database, search the **Phone** column for your mobile number. If a real household's row has it, that's fine, but that row will get the same SMS ticks during the test.
2. Add a new row:
   - **Guest:** `TEST – delete after SMS check`
   - **Phone:** your mobile, starting with `+1`, for example `+1 817 555 0123`. Without the `+1` the website ignores the number.
   - **Adults/Teens:** `1` and **Kids:** `0`
   - Leave everything else empty. Don't tick **SMS Consent** yourself: a ticked box alone never lets the website text anyone.

The test row counts in **Admin → Overview** until you delete it in step 6.

## Step 3. Text the keywords from your phone

Text each word to **+1 682-786-8002**. Wait for the reply and do the check before sending the next one. Each reply should arrive **once**, not twice.

| You text | Reply starts with | Then check |
|---|---|---|
| `SOPHIA` | "Simply Soph Media: You're subscribed to Sophia's event texts…" | In Notion, the test row has **SMS Consent** ticked, **SMS Consent Date** filled and **SMS Opt Out** unticked. On the admin site, [Communications → SMS reminders](https://misxv.simplysoph.com/admin/updates/?tab=sms) lists the test row under **Individuals** |
| `HELP` | "Simply Soph Media: Help for Sophia's event texts…" | Nothing changes |
| `STOP` | "Simply Soph Media: You are unsubscribed…" | Notion: **SMS Opt Out** is ticked. Reload SMS reminders: the test row is no longer listed |
| `START` | "Simply Soph Media: You're subscribed…" (same as SOPHIA) | Notion: **SMS Opt Out** is unticked. The test row is listed again |

The full wording of each reply is on the public [SMS page](https://misxv.simplysoph.com/sms/).

**If something is off:**

- **No reply:** in Twilio, open **Monitor → Logs → Messaging** and find your text. Any error shows there.
- **Two replies to one text:** stop and report it. The website must never add a reply of its own.
- **The reply arrives but Notion doesn't change:** on SMS reminders, press **Retry … pending Notion opt-out update(s)** if it appears. In Twilio, check **Monitor → Logs → Errors** for error **11200**, which means the website answered Twilio too slowly.
- **Notion changes but the row isn't listed:** the **Phone** in Notion doesn't exactly match the number you texted from.

## Step 4. Turn sending on (just for the test)

1. **Let the website's Twilio key send.** In the Twilio Console, open **Settings → Account settings → API keys & auth tokens**, click the website's restricted key, open the **Permissions** tab, add **create** for Messages (keep **read**) and click **Save**. Twilio's instructions: [Update an API key](https://www.twilio.com/docs/iam/api-keys/keys-in-console#update-an-api-key-in-the-twilio-console).
   - If there are several keys, the right one's SID (starting `SK`) matches `TWILIO_API_KEY_SID` under **Variables & secrets** on the [misxv-api service in Cloud Run](https://console.cloud.google.com/run/detail/us-central1/misxv-api/revisions?project=simplysoph-66c78).
2. **Switch sending on** in PowerShell:

   ```powershell
   gcloud config configurations activate misxv
   gcloud run services update misxv-api --project=simplysoph-66c78 --region=us-central1 '--update-env-vars=SMS_ENABLED=true,SMS_ACTIVATION_REVIEWED=true'
   ```

   Keep the single quotes: without them PowerShell breaks the value apart and the update fails. It takes about a minute and prints a new revision name. Write that name down.

## Step 5. Send one test text to yourself

1. Open [Communications → SMS reminders](https://misxv.simplysoph.com/admin/updates/?tab=sms). The status line should now read "Review one recipient and message before each send."
2. Under **Individuals**, tick only the test row. Don't tick any distribution group.
3. **Subject / draft title:** `SMS test`. **Message:**

   ```
   Simply Soph Media: Test message for Sophia's event texts. Reply STOP to opt out.
   ```

   Every text must start with `Simply Soph Media:` and contain `STOP`, or the website refuses it. Don't add `{link}`.
4. Click **Create SMS drafts for review**. It should say "1 SMS drafts created. Nothing sent."
5. Under **Latest five SMS records**, click **Review SMS** on the test draft. Tick **I have reviewed this recipient and message**, then click **Send this SMS**.
6. The text arrives on your phone. Reload the page after a minute: the draft's status should read **delivered**.

**If it doesn't work:** **rejected** means Twilio refused it; the most likely cause is the key's missing **create** permission (step 4.1). **unknown** means the website couldn't tell whether Twilio sent it. Don't try again; look for the message in Twilio's **Monitor → Logs → Messaging** first.

## Step 6. Turn sending off and clean up

1. Switch sending off in PowerShell:

   ```powershell
   gcloud run services update misxv-api --project=simplysoph-66c78 --region=us-central1 '--update-env-vars=SMS_ENABLED=false,SMS_ACTIVATION_REVIEWED=false'
   ```

   SMS reminders should go back to "Sending is disabled pending sender setup and activation review." Write down this revision name too.
2. Delete the test row in Notion. Leave every real row alone.
3. Optional: remove **create** from the key's permissions again. The switch from step 6.1 already blocks sending; removing the permission is extra caution, and you'd add it back at the real launch.
4. Your phone stays subscribed. Text `STOP` if you'd rather not get event texts.
5. Record the result: the date, which checks passed, and both revision names. They go in `ops/event-resources.json` (Claude can add them for you).

## When the family approves real texts

1. Repeat step 4. Skip 4.1 if the key can still send.
2. On SMS reminders, choose the distribution groups or individuals. Only guests who texted SOPHIA from the phone in their Notion row are listed or included.
3. Write the message, starting with `Simply Soph Media:` and ending with `Reply STOP to opt out.` Use the November 15 RSVP deadline. Add `{link}` where each household's private RSVP link belongs.
4. Create the drafts, then review and send each one.
5. Switch sending off again (step 6.1) when the family is done.

---

## Reference (for whoever maintains the website)

### What the code does

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

### Runtime settings

| Setting | Where | Notes |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Cloud Run env | Must be the account that owns the campaign **and** the WhatsApp sender. Callbacks from any other account return 403 |
| `TWILIO_MESSAGING_SERVICE_SID` | Cloud Run env | Must be the service linked to the A2P campaign. Callbacks from any other service return 403 |
| `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET` | env / Secret Manager | Restricted key. Needs Messages **read** (verifying START timestamps). Messages **create** is granted only at activation |
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

   These match the approved campaign; changing any of them makes the live program differ from what carriers approved. Twilio must classify a texted `SOPHIA` as `OptOutType=START`, or the app ignores it (step 3 proves this).
4. **Integration:** inbound "Send a webhook" → `https://misxv.simplysoph.com/api/twilio/inbound`; status callback → `https://misxv.simplysoph.com/api/twilio/status`.
5. **Geo permissions:** United States and Canada only for SMS.
6. **WhatsApp sender:** callbacks to `/api/whatsapp/inbound` and `/api/whatsapp/status`. The WhatsApp sender is not part of the SMS Messaging Service.

### Technical checks

- An unsigned POST to each callback returns 403. A correctly signed but malformed POST returns 422 and writes nothing. Both are covered by the automated tests (`tests/sms.test.mjs`, `tests/application.test.mjs`); repeat them against production only with the Auth Token at hand.
- Twilio times out after 15 s (error 11200). A START waits on a Twilio REST call and a Notion write before replying, so watch the Twilio debugger during step 3.

### Known limits

- **10DLC covers US carriers.** Canada generally works from a US long code. Puerto Rico, USVI and Guam numbers are rejected by the code today. Use WhatsApp or email for every other country.
- **Meta blocks marketing templates to US numbers.** WhatsApp is for international guests only.
- **MMS STOP.** Only `SM…` message IDs are accepted. A STOP sent as MMS is still enforced by Twilio, but is not recorded locally.

### Retirement

After the family approves retirement: turn off both flags, settle in-flight messages, export approved records privately, release the event number, delete only the event Messaging Service(s), revoke the event API key, remove event secret versions and bindings, and review remaining charges. Preserve shared Twilio/Meta accounts. Follow `CLEANUP.md` and reconcile `ops/event-resources.json` before any deletion.
