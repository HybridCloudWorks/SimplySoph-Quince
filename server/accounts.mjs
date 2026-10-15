import { randomUUID, createHmac } from "node:crypto";
import {
  token,
  hash,
  error,
  cookie,
  rateLimit,
  withinLimit,
  atLeast,
  pruneSessions,
} from "./auth.mjs";
import { renderSignInEmail, longDate } from "../emails/templates.mjs";
import { siteSettings } from "./site-settings.mjs";

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
  // The household's invitation must not be revoked; a household whose link
  // hasn't been issued yet can still sign in (re-audit D1).
  const invite = s.invitations[account?.householdId];
  return !!(account && account.active !== false && !account.deletedAt && (!invite || invite.active));
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
// The pages an emailed sign-in link may bring a guest back to, in English or
// Spanish ("share", "es/share"). Only a name from this list is kept with the
// link; anything else, a URL included, falls back to My account.
const returnPages = ["account", "rsvp", "share", "guestbook", "contact", "gallery"];
export function returnRoute(value) {
  const m = typeof value === "string" ? /^(es\/)?([a-z]+)$/.exec(value) : null;
  return m && returnPages.includes(m[2]) ? value : null;
}

// Guests sign in with the email on their household's Notion row: an emailed
// link, Google or Microsoft. There is no separate registration. An "account" is
// only the record of a verified sign-in, created on first use; it holds no
// permissions. Invitation links stay RSVP-only (application.mjs).
export function createAccounts({
  ledger,
  mailer,
  notion,
  key,
  origin,
  now,
  signInFloorMs = 0,
  // Shared with admin sign-in links; see createApplication.
  signInGate = (task) => task(),
}) {
  const emailKey = (value) =>
    createHmac("sha256", key)
      .update("email:" + value)
      .digest("hex");
  async function issue({ address, householdId, generation, household, returnTo }) {
    const raw = token(),
      id = randomUUID();
    const { locale, eventDate } = await ledger.transaction((s) => {
      s.emailLinks ??= {};
      for (const [k, link] of Object.entries(s.emailLinks))
        if (link.expiresAt <= now()) delete s.emailLinks[k];
      // Email sign-in needs only that the invitation is not revoked (or not
      // issued yet); the link generation does not matter (re-audit D1).
      const invite = s.invitations[householdId];
      if (invite && !invite.active) throw error(401, "INVITATION_INACTIVE");
      s.emailLinks[hash(raw)] = {
        id,
        email: address,
        emailKey: emailKey(address),
        householdId,
        generation,
        returnTo,
        expiresAt: now() + 900000,
      };
      // The language of the page the guest asked from, else the household's.
      const locale = returnTo ? (returnTo.startsWith("es/") ? "es" : "en") : invite?.locale || "en";
      return { locale, eventDate: longDate(siteSettings(s).ceremony.start, locale) };
    });
    // Token is a fragment, never an access-log query parameter. GET/scanners do not
    // consume it: the page requires an explicit user click and a same-origin POST.
    const url = `${origin}${locale === "es" ? "/es" : ""}/account/#${raw}`;
    const mail = renderSignInEmail({ locale, household, url, eventDate });
    try {
      await mailer.send({
        id,
        to: address,
        subject: mail.subject,
        secret: true,
        html: mail.html,
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
    if (invite && !invite.active) throw error(403, "INVITATION_INACTIVE");
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
    // Notion decides the household; an email moved to another row follows it,
    // and its sessions for the old household end.
    if (a.householdId !== row.id) {
      for (const [k, v] of Object.entries(s.sessions))
        if (v.accountId === a.id) delete s.sessions[k];
      a.householdId = row.id;
    }
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
      generation: invite?.generation ?? null,
      email: address,
      csrf,
      expiresAt: now() + 1800000,
    };
  }
  return {
    emailKey,
    async request(body) {
      if (!mailer.configured) throw error(503, "EMAIL_SIGN_IN_UNAVAILABLE");
      const address = normalizeEmail(body.email),
        returnTo = returnRoute(body.return);
      return signInGate(() => atLeast(signInFloorMs, async () => {
        const row = rosterMatch(await notion.list(), address),
          invite = row && (await ledger.read()).invitations[row.id];
        // Only sends are counted: 3 links per address per 15 minutes, plus a
        // shared hourly budget. Requests that send nothing count for nothing,
        // so a stranger cannot lock anyone out (AUTHN-5); the person still gets
        // every link that was sent. When a limit is reached, or the address is
        // not on the guest list, the response is the same.
        if (
          row &&
          (!invite || invite.active) &&
          (await withinLimit(ledger, "email-to:" + emailKey(address), 3, 900000, now())) &&
          (await withinLimit(ledger, "email-login-sends", 120, 3600000, now()))
        )
          try {
            await issue({
              address,
              householdId: row.id,
              generation: invite?.generation ?? null,
              household: row.name,
              returnTo,
            });
          } catch {
            // Only listed addresses reach this step, so a save error here must
            // not change the answer; the guest can simply ask again.
          }
        return { requested: true };
      }));
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
      const returnTo = await ledger.transaction((s) => {
        const link = s.emailLinks?.[hash(raw)],
          invite = s.invitations[pending.householdId];
        if (
          !link ||
          link.expiresAt <= now() ||
          (invite && !invite.active)
        )
          throw error(401, "EMAIL_LINK_INVALID");
        delete s.emailLinks[hash(raw)];
        signIn(s, row, link.email, csrf, value);
        return returnRoute(link.returnTo);
      });
      // The page to go back to comes from the link's own record; the page checks
      // the name against the same list before going there.
      return { csrf, setCookie: cookie(value), returnTo };
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
