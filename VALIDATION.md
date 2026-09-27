# Validation record

Latest backend preparation: 26 local tests pass. New checks cover invalid/expired/revoked invitation tokens, tampered/wrong-key/expired sessions, rotation and household isolation, exact-origin CSRF, restricted cookies, duplicate/extra/missing guests, uninvited events, all-declined and mixed responses, stale versions, deadline boundaries, input limits, Notion metadata-only reads, redirects, bounded retries and sanitized failures. These are isolated module tests; durable storage, endpoints, live Notion access and email remain unimplemented. An empty event Secret Manager container was created and its metadata verified; no guest data or token was accessed.

Notion household follow-up: browser sign-in succeeded and the existing Invitations source was identified. Its visible columns support household counts, so the selected integration design now preserves that structure. All 30 local checks passed, including four household-count tests covering per-event attendance, category-specific limits, reduced capacity, unauthorized events, missing configuration, stale versions and deadline boundaries. API property types and options remain unverified. The dedicated connection form is prepared, awaiting action-time approval; no Notion credential, page grant or database write was created. Live RSVP remains disabled. These changes affect server foundations and documentation only, so no new static deployment was needed.

Custom-domain follow-up at 2026-09-27 02:56 UTC: `https://misxv.simplysoph.com` returned HTTP 200 with normal TLS verification. Browser loaded the expected Sophia page, correct Friday date and demo banner. Firebase reports HOST_ACTIVE and OWNERSHIP_ACTIVE; certificate propagation may still be completing at other edges. Screenshot saved privately in the parent workspace outputs as `custom-domain-live.png`.

September 26, 2026. This records local preview evidence, not production readiness.

## Passed

- Dependency-free static build: five guest routes plus 404 generated successfully.
- All local route and asset references checked; invitation image loaded in the browser.
- HTTP checks: Home, Details, RSVP, FAQ, Privacy returned 200; an unknown route returned 404 with the themed page.
- JavaScript syntax checks for RSVP behavior and preview server.
- Six Node tests: both locales/all seven email templates; HTML escaping; unsafe link rejection; live-date/deadline guards; committed-response guard; change-copy requirement.
- Fourteen HTML/plain-text email preview pairs rendered without any network dispatch.
- Browser RSVP: invalid-code feedback, valid sample household, required-answer validation, all-declined review, mixed attendance, review, honest demo completion, and preserved answers when reopening edit.
- Browser visual checks: desktop Home and RSVP; 390px phone Home and RSVP. At the phone width, Home and RSVP had no horizontal document overflow. Invitation loaded successfully.
- No captured browser console errors at final Home check.

The browser check caught and fixed a malformed attending option before delivery.

## Not yet verified / not implemented

Google preparation follow-up: fourteen local tests now pass, including the HTTP server check and seven cleanup inventory tests for empty/unverified state, dependency order, protected targets, invalid dependency graphs, and scoped Microsoft 365 grant removal. The local cleanup report generated successfully. Cloud Run platform bind/startup support and Google Buildpacks Node 24 selection were added. Tests ran on the workstation's Node 26; an actual Node 24 Cloud Build and deployed revision remain unverified. The family-selected Google account is authenticated; live reads verify the existing project and enabled billing. Metadata-only discovery found existing resources that must be preserved. No Google cloud mutation has been made. A Microsoft 365 event shared mailbox was subsequently created, verified in the admin UI and recorded with exact mailbox ID and scoped baseline. No license was purchased or email sent. The cleanup GitHub workflow successfully ran its initial eleven checks on Node 24 and generated its review: https://github.com/saulpatinojr/SimplySoph-Quince/actions/runs/36279345214 . It has no cloud credentials or deletion capability. The Microsoft 365 follow-up adds the twelfth local check; the updated workflow uses pinned Node 24-compatible actions and Ubuntu 24.04.

Live Notion writes, guest authorization, durable persistence, concurrent edits, rate limiting, sender/domain/DNS configuration, real email deliverability, signed webhook processing, privacy retention operations, full English/Spanish website parity, all email-client rendering, 200% text zoom, complete accessibility audit, and production hosting. No real guest response or email was transmitted.

The family subsequently confirmed Friday, January 15, 2027. Website copy, configuration, email previews, and planning documents now use the confirmed date. The original invitation artwork still says Saturday and is explicitly identified as incorrect on the website. Preview/demo notices remain because live RSVP is not connected. Calendar/countdown remain unimplemented. Map target is based on supplied invitation text; venue identity and directions still need family verification.

Mailbox follow-up: all 13 local checks pass, including scoped baseline validation. The cleanup report now lists the real event mailbox; a mailbox-scoped baseline cannot validate a Google resource. Previous Node 24 GitHub run passed all 12 then-current checks: https://github.com/saulpatinojr/SimplySoph-Quince/actions/runs/36279527886 . Organizer Read and Manage and Send As permissions were subsequently approved, applied and individually verified for administrator@simplysoph.com. No mail was sent; app sending remains unconfigured.

Delegation follow-up: all 14 local checks passed. Cleanup validates the exact mailbox/principal/permissions and orders delegate removal before mailbox removal. Read and Manage plus Send As identity panels both showed administrator@simplysoph.com.

## Published static preview — September 26, 2026 (local time)

Firebase CLI 15.31.0 deployed only target `hosting:misxv` (site `misxv-simplysoph`). All 14 then-current checks passed during predeploy; 11 static files released. Live HTTPS checks returned 200 for Home, Details, RSVP, FAQ and Privacy; unknown route returned the themed HTTP 404. The invitation asset and event configuration loaded. The live browser showed the correct Friday date, loaded invitation and no horizontal overflow at its desktop viewport. Screenshot: `outputs/published-website.png` in the parent workspace.

The dedicated custom-domain association was created after a 404 baseline. Hostinger saved CNAME `misxv` and TXT `_acme-challenge.misxv`, both TTL 300, using values returned by Firebase. Authoritative DNS returned both values; the table retained all 12 pre-existing records. Certificate/domain activation is recorded in PUBLISHING.md. No real RSVP or email was sent. An additional cleanup test now protects the default Hosting site and verifies DNS-before-domain-before-site removal order.
