# Published website

The multi-page website is live at **https://misxv.simplysoph.com** and **https://misxv-simplysoph.web.app**. Each build contains every English and Spanish page plus a 404 document. Normal HTTPS validation succeeds on the custom domain.

The Cloud Run RSVP and sign-in service is deployed and connected through `/api/**`, and unauthenticated private endpoints reject access. Before distributing invitations, run the live acceptance checklist in [deployment.md](deployment.md): real email delivery, administrator and guest sign-in, Notion projection and media moderation. Those checks do not block publishing page improvements.

## Automatic publishing

`.github/workflows/check.yml` runs the Node 24 checks and production dependency audit. After those succeed on a push to `main`, its dependent production job builds the same commit and publishes only `misxv-simplysoph`. PRs and other branches cannot deploy. Main is the only production release branch; retired feature branches cannot publish.

The job serializes production releases, skips superseded commits, and verifies `X-Release-Commit` on the real custom domain. Its Actions summary records the source commit and Firebase release. A failed deployment leaves the previous release live and marks the job failed; inspect release history if failure occurs after the API created the release.

Google authentication uses short-lived GitHub OIDC with repository ID 1389834350, owner ID 312844660 (the HybridCloudWorks organization, since the repository moved from the personal account whose ID was 34853639), main ref, push event and exact workflow path. Moving the repository again changes the owner ID, so the provider's attribute condition must be updated, and the publish job fails with `unauthorized_client` until it is. There is no stored service-account key. The dedicated Hosting custom role contains only Hosting get/update permissions. A separate custom role grants only `run.services.get` on the single `misxv-api` service so Hosting can validate its API rewrite, with no site creation/deletion, guest data, secrets, email or project administration access. Firebase Hosting IAM is project-level: the event-site restriction is enforced in the reviewed publisher code, not a site-level IAM boundary. Protect write access to the release branches and workflow. All identities, trust objects, the custom role and bindings are in the cleanup inventory.

The REST publisher preserves only the reviewed `/api/**` rewrite to `misxv-api` in `us-central1` and rejects unsupported routing configuration. API-specific Hosting headers preserve `private, no-store` and cookie variation; this was verified through the custom domain. Reference: [Firebase Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy).

PR #2 is merged into main and its feature branch is retired. Production publishing trusts only main.

## Exact hosting target

- Google account: the project owner's Google account (shown as `<project-owner-account>` below); the HybridCloudWorks account does not have access
- Existing project: `simplysoph-66c78`
- Event site: `misxv-simplysoph` (USER_SITE)
- Hosting target in `.firebaserc`: `misxv`
- Upload directory: `dist/` only, generated from tracked source
- Default site `simplysoph-66c78` is protected and was not deployed

From this repository with the intended account authenticated:

```powershell
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account <project-owner-account> --non-interactive --dry-run
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account <project-owner-account> --non-interactive
```

The Hosting predeploy hook runs `npm run check`, which builds pages and runs route/asset and behavior checks. Do not use an unscoped `firebase deploy` in this shared project. Firebase CLI 15.31.0 performed the deployment. Node 24 is the CI and API runtime target; guest pages are static and the dedicated Cloud Run container handles API requests. Gemini and a new load balancer are not required. Existing shared billing still applies; this does not promise zero charges.

Changes reach `main` only through pull requests whose `check` job passes (ruleset "Protect main"), and the publish job runs in the GitHub `production` environment, which only `main` can use. Publishing authenticates through Workload Identity Federation; its condition admits only pushes to `main` running this repository's `check.yml`.

## Event DNS records

| Type | Relative name | Value | TTL |
|---|---|---|---|
| CNAME | `misxv` | `misxv-simplysoph.web.app` | 300 |
| TXT | `_acme-challenge.misxv` | `GgMeXlKk-yzZzIsPylLvlucbfegUX8oCxv0mSBZJamk` | 300 |

These exact values came from Firebase Hosting's custom-domain API. The TXT is a public certificate-validation record, not a private integration credential. Keep it while the domain is in use unless Firebase instructs otherwise. All twelve pre-existing records, including the root website, Microsoft 365 MX/autodiscover and existing verification records, were preserved. They were first created at Hostinger on September 26, 2026. DNS for simplysoph.com has since moved to Cloudflare (live nameservers `june.ns.cloudflare.com` and `matt.ns.cloudflare.com`, checked October 13, 2026), so manage these records in Cloudflare.

Firebase may need time to observe DNS and issue its certificate. Do not disable TLS verification or bypass a browser certificate warning. Use the working web.app URL until the custom URL passes normal HTTPS validation. [Firebase custom-domain setup](https://firebase.google.com/docs/hosting/custom-domain).

## Verify after each release

Check Home, Details, RSVP, FAQ, Spanish and Privacy over HTTPS, an unknown route for HTTP 404, loaded artwork and the Friday January 15, 2027 date. Verify `/api/config`, private/no-store cache headers, and unauthenticated rejection on private endpoints; complete the acceptance checklist in [deployment.md](deployment.md) before distributing invitations. Confirm X-Release-Commit matches the checked push for automatic releases. Check on a phone before guest distribution. Search-engine exclusions are not access control. No credentials or guest records belong in static output.

## Rollback and retirement

For a content rollback, select this exact event site in Firebase Hosting release history and roll back to a known working prior release, or redeploy a reviewed source revision to `hosting:misxv`. The initial release has no prior event version.

For retirement, run `npm run cleanup:plan` or the manual GitHub cleanup-review workflow, export anything the family wants to retain, then review the inventory. Remove the two event DNS records, detach the event custom domain, and disable or delete only the dedicated event site as appropriate. Permanent site deletion is irreversible and its ID cannot be reused. Preserve the shared project/default site. The checklist includes the event mailbox and its delegation as separate resources. See [cleanup.md](cleanup.md) for complete controls. No automatic deletion is scheduled.
