# Production deployment and operating guide

How to configure, deploy, verify, roll back and recover the Mis XV service. This guide states what the **code** does. It does not log what was done in production. Live identifiers (secret versions, revisions, client IDs, Notion IDs, Twilio SIDs) belong in `ops/event-resources.json`. **Nothing listed under "Acceptance gate" counts as working until it is re-verified and recorded there.**

Related: [publishing.md](publishing.md) (static release pipeline) · [account-access.md](account-access.md) (guest and admin sign-in) · [twilio-setup.md](twilio-setup.md) (SMS/WhatsApp) · [cleanup.md](cleanup.md) (retirement) · [v1/](v1/README.md) (v1.0 design and plan).

## Topology

| Component | Implementation | Deployed by |
|---|---|---|
| Static site (EN/ES, every route + 404) | `scripts/build-pages.mjs` → `dist/` → Firebase Hosting site `misxv-simplysoph`, target `misxv` | GitHub Actions on push to `main` only (OIDC, no stored key) |
| API | Node 24, `server/start.mjs`, one Cloud Run service `misxv-api` in `us-central1`, reached via Hosting rewrite `/api/**` | **Manual** (see "Deploy the API") |
| State | One JSON ledger in a private GCS bucket with generation preconditions (`server/store.mjs`, 20 MB cap); media/documents as separate private objects | — |
| Guest roster and planning | Notion data sources via a dedicated scoped connection | — |
| Email | Microsoft Graph, mailbox `misxv@simplysoph.com` (hard-coded sender); optional SendGrid fallback; see [email.md](email.md) | — |
| SMS / WhatsApp | Twilio (off by default; see [twilio-setup.md](twilio-setup.md)) | — |

With no `EVENT_BUCKET` the server runs in **preview mode**: every page is served and the API fails closed with 503. Partial live configuration stops startup. Notion failures never fall back to demo data.

## Configuration

Every variable `server/start.mjs` reads. Secrets come from **pinned** Secret Manager versions, never `latest`, never baked into the image, Hosting output or CI.

| Variable | Required | Secret | Default | Meaning |
|---|---|---|---|---|
| `EVENT_BUCKET` | Live | No | none → preview | Dedicated private bucket (uniform access, public access prevention, versioning) |
| `APP_KEY` | Live | **Yes** | — | Exactly 32 random bytes, base64. Seals MFA seeds and drafts. Losing it makes ledger exports unreadable |
| `PUBLIC_ORIGIN` | No | No | `https://misxv.simplysoph.com` | https, no trailing slash. Used for origin checks and Twilio signature URLs |
| `DATA_RETENTION_DATE` | Live | No | — | `YYYY-MM-DD` family-approved review date; not an automatic deletion |
| `NOTION_TOKEN` | Live | **Yes** | — | Dedicated connection scoped to the approved databases only |
| `NOTION_SOURCE_ID` | Live | No | — | Invitations **data-source** ID (not a page/view ID) |
| `SCOPED_NOTION_CONNECTION_CONFIRMED` | Live | No | — | Literal `true` after verifying the connection's page access |
| `ADMIN_GOOGLE_CLIENT_ID` | Live | No | — | Web OAuth client; authorized origin = `PUBLIC_ORIGIN`. Also used for guest Google sign-in on `/account/` |
| `MICROSOFT_CLIENT_ID` | No | No | empty → Microsoft sign-in hidden | Application (client) ID of the **Mis XV sign-in** Entra app (single-page app, no secret; see Provisioning 7). Created Oct 9, 2026: `7a448a2b-1b47-4423-a92d-2d840d8b0df0` |
| `MICROSOFT_TENANT_ID` | With `MICROSOFT_CLIENT_ID` | No | — | `83d9aa10-e1de-455e-a9b8-1cc73e99685a` (simplysoph.com). Work accounts from any other organization are refused; personal Microsoft accounts are always accepted |
| `ADMIN_EMAILS` | Live | No | — | The break-glass owner (one address): the only admin outside Notion. Every other administrator is a Notion row with **Administrator Eligible** ticked ([access model](v1/access-model.md)) |
| `NOTIFICATION_EMAILS` | No | No | `ADMIN_EMAILS` | All of these receive generic review notifications |
| `M365_TENANT_ID`, `M365_CLIENT_ID` | Live | No | — | Entra app with Exchange **application RBAC** `Mail.Send` scoped to the event mailbox |
| `M365_CLIENT_SECRET` | Live | **Yes** | — | Same app; expiry must cover the event |
| `MAIL_PROVIDER` | No | No | `m365` | `m365` or `sendgrid`; anything else stops startup |
| `SENDGRID_FALLBACK_ENABLED` | No | No | `false` | Fallback only on pre-submission Graph auth failures; uncertain sends never retry elsewhere |
| `SENDGRID_API_KEY` | If SendGrid used | **Yes** | — | Check the SendGrid plan covers the event date before relying on fallback |
| `TWILIO_ACCOUNT_SID`, `TWILIO_MESSAGING_SERVICE_SID`, `TWILIO_API_KEY_SID` | For SMS/WA | No | — | Must belong to the account/service that owns the campaign and sender |
| `TWILIO_API_KEY_SECRET`, `TWILIO_AUTH_TOKEN` | For SMS/WA | **Yes** | — | Restricted key; Auth Token validates webhook signatures |
| `SMS_ENABLED`, `SMS_ACTIVATION_REVIEWED` | No | No | `false` | Both `true` + Auth Token required to send SMS |
| `WHATSAPP_FROM` | For WA | No | — | `+16827868002` |
| `WHATSAPP_TEMPLATES_JSON` | No | No | `[]` | Approved templates only; invalid JSON stops startup |
| `WHATSAPP_ENABLED`, `WHATSAPP_ACTIVATION_REVIEWED` | No | No | `false` | Both `true` required to send WhatsApp |
| `SCHEDULER_AUDIENCE`, `SCHEDULER_SERVICE_ACCOUNT` | No | No | none → drain off | Both or neither (startup fails otherwise). The Cloud Run service URL the OIDC token is minted for, and the scheduler service account email. See "Scheduled drain" |
| `PORT` / `HOST` | No | No | `4173` / `127.0.0.1` (`0.0.0.0` on Cloud Run) | Dockerfile sets `PORT=8080` |

`.env.example` lists the same names for local use only.

## Provisioning boundaries

1. Record a scoped baseline before creating anything, and inventory every object, grant, secret version and image in `ops/event-resources.json`. Preserve the shared project, default Hosting site and billing.
2. Runtime service account: `objectUser` on the event bucket only; Secret Accessor on individual event secrets only. No project Editor, no downloadable keys.
3. Google OAuth client: exact production origin plus explicitly chosen preview origins only. The owner keeps recovery codes (Guest access → Your recovery codes) away from their phone.
4. Notion connection: read/update/insert on **only** the organizer-approved databases (Invitations, Budget, Godparents). No user profiles, comments or agents.
5. Microsoft: Exchange application RBAC limited to `misxv@simplysoph.com`; verify another mailbox is denied. No tenant-wide `Mail.Send`. SPF authorizes Microsoft 365. DKIM selector1 signs and passes; the selector2 CNAME was restored in Cloudflare (verified Oct 9, 2026). DMARC is published at `p=none`, with reports going to Cloudflare's DMARC Management since October 13, 2026.
6. Twilio: see [twilio-setup.md](twilio-setup.md). Grant Messages *create* to the runtime key only at activation.
7. Microsoft sign-in app (optional; the owner creates it in the [Microsoft Entra admin center](https://entra.microsoft.com) → App registrations → **New registration**):
   - Name `Mis XV sign-in`. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**. Redirect URI: platform **Single-page application (SPA)**, `https://misxv.simplysoph.com/admin/login/`.
   - **Authentication** → Single-page application → add `https://misxv.simplysoph.com/account/` and `https://misxv.simplysoph.com/es/account/`. Leave both implicit-grant boxes unchecked. Do not create a client secret: the browser uses PKCE.
   - **Token configuration** → Add optional claim → ID → check `email`, `acct` and `xms_edov` (accept the Graph `email` permission prompt). Then **Manifest** → under `optionalClaims.idToken` add `{ "name": "amr", "essential": false }` so Microsoft can prove MFA. Without `acct`/`xms_edov`, simplysoph.com work accounts are refused; personal accounts are unaffected.
   - Set `MICROSOFT_CLIENT_ID` to the Application (client) ID and `MICROSOFT_TENANT_ID` as above, redeploy, and record the app as `entra-application` in the inventory.

## Deploy the API

Build from a clean checkout of `main` after `npm run check` passes on Node 24, then deploy by **immutable digest**:

```sh
gcloud run deploy misxv-api \
  --project=simplysoph-66c78 --region=us-central1 \
  --image=<repository>/misxv-api@sha256:<digest> \
  --service-account=<runtime-sa> \
  --min-instances=0 --max-instances=2 --concurrency=40 \
  --cpu=1 --memory=2Gi --timeout=600 --cpu-throttling \
  --set-env-vars=<non-secret settings from the table> \
  --set-secrets=APP_KEY=<secret>:<version>,NOTION_TOKEN=<secret>:<version>,M365_CLIENT_SECRET=<secret>:<version>,TWILIO_API_KEY_SECRET=<secret>:<version>,TWILIO_AUTH_TOKEN=<secret>:<version>
```

- These limits are a starting point, not a spending cap. Configure a billing budget alert.
- **Why 2 GiB and 600 s** (changed from 1 GiB and 120 s for guest videos; see "Media job"). Converting one video holds the guest's original in `/tmp`, which on Cloud Run is memory (up to 300 MB), plus the converted file (under 80 MB) and ffmpeg itself (measured at 440 MB for 4K HEVC). That holds because ffprobe and ffmpeg decode only the codecs phones record and frames of at most 4096×2176 pixels (`server/video.mjs`): before those limits, a 3 MB MOV of PNG frames growing to 16000×16000 took ffmpeg to 2064 MB and ffprobe to 2001 MB; it is now refused in under 0.1 s at under 50 MB. Add the API (~250 MB), up to 8 upload pieces in flight (~130 MB) and 2 photo decodes, and the worst case is about 1.5 GB: over 1 GiB, inside 2 GiB. A 60-second clip took 106–204 s on one core (1080p H.264 to 4K HEVC), so the media job's request needs more than 120 s; guest requests still end within Hosting's own 60-second limit. Billing stays request-based (`--cpu-throttling`): the conversion runs inside the job's request, never in the background.
- Public invocation is required for the Hosting rewrite. Every private route still enforces application authentication and an exact `Origin` match. The exceptions authenticate differently: Twilio callbacks by signature, and `/api/internal/drain` and `/api/internal/media` by a Google-signed OIDC token.
- Deploy a backward-compatible API **before** publishing a frontend that depends on it. Record the revision and digest in the inventory.
- Hosting validates the `/api/**` rewrite with a service-scoped `run.services.get` grant. `scripts/deploy-hosting.mjs` refuses any other routing.

## Scheduled drain

`POST /api/internal/drain` retries work that failed earlier: up to 10 RSVPs still waiting to reach Notion, up to 10 Budget or Godparents rows, and up to 25 pending SMS and 25 pending WhatsApp opt-in/opt-out projections. It also checks that Notion still shows each answered household's website RSVP (the RSVP column and head counts). A difference is reported once in Notifications and counted on the dashboard (many at once become one alert), and Notion is never overwritten automatically, because the family may have changed it on purpose. On Invitations the admin chooses, per household, **Keep Notion's version** (not reported again unless it changes) or **Write the website's answer**. Rows written in the last 2 minutes are skipped, and a check that finds nothing new writes nothing. A guest's contact-details change writes only the contact columns, plus an answer of theirs still waiting to reach Notion; it never rewrites an answer already there. It never sends a message to a guest. Each step runs on its own, so one failing step never blocks the others. The route returns 404 until both scheduler variables are set. It accepts only a Google-signed OIDC token whose audience is exactly `SCHEDULER_AUDIENCE` and whose verified email is exactly `SCHEDULER_SERVICE_ACCOUNT`.

One-time setup (owner, `gcloud config configurations activate misxv`):

```sh
gcloud services enable cloudscheduler.googleapis.com --project=simplysoph-66c78
gcloud iam service-accounts create misxv-scheduler --project=simplysoph-66c78 \
  --display-name="Mis XV drain scheduler"          # no roles: it only identifies the caller
URL=$(gcloud run services describe misxv-api --project=simplysoph-66c78 \
  --region=us-central1 --format="value(status.url)")
gcloud run services update misxv-api --project=simplysoph-66c78 --region=us-central1 \
  --update-env-vars=SCHEDULER_AUDIENCE=$URL,SCHEDULER_SERVICE_ACCOUNT=misxv-scheduler@simplysoph-66c78.iam.gserviceaccount.com
gcloud scheduler jobs create http misxv-drain --project=simplysoph-66c78 \
  --location=us-central1 --schedule="*/10 * * * *" --time-zone="America/Chicago" \
  --uri="$URL/api/internal/drain" --http-method=POST \
  --headers=Content-Type=application/json --message-body="{}" \
  --oidc-service-account-email=misxv-scheduler@simplysoph-66c78.iam.gserviceaccount.com \
  --oidc-token-audience="$URL" --attempt-deadline=60s
```

- Verify: `gcloud scheduler jobs run misxv-drain --location=us-central1 --project=simplysoph-66c78`, then in the request logs find `POST /api/internal/drain` with status 200. An unsigned `curl -X POST $URL/api/internal/drain -H "Content-Type: application/json" -d "{}"` must return 401.
- Record the service account and the job in `ops/event-resources.json`. Cloud Scheduler includes 3 free jobs per billing account.
- Pause with `gcloud scheduler jobs pause misxv-drain …`. Removing the two variables turns the route off again.

## Media job (video conversion)

Guests' photos and videos reach the API in pieces of at most 8 MiB (`POST /api/uploads`, then `POST /api/uploads/<id>?offset=N`, `server/application.mjs`), each a short request through the Hosting rewrite. The API writes the pieces to a Cloud Storage **resumable session** for `private/uploads/<id>` that it opened itself; the session URI stays sealed in the ledger, so browsers never talk to the bucket (no bucket CORS, no signed URLs, no CSP change, no new IAM role: `objectUser` covers it). A photo is converted to JPEG as its last piece arrives. A video waits in "processing" for `POST /api/internal/media`, which converts waiting videos one at a time (H.264/AAC MP4, at most 1080p and 30 fps, with a poster frame) and starts no new one after 60 s. Only then does the family get the "New video awaiting review" email and see it on Admin → Photos. The job also cancels uploads left unfinished for a day. Without this job, videos stay "processing" (photos are unaffected).

One-time setup, after the drain's setup above (same caller identity, so no new service account or role). Take the audience from the working drain job, not from `status.url`: a service now has two URLs (`misxv-api-<hash>-uc.a.run.app` and `misxv-api-<project number>.us-central1.run.app`), `gcloud` may print either, and a token minted for any value other than `SCHEDULER_AUDIENCE` is refused with 401.

```sh
AUD=$(gcloud scheduler jobs describe misxv-drain --project=simplysoph-66c78 \
  --location=us-central1 --format="value(httpTarget.oidcToken.audience)")
echo "$AUD"   # must equal SCHEDULER_AUDIENCE on misxv-api
gcloud scheduler jobs create http misxv-media --project=simplysoph-66c78 \
  --location=us-central1 --schedule="*/5 * * * *" --time-zone="America/Chicago" \
  --uri="$AUD/api/internal/media" --http-method=POST \
  --headers=Content-Type=application/json --message-body="{}" \
  --oidc-service-account-email=misxv-scheduler@simplysoph-66c78.iam.gserviceaccount.com \
  --oidc-token-audience="$AUD" --attempt-deadline=600s
```

- Deploy the API with `--memory=2Gi --timeout=600` first ("Deploy the API"). The attempt deadline matches the request timeout: one conversion may take up to 7 minutes (ffmpeg's own limit) after the 60 s in which it may start.
- Verify: `gcloud scheduler jobs run misxv-media --location=us-central1 --project=simplysoph-66c78`, then find `POST /api/internal/media` with status 200 and one `"message":"media"` log line with its counts. An unsigned POST must return 401.
- A conversion that failed for a server reason logs `video conversion will be retried` (WARNING) and is tried by the next runs, 3 times in all; a file that can never play (over 60 s, unreadable) is marked with its reason on Admin → Photos. A run that dies mid-conversion (the instance killed, say for memory) counts as one of the 3: a video claimed 3 times without an outcome is marked "conversion failed" and logs `video conversion given up: 3 runs ended without an answer` (ERROR) instead of being converted again.
- Each instance converts one video at a time, and a run takes that slot before it claims or downloads anything. A run that fires while the previous one is still converting on the same instance ends at once and logs `media job skipped: this instance is converting a video` (INFO); the next run picks the video up.
- Optional but recommended: the bucket keeps old object versions, so every deleted original (up to 300 MB each) would stay as a noncurrent version until retirement. This lifecycle rule removes noncurrent versions under `private/uploads/` after a day (7-day soft delete still applies; ledger and gallery objects are untouched). It replaces the bucket's lifecycle configuration, which is empty today:

  ```sh
  printf '%s' '{"rule":[{"action":{"type":"Delete"},"condition":{"matchesPrefix":["private/uploads/"],"isLive":false,"daysSinceNoncurrentTime":1}}]}' > misxv-lifecycle.json
  gcloud storage buckets update gs://<EVENT_BUCKET> --lifecycle-file=misxv-lifecycle.json
  ```
- Record the job (and the rule, if added) in `ops/event-resources.json`. Pause with `gcloud scheduler jobs pause misxv-media …`.

## Channel activation

| Channel | Code path | Gate to turn on |
|---|---|---|
| Email | `server/mail.mjs`, outbox in ledger | Live config + acceptance gate below |
| SMS | `server/sms.mjs` | Approved A2P campaign, then Twilio acceptance, then both `SMS_*` flags |
| WhatsApp | `server/whatsapp.mjs` | ONLINE sender, approved templates, eligible non-US test, then both `WHATSAPP_*` flags |

Rules that hold for every channel:

- Each send is reviewed by an organizer and claimed once before the provider call.
- `accepted` means the provider took the message. It does not mean delivered.
- `unknown` and `sending` are never retried automatically. Reconcile them against the provider (Sent Items or the Twilio logs) first.

**Batch email (invitations and reminders).** In Admin → Invitations:
1. Select households, then use **Create links** (only for households without one; nothing is emailed) or **Email invitation** / **Email reminder**.
2. Review the recipients, the skipped households with reasons, and one sample per language.
3. Type the number of emails to confirm. The open admin tab sends them in groups of 10 at about 28 per minute, under Exchange Online's 30 per minute limit.
4. Closing the tab or pressing **Stop** halts sending. A confirmed batch can be continued later from **Recent email batches**. Nothing sends on a timer.

Which households are skipped:
- **Both types:** households that already responded.
- **Invitations:** households that already received one.
- **Reminders:** households emailed in the last 72 hours, or that have already had 3 reminders.

Each email carries its own private link, which opens only after that email was sent. A single household is a batch of one.

SMS only goes to phones whose owner texted the program keyword (`SOPHIA`, `START`, `UNSTOP`). The receipt must be synced and bound to the household. **An organizer-ticked Notion consent box alone never makes a number textable.** Every SMS must start with `Simply Soph Media:` and include `STOP`.

## Acceptance gate before any real invitation

Record date, tester and evidence for each item in the inventory. Status on October 13, 2026: the owner confirmed the ticked items; anything unticked is still unverified.

- [x] `npm run check` and `npm audit --omit=dev` pass on Node 24 in CI. Desktop, mobile and Spanish navigation verified in a real browser (CI on main at e33010e and Chromium at 390 and 1440 px in English and Spanish with no axe WCAG 2.2 AA violations, October 15, 2026).
- [x] Administrator sign-in with the real providers: the emailed link, Google or Microsoft, then the authenticator code (owner, October 13, 2026).
- [ ] Administrator refusals: an address that is not a ticked row's main Email (or an owner) is refused; the first setup works only from the emailed link (QR); code replay and an expired session are refused; ten wrong codes pause sign-in; an owner recovery code works.
- [ ] Disposable Notion test household:
  - [ ] Lookup, allocation limits, decline and mixed attendance.
  - [ ] Concurrent-edit protection, replay and ledger restart.
  - [x] Notion projection and admin counts: a test household's answer reached Notion and Admin → Overview (owner, October 13, 2026).
  - [ ] Afterwards, archive only that fixture.
- [ ] A Notion write outage keeps the answer saved and pending (if Notion cannot be read at all, the RSVP is refused with a retryable error and nothing is saved); the scheduled drain (every 10 minutes) or Retry sync then reconciles it. If the family edited the row in Notion meanwhile, the retry writes only the Website columns and the drift check reports the difference; Keep and Write both behave as described on Invitations.
- [ ] A permanent Notion refusal (for example a missing column) marks the row failed and adds one alert to Notifications; after fixing the row, Retry sync writes it. The same holds for a refused Budget or Godparents change.
- [x] Media: upload a disposable image, approve it and remove it (owner, October 13, 2026).
- [ ] Media: confirm metadata is stripped and a new upload stays private until approved.
- [x] Media from real phones over cellular data: a 60-second iPhone video (Safari) and a 60-second Android video (Chrome) arrive with progress, the media job converts both (Admin → Photos shows them playing), and they play in Safari and Chrome after approval; a 61-second clip is refused with the trim message; the table QR opens `/share/` and the emailed sign-in comes back to it (owner, October 15, 2026).
- [ ] One reviewed email to an organizer-chosen test recipient. Verify Sent Items (sign-in link emails are deliberately not kept there), receipt, SPF/DKIM headers, and the Spanish rendering.
- [ ] Guest sign-in with a household's Notion Email and with an Additional Email (emailed link, Google, Microsoft); removing the email in Notion ends access on the next request; the RSVP receipt arrives at the verified address ([account-access.md](account-access.md)).
- [ ] Real content confirmed (church, dinner, dress code, retention date), invitation artwork, and that guest links never appear in logs or public artifacts.
- [x] SMS: accepted on October 13, 2026 (handset keywords and a delivered test text; see [twilio-setup.md](twilio-setup.md)).
- [ ] WhatsApp: the checks in the [WhatsApp guide](whatsapp-activation.md), after Meta approves the templates.

## Reliability and limits

- **Ledger.** GCS generation preconditions serialize writes across instances. A failed write never returns a saved receipt. The 20 MB cap suits one small event; media bytes are stored separately. Each request checks the ledger's generation and downloads it only when it changed. Rate-limit counters live in memory, not the ledger (the 20 uploads a day per household are the exception, see "Media"). An RSVP takes 2 ledger writes: one save records the response and claims the Notion sync and the receipt email, and one final save records both outcomes. Heavy bursts can still return a retryable `BUSY`.
- **Invitation links.** 256-bit secrets, stored only as hashes. Reissuing a link ends that link's sessions and unsent drafts; email sign-ins stay. Revoking an invitation ends every session for the household.
- **Data authority.** Notion owns invited capacity and who may sign in. The ledger owns accepted website responses. Head counts follow the website's answer, or Notion's for phone answers and differences the admin chose to keep.
- **Notion client.** Requests are paced to 2.5/s per instance and retried on 429 (honoring `Retry-After` up to 10 s). Server errors are retried for reads and updates, never for page creates. Guest-list reads are cached for 30 s, and any write clears the cache. RSVP submit, invitation exchange, sign-in and every outbound send read fresh; page views may lag a direct Notion edit by up to 30 s. Each admin request re-reads the admin's row (5-second positive cache). During a Notion outage, read-only views (the guest's invitation, profile and messages, and the admin guest list, dashboard and audience) serve the last good answer for up to an hour, and an admin confirmed within the last 15 minutes keeps working. Guest writes and fresh reads (sign-in, RSVP) return a retryable error instead of using old data.
- **Logs.** API requests are written to stdout as Cloud Logging JSON: method, path, status and latency only. Unexpected failures log `ERROR` with a stack trace; known 5xx codes such as `BUSY` log `WARNING`. Create a log-based alert on `severity>=ERROR` for `misxv-api`.
- **Rate limits.** Counters are kept in memory per instance, so effective limits are up to 2× with two instances and start over when an instance does. The 20 uploads a day per household are counted in the ledger instead (see "Media"). Shared budgets count only rejected credentials or outgoing mail, so anonymous junk cannot lock out valid users. Sign-in links: at most 3 per address per 15 minutes plus a shared hourly budget, counting only links actually sent; requests answer in no less than 0.9 s either way, and the same way even when saving the link fails. Each one holds its request slot for that time (a wait, not CPU), so Cloud Run serves 40 requests per instance and at most 16 of them may be sign-in requests; more at the same moment get a retryable `SIGN_IN_BUSY` (which points to Microsoft and Google sign-in). Blocking sign-in takes a sustained flood, and the other slots stay free. A counter whose window is open is never evicted; a full table refuses new keys instead. Per-identity, per-household and per-actor budgets limit legitimate use, and each MFA challenge allows 5 attempts. Forwarding headers are not trusted.
- **Admin live updates.** Each visible admin tab reads `/api/admin/pulse` every 30 s: one ledger read, no Notion call, no writes. New and updated RSVPs appear in the Notifications inbox in-app only; no email is sent for them.
- **Event log.** Each state change appends an entry to `eventLog` in the same save (IDs, statuses and channel; never phone numbers or message text). After the save commits, each entry is also written as one log line, with email addresses and phone hashes replaced by keyed tags (`email:…`, `phone:…`) that correlate but cannot be read or reversed: in Logs Explorer filter `jsonPayload.event.type="rsvp.submitted"` (or `delivery.`, `consent.`, `role.`, `invitation.`, `notion.`). The ledger keeps the newest 20,000 entries; the log copy follows Cloud Logging retention (30 days by default).
- **Ledger writes.** Transactions on one instance run one at a time. Conflicts with the other instance and GCS 429 throttling are retried with jittered backoff (up to 8 attempts) before returning `BUSY`. Each GCS load or save times out after 5 s: one slow load is retried, a timed-out save is never re-run (it may still have landed) and is logged at ERROR, and more than 32 queued transactions on one instance return `BUSY` immediately.
- **Media.**
  - Limits (`site/upload-batch.mjs`, shared by the page and the API): 10 files chosen at once and 20 begun a day per household (counted in the ledger as each upload begins, so restarts and the second instance do not reset it, and an upload given up or refused still counts); photos JPEG, PNG or WebP up to 40 MB and 64 MP; videos MP4, MOV or WebM up to 300 MB, 60 s (60.9 s is cut to 60), 4096 px per side and 4096×2176 pixels a frame (DCI 4K and UHD either way up). Only what phones record is decoded: H.264, HEVC, VP8, VP9, AV1, MPEG-4 and ProRes video; AAC, Opus, Vorbis, ALAC, PCM, AMR and MP3 audio; any other codec, such as PNG frames in a MOV, is refused as unreadable. HEIC is not decoded (sharp's prebuilt libvips has no HEVC decoder); the chooser leaves it out, so iPhones send JPEG.
  - Uploads travel in pieces of whole 256 KiB units, at most 8 MiB, one request at a time per person and 8 per instance (more get a retryable `UPLOAD_BUSY`); a person has at most 1,500 pieces an hour and 10 unfinished uploads; unfinished uploads are given up after a day.
  - Photos are re-encoded to JPEG of at most 2000 px; videos to MP4/H.264/AAC of at most 1080p and 30 fps, with a JPEG poster; metadata (including location) is removed and originals are deleted once converted. One video conversion per instance at a time, by the media job, at a lower CPU priority than the API.
  - Media is streamed from storage by byte range, never read whole into memory.
  - Approved media is only visible to signed-in guests. Rejection removes access immediately.
- **Documents.** Stored under `private/documents/`, admin only, 8 MB limit. Delete marks them as trash; it does not purge.

## Notion planning sync

Budget and Godparents edits made on the website are saved to the ledger as `pending`, then patched into the linked Notion row (changed fields only). New rows use a stable `Website Record ID`, and an ambiguous create is looked up, never repeated. A five-minute durable lock serializes writes to each row. Direct Notion edits do **not** flow back to the website. Rows still waiting to reach Notion after an outage are retried by the scheduled drain, oldest attempt first; errors that need a person (a schema conflict, a duplicate or missing record, an uncertain create) wait for Retry sync. A change Notion refuses outright shows "Refused by Notion", is reported once in Notifications, and is corrected by editing the record or pressing Retry sync. The recommended v1.0 ownership model is in [v1/notion-strategy.md](v1/notion-strategy.md).

## Release and rollback

- **Static site.** Published automatically from `main` only, after checks pass; see [publishing.md](publishing.md). To roll back, use Firebase Hosting release history for site `misxv-simplysoph` (Hosting → Release history → Rollback), or merge a pull request that reverts the change; `main` only accepts pull requests, and merging publishes.
- **API.** Route traffic back to the previous known-good revision (`gcloud run services update-traffic misxv-api --to-revisions=<rev>=100`).
- **Order.** Restore a compatible frontend and API together.
- **Ledger.** Never roll the live ledger back over newer RSVPs (see "Recovery").
- **Notion.** Keep the additive Notion columns.

## Recovery

The bucket has object versioning, public access prevention, uniform access and 7-day soft delete. To restore:

1. Close intake and stop the service.
2. List the generations of the exact object.
3. Download the chosen generation to a restricted location and validate it against the audit log.
4. Copy it back with a precondition on the current generation.

Never restore while writes are active. A whole-ledger rollback can revive old sessions, codes or pending mail. Invalidate sessions and challenges, and reconcile invitation generations, authenticators and outbox state, before restarting. Restore media together with its moderation metadata. Preserve `APP_KEY` until every wanted export has been read.

At retirement, export the approved media and guest data, verify the exports, then include **all object generations** in the reviewed cleanup ([cleanup.md](cleanup.md)). Nothing schedules deletion automatically.
