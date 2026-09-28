import { token, hash, error, rateLimit } from "./auth.mjs";
import { accountActive } from "./accounts.mjs";

export function adminIdentity(state, address, owners) {
  if (owners.includes(address)) {
    const prior = Object.entries(state.admins).find(
      ([, a]) => a.email === address,
    );
    return { id: prior?.[0] || "owner:" + address, email: address };
  }
  const account = Object.values(state.accounts || {}).find(
    (a) => a.email === address,
  );
  if (accountActive(state, account) && account.permissions.includes("admin"))
    return {
      id: "account:" + account.id,
      email: address,
      accountId: account.id,
    };
  return null;
}

export function createAdminEmail({ ledger, mailer, adminEmails, origin, now }) {
  return {
    async request(body) {
      const address = String(body.email || "")
        .trim()
        .toLowerCase();
      if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        throw error(422, "INVALID_EMAIL");
      if (!mailer.configured) throw error(503, "EMAIL_SIGN_IN_UNAVAILABLE");
      await rateLimit(ledger, "admin-email-global", 60, 3600000, now());
      await rateLimit(ledger, "admin-email:" + hash(address), 3, 900000, now());
      const raw = token();
      const allowed = await ledger.transaction((s) => {
        s.adminEmailLinks ??= {};
        for (const [id, l] of Object.entries(s.adminEmailLinks))
          if (l.expiresAt <= now()) delete s.adminEmailLinks[id];
        if (!adminIdentity(s, address, adminEmails)) return false;
        s.adminEmailLinks[hash(raw)] = {
          email: address,
          expiresAt: now() + 900000,
        };
        return true;
      });
      if (allowed) {
        try {
          await mailer.send({
            id: token(),
            to: address,
            subject: "SimplySoph · Administrator Sign-In",
            html: `<p>Continue to administrator verification. Your authenticator is still required.</p><p><a href="${origin}/admin/login/#${raw}">Verify Email And Continue</a></p><p>This link works once and expires in 15 minutes. If you did not request it, ignore this email.</p>`,
          });
        } catch {
          /* Do not reveal account existence or retry an ambiguous send. */
        }
      }
      return { requested: true };
    },
    async consume(raw) {
      await rateLimit(ledger, "admin-email-verify", 120, 900000, now());
      if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw))
        throw error(401, "EMAIL_LINK_INVALID");
      return ledger.transaction((s) => {
        const link = s.adminEmailLinks?.[hash(raw)];
        if (!link || link.expiresAt <= now())
          throw error(401, "EMAIL_LINK_INVALID");
        const identity = adminIdentity(s, link.email, adminEmails);
        if (!identity) throw error(401, "EMAIL_LINK_INVALID");
        delete s.adminEmailLinks[hash(raw)];
        return identity;
      });
    },
  };
}
