# Production deployment and operating guide

How to configure, deploy, verify, roll back and recover the Mis XV service. This guide states what the **code** does. It does not log what was done in production. Live identifiers (secret versions, revisions, client IDs, Notion IDs, Twilio SIDs) belong in `ops/event-resources.json`. **Nothing listed under "Acceptance gate" counts as working until it is re-verified and recorded there.**

Related: [PUBLISHING.md](PUBLISHING.md) (static release pipeline) · [ACCOUNT-ACCESS.md](ACCOUNT-ACCESS.md) (guest and admin sign-in) · [docs/twilio-setup.md](docs/twilio-setup.md) (SMS/WhatsApp) · [CLEANUP.md](CLEANUP.md) (retirement) · [docs/v1/](docs/v1/README.md) (v1.0 design and plan).

## Topology

| Component | Implementation | Deployed by |
|---|---|---|
| Static site (EN/ES, 65 routes + 404) | `scripts/build-pages.mjs` → `dist/` → Firebase Hosting site `misxv-simplysoph`, target `misxv` | GitHub Actions on push to `main` only (OIDC, no stored key) |
| API | Node 24, `server/start.mjs`, one Cloud Run service `misxv-api` in `us-central1`, reached via Hosting rewrite `/api/**` | **Manual** (see "Deploy the API") |
| State | One JSON ledger in a private GCS bucket with generation preconditions (`server/store.mjs`, 20 MB cap); media/documents as separate private objects | — |
| Guest roster and planning | Notion data sources via a dedicated scoped connection | — |
| Email | Microsoft Graph, mailbox `misxv@simplysoph.com` (hard-coded sender); optional SendGrid fallback | — |
| SMS / WhatsApp | Twilio (off by default; see [docs/twilio-setup.md](docs/twilio-setup.md)) | — |

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
| `ADMIN_GOOGLE_CLIENT_ID` | Live | No | — | Web OAuth client; authorized origin = `PUBLIC_ORIGIN` |
| `ADMIN_EMAILS` | Live | No | — | Owners (break-glass role, comma-separated). Removing an email invalidates their sessions |
| `ADMIN_DELEGATE_EMAILS` | No | No | empty | Delegates: email link + MFA; also need **Administrator Eligible** on their Notion row |
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
| `PORT` / `HOST` | No | No | `4173` / `127.0.0.1` (`0.0.0.0` on Cloud Run) | Dockerfile sets `PORT=8080` |

`.env.example` lists the same names for local use only.

## Provisioning boundaries

1. Record a scoped baseline before creating anything, and inventory every object, grant, secret version and image in `ops/event-resources.json`. Preserve the shared project, default Hosting site and billing.
2. Runtime service account: `objectUser` on the event bucket only; Secret Accessor on individual event secrets only. No project Editor, no downloadable keys.
3. Google OAuth client: exact production origin plus explicitly chosen preview origins only. Keep a second owner and authenticator recovery material.
4. Notion connection: read/update/insert on **only** the organizer-approved databases (Invitations, Budget, Godparents). No user profiles, comments or agents.
5. Microsoft: Exchange application RBAC limited to `misxv@simplysoph.com`; verify another mailbox is denied. No tenant-wide `Mail.Send`. Review SPF/DKIM/DMARC before any invitation send (DMARC is not yet published).
6. Twilio: see [docs/twilio-setup.md](docs/twilio-setup.md). Grant Messages *create* to the runtime key only at activation.

## Deploy the API

Build from a clean checkout of `main` after `npm run check` passes on Node 24, then deploy by **immutable digest**:

```sh
gcloud run deploy misxv-api \
  --project=simplysoph-66c78 --region=us-central1 \
  --image=<repository>/misxv-api@sha256:<digest> \
  --service-account=<runtime-sa> \
  --min-instances=0 --max-instances=2 --concurrency=4 \
  --cpu=1 --memory=1Gi --timeout=120 --cpu-throttling \
  --set-env-vars=<non-secret settings from the table> \
  --set-secrets=APP_KEY=<secret>:<version>,NOTION_TOKEN=<secret>:<version>,M365_CLIENT_SECRET=<secret>:<version>,TWILIO_API_KEY_SECRET=<secret>:<version>,TWILIO_AUTH_TOKEN=<secret>:<version>
```

- These limits are a starting point, not a spending cap. Configure a billing budget alert.
- Public invocation is required for the Hosting rewrite. Every private route still enforces application authentication and an exact `Origin` match.
- Deploy a backward-compatible API **before** publishing a frontend that depends on it. Record the revision and digest in the inventory.
- Hosting validates the `/api/**` rewrite with a service-scoped `run.services.get` grant. `scripts/deploy-hosting.mjs` refuses any other routing.

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

SMS only goes to phones whose owner texted the program keyword (`SOPHIA`, `START`, `UNSTOP`). The receipt must be synced and bound to the household. **An organizer-ticked Notion consent box alone never makes a number textable.** Every SMS must start with `Simply Soph Media:` and include `STOP`.

## Acceptance gate before any real invitation

Record date, tester and evidence for each item in the inventory. Status as of this revision: **all unverified.**

- [ ] `npm run check` and `npm audit --omit=dev` pass on Node 24 in CI. Desktop, mobile and Spanish navigation verified in a real browser.
- [ ] Google login rejects unauthorized accounts. MFA enrollment, sign-in, code replay and expired session verified with the real OAuth client. A second owner can sign in.
- [ ] Disposable Notion test household:
  - [ ] Lookup, allocation limits, decline and mixed attendance.
  - [ ] Concurrent-edit protection, replay and ledger restart.
  - [ ] Notion projection and admin counts.
  - [ ] Afterwards, archive only that fixture.
- [ ] Notion outage keeps the receipt pending; Retry Sync then reconciles it. There is no unattended retry worker.
- [ ] Media: upload a disposable image, confirm metadata is stripped and the item is private-pending, then approve and remove it.
- [ ] One reviewed email to an organizer-chosen test recipient. Verify Sent Items, receipt, SPF/DKIM headers, and the Spanish rendering.
- [ ] Guest registration, returning sign-in and private pages (ACCOUNT-ACCESS.md). Delegates verify their own email and enroll MFA themselves.
- [ ] Real content confirmed (church, dinner, dress code, retention date), invitation artwork, and that guest links never appear in logs or public artifacts.
- [ ] Before using SMS or WhatsApp: the acceptance steps in docs/twilio-setup.md.

## Reliability and limits

- **Ledger.** GCS generation preconditions serialize writes across instances. A failed write never returns a saved receipt. The 20 MB cap suits one small event; media bytes are stored separately. Each request makes several ledger writes, including the rate-limit counters, so bursts can return `BUSY`. Reducing write amplification is P0 in [docs/v1/implementation-plan.md](docs/v1/implementation-plan.md).
- **Invitation links.** 256-bit secrets, stored only as hashes. Revoking or rotating a link invalidates its sessions and unsent drafts.
- **Data authority.** Notion owns invited capacity. The ledger owns accepted website responses.
- **Rate limits.** Shared global and per-actor budgets plus MFA attempt limits. Forwarding headers are not trusted.
- **Logging.** No request bodies, credentials or invitation fragments are logged. The service currently emits almost no logs (see the plan).
- **Media.**
  - Limits: 8 MB per file, 25 MP per image, video 60 s and 4096 px per side.
  - One video conversion per instance at a time.
  - Images are re-encoded to JPEG and videos to MP4/H.264/AAC, with metadata removed.
  - Approved media is only visible to registered guests. Rejection removes access immediately.
- **Documents.** Stored under `private/documents/`, admin only, 8 MB limit. Delete marks them as trash; it does not purge.

## Notion planning sync

Budget and Godparents edits made on the website are saved to the ledger as `pending`, then patched into the linked Notion row (changed fields only). New rows use a stable `Website Record ID`, and an ambiguous create is looked up, never repeated. A five-minute durable lock serializes writes to each row. Direct Notion edits do **not** flow back to the website. The recommended v1.0 ownership model is in [docs/v1/notion-strategy.md](docs/v1/notion-strategy.md).

## Release and rollback

- **Static site.** Published automatically from `main` only, after checks pass; see PUBLISHING.md. To roll back, use Firebase Hosting release history for site `misxv-simplysoph`, or redeploy a reviewed commit.
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

Never restore while writes are active. A whole-ledger rollback can revive old sessions, codes or pending mail. Invalidate sessions and challenges, and reconcile invitation generations, permissions and outbox state, before restarting. Restore media together with its moderation metadata. Preserve `APP_KEY` until every wanted export has been read.

At retirement, export the approved media and guest data, verify the exports, then include **all object generations** in the reviewed cleanup (CLEANUP.md). Nothing schedules deletion automatically.
