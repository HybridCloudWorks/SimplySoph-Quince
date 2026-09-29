# Published website

The multi-page website is live at **https://misxv.simplysoph.com** and **https://misxv-simplysoph.web.app**. The current build contains 57 routes plus a 404 document and the corrected invitation. Normal HTTPS validation succeeds on the custom domain.

The Cloud Run RSVP/email backend is deployed and connected through `/api/**`. Live configuration confirms both providers are configured, and unauthenticated private endpoints reject access. Microsoft accepted the two approved setup emails; actual delivery, organizer MFA, guest registration/returning sign-in, Notion response projection and media moderation still require live acceptance. Do not distribute invitations until those checks pass. These acceptance gates do not block publishing static page improvements.

## Automatic publishing

`.github/workflows/check.yml` runs the Node 24 checks and production dependency audit. After those succeed on a push to `main`, its dependent production job builds the same commit and publishes only `misxv-simplysoph`. PRs and other branches cannot deploy. Main is the only production release branch; retired feature branches cannot publish.

The job serializes production releases, skips superseded commits, and verifies `X-Release-Commit` on the real custom domain. Its Actions summary records the source commit and Firebase release. A failed deployment leaves the previous release live and marks the job failed; inspect release history if failure occurs after the API created the release.

Google authentication uses short-lived GitHub OIDC with repository ID 1389834350, owner ID 34853639, approved refs, push event and exact workflow path. There is no stored service-account key. The dedicated custom role contains only Hosting get/update permissions, with no site creation/deletion, guest data, secrets, email or project administration access. Firebase Hosting IAM is project-level: the event-site restriction is enforced in the reviewed publisher code, not a site-level IAM boundary. Protect write access to the release branches and workflow. All identities, trust objects, the custom role and bindings are in the cleanup inventory.

The REST publisher preserves only the reviewed `/api/**` rewrite to `misxv-api` in `us-central1` and rejects unsupported routing configuration. API-specific Hosting headers preserve `private, no-store` and cookie variation; this was verified through the custom domain. Reference: [Firebase Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy).

The activation branch `feature/activate-rsvp` is intentionally not trusted for automatic deployment. Its checked release was manually published to the exact event target while PR #2 remains open for review. An older `main` deployment would replace these assets and API routing. Merge the reviewed PR before relying on main as the source of this release; do not broaden the identity trust to work around review.

## Exact hosting target

- Google account: `saulpatinojr@gmail.com`
- Existing project: `simplysoph-66c78`
- Event site: `misxv-simplysoph` (USER_SITE)
- Hosting target in `.firebaserc`: `misxv`
- Upload directory: `dist/` only, generated from tracked source
- Default site `simplysoph-66c78` is protected and was not deployed

From this repository with the intended account authenticated:

```powershell
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account saulpatinojr@gmail.com --non-interactive --dry-run
npx -y firebase-tools@15.31.0 deploy --only hosting:misxv --project simplysoph-66c78 --account saulpatinojr@gmail.com --non-interactive
```

The Hosting predeploy hook runs `npm run check`, which builds pages and runs route/asset and behavior checks. Do not use an unscoped `firebase deploy` in this shared project. Firebase CLI 15.31.0 performed the deployment. Node 24 is the CI and API runtime target; guest pages are static and the dedicated Cloud Run container handles API requests. Gemini and a new load balancer are not required. Existing shared billing still applies; this does not promise zero charges.

## Hostinger records created

| Type | Relative name | Value | TTL |
|---|---|---|---|
| CNAME | `misxv` | `misxv-simplysoph.web.app` | 300 |
| TXT | `_acme-challenge.misxv` | `GgMeXlKk-yzZzIsPylLvlucbfegUX8oCxv0mSBZJamk` | 300 |

These exact values came from Firebase Hosting's custom-domain API. The TXT is a public certificate-validation record, not a private integration credential. Keep it while the domain is in use unless Firebase instructs otherwise. All twelve pre-existing records, including the root website, Microsoft 365 MX/autodiscover and existing verification records, were preserved. Nameservers remain Hostinger's.

Firebase may need time to observe DNS and issue its certificate. Do not disable TLS verification or bypass a browser certificate warning. Use the working web.app URL until the custom URL passes normal HTTPS validation. [Firebase custom-domain setup](https://firebase.google.com/docs/hosting/custom-domain).

## Verify after each release

Check Home, Details, RSVP, FAQ, Spanish and Privacy over HTTPS, an unknown route for HTTP 404, loaded artwork and the Friday January 15, 2027 date. Verify `/api/config`, private/no-store cache headers, and unauthenticated rejection on private endpoints; complete the acceptance checklist in DEPLOYMENT.md before distributing invitations. Confirm X-Release-Commit matches the checked push for automatic releases. Check on a phone before guest distribution. Search-engine exclusions are not access control. No credentials or guest records belong in static output.

## Rollback and retirement

For a content rollback, select this exact event site in Firebase Hosting release history and roll back to a known working prior release, or redeploy a reviewed source revision to `hosting:misxv`. The initial release has no prior event version.

For retirement, run `npm run cleanup:plan` or the manual GitHub cleanup-review workflow, export anything the family wants to retain, then review the inventory. Remove the two event DNS records, detach the event custom domain, and disable or delete only the dedicated event site as appropriate. Permanent site deletion is irreversible and its ID cannot be reused. Preserve the shared project/default site. The checklist includes the event mailbox and its delegation as separate resources. See `CLEANUP.md` for complete controls. No automatic deletion is scheduled.
