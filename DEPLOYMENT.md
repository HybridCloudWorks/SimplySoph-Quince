# Production deployment and operating guide

The guest frontend is static. Live RSVP, invitations, photos and private administration require the accompanying Node 24 API. Google AI Studio may edit this repository but is not required at runtime. Use existing Firebase Hosting for `misxv.simplysoph.com` and one dedicated Cloud Run service, private bucket and runtime identity. Keep email in the existing Microsoft 365 tenant.

## Required configuration

Copy `.env.example` only to a private, ignored local file when needed. In Cloud Run, bind sensitive values from Google Secret Manager. Never bake secrets into the image, Hosting directory, source uploads or CI.

| Setting | Meaning |
|---|---|
| `PUBLIC_ORIGIN` | Exactly `https://misxv.simplysoph.com`, with no trailing slash |
| `EVENT_BUCKET` | Dedicated private `misxv-...` bucket, uniform access and public access prevention |
| `APP_KEY` | Stable cryptographically random 32-byte key, base64; seals MFA seeds and email bodies. Preserve securely for restoring the ledger. |
| `NOTION_TOKEN` | Dedicated connection restricted to Invitations; do not launch with a personal workspace-wide token |
| `NOTION_SOURCE_ID` | Notion data-source ID, not a view/page ID; keep in deployment configuration |
| `SCOPED_NOTION_CONNECTION_CONFIRMED` | Literal `true` only after verifying the connection’s page access |
| `ADMIN_GOOGLE_CLIENT_ID` | Web OAuth client for this website; authorized JavaScript origin matches PUBLIC_ORIGIN |
| `ADMIN_EMAILS` | Comma-separated authorized Google emails; initially the organizer’s confirmed Gmail account |
| `DATA_RETENTION_DATE` | Family-approved YYYY-MM-DD review date; configuration gate, not an automatic deletion schedule |
| `M365_TENANT_ID`, `M365_CLIENT_ID`, `M365_CLIENT_SECRET` | Dedicated Microsoft application credential, with Mail.Send restricted to the event mailbox |

No EVENT_BUCKET means preview mode with unavailable API, not in-memory production storage. Partial live configuration stops startup. Notion failures never silently revert to a demo.

## Provisioning boundaries

1. Verify Google account/project and capture scoped baselines before each resource creation. Record every object and grant in `ops/event-resources.json`, including build repositories/source archives and Secret Manager versions. Preserve the existing project, default Hosting site and billing.
2. Create the dedicated private storage bucket and runtime service account. Grant object access only on that bucket, and Secret Accessor only on individual event secrets. Do not grant project Editor or broadly accessible bucket roles. Do not create downloadable service-account keys.
3. Configure a dedicated Google web OAuth client. Use the exact production origin and explicitly selected preview origins only. Allowlisted administrators complete Google login and TOTP enrollment; subsequent sign-ins require both. Keep a second authorized organizer and secure authenticator recovery material. Removing an email from ADMIN_EMAILS invalidates their sessions. If all factors are lost, an authorized cloud operator must perform a reviewed, backed-up recovery of the specific admin ledger entry; never add a public reset bypass.
4. Configure the Notion connection with read/update/insert content on **only the source Invitations database**, no user profiles/comments/agents. Store its token in the event secret. Prepare the website projection columns through the admin action after a private schema baseline. Existing RSVP delivery state and Adults/Teens/Kids capacities remain untouched.
5. Microsoft account must be `administrator@simplysoph.com` in the family tenant. The machine’s unrelated Azure CLI login must not be used. Configure Exchange Application RBAC limited to `misxv@simplysoph.com` and verify access to another mailbox is denied. Avoid tenant-wide Graph Mail.Send permissions that bypass the narrow RBAC grant. Store the app credential in Secret Manager with an expiry covering the event; inventory its exact application and role assignment. Review SPF/DKIM/DMARC before any invitation dispatch.
6. Build the Dockerfile and deploy dedicated `misxv-api` in `us-central1`, minimum instances 0, maximum instances 2, concurrency 8, 1 CPU/512 MiB initially. These are starting limits, not a spending cap. Use request-based CPU, pin secret versions and immutable image digest. Public invocation exposes API routes; application authentication remains mandatory on every private route. Only the configured origin may mutate data. Inventory the exact public invoker binding separately.
7. After backend verification, add a Firebase Hosting rewrite for `/api/**` to `misxv-api`, `us-central1`. Keep target `misxv` and deploy only `hosting:misxv`. Never rewrite all URLs to the homepage. Firebase preserves the specially named `__session` cookie; API responses use private/no-store. Test caching and cookies through the real custom hostname.

The repository’s static `firebase.json` intentionally has no live rewrite until the service is provisioned. Do not mistake static publication for enabling RSVP. Use a separate deployment config for the validated rewrite; do not point a public preview at real guest data.

## Acceptance gate before opening real invitations

- Node 24 CI, route/asset checks and dependency audit pass; real browser desktop/mobile/Spanish navigation works.
- Google login rejects unauthorized accounts; MFA enrollment/sign-in/replay/expired-session behavior verified with the real OAuth client.
- A clearly identified disposable Notion test household is used for real end-to-end validation. Verify lookup, allocation limits, decline, mixed attendance, concurrent edit protection, replay, ledger restart, Notion projection and admin counts. Record its private ID and archive only that fixture afterward.
- Verify a Notion outage keeps the saved receipt pending; retry from the dashboard and compare projection to the latest ledger response. There is no unattended retry worker in this version: the family must review pending sync.
- Upload a disposable image, confirm metadata stripping and private pending status, approve and remove it, and verify no contact message can become public.
- Only after the organizer identifies a test recipient, send one reviewed message; verify Sent Items, receipt and headers. Graph 202 means accepted, not delivered. No real invitations during testing.
- Confirm church/dinner details, real content, retention date and privacy copy. Review artwork’s incorrect weekday. Verify guest links are never logged, exported to public artifacts or shared as demo links.

## Reliability and limits

Google Storage generation preconditions serialize the single event ledger across instances; failed storage never returns a saved receipt. Its 20 MB limit is intended for one small event, with image bytes stored separately. Invitations use 256-bit random link secrets stored only as hashes; draft email bodies are sealed. Revocation/rotation invalidates sessions and unsent drafts. Notion is the authoritative invited-capacity source; the ledger is authoritative for accepted website responses.

Rate controls use a shared global write budget and per-household/administrator budgets, with MFA challenge attempt limits. They do not trust caller-supplied forwarding headers or identify every attacker. Confirm real traffic/load behavior and configure provider budget/abuse alerts before guest distribution. Runtime operations must not log request bodies, credentials or private invitation fragments. Persistent state includes personal data; restrict operator access and treat backups accordingly.

Email drafts require review. A send is atomically claimed once. Accepted, failed and unknown outcomes are recorded. If a process stops after claiming a send, it stays `sending`; check Microsoft Sent Items before any manual reconciliation. Do not change unknown/sending records back to draft without proving the first send did not happen. Drafts become stale when invitation generation or recipient changes.

## Release, rollback and retirement

Review PR, merge only when approved, build from its exact commit, deploy backend then the scoped Hosting release, and record both revisions. For rollback restore compatible backend and frontend revisions; do not roll the live ledger back over newer RSVPs. Keep additive Notion columns and their baseline. See CLEANUP.md for closing intake, exports, credential revocation and exact removal. Nothing schedules deletion, buys a subscription or cancels the existing domain/Microsoft tenant.

Provider references: [Firebase Cloud Run rewrites](https://firebase.google.com/docs/hosting/cloud-run), [Hosting cookies and caching](https://firebase.google.com/docs/hosting/manage-cache), [GCS generation preconditions](https://docs.cloud.google.com/storage/docs/request-preconditions), [Exchange application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).
