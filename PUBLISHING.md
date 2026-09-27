# Published website

The multi-page website is live at **https://misxv.simplysoph.com** and **https://misxv-simplysoph.web.app**. The previous five-page demo was replaced on September 27, 2026 with the current 53 routes plus a 404 document and corrected invitation. Normal HTTPS validation of the new Details route succeeded after release.

RSVP and email are not activated yet. Forms report service unavailability; no fake save or confirmation is returned. Do not distribute it as a working RSVP service until the secure integration has passed an end-to-end test. These integration gates do not block publishing static page improvements.

## Automatic publishing

`.github/workflows/check.yml` runs the Node 24 checks and production dependency audit. After those succeed on a push to `feature/complete-quince-site` or `main`, its dependent production job builds the same commit and publishes only `misxv-simplysoph`. PRs and other branches cannot deploy. After this feature branch is merged, retire its production trigger and matching identity-provider condition; main remains the normal release branch.

The job serializes production releases, skips superseded commits, and verifies `X-Release-Commit` on the real custom domain. Its Actions summary records the source commit and Firebase release. A failed deployment leaves the previous release live and marks the job failed; inspect release history if failure occurs after the API created the release.

Google authentication uses short-lived GitHub OIDC with repository ID 1389834350, owner ID 34853639, approved refs, push event and exact workflow path. There is no stored service-account key. The dedicated custom role contains only Hosting get/update permissions, with no site creation/deletion, guest data, secrets, email or project administration access. Firebase Hosting IAM is project-level: the event-site restriction is enforced in the reviewed publisher code, not a site-level IAM boundary. Protect write access to the release branches and workflow. All identities, trust objects, the custom role and bindings are in the cleanup inventory.

The REST publisher rejects unsupported routing configuration instead of silently dropping future API rewrites. Extend its mapping and tests when the verified API is ready. Reference: [Firebase Hosting REST deployment](https://firebase.google.com/docs/hosting/api-deploy).

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

The Hosting predeploy hook runs `npm run check`, which builds pages and runs route/asset and behavior checks. Do not use an unscoped `firebase deploy` in this shared project. Firebase CLI 15.31.0 performed the initial deployment. Node 24 is the CI target; production runs static files without Node, Gemini, a container or a new load balancer. Existing shared billing still applies; this does not promise zero charges.

## Hostinger records created

| Type | Relative name | Value | TTL |
|---|---|---|---|
| CNAME | `misxv` | `misxv-simplysoph.web.app` | 300 |
| TXT | `_acme-challenge.misxv` | `GgMeXlKk-yzZzIsPylLvlucbfegUX8oCxv0mSBZJamk` | 300 |

These exact values came from Firebase Hosting's custom-domain API. The TXT is a public certificate-validation record, not a private integration credential. Keep it while the domain is in use unless Firebase instructs otherwise. All twelve pre-existing records, including the root website, Microsoft 365 MX/autodiscover and existing verification records, were preserved. Nameservers remain Hostinger's.

Firebase may need time to observe DNS and issue its certificate. Do not disable TLS verification or bypass a browser certificate warning. Use the working web.app URL until the custom URL passes normal HTTPS validation. [Firebase custom-domain setup](https://firebase.google.com/docs/hosting/custom-domain).

## Verify after each release

Check Home, Details, RSVP, FAQ, Spanish and Privacy over HTTPS, an unknown route for HTTP 404, loaded artwork, the Friday January 15, 2027 date, and honest unavailable-service feedback until activation. Confirm X-Release-Commit matches the checked push. Check on a phone before guest distribution. Search-engine exclusions are not access control. No credentials or guest records belong in static output.

## Rollback and retirement

For a content rollback, select this exact event site in Firebase Hosting release history and roll back to a known working prior release, or redeploy a reviewed source revision to `hosting:misxv`. The initial release has no prior event version.

For retirement, run `npm run cleanup:plan` or the manual GitHub cleanup-review workflow, export anything the family wants to retain, then review the inventory. Remove the two event DNS records, detach the event custom domain, and disable or delete only the dedicated event site as appropriate. Permanent site deletion is irreversible and its ID cannot be reused. Preserve the shared project/default site. The checklist includes the event mailbox and its delegation as separate resources. See `CLEANUP.md` for complete controls. No automatic deletion is scheduled.
