# v1.0 design set

Produced on Oct 8, 2026 from six parallel reviews: architecture, Twilio, UX, security, Notion and documentation. Each review read the code; none of them assumed the docs were correct.

| # | Deliverable | Document |
|---|---|---|
| 1 | Updated deployment guide | [../../DEPLOYMENT.md](../../DEPLOYMENT.md) |
| 2 | Architecture recommendations | [architecture.md](architecture.md) |
| 3 | Twilio gap analysis (30909) | [twilio-gap-analysis.md](twilio-gap-analysis.md) · resubmission values: [../sms-campaign-registration.md](../sms-campaign-registration.md) · runbook: [../twilio-setup.md](../twilio-setup.md) |
| 4 | Invitation/RSVP workflow design | [architecture.md#invitation-and-rsvp-workflow](architecture.md#invitation-and-rsvp-workflow) |
| 5 | Admin Center and authorization model | [admin-center.md](admin-center.md) |
| 6 | Notion integration strategy | [notion-strategy.md](notion-strategy.md) |
| 7 | UX recommendations | [ux.md](ux.md) |
| 8 | Prioritized implementation plan | [implementation-plan.md](implementation-plan.md) |
| 9 | Production-readiness checklist | [implementation-plan.md#production-readiness-validation-checklist](implementation-plan.md#production-readiness-validation-checklist) |

## Headline findings

1. **30909 had a real code cause.** The campaign said consent comes only from a keyword, but an organizer-ticked Notion box could make a number textable. Fixed. Only a verified keyword opt-in now counts.
2. **The platform is sound.** The pre-launch risks are ledger write amplification and missing logs, not missing abstractions.
3. **Registering an account breaks a household's invitation link.** This is the top guest-experience bug.
4. **Admin Mode already exists and is enforced on the server.** It needs permission sets, fresh-MFA role changes, safe MFA enrollment, and a fix for an anonymous rate-limit lockout (High).
5. **Notion should stay the source for the family's data.** Add rate limiting, caching and scheduled retries rather than two-way sync.

## Scope decisions

These are recommendations. Confirm or override them.

- **Single event**, not multi-event.
- **Microsoft Graph** for email, not SMTP.
- **SMS for US/Canada only**; WhatsApp for international guests.
- **Polling** for near-real-time status, not WebSockets/SSE or Firestore.
