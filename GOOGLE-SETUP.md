# Google hosting, mail, and secrets

The family approved Google hosting and subsequently confirmed its existing Microsoft 365 email; preserve that mail setup. This supersedes the Resend-first recommendation. The family already owns `simplysoph.com`; the event will use **misxv.simplysoph.com**. No domain purchase or transfer is needed. No cloud resource, DNS record, Workspace subscription, or live email has been created by this buildout.

## Confirmed target and discovery — September 26, 2026

- Account: `saulpatinojr@gmail.com`. Browser sign-in refreshed successfully.
- Existing project: **SimplySoph**, `simplysoph-66c78`, project number `424903425639`. Live reads confirm ACTIVE and billing enabled; do not create a replacement project or attach a different billing account.
- Explicitly set both `--project=simplysoph-66c78` and `--billing-project=simplysoph-66c78` alongside the account in commands. The workstation has an unrelated inherited quota-project setting; per-command overrides resolved it without changing the global configuration.
- Existing infrastructure includes three Cloud Run services in us-central1, two artifact repositories, ten global secrets, a default Firestore database, service identities, and six storage buckets. They predate this event and are protected. Only metadata was read, not secret values or guest records. A partial baseline is saved locally outside the repository. Full baseline and shared-resource checks remain pending.
- Public DNS reports `ns1.dns-parking.com` and `ns2.dns-parking.com` for the root domain; the event hostname does not currently resolve. Keep the existing DNS provider and add only the necessary event records after obtaining verified hosting values.
- **Every new resource/change must have a cleanup record.** See `CLEANUP.md` and `ops/event-resources.json`; use dedicated event resources and preserve this shared project.

## Selected direction

| Component | Choice | Role |
|---|---|---|
| Website and secure API | Cloud Run | Serve the static guest pages and, once implemented, same-origin RSVP endpoints |
| Build and images | Cloud Build / Artifact Registry | Build this repository and retain deployable images |
| Runtime secrets | Google Secret Manager | Store Notion token and application-specific signing/OAuth credentials |
| Organizer workspace | Existing Notion database | Preserve existing records and map their actual schema |
| Durable coordination | Small server-only Cloud Firestore store, planned | Commit RSVP snapshots, deduplicate writes/email intents, and coordinate Notion sync; not implemented yet |
| Email and replies | Existing Microsoft 365 tenant; proposed event shared mailbox | Monitored event inbox without migrating existing domain mail |
| Sending transport | Microsoft Graph with mailbox-scoped authorization | Send from the Google backend; no SMTP relay required |
| Domain registration | Existing simplysoph.com registration | Preserve ownership, registrar and renewal settings |
| DNS | Hostinger (family confirmed) | Add misxv subdomain and verified service records; preserve root website/mail |

Google Cloud uses a **project linked to a billing account**. Google Workspace is a **separate subscription**. Owning a domain does not automatically provide a mailbox or hosting. The family already has Microsoft 365 mail. Inspect its licensing before buying another seat; preserve its MX records. No Workspace subscription is planned.

The custom-domain hosting path must be selected before DNS changes. Cloud Run's direct domain mapping is still Preview/limited availability; assess Firebase Hosting in front of Cloud Run or a supported load balancer against the lean-site budget. Do not point an arbitrary CNAME directly at a run.app URL and assume TLS will work. [Google custom-domain options](https://docs.cloud.google.com/run/docs/mapping-custom-domains).

Google Vault is for Workspace retention/eDiscovery. It is not the place to store Notion tokens or API keys; Secret Manager is the appropriate service. No Vault license is needed solely for website secrets. [Vault](https://support.google.com/vault/answer/2462365), [Secret Manager](https://docs.cloud.google.com/secret-manager/docs/overview).

## Prepared in the repository

- Cloud Run-compatible startup: injected `PORT`, bind to `0.0.0.0` when `K_SERVICE` exists, and graceful termination. Local development still binds to loopback.
- `/healthz` reports `mode: preview`; it does not claim Notion or email readiness.
- Google Buildpacks Node 24 selection. Existing `npm run build` generates `dist/`, and `npm start` launches the server. No Dockerfile or runtime AI dependency is required. [Node buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs), [runtime contract](https://docs.cloud.google.com/run/docs/container-contract).
- `.gcloudignore` keeps Git history, scratch files, local environment files, and sample CSVs out of source upload. The application only serves `dist/`.
- Local checks exercise ephemeral port startup, health, homepage, HEAD, method rejection, and 404 responses. Cloud Build and a deployed revision have not been tested yet.

## Provisioning sequence

1. Account, existing project, billing attachment and hostname are confirmed above. Resolve monthly operating budget, Hostinger DNS management access and Microsoft 365 sender/admin access.
2. Complete the private baseline and keep the existing project. Reserve an event prefix, record exact resource identities and removal steps in the inventory as provisioning proceeds; do not reuse existing application secrets or service identities by convenience.
3. Set budget alerts, scoped service identities, and resource limits. Start with request-based billing, minimum instances zero and a low maximum for the preview. Budget alerts are not a hard spending cap. Pricing depends on the final region and traffic; do not promise zero spend.
4. Enable the required APIs and prepare build/runtime identities. Do not use broad runtime Owner/Editor roles. Give the runtime access only to the specific secrets and server-side data it requires.
5. Create empty secret containers for the needed integration values. Enter the Notion integration token through Secret Manager's secure UI; do not paste it into chat, GitHub, frontend configuration, or CLI command arguments. Map a pinned secret version to the service when deploying.
6. Inspect the Notion database after access is supplied. Map property types/IDs and preserve the records; test on one sample household. A website integration token and a chat connector are separate forms of access.
7. Deploy an authenticated preview first, verify the revision and logs, then configure the guest-facing access path when real invitations are ready. Do not mistake robots/noindex for authentication. The existing source contains invitation/event details and should not acquire real guest data.
8. Configure the selected custom-domain hosting path and only its verified DNS records for `misxv.simplysoph.com`. Record prior DNS state, exact name/type/value, certificate/mapping resources and their cleanup steps. Do not transfer the domain or change nameservers.
9. Inspect the existing Microsoft 365 tenant/licenses; add an event shared mailbox if appropriate, preserve existing mail DNS and establish mailbox-scoped Graph sending access. See `M365-EMAIL.md`.
10. Implement/test private invitation access, durable RSVP commits, Notion reconciliation, and approved email dispatch before opening live RSVPs. Verify one full end-to-end journey with an authorized test recipient.

Account, project and hostname are now known. Finalize region, limits, custom-domain hosting path and sender before their respective resource commands. Do not use the CLI's active account/project as an implicit deployment target.

## Email follows the existing Microsoft 365 setup

Use `M365-EMAIL.md` as the current email implementation plan. It supersedes the earlier Gmail/Workspace and Resend proposals. Hostinger manages DNS; Microsoft 365 handles mail; Google hosts the app and stores integration credentials. Reuse the provider-independent email templates and durable outbox design, with Graph-specific acceptance/retry handling.

## Inputs still needed

Hostinger DNS access; monthly hosting budget; Microsoft 365 app authorization (event mailbox and organizer permissions are configured); Notion page/database URL and integration access; preferred retention window after the event. No secret value is requested in chat. Google account/project/billing/domain inputs are already resolved.

Microsoft 365 mailbox discovery and creation are recorded in `M365-EMAIL.md`. This does not complete the broader Google resource baseline.
