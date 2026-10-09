# Architecture and invitation/RSVP workflow

## Recommendation in one paragraph

Keep the current platform: static Firebase Hosting, one Cloud Run service, a GCS ledger with generation preconditions, Notion, and Microsoft Graph. It is correct, cheap and unusually careful about idempotency. With the RSVP deadline on Oct 31, a platform migration is the riskiest move available. The real pre-launch risks are:

- **Write amplification** on the single ledger object. One RSVP takes about 7 full rewrites, including the rate-limit counters.
- **No operational logs.** Every 5xx is swallowed into a JSON 503.

Fix those first. Then converge the three messaging code paths behind one `Channel` interface and one delivery state machine, with an append-only event log. Do this only as each extra channel actually goes live.

## As built

```
Browser (dist/, EN/ES) ─► Firebase Hosting ──/api/**──► Cloud Run misxv-api (Node 24)
                                                        http.mjs → application.mjs dispatch()
Twilio webhooks ───────────────────────────────────────► ├─ sms.mjs ─► twilio.mjs ─────────────┐
                                                        ├─ whatsapp.mjs ─► whatsapp-transport ─┴► Twilio REST
                                                        ├─ outbox ─► mail.mjs (Graph | SendGrid)
                                                        ├─ notion.mjs (roster read + projection)
                                                        └─ store.mjs ─► gs://…/private/event-ledger.json
```

| Area | Finding | Verdict |
|---|---|---|
| Channels | Three parallel paths: email outbox, SMS drafts/claims/delivery, WhatsApp drafts/claims/links. About 19 ledger keys. The two Twilio transports are about 70% duplicated | Simplify when a 2nd channel goes live |
| Invitation links | Email: admin copies and pastes the link. WhatsApp: minted per draft. SMS: no per-household link | Mint links server-side at send time for all channels |
| State machine | Per channel: claim → accepted / rejected / unknown → delivered. Never auto-retries unknown | Keep the semantics |
| Audit | Mutable array capped at 5,000 entries. SMS/WhatsApp sends not audited | Replace with an append-only event log |
| Ledger contention | GCS allows about 1 write/s per object. 8 immediate retries with no backoff. Rate limits are ledger writes | **P0 fix** |
| Observability | One startup log line; exceptions → silent 503 | **P0 fix** |
| `application.mjs` | 1,668-line route chain | Split by route group after the deadline |
| Dead code | `server/invitation-security.mjs` (imported only by its test) | Remove (P2) |
| Tests | 144 dispatch-level behavior tests, all passing | Keep; add contention tests |

## Scope corrections to the requested design

| Request | Recommendation | Why |
|---|---|---|
| "User creates an event" | **Single event.** Centralize the hard-coded dates and deadline (`application.mjs` ~L34, L78, L313-321) into one event-config module | Multi-tenant events mean a new data model, authorization scoping and UI, for one quinceañera. Revisit only if this becomes a product |
| "SMTP email invitations" | **Keep Microsoft Graph.** Offer `smtp` only as an optional adapter for a non-Microsoft relay | Exchange Online is retiring Basic-auth SMTP AUTH. OAuth SMTP needs the same Entra app and gives up the mailbox-scoped RBAC grant already in place |
| "SMS local and international" | **SMS = US/Canada. International = WhatsApp** | A2P 10DLC covers US carriers. Other countries need separate sender registration per country |
| "Near-real-time RSVP sync" | **Polling**: `/api/admin/status` every 20–30 s while the tab is visible, with ETag = ledger generation (304 when unchanged) | SSE would occupy the 8 total concurrency slots (2×4) and hit the 120 s timeout. Firestore listeners add an auth/rules/SDK surface. Polling costs about 30k requests/month, inside the free tier |
| Event-driven, auditable | **Append-only `events[]` in the same ledger transaction as each state change**, mirrored to Cloud Logging | Same atomicity as the data. No new infrastructure |

## Target v1.0 shape

```
                ┌──────────── application (route groups) ────────────┐
Admin UI ──►    │ invitations   deliveries   rsvp   admin   webhooks │
                └──────┬──────────────┬─────────────────────┬────────┘
                       │              │                     │
                 Ledger (GCS)    Channel registry      Notion adapter
                 - households*   - email (graph)       (cached roster,
                 - deliveries    - sms (twilio)         429 backoff,
                 - responses     - whatsapp (twilio)    projection)
                 - contactPrefs  - [smtp optional]
                 - events[] (append-only)       * roster lives in Notion
```

### `Channel` interface

```js
// server/channels/channel.mjs — one adapter per provider/channel.
/** @typedef {{
 *   id: "email"|"sms"|"whatsapp",
 *   capabilities: { deliveryReceipts: boolean, templatesRequired: boolean, consent: "none"|"keyword"|"keyword+record" },
 *   eligible(household, state): { ok: boolean, reason?: string },    // consent, suppression, address format
 *   render(delivery, link): { to, body | templateSid+vars },          // server mints link; never the admin
 *   send(rendered): Promise<{ providerId, state: "accepted" }>,       // throws REJECTED | UNKNOWN
 *   verify(req): boolean,                                             // webhook signature
 *   parseStatus(params): { providerId, status } | null,
 *   parseInbound(params): { address, kind: "START"|"STOP"|"HELP"|"OTHER", at } | null,
 * }} Channel */
```

Merge `twilio.mjs` and `whatsapp-transport.mjs` into one Twilio adapter parameterized by channel. Route both webhooks through one handler: `/api/webhooks/twilio/:channel/:kind`. Keep the old paths as aliases until the Console is updated.

### One delivery record

```
deliveries[id] = { id, channel, householdId, campaignId, to, linkId, state, providerId, at }
state: draft → claimed → accepted → sent → delivered | undelivered | read
                     ↘ rejected   ↘ unknown (never auto-retried)     cancelled (stale/suppressed)
```

### Event log

Every state change appends `{ at, type, actor, householdId?, deliveryId?, data }` in the same transaction. Types:

- `invitation.issued`, `invitation.opened`, `invitation.revoked`
- `delivery.claimed`, `delivery.accepted`, `delivery.delivered`, …
- `rsvp.submitted`, `rsvp.updated`
- `consent.granted`, `consent.revoked`
- `role.granted`, `role.revoked`, `notion.synced`

The dashboard status is **derived** from events plus responses, never stored twice. Each event is also written as one structured log line, so a copy exists outside the ledger.

## Invitation and RSVP workflow

```
Organizer                          Server                                 Guest
─────────                          ──────                                 ─────
Select households/group ─────────► eligible(channel) per household
Preview 1 sample/language ◄─────── render(sample)
Confirm "send N" ────────────────► for each: mint link (per delivery) ──► email / SMS / WhatsApp
                                   claim → send → event delivery.*        tap link (#token)
                                   ◄── provider status callbacks           ─► POST /invitation-session
                                   event invitation.opened ◄──────────────   (RSVP-scoped session)
                                                                           one tap: Attending / Can't attend
                                   rsvp.submitted (idempotency key) ◄──── confirm
Dashboard poll (ETag) ◄─────────── derived status + counts                 UI unlocks by status
                                   project to Notion "Website …" columns
```

### Guest state machine (what the UI shows)

| State | Guest sees | Unlocks |
|---|---|---|
| Invited / Delivered | Invitation with **Attending** and **Can't attend** buttons | — |
| Opened, no answer | Quick-answer card and deadline countdown | RSVP form, WhatsApp/SMS reminders opt-in |
| Accepted | Celebration card, "edit until Nov 15" | Calendar for the events they're attending, directions/parking, dietary/accessibility, guestbook. On event day: photo upload, gallery, livestream |
| Declined | "We'll miss you" | Guestbook, livestream, change answer before deadline |
| Closed (after deadline) | Read-only receipt | Contact the family |

These unlocks are enforced on the **server**: each endpoint checks the household's current response state. The UI only reflects it.

### Link and session model

- Each household link token is 256-bit, carried in the URL `#fragment`, and exchanged by POST. One token is minted **per delivery**, so each channel can be revoked separately.
- A link session is **RSVP-scoped**: view the invitation, RSVP, opt in to messages, upload, guestbook. It **keeps working after the household registers an account**. Today registering breaks it (UX P0).
- The gallery, private pages, admin and changing the sign-in email still require a verified email (plus MFA for admin).
- Contact details are masked in link-only sessions, so a forwarded link doesn't expose them.
