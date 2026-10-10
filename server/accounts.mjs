import { randomUUID, createHmac } from "node:crypto";
import {
  token,
  hash,
  error,
  cookie,
  rateLimit,
  withinLimit,
  pruneSessions,
} from "./auth.mjs";

const normalizeEmail = (value) => {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw error(422, "INVALID_EMAIL");
  return value.trim().toLowerCase();
};
export function accountActive(s, account) {
  return !!(
    account &&
    account.active !== false &&
    !account.deletedAt &&
    s.invitations[account.householdId]?.active
  );
}
// The Notion row whose Email (or Additional Emails) is this address. An email on
// two rows is ambiguous and signs in to neither.
export function rosterMatch(rows, address) {
  const found = rows.filter(
    (r) =>
      !r.archived &&
      (r.email === address || (r.additionalEmails || []).includes(address)),
  );
  return found.length === 1 ? found[0] : null;
}

// Guests sign in with the email on their household's Notion row: an emailed
// link, Google or Microsoft. There is no separate registration. An "account" is
// only the record of a verified sign-in, created on first use; it holds no
// permissions. Invitation links stay RSVP-only (application.mjs).
export function createAccounts({ ledger, mailer, notion, key, origin, now }) {
  const emailKey = (value) =>
    createHmac("sha256", key)
      .update("email:" + value)
      .digest("hex");
  async function issue({ address, householdId, generation }) {
    const raw = token(),
      id = randomUUID();
    const locale = await ledger.transaction((s) => {
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
        expiresAt: now() + 900000,
      };
      return invite.locale || "en";
    });
    // Token is a fragment, never an access-log query parameter. GET/scanners do not
    // consume it: the page requires an explicit user click and a same-origin POST.
    const url = `${origin}${locale === "es" ? "/es" : ""}/account/#${raw}`;
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
  // Record the verified sign-in and open a full guest session, inside one save.
  function signIn(s, row, address, csrf, value) {
    const invite = s.invitations[row.id];
    if (!invite?.active) throw error(403, "INVITATION_INACTIVE");
    s.accounts ??= {};
    const k = emailKey(address);
    let a = Object.values(s.accounts).find((v) => v.emailKey === k);
    if (!a) {
      a = {
        id: randomUUID(),
        householdId: row.id,
        name: row.name,
        email: address,
        emailKey: k,
        active: true,
        version: 1,
        verifiedAt: now(),
      };
      s.accounts[a.id] = a;
    }
    // Notion decides the household; an email moved to another row follows it.
    if (a.householdId !== row.id) a.householdId = row.id;
    a.name = row.name;
    a.lastSignInAt = now();
    s.profiles ??= {};
    s.profiles[row.id] ??= {
      id: row.id,
      name: row.name,
      contact: { email: row.email, phone: row.phone, address: null },
      version: 1,
      createdAt: now(),
      updatedAt: now(),
    };
    pruneSessions(s, now());
    s.sessions[hash(value)] = {
      kind: "guest",
      accountId: a.id,
      householdId: row.id,
      generation: invite.generation,
      email: address,
      csrf,
      expiresAt: now() + 1800000,
    };
  }
  return {
    emailKey,
    async request(body) {
      if (!mailer.configured) throw error(503, "EMAIL_SIGN_IN_UNAVAILABLE");
      const address = normalizeEmail(body.email);
      await rateLimit(
        ledger,
        "email-login:" + emailKey(address),
        3,
        900000,
        now(),
      );
      const row = rosterMatch(await notion.list(), address),
        invite = row && (await ledger.read()).invitations[row.id];
      // The shared budget bounds outgoing mail only. When spent, or when the
      // address is not on the guest list, nothing is sent and the response is
      // the same, so it never reveals which addresses exist.
      if (
        invite?.active &&
        (await withinLimit(ledger, "email-login-sends", 120, 3600000, now()))
      )
        await issue({
          address,
          householdId: row.id,
          generation: invite.generation,
        });
      return { requested: true };
    },
    async consume(raw) {
      const pending =
        typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw)
          ? (await ledger.read()).emailLinks?.[hash(raw)]
          : null;
      if (!pending || pending.expiresAt <= now()) {
        // Only rejected links share a budget; valid links are never blocked by it.
        await rateLimit(ledger, "email-verify-failures", 300, 900000, now());
        throw error(401, "EMAIL_LINK_INVALID");
      }
      // The email must still be on that household's Notion row.
      const row = rosterMatch(await notion.list({ fresh: true }), pending.email);
      if (row?.id !== pending.householdId)
        throw error(401, "EMAIL_LINK_INVALID");
      const value = token(),
        csrf = token();
      await ledger.transaction((s) => {
        const link = s.emailLinks?.[hash(raw)],
          invite = s.invitations[pending.householdId];
        if (
          !link ||
          link.expiresAt <= now() ||
          !invite?.active ||
          invite.generation !== link.generation
        )
          throw error(401, "EMAIL_LINK_INVALID");
        delete s.emailLinks[hash(raw)];
        signIn(s, row, link.email, csrf, value);
      });
      return { csrf, setCookie: cookie(value) };
    },
    // A Microsoft or Google identity already verified by the caller. Always a
    // guest session, whatever the person's admin status: administration goes
    // through /admin/login/. `inside` runs in the same save (nonce, binding).
    async ssoSession(address, inside) {
      const row = rosterMatch(await notion.list({ fresh: true }), address);
      if (!row) throw error(404, "SSO_NO_ACCOUNT");
      const value = token(),
        csrf = token();
      await ledger.transaction((s) => {
        inside(s);
        signIn(s, row, address, csrf, value);
      });
      return { csrf, setCookie: cookie(value) };
    },
  };
}
