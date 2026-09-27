# Validation record — complete-site branch

This is implementation and local-test evidence, **not a claim that production RSVP/email is live**.

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

- Existing domain/site remain the prior production release; this branch has not replaced them.
- Notion API schema was previously read successfully through the user’s stored personal token. A dedicated event connection has now been created with explicit approval. Its Invitations-only access and replacement secret version still need verification; no guest rows or schema columns were written by this branch.
- Google OAuth client “Mis XV family administration” was created after explicit approval, using only the event JavaScript origin; its public client ID is inventoried. No client secret was retrieved or used. Real login acceptance remains pending.
- Dedicated private bucket `misxv-2027-simplysoph-66c78`, runtime service account, and bucket-only objectUser binding were created and inventoried. Public access prevention and uniform access were verified. Cloud Run, application secret and runtime provider-secret bindings remain pending.
- Existing Microsoft shared mailbox and organizer delegation are recorded. Mailbox-scoped application authentication, email DNS authentication review and a real reviewed-recipient test are still required. No email was sent.
- Family content and retention date remain outstanding. Routes with missing content state that it is pending. Menu choices cannot be finalized until supplied.

Follow DEPLOYMENT.md’s live acceptance gate before distributing working invitations. Keep this PR draft while provider setup and these tests remain incomplete.
