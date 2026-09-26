# Google hosting, mail, and secrets

The family approved continuing on Google, including a Google-managed domain workflow and Workspace email where practical. This supersedes the Resend-first recommendation. No cloud resource, domain registration, Workspace subscription, or live email has been created by this change.

## Selected direction

| Component | Choice | Role |
|---|---|---|
| Website and secure API | Cloud Run | Serve the static guest pages and, once implemented, same-origin RSVP endpoints |
| Build and images | Cloud Build / Artifact Registry | Build this repository and retain deployable images |
| Runtime secrets | Google Secret Manager | Store Notion token and application-specific signing/OAuth credentials |
| Organizer workspace | Existing Notion database | Preserve existing records and map their actual schema |
| Durable coordination | Small server-only Cloud Firestore store, planned | Commit RSVP snapshots, deduplicate writes/email intents, and coordinate Notion sync; not implemented yet |
| Email and replies | One Google Workspace Gmail mailbox | Monitored family inbox and authenticated sender; aliases where useful |
| Sending transport | Gmail API with narrowly scoped authorization | Default for this low-volume app; SMTP relay remains an alternative |
| Domain registration | Cloud Domains, subject to name/price approval | Registration managed and billed through the Google Cloud project; Squarespace is involved |
| DNS | Cloud DNS | Domain verification, website, mail authentication, and routing records |

Google Cloud uses a **project linked to a billing account**. Google Workspace is a **separate subscription**. Purchasing a domain does not automatically buy a mailbox or host the website. Cloud Domains can bill through Cloud Billing but involves Squarespace terms/registration. [Cloud Domains overview](https://docs.cloud.google.com/domains/docs/overview).

Google Vault is for Workspace retention/eDiscovery. It is not the place to store Notion tokens or API keys; Secret Manager is the appropriate service. No Vault license is needed solely for website secrets. [Vault](https://support.google.com/vault/answer/2462365), [Secret Manager](https://docs.cloud.google.com/secret-manager/docs/overview).

## Prepared in the repository

- Cloud Run-compatible startup: injected `PORT`, bind to `0.0.0.0` when `K_SERVICE` exists, and graceful termination. Local development still binds to loopback.
- `/healthz` reports `mode: preview`; it does not claim Notion or email readiness.
- Google Buildpacks Node 24 selection. Existing `npm run build` generates `dist/`, and `npm start` launches the server. No Dockerfile or runtime AI dependency is required. [Node buildpacks](https://docs.cloud.google.com/docs/buildpacks/nodejs), [runtime contract](https://docs.cloud.google.com/run/docs/container-contract).
- `.gcloudignore` keeps Git history, scratch files, local environment files, and sample CSVs out of source upload. The application only serves `dist/`.
- Local checks exercise ephemeral port startup, health, homepage, HEAD, method rejection, and 404 responses. Cloud Build and a deployed revision have not been tested yet.

## Provisioning sequence

1. Confirm the owning Google account, intended project (or create one named SimplySoph Quince), monthly operating budget, domain names, annual domain budget, and existing Workspace status.
2. Create/select a dedicated project using that explicit account. The family attaches its chosen billing account through Google's billing interface.
3. Set budget alerts, scoped service identities, and resource limits. Start with request-based billing, minimum instances zero and a low maximum for the preview. Budget alerts are not a hard spending cap. Pricing depends on the final region and traffic; do not promise zero spend.
4. Enable the required APIs and prepare build/runtime identities. Do not use broad runtime Owner/Editor roles. Give the runtime access only to the specific secrets and server-side data it requires.
5. Create empty secret containers for the needed integration values. Enter the Notion integration token through Secret Manager's secure UI; do not paste it into chat, GitHub, frontend configuration, or CLI command arguments. Map a pinned secret version to the service when deploying.
6. Inspect the Notion database after access is supplied. Map property types/IDs and preserve the records; test on one sample household. A website integration token and a chat connector are separate forms of access.
7. Deploy an authenticated preview first, verify the revision and logs, then configure the guest-facing access path when real invitations are ready. Do not mistake robots/noindex for authentication. The existing source contains invitation/event details and should not acquire real guest data.
8. Confirm domain availability and actual price; complete registration with accurate registrant details and chosen renewal/privacy settings. The family completes billing inputs, required terms acceptance, and contact-email verification. Configure only verified DNS values.
9. Add/reuse one Workspace mailbox, verify the domain and Gmail, configure SPF/DKIM/DMARC, and establish the narrow Gmail sending authorization described below.
10. Implement/test private invitation access, durable RSVP commits, Notion reconciliation, and approved email dispatch before opening live RSVPs. Verify one full end-to-end journey with an authorized test recipient.

Account, project ID, region, billing account, domain, and mailbox must be resolved before filling in resource commands. Do not use the CLI's active account/project as an implicit deployment target.

## Gmail API first, SMTP if needed

The Gmail API can send through a Workspace mailbox using OAuth and the `gmail.send` scope. SMTP is a transport alternative, not a prerequisite for sending event emails. A Cloud Run service account alone cannot send as a mailbox. [Sending email](https://developers.google.com/workspace/gmail/api/guides/sending), [send permission](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send).

Prefer one internal Workspace OAuth app authorized by the dedicated sender, if the project/organization setup allows it. Store the client secret and refresh token in Secret Manager, with failure/revocation handling. Confirm the account's consent-screen and verification requirements. External OAuth apps left in Testing can have refresh tokens expire after seven days; do not ship that setup as unattended production email. Avoid domain-wide delegation for this single-mailbox project unless a specific need justifies its broader authority. [OAuth expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

If the existing Workspace environment requires SMTP relay instead, verify its supported authentication and TLS configuration. IP-allowlisted relay would require stable egress from Cloud Run and may add networking cost; do not add NAT/static egress by default. [Google SMTP relay](https://support.google.com/a/answer/2956491).

Workspace sending/trial limits must be checked for the actual account before selecting a batch size. Queue and pace messages. Keep invitations, reminders, and changes subject to the family's approved audience/schedule; general infrastructure approval is not an instruction to send invitations immediately.

## Differences from the earlier Resend plan

- Reuse the existing English/Spanish HTML/text templates; they are provider-independent.
- Keep a durable application outbox with a unique message-intent key, current eligibility check, and approval record.
- Gmail's send API does not provide the Resend idempotency-key contract. If sending times out after acceptance may have occurred, mark the item **unknown / needs reconciliation**; do not blindly retry and claim exactly-once delivery. A custom Message-ID alone does not guarantee deduplication.
- Store Gmail's returned message ID and mark the request accepted. This is not proof of inbox delivery or reading.
- Do not claim Resend-style bounce/delivery webhooks are available from Gmail send. Initially use the monitored sender inbox for bounce follow-up. Automated bounce processing would need an explicitly scoped mailbox-read integration and a separate review.
- For reminders, recheck current RSVP and recipient suppression immediately before sending. Do not put private household tokens into link-tracking services.

## Inputs still needed

Owning Google account; project choice; billing attachment; domain candidates and annual limit; monthly Workspace/hosting budget; existing Workspace status; sender mailbox; Notion page/database URL and integration access. No secret value is requested in chat.
