import { randomUUID, createHmac } from "node:crypto";
import { token, hash, error, cookie, rateLimit } from "./auth.mjs";

export const pagePermissions = ["gifts", "padrinos", "costs", "admin"];
const normalizeEmail = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  )
    throw error(422, "INVALID_EMAIL");
  return value.trim().toLowerCase();
};
export function accountActive(s, account) {
  return !!(
    account?.active &&
    !account.deletedAt &&
    s.invitations[account.householdId]?.active
  );
}
export function allowedPages(s, session) {
  const a = s.accounts?.[session?.accountId];
  return accountActive(s, a) ? a.permissions : [];
}

// One verified contact account per household invitation. An invitation code bootstraps
// registration; once claimed it cannot bypass email verification or page permissions.
export function createAccounts({
  ledger,
  mailer,
  notion,
  key,
  origin,
  now,
  syncOne,
}) {
  const emailKey = (value) =>
    createHmac("sha256", key)
      .update("email:" + value)
      .digest("hex");
  const accountFor = (s, householdId) =>
    Object.values(s.accounts || {}).find((a) => a.householdId === householdId);
  async function issue({
    address,
    householdId,
    generation,
    registration,
    name,
  }) {
    const raw = token(),
      id = randomUUID();
    await ledger.transaction((s) => {
      s.emailLinks ??= {};
      for (const [k, link] of Object.entries(s.emailLinks))
        if (link.expiresAt <= now()) delete s.emailLinks[k];
      const invite = s.invitations[householdId];
      if (!invite?.active || invite.generation !== generation)
        throw error(401, "INVITATION_INACTIVE");
      s.emailLinks[hash(raw)] = {
        id,
        email: address,
        emailKey: emailKey(address),
        householdId,
        generation,
        registration,
        name,
        expiresAt: now() + 900000,
      };
    });
    // Token is a fragment, never an access-log query parameter. GET/scanners do not
    // consume it: the page requires an explicit user click and a same-origin POST.
    const url = `${origin}/account/#${raw}`;
    try {
      await mailer.send({
        id,
        to: address,
        subject: "Sophia · Your sign-in link / Tu enlace de acceso",
        html: `<p>Sign in to Sophia’s celebration website.</p><p>Inicia sesión en el sitio de la celebración de Sophia.</p><p><a href="${url}">Continue / Continuar</a></p><p>This link expires in 15 minutes and works once. If you did not request it, ignore this email.</p><p>Este enlace vence en 15 minutos y funciona una sola vez. Si no lo solicitaste, ignora este correo.</p>`,
      });
    } catch {
      // Retain a possibly delivered link until expiry. Do not retry an ambiguous send.
      // Never reveal recipient existence or provider errors in the anonymous response.
      await ledger.transaction((s) => {
        s.audit.push({
          action: "sign-in-email-failed",
          id,
          at: new Date(now()).toISOString(),
        });
        s.audit = s.audit.slice(-5000);
      });
    }
  }
  return {
    accountFor,
    async request(body, session) {
      if (!mailer.configured) throw error(503, "EMAIL_SIGN_IN_UNAVAILABLE");
      const address = normalizeEmail(body.email);
      await rateLimit(ledger, "email-login-global", 120, 3600000, now());
      await rateLimit(
        ledger,
        "email-login:" + emailKey(address),
        3,
        900000,
        now(),
      );
      const s = await ledger.read();
      if (body.register === true) {
        if (session?.kind !== "guest" || session.accountId)
          throw error(401, "SIGN_IN_REQUIRED");
        const invitation = s.invitations[session.householdId];
        if (!invitation?.latestSubmissionId) throw error(409, "RSVP_FIRST");
        if (accountFor(s, session.householdId))
          throw error(409, "EMAIL_SIGN_IN_REQUIRED");
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 120 ||
          /[\x00-\x1f\x7f]/.test(body.name)
        )
          throw error(422, "INVALID_TEXT");
        await rateLimit(
          ledger,
          "register:" + session.householdId,
          3,
          900000,
          now(),
        );
        if (
          !Object.values(s.accounts || {}).some(
            (a) => a.emailKey === emailKey(address),
          )
        )
          await issue({
            address,
            householdId: session.householdId,
            generation: invitation.generation,
            registration: true,
            name: body.name.trim(),
          });
      } else {
        const account = Object.values(s.accounts || {}).find(
          (a) => a.emailKey === emailKey(address),
        );
        if (accountActive(s, account)) {
          const invite = s.invitations[account.householdId];
          await issue({
            address,
            householdId: account.householdId,
            generation: invite.generation,
            registration: false,
          });
        }
      }
      return { requested: true };
    },
    async consume(raw) {
      await rateLimit(ledger, "email-verify-global", 300, 900000, now());
      if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw))
        throw error(401, "EMAIL_LINK_INVALID");
      const pending = (await ledger.read()).emailLinks?.[hash(raw)];
      if (!pending || pending.expiresAt <= now())
        throw error(401, "EMAIL_LINK_INVALID");
      const fresh = await notion.read(pending.householdId);
      if (fresh.archived) throw error(401, "EMAIL_LINK_INVALID");
      const value = token(),
        csrf = token();
      const result = await ledger.transaction((s) => {
        const link = s.emailLinks?.[hash(raw)],
          invite = s.invitations[pending.householdId];
        if (
          !link ||
          link.expiresAt <= now() ||
          !invite?.active ||
          invite.generation !== link.generation
        )
          throw error(401, "EMAIL_LINK_INVALID");
        s.accounts ??= {};
        let a = accountFor(s, link.householdId);
        if (link.registration) {
          if (
            a ||
            Object.values(s.accounts).some((v) => v.emailKey === link.emailKey)
          )
            throw error(401, "EMAIL_LINK_INVALID");
          a = {
            id: randomUUID(),
            householdId: link.householdId,
            name: link.name,
            email: link.email,
            emailKey: link.emailKey,
            active: true,
            permissions: [],
            version: 1,
            verifiedAt: now(),
          };
          s.accounts[a.id] = a;
          const profile = s.profiles?.[a.householdId];
          if (profile) {
            profile.contact.email = a.email;
            profile.version++;
            profile.updatedAt = now();
          }
          invite.syncState = "pending";
          // Invalidate every unverified code session once the invitation is claimed.
          for (const [id, other] of Object.entries(s.sessions))
            if (other.householdId === a.householdId && !other.accountId)
              delete s.sessions[id];
        }
        if (!accountActive(s, a) || a.emailKey !== link.emailKey)
          throw error(401, "EMAIL_LINK_INVALID");
        delete s.emailLinks[hash(raw)];
        s.sessions[hash(value)] = {
          kind: "guest",
          accountId: a.id,
          householdId: a.householdId,
          generation: invite.generation,
          csrf,
          expiresAt: now() + 1800000,
        };
        return { householdId: a.householdId, registration: link.registration };
      });
      if (result.registration) {
        try {
          await syncOne(result.householdId);
        } catch {
          /* The account/session is already durable; its pending Notion projection can be retried. */
        }
      }
      return { csrf, setCookie: cookie(value) };
    },
  };
}
