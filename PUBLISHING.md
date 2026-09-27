# Published website

The design preview is live at **https://misxv.simplysoph.com** and **https://misxv-simplysoph.web.app**. Normal HTTPS validation and a browser page load succeeded at 2026-09-27 02:56 UTC (September 26 local time). Firebase reports active host mapping and ownership. Its certificate status was still propagating globally at the most recent API read; the local HTTPS endpoint is verified working.

RSVP is a demonstration only. It does not save responses, connect to Notion or send email. The site announces this prominently. Do not distribute it as a working RSVP service until the secure integration has passed an end-to-end test.

## Exact hosting target

- Google account: `saulpatinojr@gmail.com`
- Existing project: `simplysoph-66c78`
- Event site: `misxv-simplysoph` (USER_SITE)
- Hosting target in `.firebaserc`: `misxv`
- Upload directory: `dist/` only, generated from tracked source
- Default site `simplysoph-66c78` is protected and was not deployed

From this repository with the intended account authenticated:

```powershell
npx -y firebase-tools@latest deploy --only hosting:misxv --project simplysoph-66c78 --account saulpatinojr@gmail.com --non-interactive --dry-run
npx -y firebase-tools@latest deploy --only hosting:misxv --project simplysoph-66c78 --account saulpatinojr@gmail.com --non-interactive
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

Check Home, Details, RSVP, FAQ and Privacy over HTTPS, an unknown route for HTTP 404, loaded artwork, the Friday January 15, 2027 date, and the honest RSVP demo marker. Check on a phone before guest distribution. Search-engine exclusions are not access control. No credentials or guest records belong in static output.

## Rollback and retirement

For a content rollback, select this exact event site in Firebase Hosting release history and roll back to a known working prior release, or redeploy a reviewed source revision to `hosting:misxv`. The initial release has no prior event version.

For retirement, run `npm run cleanup:plan` or the manual GitHub cleanup-review workflow, export anything the family wants to retain, then review the inventory. Remove the two event DNS records, detach the event custom domain, and disable or delete only the dedicated event site as appropriate. Permanent site deletion is irreversible and its ID cannot be reused. Preserve the shared project/default site. The checklist includes the event mailbox and its delegation as separate resources. See `CLEANUP.md` for complete controls. No automatic deletion is scheduled.
