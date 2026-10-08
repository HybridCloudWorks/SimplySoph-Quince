# Twilio gap analysis

Trigger: Twilio rejected the A2P campaign with **30909, "Message Flow or Call to Action incomplete/unverified"**. Baseline assumption: no Twilio work is verified.

- **Fixed in this change:** the code, the public pages and the docs.
- **Still to do:** everything marked **Owner** needs a Twilio Console or handset action.

## SMS campaign (30909)

| # | Area | Current state (before this change) | Required state | Remediation | Owner | Validation |
|---|---|---|---|---|---|---|
| 1 | Hidden opt-in path | A Notion `SMS Consent` checkbox and date made a number sendable (`audience.mjs`, `sms.mjs review()`). This contradicted the registered "keyword only" flow | Only a verified keyword opt-in makes a number sendable | `smsKeywordConsent()` now requires a synced START receipt bound to the household phone, in both drafting and review. Tests: Notion-only consent is rejected | **Done** | `tests/sms.test.mjs`, `tests/application.test.mjs` |
| 2 | Program keyword | Only `START`/`UNSTOP`, which are carrier-reserved re-subscribe words | A unique keyword plus re-subscribe keywords | `SOPHIA` added (`site/sms-program.mjs`). The inbound handler accepts it when Twilio flags it `OptOutType=START` | Code done · **Owner:** add `SOPHIA` to Advanced Opt-Out | Handset texts `SOPHIA`; the ledger shows a synced START |
| 3 | message_flow content | No quoted confirmation text; didn't say how guests find the number; one opt-in path described | Brand, public CTA URL, exact CTA text, keyword, number, verbatim auto-reply, frequency, rates, HELP/STOP, terms and privacy URLs, all paths | New `message_flow` (1,378 characters) in `docs/sms-campaign-registration.md`. Tests keep it in sync with the code | **Done** | `tests/sms-campaign.test.mjs` |
| 4 | Public CTA page | The `/sms/` CTA showed START only. `/sms-terms/` repeated the same page | Public page showing the exact CTA and all three auto-replies; separate terms | `/sms/` shows the CTA (tap-to-text link prefilled with `SOPHIA`) and the verbatim replies. `/sms-terms/` is a numbered terms page. Both in EN/ES | Code done · **Owner:** deploy, then open in a private window | Reviewer-style check of both URLs |
| 5 | Brand consistency | Footer "© SimplySoph"; sample/test text "SimplySoph RSVP" | "Simply Soph Media" everywhere a reviewer looks | Footer, SMS pages, replies and samples aligned. `smsCompliantText()` rejects drafts without the `Simply Soph Media:` prefix and `STOP` | **Done** · **Owner:** confirm the registered brand name exactly | Footer of any page; a draft without the prefix fails with 422 |
| 6 | Privacy wording | Non-sharing limited to "for marketing or promotional purposes"; general policy allowed disclosure to providers without exception | Carrier-standard sentence: no mobile info shared with third parties/affiliates for marketing; opt-in data and consent not shared with any third parties | Added to the privacy page SMS section, SMS terms, and `site/policies.mjs` (EN/ES) | **Done** | `/privacy/`, `/sms-terms/` |
| 7 | Resubmission | Campaign rejected | Edit and resubmit the **same** campaign | Paste the values from `docs/sms-campaign-registration.md` after the release is live | **Owner** | Twilio campaign status = VERIFIED |

## Runtime configuration (all unverified)

| # | Area | Current state (docs) | Required state | Remediation | Validation |
|---|---|---|---|---|---|
| 8 | Messaging Service | Two services in the docs and inventory (`MG641…` empty, `MG6d6…` linked to the campaign). Docs contradicted each other | One service, linked to the campaign, with only +16827868002 | Set `TWILIO_MESSAGING_SERVICE_SID` to the campaign-linked service. Retire the other through cleanup review | Signed real callback returns 200, not 403 |
| 9 | Account identity | Docs mention a "My first Twilio account" trial and a separate account | Campaign, number, WhatsApp sender and runtime credentials all in one account | Confirm in Console; align `TWILIO_ACCOUNT_SID` | Same as above |
| 10 | Advanced Opt-Out replies | Earlier START/STOP/HELP replies were saved in Console | Exact replies from `site/sms-program.mjs` v2026-10-08 | Paste the new replies; add `SOPHIA` | Handset: SOPHIA / HELP / STOP / START each get exactly one reply |
| 11 | Callbacks | Reported configured | `/api/twilio/inbound` and `/api/twilio/status` on the service, exact URLs | Verify; no trailing slash | Unsigned → 403; signed malformed → 422 |
| 12 | API key permissions | Messages read only | Read now; create only at activation | Grant create after the campaign is approved and acceptance passes | `SMS_REJECTED` disappears on the test send |
| 13 | Activation flags | `SMS_ENABLED=false`, `SMS_ACTIVATION_REVIEWED=false` | Both false until acceptance, then both true | No change now | `/admin` SMS review shows `sendingEnabled` |
| 14 | Webhook latency | START waits on Twilio REST plus Notion before replying | Under 15 s or Twilio logs 11200 | Watch during acceptance. If it appears, acknowledge first and project to Notion asynchronously (P1) | Twilio debugger shows no 11200 |
| 15 | MMS STOP | Only `SM…` IDs are accepted | Record STOP from `MM…` too | P2: accept the `MM` prefix for inbound opt-outs | Unit test |
| 16 | Territories | US/CA only; PR/USVI/Guam rejected | Decide whether to include PR | Optional P2 after Console Geo Permissions check | Unit test plus Console |

## WhatsApp

| # | Area | Current state | Required state | Remediation | Validation |
|---|---|---|---|---|---|
| 17 | Templates | Last known: 3 pending, `reminder_es` rejected | All four approved | Re-check through the Content API; fix and resubmit `reminder_es` | `WHATSAPP_TEMPLATES_JSON` lists approved SIDs only |
| 18 | US recipients | Meta blocks marketing templates to US numbers | WhatsApp is international-only | Keep email for US guests; don't reclassify invitations as utility | Owner test from a non-US eligible number |
| 19 | Opt-in friction | Opt-in only on the registered account page; registering breaks the household link | Opt-in offered on the RSVP confirmation for link sessions | P1 in the [implementation plan](implementation-plan.md) | Guest flow test |
| 20 | "International SMS" request | Not supported by the code; not covered by 10DLC | Use WhatsApp (or email) for non-US/CA guests | Documented. No international SMS will be built | — |

## Documentation removed or corrected

- `docs/twilio-runtime-status.md`: deleted. It was a point-in-time log with two conflicting service IDs and said the campaign was "IN_PROGRESS".
- `docs/whatsapp-setup.md`: deleted. It said the transport was "not yet implemented", which is false.
- `docs/twilio-setup.md`: rewritten as the single runbook. The toll-free plan, the "trial account" log and the wrong secret names are gone.
- `DEPLOYMENT.md`: rewritten. It said STOP/HELP and callbacks were "pending" and SMS sending was "disabled in code". Both were wrong.
- `CLEANUP.md`: said "no Twilio resources have been provisioned". Corrected.
