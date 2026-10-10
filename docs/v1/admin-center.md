# Admin Center and authorization model

## What already exists (verified in code)

Admin Mode is largely built, and the server enforces it on every request:

- **Mark/unmark administrator.**
  - The owner uses the admin checkbox at `/admin/access/` (`application.mjs` ~L1134-1181).
  - The server requires an owner session to change it and immediately revokes the demoted user's admin sessions, challenges and email links.
- **Every `/api/admin/*` route** goes through `requireAuth("admin")` with a CSRF token, then `checkAdministratorEligibility`. No route was found that relies only on UI gating.
- **MFA.** TOTP is required for every admin session (5 attempts, 5-minute challenge, replay blocked). Sessions are 30 minutes, stored hashed, and use a `__session` cookie (HttpOnly, Secure, SameSite=Strict, Path=/api).
- **Three ways in today:**
  - Owners: listed in `ADMIN_EMAILS`.
  - Delegates: listed in `ADMIN_DELEGATE_EMAILS` **and** marked "Administrator Eligible" in Notion.
  - Account admins: a registered guest account with the `admin` permission **and** "Administrator Eligible" in Notion.

## Gaps against the requested Admin Mode

| Requirement | Gap | Severity |
|---|---|---|
| Simple user-level setting | Works only for households that RSVP'd and registered. Non-guest admins need an env change, a redeploy and a Notion row | Medium |
| Auto-access on login | An admin guest isn't redirected; they must find `/admin/login/` | Low (UX) |
| Least privilege | Every admin can do everything: issue links, import, change the Notion schema, mass-send, read all PII | **Medium (M1)** |
| Role-change safety | No fresh MFA to grant admin. Audit entry lacks before/after. 5,000-entry log can be flooded by guest activity | Medium (M3) |
| MFA enrollment | The first person to complete email/Google sign-in for an un-enrolled admin binds their own authenticator; the owner isn't notified; no reset | **Medium (M2)**. The delegate is in this state now |
| Demotion | A delegate unmarked in Notion keeps `/api/pages/*` and pending-photo access until their session expires (≤30 min) | Low |
| Availability | Delegates are checked against a full Notion list on every request; a Notion outage locks them out | Low |
| Anonymous lockout | The global login limit (60 per 15 min) is charged before credential checks, so anyone can exhaust it and block all admin logins. The global write limit can block RSVPs | **High (H1)** |

## Target model

> **Superseded on Oct 10, 2026** by [access-model.md](access-model.md): admin access now comes from the Notion "Administrator Eligible" box, checked on every request.

**Single source of truth: the ledger.** Notion "Administrator Eligible" becomes an informational projection. It is no longer half of the grant, because anyone who can edit that Notion database would otherwise hold part of admin access.

| Role | How assigned | Permissions |
|---|---|---|
| `owner` | `ADMIN_EMAILS` env only (break-glass, never changeable from the UI) | Everything, plus `roles:grant`, `accounts:delete`, `schema:modify`, `import` |
| `admin` | Owner toggles `role` on a user in Admin Center | `events:manage`, `invitations:issue`, `invitations:monitor`, `users:manage` (non-admin page access and active flag), `messaging:send` |
| `viewer` (optional helper) | Owner toggles | `invitations:monitor` only |
| `guest` | Default | Own household only |

Account record additions: `role`, `roleChangedAt`, `roleChangedBy`, `mfaEnrollBy`. Role history goes in a separate append-only `roleEvents[]` (`{actor, target, from, to, at}`) that is never trimmed.

### Server enforcement

```js
// application.mjs — after checkAdministratorEligibility; replaces inline ownerSession checks.
const can = (session, cap) => PERMISSIONS[session.role]?.has(cap) ?? false;
function requirePermission(session, cap) {
  if (!can(session, cap)) throw error(403, "PERMISSION_REQUIRED");
}
```

Apply to each route group:

- `invitations:issue` → link create and revoke
- `messaging:send` → mail, SMS and WhatsApp send
- `schema:modify` → Notion columns
- `import` → CSV import
- `roles:grant` → the new role endpoint

### Role change endpoint

`POST /api/admin/accounts/role { id, version, role, code }`, owner only:

1. Verify a **fresh TOTP code** inside the transaction.
2. Refuse self-changes and any change to `owner`.
3. Append a `roleEvents` entry and an `events[]` entry.
4. On demotion, revoke admin sessions, challenges and links, and delete the stored authenticator record.

### MFA enrollment

Granting admin issues a **single-use enrollment link** valid 24 hours, bound to `mfaEnrollBy`. Completing enrollment emails all owners. Owners can **reset** an admin's authenticator, which invalidates the old seed and issues a new enrollment link.

### Automatic Admin Center on login

After any sign-in, `/api/session` returns `role`. If it isn't `guest`, the client routes to the step-up MFA page and then `/admin/`. MFA is never skipped.

## Admin Center information architecture

| Section | Purpose | Permission |
|---|---|---|
| Overview | Funnel (not sent / sent / opened / accepted / declined / pending), pending Notion sync, failed deliveries | `invitations:monitor` |
| Guests & Invitations | One row per household: channels available, last delivery state, opened, RSVP and headcount; bulk send with sample preview | monitor / issue / send |
| Messages | Drafts and outbox across channels, delivery status, opt-outs | `messaging:send` |
| Event | Venues, times, deadline, content (already at `/admin/site/`) | `events:manage` |
| Users & Roles | Accounts, page access, role toggle (owner only), MFA reset, role history | `users:manage` / `roles:grant` |
| Planning | Budget, godparents, documents (existing) | `events:manage` |

## Status (2026-10-09)

Shipped: owner-gated authenticator setup with reset (M2), a fresh owner code to grant admin with removal dropping the authenticator (M3, L3), owner-only Notion schema and import (part of M1), append-only role history, constant-time CSRF (L4), dead code removed (L5). Anonymous lockout (H1) was fixed earlier. Still open: finer permission sets beyond owner/admin, delegates' 30-minute grace after Notion un-marking (L1), and Notion dependence for delegates (L2).

## Fixes for the security findings

| Finding | Fix |
|---|---|
| H1 anonymous lockout | Move rate counters to in-memory per instance (or Cloud Armor); key them per credential/IP; verify the credential before charging the limit; restrict Cloud Run ingress to the Hosting path if feasible |
| M1 every admin has every power | Permission sets above |
| M2 first-enroller binding | Enrollment links + owner notification + reset |
| M3 role change without fresh MFA | Fresh TOTP + `roleEvents[]` |
| L4 CSRF compared with `!==` | `crypto.timingSafeEqual` |
| L5 dead `invitation-security.mjs` | Delete |
