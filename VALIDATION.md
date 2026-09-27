# Validation record — complete-site branch

This is implementation and local-test evidence, **not a claim that production RSVP/email is live**.

Activation follow-up: 61 tests now pass, including production startup rejection for each missing Microsoft mail credential. The Docker image was built and started locally: health reported preview, Details returned 200, runtime uid was 1000, and private work/Git/skill directories were absent. The test container was stopped and removed. No real guest registration or email was attempted.

## Automated checks

- 53 guest/admin routes plus root 404 document build; every generated local link and asset resolves.
- 58 Node tests cover durable-save failure, concurrent ledger updates, idempotent responses, household allocation, stale forms, origin/CSRF, revocation, MFA attempt/replay limits, Notion projection isolation, moderation, seating, stale email drafts and Microsoft timeout ambiguity, plus email registration/return/expiry/single use, code invalidation, private-page grants/revocation, delegated admin MFA, profile identity isolation and private replies.
- Dependency audit: zero known vulnerabilities at the latest local check. CI uses Node 24; local checks used Node 26.5.0.
- Cleanup inventory and dependent-first review generation pass, protecting the existing domain, Google project/default site, Microsoft tenant and original Notion database.
- Guest-account commit 6cfcf60 passed both GitHub Node 24 checks and GitGuardian. Qlty reports success but its description says one blocking issue; its detailed report requires a separate Qlty sign-in. Treat that report as unresolved until inspected.

## Browser verification

Using the actual browser against the local build:

- Home artwork/date/navigation load; 390px mobile Home and Ceremony have no horizontal overflow.
- Found and fixed an off-screen phone dropdown. Verified its bounds are inside a 390px viewport and it navigates to Ceremony.
- Against an isolated synthetic-provider fixture: private invitation exchange, per-event counts, review, saved confirmation, Spanish confirmation, dashboard counts, seating save and announcement save.
- Additional synthetic browser run: RSVP → email registration → explicit link verification → account screen; denied Costs page; admin checkbox grant/private content save; private family reply; returning email link → visible granted page and reply. No external mail or Notion calls were made.
- Corrected invitation PNG is byte-identical to the supplied Designer.png (SHA256 109d0403029fe2af86730c8b6e59d5c272dee66345bfa1d01e14ed07c58a990e). Clicked the home image and verified the full 1024×1536 image opens.
- Synthetic test used no live Notion requests or email dispatch. The browser-only fixture wrapper stays in ignored work/ and must never be shipped. These checks do not verify real Google OAuth, GCS, Notion writes or Microsoft sending.
- Ordinary unconfigured preview returns unavailable API errors rather than saving to a fake store.

## Provider state and remaining acceptance

- The multi-page static release replaced the earlier demo on September 27, 2026. The custom-domain Details page returned HTTP 200 after publication. Automatic publishing is now part of the checked push workflow; release identity and commit verification are recorded by the production job.
- Notion API schema was previously read successfully through the user’s stored personal token. A dedicated event connection has now been created with explicit approval. Its Invitations-only access and replacement secret version still need verification; no guest rows or schema columns were written by this branch.
- Google OAuth client “Mis XV family administration” was created after explicit approval, using only the event JavaScript origin; its public client ID is inventoried. No client secret was retrieved or used. Real login acceptance remains pending.
- Dedicated private bucket `misxv-2027-simplysoph-66c78`, runtime service account, and bucket-only objectUser binding were created and inventoried. Public access prevention and uniform access were verified. Cloud Run, application secret and runtime provider-secret bindings remain pending.
- Existing Microsoft shared mailbox and organizer delegation are recorded. Mailbox-scoped application authentication, email DNS authentication review and a real reviewed-recipient test are still required. No email was sent.
- Family content and retention date remain outstanding. Routes with missing content state that it is pending. Menu choices cannot be finalized until supplied.

Follow DEPLOYMENT.md’s live acceptance gate before distributing working invitations. Keep this PR draft while provider setup and these tests remain incomplete.

## Earlier site review — September 27, 2026 (before publication)

- Verified origin contains the complete implementation on `feature/complete-quince-site` through f1e5cb2 before this review. Both GitHub Node 24 checks and GitGuardian passed. Qlty's success status still carries a one-blocking-issue description; its authenticated report remains unresolved.
- Re-ran all 58 tests, all 54 generated-document/local-link checks and the production dependency audit (zero reported vulnerabilities).
- Reviewed the desktop home page and 390px expanded phone navigation. The dropdown stays within the viewport. At 320px, checked English/Spanish Home, Details, Ceremony, Reception, RSVP, Account, Gifts, Spanish FAQ, Gallery, Admin Login, Privacy and 404; no horizontal overflow was found. Spanish home navigation also stayed within 768/820/900/1024/1440px viewports. Temporary browser size overrides were cleared afterward.
- Unconfigured preview RSVP/account/admin requests correctly show unavailable notices. This review did not send email or access real guest data. Earlier synthetic authenticated-flow coverage remains documented above.
- At that earlier review, the public custom-domain RSVP page still displayed the design preview. Publication was incorrectly held with backend activation. The publication record below supersedes that state; the provider gates now apply only to activating live RSVP/email.
- No additional layout/navigation defect was found in the reviewed pages. The main issues are launch readiness and incomplete content, not missing route files.

## Publication and automatic release — September 27, 2026

- Manually published the current multi-page build, then added and exercised automatic publishing on a push. GitHub run [36308570469](https://github.com/saulpatinojr/SimplySoph-Quince/actions/runs/36308570469) passed both checks and production deployment. It published commit `1bb6f7916d762ac91f74325ee1d37bbbcec127ef`, release `sites/misxv-simplysoph/releases/1790500356008000` at 09:12:36 UTC.
- The suite now has 60 passing tests, including two deployment guards. A credential-free dry run validated the complete 64-file upload manifest. PR runs correctly skip the deployment job.
- All 54 public HTML documents matched the generated local files byte-for-byte; an unknown route returned HTTP 404. The public invitation hash exactly matches the corrected original.
- The custom-domain X-Release-Commit header matched the pushed commit. Browser navigation from Home to Details to Spanish Details showed the Friday date and separate pages on the public domain.
- The dedicated GitHub identity used short-lived federation successfully with only Hosting get/update permissions. No service-account key, API-key viewer grant, guest-data access or default-site deployment was needed. Created identities, trust and grants are recorded for cleanup.
- Live Notion-backed RSVP, email links and family administration remain unactivated, as described in the provider acceptance section. Static publication no longer waits on those integrations.
