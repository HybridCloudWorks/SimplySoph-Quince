# SimplySoph · Sophia's Mis XV

Lean, invitation-inspired website starter for continued development in Google AI Studio. Burgundy, gold, parchment, and the supplied invitation artwork. **Preview only: no live Notion connection, RSVP storage, email sending, or deployment is enabled.**

## Preview locally

Requires Node.js 22 or newer. No dependencies to install.
Deployment now targets Node.js 24 through Google Buildpacks. Local validation was run with the workstation's Node.js 26 runtime.

```powershell
npm run build
npm start
```

Open http://127.0.0.1:4173/. Ctrl+C stops the server. Deploy only `dist/` when the site is ready; configure the static host to use `404.html` for unknown paths with HTTP status 404. Pages use root-relative assets; host at the domain root rather than a repository subpath unless a base-path adaptation is added.

## Final routes

Home `/`, Event Details `/details/`, RSVP `/rsvp/`, FAQ & Contact `/faq/`, Guest Privacy `/privacy/`, and `/404.html`. Ceremony, reception, and travel share Event Details. Confirmation/edit are RSVP states. Family management stays in Notion.

Try **SOPHIA-DEMO** on the RSVP page. Two fictional guests can respond separately for ceremony, dinner, and dance, then review/edit. Nothing is sent or persisted; refresh clears answers. Do not enter real guest data into the preview.

## Source and handoff

| Location | Purpose |
|---|---|
| `site/` | Shared HTML sections, styles, demo behavior, original artwork |
| `scripts/build.mjs` | Generates static pages in `dist/` |
| `scripts/serve.mjs` | Loopback-only preview server with themed 404 |
| `emails/templates.mjs` | Seven email types in English/Spanish, HTML and plain text; rendering only |
| `PAGE-SCOPE.md` | Final keep/merge/defer decisions for all 28 proposed pages |
| `EMAIL-PLAN.md` | Resend, alternatives, domain, sender, queue, and delivery workflow |
| `GOOGLE-SETUP.md` | Current Google-first hosting, Workspace/Gmail, domain, and Secret Manager plan; supersedes Resend as the default |
| `WEBSITE-PLAN.md` | Research, sources, event inventory, and launch checklist |
| `NOTION-INTEGRATION.md` | Schema, secure endpoint contract, and reconciliation design |
| `GOOGLE-AI-STUDIO-PROMPT.md` | Ready-to-paste continuation instructions |
| `notion-templates/` | Fictitious CSV examples; configure Notion relations/types separately |

`site/event-config.js` is reserved public configuration, not a live feature toggle. Current content is in `site/index.html`; changing `mode` does not connect a service. Google Fonts is the only external resource loaded by the site; system fonts provide fallback.

## Checks and email previews

```powershell
npm run check
npm run emails:preview
```

Checks build six pages, verify local route/asset references, and run email-rendering tests. Fourteen sample HTML/plain-text message pairs appear under ignored `work/email-previews/`; the script never sends email. Browser verification and limitations are recorded in `VALIDATION.md`.

## Continue in Google AI Studio

Import/sync this repository through AI Studio's documented GitHub workflow, then use `GOOGLE-AI-STUDIO-PROMPT.md`. No runtime Gemini dependency is needed. Add a small server-only API for invitation access, Notion writes, and authorized email delivery after credentials/schema are available. Keep secrets and real guest records out of the repository and browser assets.

## Unresolved details

**Confirmed by the family: Friday, January 15, 2027**, in America/Chicago. Website text, configuration, and sample emails use this date. The original invitation artwork still incorrectly says Saturday and must be corrected before distribution. Countdown/calendar functionality is not yet implemented; do not guess event end times.

Confirm church identity/address (invitation: “Lady of Guadalupe Church”; later list: “Our Lady of Guadalupe”), dinner venue, deadline, family contact, attire, guest policies, and language. The reception address is transcribed from the invitation, not independently venue-verified.

The website is English. English/Spanish email drafts are included; a bilingual website remains a follow-up after language/copy confirmation. Replace preview privacy copy with actual practices before real collection. `noindex` and robots exclusions do not secure the site.

## Google setup in progress

The family selected Google for hosting and email. Cloud Run startup support (`PORT`, platform bind address, health endpoint) is prepared and locally checked. No cloud project, billing link, domain, Workspace subscription, secret, or deployment has been created. See `GOOGLE-SETUP.md` for the provisioning sequence and pending account/domain/Notion inputs. Use **Secret Manager** for integration credentials; Google Vault is a different Workspace retention product.
