# Validation record — complete-site branch

This is implementation and local-test evidence, **not a claim that production RSVP/email is live**.

## Automated checks

- 47 guest/admin routes plus root 404 document build; every generated local link and asset resolves.
- 52 Node tests cover durable-save failure, concurrent ledger updates, idempotent responses, household allocation, stale forms, origin/CSRF, revocation, MFA attempt/replay limits, Notion projection isolation, moderation, seating, stale email drafts and Microsoft timeout ambiguity.
- Dependency audit: zero known vulnerabilities at the latest local check. CI uses Node 24; local checks used Node 26.5.0.
- Cleanup inventory and dependent-first review generation pass, protecting the existing domain, Google project/default site, Microsoft tenant and original Notion database.
- The first pushed commit passed GitHub Node 24 checks and GitGuardian. Qlty reports success but its description says one blocking issue; its detailed report requires a separate Qlty sign-in. Treat that report as unresolved until inspected.

## Browser verification

Using the actual browser against the local build:

- Home artwork/date/navigation load; 390px mobile Home and Ceremony have no horizontal overflow.
- Found and fixed an off-screen phone dropdown. Verified its bounds are inside a 390px viewport and it navigates to Ceremony.
- Against an isolated synthetic-provider fixture: private invitation exchange, per-event counts, review, saved confirmation, Spanish confirmation, dashboard counts, seating save and announcement save.
- Synthetic test used no live Notion requests or email dispatch. The browser-only fixture wrapper stays in ignored work/ and must never be shipped. These checks do not verify real Google OAuth, GCS, Notion writes or Microsoft sending.
- Ordinary unconfigured preview returns unavailable API errors rather than saving to a fake store.

## Provider state and remaining acceptance

- Existing domain/site remain the prior production release; this branch has not replaced them.
- Notion API schema was previously read successfully through the user’s stored personal token. A dedicated event connection has now been created with explicit approval. Its Invitations-only access and replacement secret version still need verification; no guest rows or schema columns were written by this branch.
- Google OAuth client form is prepared for only the event origin; creation awaits action-time approval.
- Dedicated runtime bucket/service account, Cloud Run configuration and secret bindings are not provisioned by this branch yet.
- Existing Microsoft shared mailbox and organizer delegation are recorded. Mailbox-scoped application authentication, email DNS authentication review and a real reviewed-recipient test are still required. No email was sent.
- Family content and retention date remain outstanding. Routes with missing content state that it is pending. Menu choices cannot be finalized until supplied.

Follow DEPLOYMENT.md’s live acceptance gate before distributing working invitations. Keep this PR draft while provider setup and these tests remain incomplete.
