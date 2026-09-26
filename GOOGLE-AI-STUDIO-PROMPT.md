# Google AI Studio handoff

Use the prompt below with the source files in `site/`, the original invitation, `WEBSITE-PLAN.md`, and `NOTION-INTEGRATION.md`. Keep the project private while it contains draft event information. Never attach guest database exports or credentials to a public project.

Official workflow reference: [Build apps in Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-build-mode). Its current documentation supports GitHub import/sync and code export. Use those supported source workflows; the ZIP in this handoff is a delivery bundle, not a promise of direct ZIP import into AI Studio.

---

Continue building the attached Sophia Mis XV quinceañera website. Preserve the supplied working design and source structure. It should remain a lean static HTML/CSS/JavaScript guest frontend with a small secure API only for private invitation access and Notion persistence. Do not add runtime Gemini calls, a chatbot, a heavy UI framework, auto-playing music, a database dump in frontend code, or a second custom admin dashboard.

Audience: Sophia's invited family and friends, primarily on phones. Organizers will manage invitations, guest contact information, attendance, and follow-up in private Notion databases.

Visual direction: burgundy #651625, deep wine #360d16, gold #E9C77B, parchment #FBF5E9. Preserve the original invitation image and its provenance; it is invitation artwork, not a verified photo of Sophia. Use elegant script for her name, serif headings, and legible sans-serif forms. Preserve semantic headings, explicit labels, keyboard operation, visible focus, reduced-motion support, and responsive layout.

Known facts from the invitation:
- Sophia, Mis XV, Fort Worth, Texas.
- Ceremony: 4:00 PM at Lady of Guadalupe Church. Exact church address is unknown.
- Dinner: 6:30–7:30 PM. Location needs confirmation.
- Reception & dance: starts 7:30 PM at AMZ Event Center, 5103 Azle Ave, Unit 200, Fort Worth, TX 76114.
- The family has confirmed Friday, January 15, 2027. Use 2027-01-15 everywhere. The original invitation artwork incorrectly says Saturday; correct that artwork before distributing invitations. The website text and configuration already use the confirmed Friday date.
- Use America/Chicago for all event/deadline calculations.
- Do not invent an RSVP deadline, ending time, dress code, children/plus-one policy, email, phone number, hotel, parking, or accessibility details.
- English is the current starter language. Add bilingual English/Spanish only if requested, with complete matching navigation, form, error, and confirmation translations.

Follow PAGE-SCOPE.md as the final scope: Home `/`, Event Details `/details/` (ceremony, reception, travel), RSVP `/rsvp/`, FAQ & Contact `/faq/`, Privacy `/privacy/`, and themed `/404.html`. Keep RSVP review and confirmation within the form flow. No custom admin routes initially: use Notion. Photos, gifts, court/padrinos, uploads, and post-event thank-you are deferred as documented. The repository's dependency-free build shares sections from site/index.html and creates deployable static routes in dist/.

Current source is a clearly labeled demo using SOPHIA-DEMO and two fictitious guests. Preserve its honest demo notices until a real secure service is implemented and verified. The demo must never appear to send/save an RSVP. Do not implement persistence via localStorage as a substitute for shared records.

Next implementation phase:
1. Read the existing Notion schema once access is available. Preserve existing records, map actual property/data-source IDs and types, and reconcile with NOTION-INTEGRATION.md.
2. Build a server-only adapter for invitation-session exchange, reading only the authorized household, and validated RSVP writes. Store secrets in the hosting platform's secret settings. Never call Notion directly from browser code or expose its token. Do not invent working credentials or mark an adapter connected without testing.
3. Use high-entropy revocable invitation tokens and short-lived Secure HttpOnly sessions. Enforce household authorization, event eligibility, named guest/plus-one limits, rate limiting, deadline, input limits, CSRF/origin protection, and idempotency on the server.
4. Let each named guest answer yes/no for each invited event. Keep Pending distinct from No. Allow all-declined and mixed attendance. Collect only relevant contact corrections and optional dietary/accessibility requests. Allow review and editing before the deadline.
5. Follow the documented durable commit/reconciliation approach; do not assume Notion supports cross-page transactions or that process-local locks solve concurrency. Return success only after durable acceptance. Surface transient errors without losing the in-memory form answers, and prevent duplicate logical responses on retry.
6. Keep Notion as the organizer UI. Provide saved views for missing contact details, unsent invitations, pending and partial responses, dinner counts, requests, and follow-up. Do not expose private notes or the guest list to the public site.
7. Follow GOOGLE-SETUP.md for the current Google-first decision: Cloud Run, Google Workspace Gmail API sending, Secret Manager, and Cloud Domains/Cloud DNS. Reuse emails/templates.mjs, whose English/Spanish templates only render content and perform no network requests. Gmail does not provide the earlier Resend idempotency/delivery-webhook contract; use a durable application outbox, represent ambiguous sends honestly, and reconcile instead of blindly retrying. Enable dispatch only after sender setup and the family's specific audience/schedule are supplied. Infrastructure approval does not send real invitations automatically.
8. Once the family confirms all details and the live flow passes tests, replace draft copy, add verified map links and calendar support, then prepare deployment using the chosen host. Do not claim publication or sync occurred without evidence.

Acceptance checks: desktop and mobile rendering; keyboard and text enlargement; invalid invitation; uninvited/cross-household access; guest count manipulation; all-declined and mixed answers; successful save verified in Notion; reopen/edit; duplicate submission; stale-tab conflict; deadline cutoff; Notion timeout/rate-limit failure; reconciliation after interrupted writes; no secrets or private guest records in browser assets. Report exactly what works and what remains disconnected.

Start by inspecting the supplied starter and continuing it. If Notion access or event facts are still absent, keep the finished preview usable and provide the specific remaining inputs without fabricating them.
