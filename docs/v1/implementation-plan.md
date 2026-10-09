# Prioritized implementation plan and production-readiness checklist

Dates assume today is **Oct 8, 2026**, the RSVP deadline is **Oct 31**, and the event is **Jan 15, 2027**. Effort: S ≤ ½ day, M ≈ 1–2 days, L ≥ 3 days.

## Phase 0: done in this change

- Twilio 30909 remediation:
  - The keyword-only consent rule is enforced in code.
  - New `SOPHIA` keyword.
  - Brand and STOP enforced on every SMS draft.
  - Public `/sms/` CTA with the verbatim auto-replies; separate `/sms-terms/` page.
  - Carrier-standard privacy wording.
  - Resubmission values, plus tests that keep them in sync with the code.
- `DEPLOYMENT.md` rewritten from the code. The full set of 27 variables is documented.
- Stale Twilio and WhatsApp docs removed or corrected. `.env.example` completed, with the personal email removed.
- 144/144 tests and 66/66 document checks passed at the end of Phase 0.

## Phase 1, P0: before any invitation goes out (target Oct 9–15)

Code items 2–8 are **done** on this branch (156/156 tests, 66/66 documents). Items 1, 9 and 10, and the alerting half of item 2, need the owner.

| # | Item | Status |
|---|---|---|
| 1 | **Owner:** deploy this release, then resubmit the campaign using `docs/sms-campaign-registration.md`. Configure Advanced Opt-Out with `SOPHIA` and the new replies | Owner |
| 2 | Structured JSON request logs; 5xx logged with stack traces | **Done** · Owner: create the log-based alert on `severity>=ERROR` for `misxv-api` and a billing budget alert |
| 3 | Rate limits moved to memory. Shared budgets count only failures, so valid credentials are never locked out (H1). Ledger transactions on one instance run one at a time, with jittered backoff and GCS 429 retry | **Done**. Folding the sync lease and mail claim into the RSVP transaction (5 → 2 writes) is moved to P1 |
| 4 | After registration the private link reopens an RSVP-only session (contact hidden and preserved); rejected links explain why | **Done** |
| 5 | Server-minted private links in invitation and reminder emails, plus **We'll be there / We can't make it** quick answers (pre-filled, guest confirms) | **Done**. A `{link}` placeholder for group email/SMS is moved to P1 |
| 6 | Notion pacing (2.5 req/s), 429/Retry-After retry, no retry of page creates on 5xx, 30 s roster cache, fresh reads at decision points | **Done** |
| 7 | Per-household status (no link, revoked, created, emailed, opened, attending, declined), status filter with counts, dashboard funnel, `openedAt` | **Done** |
| 8 | Copy fixes: corrupted Spanish characters, stale "original code" advice, English-only links, consistent informal Spanish, no Notion/UUID shown to guests | **Done** |
| 9 | Run the **acceptance gate** in `DEPLOYMENT.md` end to end with the disposable household | Owner |
| 10 | Publish a DMARC record (`p=none` first) for simplysoph.com | Owner |

## Phase 2, P1: before the RSVP deadline (target Oct 16–24)

| # | Item | Effort | Source |
|---|---|---|---|
| 10a | Fold the Notion sync lease and receipt-mail claim into the RSVP transaction (5 → 2 ledger writes per RSVP) | M | Arch |
| 10b | `{link}` placeholder so group emails (and SMS once approved) carry each household's minted link | S | UX |
| 10c | Ledger queue guard: per-attempt timeout on GCS load/save and reject when the per-instance queue is too deep (review L1) | S | Review |
| 10d | **Done:** minted email links open only after their email was sent (review L2) | S | Review |
| 11 | **Done:** batch invitations and reminders. Preview recipients, skips and one sample per language, then a typed-count confirm; the open tab sends groups of 10 at about 28/min; Stop and Continue; bulk link creation for households without links. Owner rule: every send has a person in the loop, and single sends stay available | M | UX, Arch |
| 12 | **Done:** open admin tabs check `/api/admin/pulse` every 30 s while visible (one ledger read, no Notion). The dashboard and inbox redraw (never over a field being typed in), the guest list shows a refresh banner so selections survive, and the Notifications link shows an unread count. RSVPs land in the inbox in the same save, **in-app only, never emailed** | S–M | Arch, UX |
| 13 | Append-only `events[]` written with each state change and mirrored to logs; RSVP, delivery and role events | M | Arch |
| 14 | Cloud Scheduler (OIDC) drains pending Notion and consent projections every 10 min | S | Notion |
| 15 | Permission sets plus `requirePermission`; owner-only role endpoint with fresh TOTP; MFA enrollment links, owner notification and reset (M1–M3) | M | Security |
| 16 | WhatsApp/SMS opt-in on the RSVP confirmation page; confirmation page changes with the answer; calendar for the events they're attending only | S–M | UX |
| 17 | Invited-event checkboxes and `Website invitation` status in Notion | M | Notion |
| 18 | **Owner:** WhatsApp templates approved (fix `reminder_es`); eligible non-US test | S | Twilio |
| 19 | SMS activation **only after** the campaign is approved: Twilio acceptance steps 1–6 | S | Twilio |
| 20 | If START webhooks approach the 15 s Twilio limit: acknowledge first, project to Notion asynchronously | S | Twilio |

## Phase 3, P2: after Oct 31

- Merge the Twilio transports and introduce the `Channel` interface, plus a single delivery record. Do it once a second channel is actually live (L).
- Split `application.mjs` by route group (M).
- Remove `server/invitation-security.mjs`. Decide on SendGrid: keep it only if the plan covers January.
- Notion drift report; planning read from Notion; drop guest CSV import.
- "Maybe" status, dietary/accessibility fields, event-day features.
- 30-day lifecycle rule on noncurrent ledger versions (the personal-data copies otherwise accumulate).

## Production-readiness validation checklist

Each item needs a date, a tester and evidence recorded in `ops/event-resources.json`. Nothing counts until recorded.

### Build and release
- [ ] CI green on `main` (Node 24): `npm run check` (144+ tests, 66 documents) and `npm audit --omit=dev`.
- [ ] Hosting release header `X-Release-Commit` matches the merged commit.
- [ ] API deployed by digest; revision and secret versions recorded; previous revision kept for rollback.
- [ ] Rollback drill: shift traffic to the previous revision and back.

### Security
- [ ] Unauthorized Google account is rejected. MFA enroll, sign-in, replay and expiry verified. A second owner works.
- [ ] Demoting an admin revokes their sessions immediately (test with a live session).
- [ ] Unsigned Twilio callbacks → 403; signed malformed → 422; the `run.app` URL rejects signatures.
- [ ] Cross-origin POST is rejected. API responses are `private, no-store`. Cookie flags verified on the custom domain. HSTS present.
- [ ] No secrets in the repo (`git grep` for SIDs/keys), in `dist/`, or in logs.

### Invitations and RSVP (disposable household)
- [ ] Email invitation arrives with valid SPF/DKIM (and DMARC once published), in EN and ES.
- [ ] Link opens; RSVP in ≤3 taps; edit works **after** registering an account.
- [ ] Capacity limits, decline, mixed attendance, concurrent edits and replay all behave correctly.
- [ ] Notion `Website …` columns update; Notion outage → pending → retry reconciles.
- [ ] Dashboard counts match the ledger.

### SMS (after campaign approval)
- [ ] `SOPHIA` from a handset → exactly one confirmation; synced START; Notion updated.
- [ ] HELP / STOP / START replies match `site/sms-program.mjs`; STOP blocks review (`SMS_OPTED_OUT`).
- [ ] A Notion-only consent household is **not** eligible.
- [ ] One reviewed SMS: `accepted` → `delivered`; no 11200 in the Twilio debugger.

### WhatsApp
- [ ] Sender ONLINE; only approved templates configured.
- [ ] Non-US test: consent → START → template → link → RSVP → Notion → receipt email.
- [ ] STOP/BAJA suppresses locally during a simulated Notion outage.

### Operations
- [ ] A 5xx produces an ERROR log and an alert. Budget alert configured.
- [ ] A ledger restore drill was performed on a test object with generation preconditions.
- [ ] Load smoke test: 20 concurrent RSVPs from distinct households complete without `BUSY`.
