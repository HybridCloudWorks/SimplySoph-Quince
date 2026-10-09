# SimplySoph · Sophia’s Mis XV

Multi-page English/Spanish guest website and private family administration for **Friday, January 15, 2027**, Fort Worth. RSVP deadline: **October 31, 2026, 11:59 PM Central**.

The multi-page site is live at **https://misxv.simplysoph.com**. `npm run check` builds 65 routes plus `404.html` and validates all 66 documents. Only pushes to `main` publish, after the Node 24 checks and dependency audit pass; other branches and pull requests only run checks. The API is deployed separately to Cloud Run. Invitations must not go out until the acceptance gate in `DEPLOYMENT.md` passes. The v1.0 design set and plan are in [`docs/v1/`](docs/v1/README.md).

## Run and check

Use Node 24:

```powershell
npm ci
npm run check
npm start
```

Open http://127.0.0.1:4173/. Without production configuration, the site serves every page and the API fails closed with 503. No sample invitation grants access and no form pretends to save. `npm run emails:preview` renders fictitious email examples without sending anything.

## Application

- `site/content.mjs`: bilingual route catalog, confirmed event details and family content inputs.
- `scripts/build-pages.mjs`: static pages, shared navigation, calendar and printable upload QR.
- `site/guest.js`: private invitation exchange, RSVP review/edit, photo and message submissions.
- `site/admin.js`: authorized Google sign-in plus authenticator MFA, counts, invitations, CSV import/export, seating, moderation, announcements and reviewed email outbox.
- `server/application.mjs`: authenticated API workflows; no provider credentials in browser assets.
- `server/store.mjs`: private Google Cloud Storage ledger with generation preconditions for durable concurrent transactions.
- `server/notion.mjs`: real Notion data-source adapter; preserves original invited capacities and projects website responses into separate columns.
- `server/mail.mjs`: Microsoft Graph sender (optional SendGrid fallback); records accepted, failed or uncertain outcomes without blind retries.
- `server/sms.mjs`, `server/whatsapp.mjs`: Twilio SMS/WhatsApp with keyword consent, reviewed sends and signed callbacks; see `docs/twilio-setup.md`.
- `DEPLOYMENT.md`: service configuration, release gates, provider setup and rollback.
- `PAGE-SCOPE.md`: all requested pages and their responsibilities.
- `ACCOUNT-ACCESS.md`: invitation onboarding, verified email links, per-account private pages and MFA administration.
- `CLEANUP.md` and `ops/event-resources.json`: export, ownership checks and retirement inventory.

## Team workflow

Use the GitHub repository as the shared code source. Give collaborators repository access separately from ChatGPT project access. Work on individual branches, use pull requests and require the Node 24 checks. Only main publishes checked pushes; see PUBLISHING.md. Shared ChatGPT context does not grant Google, Microsoft or Notion permissions. Never put guest exports, invitation links or credentials into chats, GitHub issues, commits or CI artifacts.

## Content still needed from the family

Church identity/address and parking; dinner venue; dress code; Sophia/parent messages; court and padrino names/photos; gift links; travel recommendations; event portraits; approved retention date. The source keeps these unset rather than inventing them. The corrected family-supplied Designer.png is now the home invitation; clicking it opens the full original image. It correctly says Friday. After-event highlights are configured when available. Registry/padrino/cost details belong in the private admin editor, not the static content file.
