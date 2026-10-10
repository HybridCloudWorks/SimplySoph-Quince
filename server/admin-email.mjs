import { token, hash, error, rateLimit, withinLimit } from "./auth.mjs";

// Emailed sign-in links for administrators. Who qualifies is decided by
// admin-access.mjs (the owner, or a ticked Notion "Administrator Eligible" row);
// the authenticator code is still required after the link.
export function createAdminEmail({ ledger, mailer, admins, origin, now }) {
  return {
    async request(body) {
      const address = String(body.email || "")
        .trim()
        .toLowerCase();
      if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
        throw error(422, "INVALID_EMAIL");
      if (!mailer.configured) throw error(503, "EMAIL_SIGN_IN_UNAVAILABLE");
      await rateLimit(ledger, "admin-email:" + hash(address), 3, 900000, now());
      // Unknown addresses never enter the ledger write queue. A spent send
      // budget is skipped silently so it cannot reveal who is an admin.
      if (
        !(await admins.find(address, { fresh: false })) ||
        !(await withinLimit(ledger, "admin-email-sends", 60, 3600000, now()))
      )
        return { requested: true };
      const raw = token();
      await ledger.transaction((s) => {
        s.adminEmailLinks ??= {};
        for (const [id, l] of Object.entries(s.adminEmailLinks))
          if (l.expiresAt <= now()) delete s.adminEmailLinks[id];
        s.adminEmailLinks[hash(raw)] = {
          email: address,
          expiresAt: now() + 900000,
        };
      });
      try {
        await mailer.send({
          id: token(),
          to: address,
          subject: "SimplySoph · Administrator sign-in",
          html: `<p>Continue to administrator verification. Your authenticator is still required.</p><p><a href="${origin}/admin/login/#${raw}">Confirm email and continue</a></p><p>This link works once and expires in 15 minutes. If you did not request it, ignore this email.</p>`,
        });
      } catch {
        /* Do not reveal account existence or retry an ambiguous send. */
      }
      return { requested: true };
    },
    async consume(raw) {
      if (typeof raw !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(raw))
        throw error(401, "EMAIL_LINK_INVALID");
      // Unknown tokens are rejected from a read and never queue a write.
      const known = (await ledger.read()).adminEmailLinks?.[hash(raw)];
      if (!known || known.expiresAt <= now())
        throw error(401, "EMAIL_LINK_INVALID");
      // Check Notion before spending the link, so a refused admin keeps it.
      const identity = await admins.find(known.email);
      if (!identity) throw error(403, "ADMIN_NOT_ALLOWED");
      await ledger.transaction((s) => {
        const link = s.adminEmailLinks?.[hash(raw)];
        if (!link || link.expiresAt <= now())
          throw error(401, "EMAIL_LINK_INVALID");
        delete s.adminEmailLinks[hash(raw)];
      });
      return identity;
    },
  };
}
