import { createAdminRecords } from "./admin-records.mjs";
import { audience, recipientName, validEmail } from "./audience.mjs";
import { createWhatsapp } from "./whatsapp.mjs";
import { createSms, smsCompliantText, smsPreview } from "./sms.mjs";
import { createPlanning } from "./planning.mjs";
import { createAdminEmail } from "./admin-email.mjs";
import { createNotifications } from "./notifications.mjs";
import { createMailBatches } from "./mail-batches.mjs";
import { normalizeVideo, mediaResponse } from "./video.mjs";
import { calendar, contactTopics, escapeHtml } from "../site/celebration.mjs";
import { siteSettings, validateSettings } from "./site-settings.mjs";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  token,
  hash,
  error,
  seal,
  unseal,
  cookie,
  rateLimit,
  chargeFailures,
  pruneSessions,
  newMfaSecret,
  verifyTotp,
  invitationCode,
  invitationCredential,
} from "./auth.mjs";
import { validateHouseholdRsvp } from "./rsvp-validation.mjs";
import { renderEmail } from "../emails/templates.mjs";
import {
  createAccounts,
  accountActive,
  allowedPages,
  pagePermissions,
} from "./accounts.mjs";
const events = ["ceremony", "dinner", "dance"];
const safeText = (s, max = 1000) => {
  if (
    typeof s !== "string" ||
    s.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)
  )
    throw error(422, "INVALID_TEXT");
  return s.trim();
};
const email = (s) => {
  s = safeText(s, 254);
  if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
    throw error(422, "INVALID_EMAIL");
  return s;
};
const uuid = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{8,128}$/.test(s);
const audit = (s, actor, action, id, now) => {
  s.audit.push({ actor, action, id, at: new Date(now).toISOString() });
  s.audit = s.audit.slice(-5000);
};
// A minted link matches the household's current generation and, when it was
// minted for an email draft, opens only once that email was actually sent.
const linkOpens = (s, fingerprint, r) => {
  const link = s.invitationLinks?.[fingerprint];
  if (link?.householdId !== r.id || link.generation !== r.generation) return false;
  if (!link.draftId) return true;
  return ["accepted", "unknown", "sending"].includes(s.outbox[link.draftId]?.state);
};
const responseCount = (r) =>
  r?.attendance?.dinner
    ? r.attendance.dinner.adultsTeens + r.attendance.dinner.kids
    : 0;
function digestInput(input) {
  return hash(JSON.stringify(input));
}
export function createApplication({
  ledger,
  notion,
  mailer,
  verifyGoogle,
  media,
  documents,
  smsTransport,
  smsWebhook,
  whatsappTransport,
  whatsappWebhook,
  whatsappTemplates = [],
  videoProcessor = normalizeVideo,
  key,
  origin,
  clientId = "",
  deadline = "2026-10-31T23:59:00-05:00",
  adminEmails = [],
  adminDelegateEmails = [],
  notificationEmails = adminEmails,
  now = Date.now,
  mailSleep,
}) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("32-byte application key required");
  const sms = createSms({
    ledger,
    notion,
    transport: smsTransport,
    webhook: smsWebhook,
    now,
  });
  const whatsapp = createWhatsapp({
    ledger,
    notion,
    transport: whatsappTransport,
    webhook: whatsappWebhook,
    templates: whatsappTemplates,
    key,
    origin,
    now,
  });
  const sendNotification = createNotifications({
    ledger,
    mailer,
    adminEmails: notificationEmails,
    origin,
    now,
  });
  const authorizedAdminEmails = [
    ...new Set([...adminEmails, ...adminDelegateEmails]),
  ];
  const ownerSession = (session) =>
    !session.accountId && adminEmails.includes(session.email);
  async function checkAdministratorEligibility(accountId, address) {
    if (!accountId) {
      if (
        adminDelegateEmails.includes(address) &&
        !adminEmails.includes(address)
      ) {
        // Authorization reads Notion fresh: a revoked eligibility must apply at once.
        const rows = await notion.list({ fresh: true });
        if (
          !rows.some(
            (r) =>
              !r.archived &&
              r.administratorEligible &&
              r.email?.trim().toLowerCase() === address,
          )
        )
          throw error(403, "ADMIN_NOT_ELIGIBLE");
      }
      return;
    }
    const a = (await ledger.read()).accounts?.[accountId];
    if (!a || !a.permissions.includes("admin"))
      throw error(403, "ADMIN_NOT_ALLOWED");
    const row = await notion.read(a.householdId, { fresh: true });
    if (row.archived || !row.administratorEligible)
      throw error(403, "ADMIN_NOT_ELIGIBLE");
  }
  const sessionValid = (s, row) =>
    row &&
    row.expiresAt > now() &&
    (row.kind === "admin"
      ? row.accountId
        ? accountActive(s, s.accounts?.[row.accountId]) &&
          allowedPages(s, row).includes("admin")
        : authorizedAdminEmails.includes(row.email)
      : s.invitations[row.householdId]?.active &&
        s.invitations[row.householdId].generation === row.generation &&
        (row.accountId
          ? accountActive(s, s.accounts?.[row.accountId])
          : row.scope === "rsvp" ||
            !Object.values(s.accounts || {}).some(
              (a) => a.householdId === row.householdId,
            )));
  // After a household registers, its private link still opens the RSVP, but
  // only the RSVP: contact details stay hidden and every other route treats the
  // session as signed out. Account pages need the verified email sign-in.
  const rsvpScopeRoutes = new Set([
    "GET /api/session",
    "GET /api/invitation",
    "POST /api/rsvp",
    "POST /api/logout",
  ]);
  const hiddenContact = () => ({ email: "", phone: "", address: null });
  // One derived status per household for the organizer dashboard; computed from
  // the ledger on read so it can never drift from the underlying records.
  const householdStatuses = [
    "not-issued",
    "revoked",
    "issued",
    "sent",
    "opened",
    "attending",
    "declined",
  ];
  function householdStatus(s, id) {
    const invite = s.invitations[id];
    if (!invite) return { status: "not-issued" };
    if (!invite.active) return { status: "revoked" };
    const response = s.responses[invite.latestSubmissionId];
    if (response) {
      const people = Object.values(response.attendance).reduce(
        (n, v) => n + v.adultsTeens + v.kids,
        0,
      );
      return {
        status: people > 0 ? "attending" : "declined",
        respondedAt: response.submittedAt,
      };
    }
    if (invite.openedAt) return { status: "opened", openedAt: invite.openedAt };
    const sent = Object.values(s.outbox).some(
      (j) =>
        j.householdId === id &&
        ["invitation", "reminder"].includes(j.type) &&
        j.generation === invite.generation &&
        j.state === "accepted",
    );
    return { status: sent ? "sent" : "issued" };
  }
  async function context(req) {
    const raw = (req.headers?.cookie || "")
      .split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("__session="))
      ?.slice(10);
    const s = await ledger.read(),
      session = raw ? s.sessions[hash(raw)] : null;
    return {
      state: s,
      session: sessionValid(s, session) ? session : null,
      sessionHash: raw ? hash(raw) : null,
    };
  }
  // Page views may use the short Notion cache; RSVP submission reads fresh.
  async function guestInvitation(session, { fresh = false } = {}) {
    const row = await notion.read(session.householdId, { fresh }),
      s = await ledger.read(),
      record = s.invitations[row.id];
    if (
      row.archived ||
      !record?.active ||
      record.generation !== session.generation
    )
      throw error(401, "INVITATION_INACTIVE");
    if (!row.validCapacity) throw error(409, "CAPACITY_NEEDS_REVIEW");
    return {
      ...row,
      ...record,
      capacity: row.capacity,
      deadline,
      latestSubmissionId: record.latestSubmissionId ?? null,
    };
  }
  // Notion sync and outbound mail are split into ledger steps (claim/finish,
  // run inside a transaction) and provider calls (outside any transaction), so
  // the RSVP path can fold both claims into its own save and both results into
  // one final save. syncOne and dispatchMail compose the same steps standalone.
  function claimSync(s, householdId, owner) {
    const row = s.invitations[householdId];
    const profile = s.profiles?.[householdId];
    if (
      !row ||
      (!row.latestSubmissionId && !profile) ||
      row.syncLease?.until > now()
    )
      return null;
    row.syncLease = { owner, until: now() + 90000 };
    const response = s.responses[row.latestSubmissionId];
    const account = Object.values(s.accounts || {}).find(
      (a) => a.householdId === householdId,
    );
    return structuredClone({ response, profile, account });
  }
  async function projectSync(householdId, task) {
    try {
      if (task.response)
        await notion.project(householdId, {
          ...task.response,
          contact: task.profile?.contact || task.response.contact,
        });
      else await notion.projectContact(householdId, task.profile.contact);
      if (task.account) await notion.projectAccount(householdId, task.account);
      return null;
    } catch (e) {
      return e.code || "NOTION_UNAVAILABLE";
    }
  }
  function finishSync(s, householdId, owner, task, failure) {
    const row = s.invitations[householdId];
    if (row.syncLease?.owner === owner) delete row.syncLease;
    // Always leave a newer response pending after an old projection finishes.
    const account = Object.values(s.accounts || {}).find(
      (a) => a.householdId === householdId,
    );
    if (
      failure ||
      (row.latestSubmissionId || null) !== (task.response?.id || null) ||
      s.profiles?.[householdId]?.version !== task.profile?.version ||
      account?.version !== task.account?.version
    ) {
      row.syncState = "pending";
      row.syncError = failure;
    } else {
      row.syncState = "synced";
      row.syncError = null;
    }
    return row.syncState;
  }
  async function syncOne(householdId) {
    const owner = token();
    const task = await ledger.transaction((s) =>
      claimSync(s, householdId, owner),
    );
    if (!task) return;
    const failure = await projectSync(householdId, task);
    await ledger.transaction((s) =>
      finishSync(s, householdId, owner, task, failure),
    );
  }
  // Throws (leaving the draft untouched) unless the draft may be sent now.
  function claimMail(s, id, currentGuest) {
    const j = s.outbox[id];
    if (!j || j.archived) throw error(404, "NOT_FOUND");
    if (j.state !== "draft") throw error(409, "MAIL_ALREADY_ATTEMPTED");
    const invite = s.invitations[j.householdId];
    if (j.type === "custom") {
      if (
        invite?.active === false ||
        (!j.directlySelected &&
          !currentGuest.distributionGroups?.some((g) => j.groups.includes(g)))
      )
        throw error(409, "MAIL_DRAFT_STALE");
    } else if (!invite?.active || invite.generation !== j.generation)
      throw error(409, "MAIL_DRAFT_STALE");
    const expectedRecipient = j.responseId
      ? (s.profiles?.[j.householdId]?.contact.email ??
        s.responses[invite.latestSubmissionId]?.contact.email)
      : currentGuest.email;
    if (
      expectedRecipient?.trim().toLowerCase() !== j.to.trim().toLowerCase() ||
      (j.responseId && j.responseId !== invite.latestSubmissionId)
    )
      throw error(409, "MAIL_DRAFT_STALE");
    j.state = "sending";
    j.attemptAt = now();
    return structuredClone(j);
  }
  async function sendMail(job) {
    try {
      const result = await mailer.send({
        ...job,
        html: unseal(job.content, key),
      });
      return { state: "accepted", code: null, provider: result?.provider || null };
    } catch (e) {
      return {
        state: e.code === "MAIL_DELIVERY_UNKNOWN" ? "unknown" : "failed",
        code: e.code,
        provider: null,
      };
    }
  }
  function finishMail(s, id, outcome) {
    s.outbox[id].state = outcome.state;
    s.outbox[id].error = outcome.code;
    s.outbox[id].provider = outcome.provider;
    s.outbox[id].finishedAt = now();
  }
  async function dispatchMail(id) {
    if (!mailer.configured) throw error(503, "MAIL_NOT_CONFIGURED");
    const pending = (await ledger.read()).outbox[id];
    if (!pending || pending.archived) throw error(404, "NOT_FOUND");
    const currentGuest = await notion.read(pending.householdId, { fresh: true });
    if (currentGuest.archived) throw error(409, "INVITATION_INACTIVE");
    const job = await ledger.transaction((s) => claimMail(s, id, currentGuest));
    const outcome = await sendMail(job);
    await ledger.transaction((s) => finishMail(s, id, outcome));
    return { id, state: outcome.state };
  }
  function queue(
    s,
    {
      type,
      household,
      recipient,
      locale = "en",
      url,
      updateText = "",
      responseId = null,
    },
  ) {
    const id = randomUUID(),
      rendered = renderEmail({
        type,
        locale,
        household: household.name,
        url: url || origin + (locale === "es" ? "/es" : "") + "/rsvp/",
        eventDate:
          locale === "es"
            ? "Viernes, 15 de enero de 2027"
            : "Friday, January 15, 2027",
        rsvpDeadline:
          locale === "es"
            ? "31 de octubre de 2026, 11:59 p. m. (hora central)"
            : "October 31, 2026, 11:59 PM Central",
        dateConfirmed: true,
        receiptCommitted: !!responseId,
        preview: false,
        updateText,
      });
    s.outbox[id] = {
      id,
      type,
      householdId: household.id,
      to: recipient,
      subject: rendered.subject,
      content: seal(rendered.html, key),
      state: "draft",
      createdAt: now(),
      responseId,
      generation: s.invitations[household.id]?.generation,
    };
    return id;
  }
  const accounts = createAccounts({
    ledger,
    mailer,
    notion,
    key,
    origin,
    now,
    syncOne,
  });
  const records = createAdminRecords({ ledger, key, now });
  const planning = createPlanning({ ledger, documents, notion, now });
  const batches = createMailBatches({
    ledger,
    notion,
    queue: (s, args) => queue(s, args),
    dispatchMail: (id) => dispatchMail(id),
    audit,
    mailer,
    origin,
    now,
    sleep: mailSleep,
  });
  const adminEmail = createAdminEmail({
    ledger,
    mailer,
    adminEmails: authorizedAdminEmails,
    origin,
    now,
  });
  async function dispatch(req) {
    const { path, method = "GET", body = {}, headers = {} } = req;
    if (["/api/whatsapp/status", "/api/whatsapp/inbound"].includes(path)) {
      if (method !== "POST") throw error(405, "METHOD_NOT_ALLOWED");
      return whatsapp.callback(
        path.split("/").pop(),
        body,
        headers["x-twilio-signature"],
      );
    }
    if (["/api/twilio/status", "/api/twilio/inbound"].includes(path)) {
      if (method !== "POST") throw error(405, "METHOD_NOT_ALLOWED");
      return sms.callback(
        path.split("/").pop(),
        body,
        headers["x-twilio-signature"],
      );
    }
    if (method !== "GET" && headers.origin !== origin)
      throw error(403, "ORIGIN_REJECTED");
    if (path === "/api/config" && method === "GET")
      return {
        clientId,
        deadline,
        mailConfigured: mailer.configured,
        live: true,
      };
    if (path === "/api/site" && method === "GET") {
      return { site: siteSettings(await ledger.read()) };
    }
    if (path.startsWith("/api/calendar/") && method === "GET") {
      const kind = path.slice(14).replace(/\.ics$/, "");
      if (!["ceremony", "dinner", "reception"].includes(kind))
        throw error(404, "NOT_FOUND");
      const site = siteSettings(await ledger.read());
      if (!site[kind].end) throw error(409, "END_TIME_PENDING");
      return {
        binary: Buffer.from(calendar(kind, site)),
        contentType: "text/calendar; charset=utf-8",
        disposition: 'attachment; filename="sophia-' + kind + '.ics"',
      };
    }
    if (path === "/api/public" && method === "GET") {
      const s = await ledger.read();
      return {
        announcements: Object.values(s.announcements).filter(
          (r) => r.published && !r.archived,
        ),
        messages: Object.values(s.messages)
          .filter((r) => r.kind === "guestbook" && r.state === "approved")
          .map((r) => ({ id: r.id, name: r.name, text: r.text })),
        photos: [], // Media metadata and bytes require a registered guest or administrator.
      };
    }
    if (path === "/api/auth/admin-email/request" && method === "POST")
      return adminEmail.request(body);
    if (
      ["/api/auth/google", "/api/auth/admin-email/verify"].includes(path) &&
      method === "POST"
    ) {
      const identity = await chargeFailures(
          ledger,
          "admin-login-failures",
          60,
          900000,
          now(),
          () =>
            path === "/api/auth/google"
              ? verifyGoogle(safeText(body.credential, 10000))
              : adminEmail.consume(body.token),
        ),
        challenge = token();
      await rateLimit(
        ledger,
        "admin-login:" + hash(identity.email),
        10,
        900000,
        now(),
      );
      const result = await ledger.transaction((s) => {
        for (const [id, c] of Object.entries(s.challenges))
          if (c.expiresAt <= now()) delete s.challenges[id];
        if (!identity.accountId) {
          const existing = Object.entries(s.admins).find(
            ([, a]) => a.email === identity.email,
          );
          if (existing) identity.id = existing[0];
        }
        const secret = newMfaSecret();
        const admin = s.admins[identity.id];
        s.challenges[hash(challenge)] = {
          ...identity,
          expiresAt: now() + 300000,
          attempts: 0,
          pendingSecret: admin ? null : seal(secret, key),
        };
        return admin
          ? {}
          : {
              enrollmentSecret: secret,
              provisioningUri: `otpauth://totp/SimplySoph:${encodeURIComponent(identity.email)}?secret=${secret}&issuer=SimplySoph`,
            };
      });
      return { challenge, ...result };
    }
    if (path === "/api/auth/mfa" && method === "POST") {
      const pendingChallenge = (await ledger.read()).challenges[
        hash(safeText(body.challenge, 100))
      ];
      // Each challenge allows 5 code attempts; unknown challenges share a budget
      // and are rejected from a read, never entering the ledger write queue.
      if (!pendingChallenge) {
        await rateLimit(ledger, "mfa-unknown-challenge", 300, 900000, now());
        throw error(401, "SIGN_IN_AGAIN");
      }
      await checkAdministratorEligibility(
          pendingChallenge.accountId,
          pendingChallenge.email,
        );
      const sessionToken = token(),
        csrf = token();
      const outcome = await ledger.transaction((s) => {
        const c = s.challenges[hash(safeText(body.challenge, 100))];
        if (!c || c.expiresAt <= now() || c.attempts >= 5)
          throw error(401, "SIGN_IN_AGAIN");
        if (
          c.accountId
            ? !accountActive(s, s.accounts?.[c.accountId]) ||
              !allowedPages(s, c).includes("admin")
            : !authorizedAdminEmails.includes(c.email)
        )
          throw error(403, "ADMIN_NOT_ALLOWED");
        c.attempts++;
        const existing = s.admins[c.id];
        const secret = unseal(existing?.secret || c.pendingSecret, key),
          step = verifyTotp(secret, body.code, now(), existing?.lastStep ?? -1);
        if (step === null) return { failed: true };
        s.admins[c.id] = {
          secret: seal(secret, key),
          lastStep: step,
          email: c.email,
        };
        pruneSessions(s, now());
        s.sessions[hash(sessionToken)] = {
          kind: "admin",
          actor: c.id,
          email: c.email,
          csrf,
          ...(c.accountId ? { accountId: c.accountId } : {}),
          expiresAt: now() + 1800000,
        };
        delete s.challenges[hash(body.challenge)];
        audit(s, c.id, "admin-sign-in", c.id, now());
        return { failed: false };
      });
      if (outcome.failed) throw error(401, "INVALID_MFA");
      return { csrf, setCookie: cookie(sessionToken) };
    }
    if (path === "/api/invitation-session" && method === "POST") {
      const credential = invitationCredential(body.token);
      if (!credential) {
        await rateLimit(ledger, "invite-failures", 600, 900000, now());
        throw error(401, "INVALID_INVITATION");
      }
      const fingerprint = hash(credential),
        s = await ledger.read();
      const row = Object.values(s.invitations).find(
        (r) =>
          (r.tokenHash === fingerprint ||
            r.codeHash === fingerprint ||
            linkOpens(s, fingerprint, r)) &&
          r.active,
      );
      if (!row) {
        await rateLimit(ledger, "invite-failures", 600, 900000, now());
        throw error(401, "INVALID_INVITATION");
      }
      await rateLimit(ledger, hash("invite:" + row.id), 20, 900000, now());
      // Typed codes (80-bit) stay closed after registration; 256-bit links reopen RSVP only.
      const viaCode = row.codeHash === fingerprint;
      const current = await notion.read(row.id, { fresh: true });
      if (current.archived || !current.validCapacity)
        throw error(401, "INVALID_INVITATION");
      const value = token(),
        csrf = token();
      await ledger.transaction((s) => {
        const r = s.invitations[row.id];
        if (
          !r?.active ||
          (r.tokenHash !== fingerprint &&
            r.codeHash !== fingerprint &&
            !linkOpens(s, fingerprint, r))
        )
          throw error(401, "INVALID_INVITATION");
        const registered = !!accounts.accountFor(s, row.id);
        if (registered && viaCode) throw error(409, "EMAIL_SIGN_IN_REQUIRED");
        r.openedAt ??= now();
        s.profiles ??= {};
        s.profiles[row.id] ??= {
          id: row.id,
          name: current.name,
          contact: {
            email: current.email,
            phone: current.phone,
            address: null,
          },
          version: 1,
          createdAt: now(),
          updatedAt: now(),
        };
        pruneSessions(s, now());
        s.sessions[hash(value)] = {
          kind: "guest",
          householdId: r.id,
          generation: r.generation,
          ...(registered ? { scope: "rsvp" } : {}),
          csrf,
          expiresAt: now() + 1800000,
        };
      });
      return { csrf, setCookie: cookie(value) };
    }
    const ctx = await context(req);
    if (
      ctx.session?.scope === "rsvp" &&
      !rsvpScopeRoutes.has(method + " " + path)
    )
      ctx.session = null;
    const { session } = ctx;
    if (session && method !== "GET")
      await rateLimit(
        ledger,
        hash("actor:" + (session.actor || session.householdId)),
        120,
        3600000,
        now(),
      );
    if (path === "/api/session" && method === "GET")
      return {
        kind: session?.kind ?? null,
        csrf: session?.csrf ?? null,
        verified: !!session?.accountId,
        scope: session?.scope ?? null,
        permissions: allowedPages(ctx.state, session),
        owner: session?.kind === "admin" && ownerSession(session),
      };
    const requireAuth = (kind) => {
      if (!session || (kind && session.kind !== kind))
        throw error(401, "SIGN_IN_REQUIRED");
      if (method !== "GET" && headers["x-csrf-token"] !== session.csrf)
        throw error(403, "CSRF_REJECTED");
    };
    if (path === "/api/gallery" && method === "GET") {
      requireAuth();
      if (session.kind !== "admin" && !session.accountId)
        throw error(403, "VERIFIED_ACCOUNT_REQUIRED");
      return {
        media: Object.values(ctx.state.photos)
          .filter((r) => r.state === "approved")
          .map((r) => ({
            id: r.id,
            kind: r.kind || "photo",
            album: r.album || "event",
            caption: r.caption,
            url: "/api/photo/" + r.id,
          })),
      };
    }
    if (path === "/api/auth/email/request" && method === "POST") {
      if (body.register === true) requireAuth("guest");
      return accounts.request(body, session);
    }
    if (path === "/api/auth/email/verify" && method === "POST")
      return accounts.consume(body.token);
    if (path === "/api/auth/step-up" && method === "POST") {
      requireAuth("guest");
      await checkAdministratorEligibility(session.accountId, session.email);
      if (!allowedPages(ctx.state, session).includes("admin"))
        throw error(403, "ADMIN_NOT_ALLOWED");
      const challenge = token(),
        secret = newMfaSecret();
      return ledger.transaction((s) => {
        const a = s.accounts?.[session.accountId];
        if (!accountActive(s, a) || !a.permissions.includes("admin"))
          throw error(403, "ADMIN_NOT_ALLOWED");
        const id = "account:" + a.id,
          admin = s.admins[id];
        s.challenges[hash(challenge)] = {
          id,
          email: a.email,
          accountId: a.id,
          expiresAt: now() + 300000,
          attempts: 0,
          pendingSecret: admin ? null : seal(secret, key),
        };
        return { challenge, ...(admin ? {} : { enrollmentSecret: secret }) };
      });
    }
    if (path === "/api/account" && method === "GET") {
      requireAuth("guest");
      const a = ctx.state.accounts?.[session.accountId];
      return {
        account: a
          ? { name: a.name, email: a.email, permissions: a.permissions }
          : null,
      };
    }
    if (path.startsWith("/api/pages/") && method === "GET") {
      requireAuth();
      const page = path.slice(11);
      if (!pagePermissions.includes(page) || page === "admin")
        throw error(404, "NOT_FOUND");
      if (
        session.kind !== "admin" &&
        !allowedPages(ctx.state, session).includes(page)
      )
        throw error(403, "PAGE_NOT_ALLOWED");
      return {
        page,
        ...(page === "gifts"
          ? { registries: siteSettings(ctx.state).registries }
          : {}),
        ...(["costs", "padrinos"].includes(page)
          ? {
              planning: Object.values(ctx.state.planning?.[page] || {}).filter(
                (r) => !r.deleted,
              ),
            }
          : {}),
        content: ctx.state.privatePages?.[page] || {
          en: "",
          es: "",
          links: [],
        },
      };
    }
    if (path === "/api/logout" && method === "POST") {
      requireAuth();
      await ledger.transaction((s) => {
        delete s.sessions[ctx.sessionHash];
      });
      return {
        setCookie:
          "__session=; Path=/api; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
      };
    }
    if (path === "/api/invitation" && method === "GET") {
      requireAuth("guest");
      const row = await guestInvitation(session),
        s = await ledger.read();
      return {
        name: row.name,
        capacity: row.capacity,
        invited: row.invited,
        deadline,
        previousSubmissionId: row.latestSubmissionId,
        response: row.latestSubmissionId
          ? session.scope === "rsvp"
            ? { ...s.responses[row.latestSubmissionId], contact: hiddenContact() }
            : s.responses[row.latestSubmissionId]
          : null,
        contact:
          session.scope === "rsvp"
            ? hiddenContact()
            : s.profiles?.[row.id]?.contact || {
                email: row.email,
                phone: row.phone,
                address: null,
              },
        contactHidden: session.scope === "rsvp",
        syncState: row.syncState,
      };
    }
    if (path === "/api/whatsapp/consent" && ["GET", "POST"].includes(method)) {
      requireAuth("guest");
      await guestInvitation(session);
      return whatsapp.consent(
        session.householdId,
        method === "POST" ? body : undefined,
      );
    }
    if (path === "/api/profile" && method === "GET") {
      requireAuth("guest");
      const invitation = await guestInvitation(session),
        state = await ledger.read();
      return {
        profile: state.profiles?.[session.householdId],
        name: invitation.name,
        invited: invitation.invited,
        capacity: invitation.capacity,
        syncState: invitation.syncState,
      };
    }
    if (path === "/api/profile" && method === "POST") {
      requireAuth("guest");
      await guestInvitation(session);
      if (
        Object.keys(body).some(
          (k) => !["version", "email", "phone", "address"].includes(k),
        )
      )
        throw error(422, "INVALID_FIELDS");
      const contact = {
        email: email(body.email),
        phone: safeText(body.phone, 40),
        address: body.address === null ? null : safeText(body.address, 500),
      };
      const profile = await ledger.transaction((s) => {
        const invite = s.invitations[session.householdId],
          p = s.profiles?.[session.householdId];
        if (!invite?.active || invite.generation !== session.generation)
          throw error(401, "INVITATION_INACTIVE");
        if (!p || p.version !== body.version)
          throw error(409, "PROFILE_CHANGED");
        p.contact = contact;
        p.version++;
        p.updatedAt = now();
        invite.syncState = "pending";
        audit(
          s,
          session.householdId,
          "profile-updated",
          session.householdId,
          now(),
        );
        return structuredClone(p);
      });
      await syncOne(session.householdId);
      return {
        profile,
        saved: true,
        syncState: (await ledger.read()).invitations[session.householdId]
          .syncState,
      };
    }
    if (path === "/api/messages" && method === "GET") {
      requireAuth("guest");
      await guestInvitation(session);
      return {
        messages: Object.values((await ledger.read()).messages)
          .filter(
            (m) =>
              m.householdId === session.householdId && m.kind === "contact",
          )
          .map((m) => ({
            id: m.id,
            text: m.text,
            at: m.at,
            replies: m.replies || [],
          })),
      };
    }
    if (path === "/api/rsvp" && method === "POST") {
      requireAuth("guest");
      const id = headers["idempotency-key"];
      if (!uuid(id)) throw error(422, "IDEMPOTENCY_REQUIRED");
      const row = await guestInvitation(session, { fresh: true }),
        fingerprint = digestInput(body),
        owner = token();
      // One save records the response and claims the Notion sync and the
      // receipt email; one final save records both outcomes (2 writes, not 5).
      const claim = (s, response) => {
        const draft = Object.values(s.outbox).find(
          (j) =>
            j.responseId === response.id &&
            ["receipt", "update"].includes(j.type) &&
            j.state === "draft" &&
            !j.archived,
        );
        let job = null;
        if (draft && mailer.configured)
          try {
            job = claimMail(s, draft.id, row);
          } catch {
            /* Stale receipt: the RSVP stays saved; the family can review it. */
          }
        return { response, task: claimSync(s, row.id, owner), job };
      };
      const { response: receipt, task, job } = await ledger.transaction((s) => {
        const current = s.invitations[row.id];
        if (!current?.active || current.generation !== session.generation)
          throw error(401, "INVITATION_INACTIVE");
        const existing = s.responses[id];
        if (existing) {
          if (
            existing.householdId !== row.id ||
            existing.fingerprint !== fingerprint
          )
            throw error(409, "IDEMPOTENCY_CONFLICT");
          return claim(s, existing);
        }
        const data = validateHouseholdRsvp(
          body,
          {
            ...row,
            latestSubmissionId: current.latestSubmissionId,
            invited: current.invited,
          },
          now(),
        );
        // A link-only session cannot see or change the registered household's
        // contact details, so the saved contact (and receipt address) is kept.
        if (session.scope === "rsvp")
          data.contact = structuredClone(
            s.profiles?.[row.id]?.contact ??
              s.responses[current.latestSubmissionId]?.contact ??
              hiddenContact(),
          );
        const response = {
          ...data,
          id,
          householdId: row.id,
          fingerprint,
          submittedAt: new Date(now()).toISOString(),
        };
        s.responses[id] = response;
        if (s.profiles?.[row.id]) {
          s.profiles[row.id].contact = data.contact;
          s.profiles[row.id].version++;
          s.profiles[row.id].updatedAt = now();
        }
        current.latestSubmissionId = id;
        current.syncState = "pending";
        if (data.contact.email)
          queue(s, {
            type: response.previousSubmissionId ? "update" : "receipt",
            household: row,
            recipient: data.contact.email,
            responseId: id,
            locale: current.locale || "en",
          });
        audit(s, row.id, "rsvp", id, now());
        // In-app only: RSVPs reach the family's inbox inside the same save,
        // with no email (the owner requires a person in the loop for sending).
        const people = Object.values(data.attendance).reduce(
          (n, v) => n + v.adultsTeens + v.kids,
          0,
        );
        const note = randomUUID();
        s.notifications ??= {};
        s.notifications[note] = {
          id: note,
          kind: "rsvp",
          householdId: row.id,
          title: `${row.name} ${response.previousSubmissionId ? "updated their RSVP" : "responded"}`,
          text: people
            ? `Attending: ${people} ${people === 1 ? "person" : "people"}`
            : "Not attending",
          at: now(),
          read: false,
          emailState: "none",
        };
        return claim(s, response);
      });
      // Provider calls run outside the ledger transaction; a crash here leaves
      // the sync lease to expire (sync retried later) and the receipt claimed
      // as "sending" (never resent blindly), exactly as the standalone paths do.
      const failure = task ? await projectSync(row.id, task) : null;
      const outcome = job ? await sendMail(job) : null;
      const syncState =
        task || job
          ? await ledger.transaction((s) => {
              if (job) finishMail(s, job.id, outcome);
              return task
                ? finishSync(s, row.id, owner, task, failure)
                : s.invitations[row.id].syncState;
            })
          : (await ledger.read()).invitations[row.id].syncState;
      return {
        id: receipt.id,
        submittedAt: receipt.submittedAt,
        saved: true,
        syncState,
      };
    }
    if (path === "/api/messages" && method === "POST") {
      requireAuth("guest");
      await guestInvitation(session);
      await rateLimit(
        ledger,
        hash("message:" + session.householdId),
        5,
        3600000,
        now(),
      );
      if (!["contact", "guestbook"].includes(body.kind))
        throw error(422, "INVALID_KIND");
      if (body.kind === "guestbook" && body.consent !== true)
        throw error(422, "CONSENT_REQUIRED");
      const id = randomUUID(),
        name = safeText(body.name, 100),
        text = safeText(body.text, 2000);
      if (!name || !text) throw error(422, "MESSAGE_REQUIRED");
      const contactEmail =
        body.kind === "contact"
          ? email(
              body.email ||
                ctx.state.profiles?.[session.householdId]?.contact?.email ||
                ctx.state.accounts?.[session.accountId]?.email ||
                "",
            )
          : "";
      const topic = body.kind === "contact" ? body.topic || "Other" : "";
      if (body.kind === "contact" && !contactTopics.includes(topic))
        throw error(422, "INVALID_TOPIC");
      await ledger.transaction((s) => {
        s.notifications ??= {};
        s.notifications[id] = {
          id,
          kind: body.kind === "contact" ? "contact" : "guestbook",
          at: now(),
          read: false,
        };
        s.messages[id] = {
          email: contactEmail,
          topic,
          id,
          householdId: session.householdId,
          name,
          text,
          kind: body.kind,
          state: "pending",
          at: now(),
        };
      });
      await sendNotification(id);
      return { id, state: "pending" };
    }
    if (["/api/photos", "/api/videos"].includes(path) && method === "POST") {
      requireAuth("guest");
      await guestInvitation(session);
      if (body.consent !== true) throw error(422, "CONSENT_REQUIRED");
      await rateLimit(
        ledger,
        hash("photo:" + session.householdId),
        20,
        86400000,
        now(),
      );
      if (typeof body.base64 !== "string" || body.base64.length > 11_200_000)
        throw error(413, "PHOTO_TOO_LARGE");
      const bytes = Buffer.from(body.base64, "base64");
      if (
        !bytes.length ||
        bytes.length > 8 * 1024 * 1024 ||
        bytes.toString("base64") !== body.base64
      )
        throw error(422, "INVALID_PHOTO");
      const isVideo = path === "/api/videos";
      const album = safeText(body.album || "event", 40);
      if (!siteSettings(await ledger.read()).albums.some((a) => a.id === album))
        throw error(422, "INVALID_ALBUM");
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      if (!isVideo && !jpeg && !png && !webp) throw error(422, "INVALID_PHOTO");
      const caption = safeText(body.caption || "", 200);
      let image;
      try {
        image = isVideo
          ? await videoProcessor(bytes)
          : await sharp(bytes, {
              limitInputPixels: 25000000,
              animated: false,
            })
              .rotate()
              .resize({
                width: 2000,
                height: 2000,
                fit: "inside",
                withoutEnlargement: true,
              })
              .jpeg({ quality: 85 })
              .toBuffer();
      } catch (e) {
        if (isVideo) throw e;
        throw error(422, "INVALID_PHOTO");
      }
      const id = randomUUID();
      await media.put(id, image, isVideo ? "video" : "photo");
      await ledger.transaction((s) => {
        s.notifications ??= {};
        s.notifications[id] = {
          id,
          kind: isVideo ? "video" : "photo",
          at: now(),
          read: false,
        };
        if (!siteSettings(s).albums.some((a) => a.id === album))
          throw error(422, "INVALID_ALBUM");
        s.photos[id] = {
          id,
          kind: isVideo ? "video" : "photo",
          album,
          householdId: session.householdId,
          caption,
          state: "pending",
          consentAt: now(),
        };
      });
      await sendNotification(id);
      return { id, state: "pending" };
    }
    if (path.startsWith("/api/photo/") && method === "GET") {
      requireAuth();
      if (session.kind !== "admin" && !session.accountId)
        throw error(403, "VERIFIED_ACCOUNT_REQUIRED");
      const id = path.slice(11);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw error(404, "NOT_FOUND");
      const row = ctx.state.photos[id];
      if (!row || (row.state !== "approved" && session?.kind !== "admin"))
        throw error(404, "NOT_FOUND");
      return mediaResponse(
        await media.get(id, row.kind || "photo"),
        row.kind,
        headers.range,
        req.query?.download === "1",
        id,
      );
    }
    if (path.startsWith("/api/admin/")) {
      requireAuth("admin");
      await checkAdministratorEligibility(session.accountId, session.email);
      if (path === "/api/admin/records") return records(req, session);
      for (const id of [body.id, req.query?.id])
        if (
          id !== undefined &&
          (typeof id !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              id,
            ))
        )
          throw error(422, "INVALID_ID");
      if (
        path.startsWith("/api/admin/planning") ||
        path.startsWith("/api/admin/documents")
      )
        return planning(req, session);
      if (path === "/api/admin/site" && method === "GET")
        return { site: siteSettings(ctx.state) };
      if (path === "/api/admin/site" && method === "POST") {
        const site = validateSettings(body);
        return ledger.transaction((s) => {
          if (site.version !== siteSettings(s).version)
            throw error(409, "SETTINGS_CHANGED");
          const albumIds = new Set(site.albums.map((a) => a.id));
          if (
            Object.values(s.photos).some(
              (p) => !albumIds.has(p.album || "event"),
            )
          )
            throw error(422, "ALBUM_HAS_MEDIA");
          site.version++;
          s.site = site;
          audit(s, session.actor, "site-settings", "event", now());
          return { site };
        });
      }
      // Cheap change check for open admin tabs (ledger read only, no Notion call).
      if (path === "/api/admin/pulse" && method === "GET") {
        const s = ctx.state,
          notes = Object.values(s.notifications || {}).filter((n) => !n.archived),
          unread = notes.filter((n) => !n.read).length,
          last = s.audit.at(-1);
        return {
          unread,
          token: hash(
            JSON.stringify([
              s.audit.length,
              last?.at,
              last?.action,
              last?.id,
              notes.length,
              unread,
              Object.values(s.invitations).filter((r) => r.syncState === "pending").length,
            ]),
          ).slice(0, 16),
        };
      }
      if (path === "/api/admin/notifications" && method === "GET")
        return {
          notifications: Object.values(ctx.state.notifications || {}).sort(
            (a, b) => b.at - a.at,
          ),
        };
      if (path === "/api/admin/notifications" && method === "POST")
        return ledger.transaction((s) => {
          const row = s.notifications?.[body.id];
          if (!row) throw error(404, "NOT_FOUND");
          row.read = true;
          return { saved: true };
        });
      if (path === "/api/admin/accounts" && method === "GET") {
        const rows = await notion.list();
        return {
          accounts: Object.values(ctx.state.accounts || {}).map(
            ({ emailKey, ...a }) => ({
              ...a,
              administratorEligible: rows.some(
                (r) =>
                  r.id === a.householdId &&
                  !r.archived &&
                  r.administratorEligible,
              ),
              protectedOwner: adminEmails.includes(a.email),
            }),
          ),
          permissions: pagePermissions,
          owner: ownerSession(session),
        };
      }
      if (
        ["/api/admin/accounts/delete", "/api/admin/accounts/restore"].includes(
          path,
        ) &&
        method === "POST"
      ) {
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
        const restoring = path.endsWith("/restore");
        const householdId = await ledger.transaction((s) => {
          const a = s.accounts?.[body.id];
          if (!a) throw error(404, "NOT_FOUND");
          if (a.version !== body.version) throw error(409, "RESPONSE_CHANGED");
          if (
            adminEmails.includes(a.email) ||
            a.email === session.email ||
            a.id === session.accountId
          )
            throw error(403, "OWNER_PROTECTED");
          if (restoring) {
            if (!a.deletedAt) throw error(409, "ACCOUNT_NOT_DELETED");
            delete a.deletedAt;
            a.active = a.deletedSnapshot?.active !== false;
            s.invitations[a.householdId].active =
              a.deletedSnapshot?.invitationActive !== false;
            delete a.deletedSnapshot;
            // Restoring an account never restores administration implicitly.
            a.permissions = (a.permissions || []).filter((p) => p !== "admin");
          } else {
            if (a.deletedAt) throw error(409, "ACCOUNT_ALREADY_DELETED");
            a.deletedSnapshot = {
              active: a.active,
              invitationActive: s.invitations[a.householdId]?.active,
            };
            a.deletedAt = new Date(now()).toISOString();
            s.invitations[a.householdId].active = false;
            a.active = false;
            a.permissions = a.permissions.filter((p) => p !== "admin");
          }
          a.version++;
          for (const [id, v] of Object.entries(s.sessions))
            if (v.accountId === a.id || v.householdId === a.householdId)
              delete s.sessions[id];
          for (const map of [s.emailLinks, s.adminEmailLinks, s.challenges])
            for (const [id, v] of Object.entries(map || {}))
              if (
                v.accountId === a.id ||
                v.householdId === a.householdId ||
                v.email === a.email
              )
                delete map[id];
          s.invitations[a.householdId].syncState = "pending";
          audit(
            s,
            session.actor,
            restoring ? "account-restored" : "account-deleted",
            a.id,
            now(),
          );
          return a.householdId;
        });
        await syncOne(householdId);
        return { saved: true };
      }
      if (path === "/api/admin/accounts" && method === "POST") {
        if (
          !Array.isArray(body.permissions) ||
          body.permissions.some((p) => !pagePermissions.includes(p)) ||
          typeof body.active !== "boolean"
        )
          throw error(422, "INVALID_PERMISSIONS");
        const current = ctx.state.accounts?.[body.id];
        if (!current) throw error(404, "NOT_FOUND");
        const fresh = await notion.read(current.householdId, { fresh: true });
        if (
          body.permissions.includes("admin") &&
          (!fresh.administratorEligible || fresh.archived)
        )
          throw error(422, "ADMIN_NOT_ELIGIBLE");
        const householdId = await ledger.transaction((s) => {
          const a = s.accounts?.[body.id];
          if (!a) throw error(404, "NOT_FOUND");
          if (a.deletedAt) throw error(409, "ACCOUNT_DELETED");
          if (a.version !== body.version) throw error(409, "RESPONSE_CHANGED");
          if (
            !ownerSession(session) &&
            (a.permissions.includes("admin") !==
              body.permissions.includes("admin") ||
              (a.permissions.includes("admin") && a.active !== body.active))
          )
            throw error(403, "OWNER_REQUIRED");
          if (adminEmails.includes(a.email) && !body.active)
            throw error(403, "OWNER_PROTECTED");
          a.permissions = [...new Set(body.permissions)];
          a.active = body.active;
          a.version++;
          if (!a.active || !a.permissions.includes("admin")) {
            for (const [id, v] of Object.entries(s.sessions))
              if (v.accountId === a.id && (!a.active || v.kind === "admin"))
                delete s.sessions[id];
            for (const [id, v] of Object.entries(s.challenges))
              if (v.accountId === a.id) delete s.challenges[id];
            for (const [id, v] of Object.entries(s.adminEmailLinks || {}))
              if (v.email === a.email) delete s.adminEmailLinks[id];
          }
          s.invitations[a.householdId].syncState = "pending";
          audit(s, session.actor, "account-access-updated", a.id, now());
          return a.householdId;
        });
        await syncOne(householdId);
        return { saved: true };
      }
      if (path === "/api/admin/pages" && method === "GET")
        return { pages: ctx.state.privatePages || {} };
      if (path === "/api/admin/pages" && method === "POST") {
        if (!["gifts", "padrinos", "costs"].includes(body.page))
          throw error(422, "INVALID_PAGE");
        const en = safeText(body.en, 10000),
          es = safeText(body.es, 10000);
        if (!Array.isArray(body.links) || body.links.length > 20)
          throw error(422, "INVALID_LINKS");
        const links = body.links.map((l) => {
          if (!l || typeof l !== "object") throw error(422, "INVALID_LINKS");
          const label = safeText(l.label, 120);
          let url;
          try {
            url = new URL(safeText(l.url, 2000));
          } catch {
            throw error(422, "INVALID_LINKS");
          }
          if (url.protocol !== "https:" || url.username || url.password)
            throw error(422, "INVALID_LINKS");
          return { label, url: url.href };
        });
        await ledger.transaction((s) => {
          s.privatePages ??= {};
          s.privatePages[body.page] = { en, es, links };
          audit(s, session.actor, "private-page-updated", body.page, now());
        });
        return { saved: true };
      }
      if (path === "/api/admin/guests" && method === "GET") {
        const rows = await notion.list(),
          s = await ledger.read();
        return {
          guests: rows.map((row) => ({
            ...row,
            displayName: recipientName(row),
            ...(s.invitations[row.id]
              ? {
                  active: s.invitations[row.id].active,
                  invited: s.invitations[row.id].invited,
                  locale: s.invitations[row.id].locale,
                  syncState: s.invitations[row.id].syncState,
                }
              : {}),
            response:
              s.responses[s.invitations[row.id]?.latestSubmissionId] ?? null,
            ...householdStatus(s, row.id),
          })),
        };
      }
      if (path === "/api/admin/dashboard" && method === "GET") {
        const s = await ledger.read(),
          rows = await notion.list(),
          responses = Object.values(s.invitations)
            .filter((r) => r.active && r.latestSubmissionId)
            .map((r) => s.responses[r.latestSubmissionId]);
        return {
          households: rows.filter((r) => !r.archived).length,
          active: Object.values(s.invitations).filter((r) => r.active).length,
          responded: responses.length,
          statuses: rows
            .filter((r) => !r.archived)
            .reduce(
              (a, r) => (a[householdStatus(s, r.id).status]++, a),
              Object.fromEntries(householdStatuses.map((k) => [k, 0])),
            ),
          pendingSync: Object.values(s.invitations).filter(
            (r) => r.syncState === "pending",
          ).length,
          counts: Object.fromEntries(
            events.map((e) => [
              e,
              responses.reduce(
                (a, r) => ({
                  adultsTeens: a.adultsTeens + r.attendance[e].adultsTeens,
                  kids: a.kids + r.attendance[e].kids,
                }),
                { adultsTeens: 0, kids: 0 },
              ),
            ]),
          ),
          requests: responses
            .filter((r) => r.requests)
            .map((r) => ({ householdId: r.householdId, text: r.requests })),
          mail: Object.values(s.outbox).reduce(
            (a, r) => ((a[r.state] = (a[r.state] || 0) + 1), a),
            {},
          ),
        };
      }
      if (path === "/api/admin/invitation" && method === "POST") {
        const row = await notion.read(body.id, { fresh: true });
        if (!row.validCapacity || row.archived)
          throw error(422, "CAPACITY_NEEDS_REVIEW");
        if (events.some((e) => typeof body.invited?.[e] !== "boolean"))
          throw error(422, "EVENTS_REQUIRED");
        const value = token(),
          code = invitationCode();
        return ledger.transaction((s) => {
          const previous = s.invitations[row.id];
          s.invitations[row.id] = {
            ...previous,
            id: row.id,
            name: row.name,
            active: body.active !== false,
            invited: body.invited,
            locale: body.locale === "es" ? "es" : "en",
            generation: (previous?.generation || 0) + 1,
            tokenHash: hash(value),
            codeHash: hash(code),
            openedAt: null,
          };
          const link =
            origin + (body.locale === "es" ? "/es" : "") + "/rsvp/#" + value;
          audit(s, session.actor, "invitation-issued", row.id, now());
          return { link, code: code.match(/.{4}/g).join("-"), id: row.id };
        });
      }
      if (path === "/api/admin/revoke" && method === "POST") {
        return ledger.transaction((s) => {
          if (!s.invitations[body.id]) throw error(404, "NOT_FOUND");
          s.invitations[body.id].active = false;
          audit(s, session.actor, "invitation-revoked", body.id, now());
          return { revoked: true };
        });
      }
      if (path === "/api/admin/import" && method === "POST") {
        if (
          !Array.isArray(body.rows) ||
          !body.rows.length ||
          body.rows.length > 50
        )
          throw error(422, "IMPORT_LIMIT");
        const rows = body.rows.map((r) => {
          const name = safeText(r.name, 100),
            adultsTeens = Number(r.adultsTeens),
            kids = Number(r.kids);
          if (
            !name ||
            !/^\d{1,2}$/.test(String(r.adultsTeens)) ||
            !/^\d{1,2}$/.test(String(r.kids)) ||
            !Number.isInteger(adultsTeens) ||
            !Number.isInteger(kids) ||
            adultsTeens < 0 ||
            kids < 0 ||
            adultsTeens + kids < 1 ||
            adultsTeens + kids > 50
          )
            throw error(422, "INVALID_CAPACITY");
          return {
            name,
            adultsTeens,
            kids,
            email: email(r.email || ""),
            phone: safeText(r.phone || "", 40),
          };
        });
        // Import creates records. Do not retry automatically after an ambiguous provider response.
        const created = [];
        for (const row of rows) {
          try {
            created.push((await notion.create(row)).id);
          } catch {
            return {
              created,
              stopped: true,
              message:
                "Verify Notion before retrying remaining rows; the last create may have succeeded.",
            };
          }
        }
        return { created, stopped: false };
      }
      if (path === "/api/admin/schema" && method === "POST")
        return { added: await notion.prepareSchema() };
      if (path === "/api/admin/sync" && method === "POST") {
        const s = await ledger.read();
        const ids = Object.values(s.invitations)
          .filter((r) => r.syncState === "pending")
          .slice(0, 10)
          .map((r) => r.id);
        for (const id of ids) await syncOne(id);
        return { attempted: ids.length };
      }
      if (path === "/api/admin/moderation" && method === "GET")
        return {
          messages: Object.values(ctx.state.messages),
          photos: Object.values(ctx.state.photos),
          albums: siteSettings(ctx.state).albums,
        };
      if (path === "/api/admin/message-reply" && method === "POST") {
        const text = safeText(body.text, 2000);
        if (!text) throw error(422, "MESSAGE_REQUIRED");
        return ledger.transaction((s) => {
          const message = s.messages[body.id];
          if (!message || message.kind !== "contact")
            throw error(404, "NOT_FOUND");
          message.replies ??= [];
          if (message.replies.length >= 100) throw error(422, "THREAD_LIMIT");
          message.replies.push({ text, at: now() });
          audit(s, session.actor, "message-reply", body.id, now());
          return { saved: true };
        });
      }
      if (path === "/api/admin/moderation" && method === "POST") {
        if (
          !["photos", "messages"].includes(body.collection) ||
          !["approved", "rejected"].includes(body.state)
        )
          throw error(422, "INVALID_FIELDS");
        return ledger.transaction((s) => {
          const row = s[body.collection][body.id];
          if (!row) throw error(404, "NOT_FOUND");
          if (row.kind === "contact" && body.state === "approved")
            throw error(422, "CONTACT_IS_PRIVATE");
          if (body.collection === "photos" && body.album) {
            if (!siteSettings(s).albums.some((a) => a.id === body.album))
              throw error(422, "INVALID_ALBUM");
            row.album = body.album;
          }
          row.state = body.state;
          audit(s, session.actor, "moderation", body.id, now());
          return { state: row.state };
        });
      }
      if (path === "/api/admin/seating" && method === "GET")
        return {
          tables: Object.values(ctx.state.tables),
          households: Object.values(ctx.state.invitations)
            .filter((r) => r.active)
            .map((r) => ({
              id: r.id,
              name: r.name,
              count: responseCount(ctx.state.responses[r.latestSubmissionId]),
            })),
        };
      if (path === "/api/admin/seating" && method === "POST")
        return ledger.transaction((s) => {
          const id = body.id || randomUUID(),
            name = safeText(body.name, 80),
            capacity = Number(body.capacity),
            households = body.households;
          if (
            !name ||
            !Number.isInteger(capacity) ||
            capacity < 1 ||
            capacity > 50 ||
            !Array.isArray(households) ||
            new Set(households).size !== households.length
          )
            throw error(422, "INVALID_TABLE");
          let count = 0;
          for (const h of households) {
            if (!s.invitations[h]?.active)
              throw error(422, "INVALID_HOUSEHOLD");
            if (
              Object.values(s.tables).some(
                (t) => t.id !== id && t.households.includes(h),
              )
            )
              throw error(409, "ALREADY_SEATED");
            count += responseCount(
              s.responses[s.invitations[h].latestSubmissionId],
            );
          }
          if (count > capacity) throw error(422, "TABLE_OVER_CAPACITY");
          s.tables[id] = { id, name, capacity, households };
          audit(s, session.actor, "seating", id, now());
          return s.tables[id];
        });
      if (path === "/api/admin/updates" && method === "GET")
        return {
          announcements: Object.values(ctx.state.announcements),
          outbox: Object.values(ctx.state.outbox).map(({ content, ...r }) => r),
          mailConfigured: mailer.configured,
        };
      if (path === "/api/admin/updates" && method === "POST") {
        const id = randomUUID(),
          title = safeText(body.title, 140),
          text = safeText(body.text, 2000),
          titleEs = safeText(body.titleEs || "", 140),
          textEs = safeText(body.textEs || "", 2000);
        if (!title || !text) throw error(422, "MESSAGE_REQUIRED");
        return ledger.transaction((s) => {
          s.announcements[id] = {
            id,
            title,
            text,
            titleEs,
            textEs,
            published: true,
            at: now(),
          };
          audit(s, session.actor, "announcement-published", id, now());
          return { id };
        });
      }
      if (path === "/api/admin/audience" && method === "GET") {
        const rows = (await notion.list()).filter(
          (r) => !r.archived && ctx.state.invitations[r.id]?.active !== false,
        );
        return {
          groups: [
            ...new Set(rows.flatMap((r) => r.distributionGroups || [])),
          ].sort(),
          recipients: (req.query?.channel === "sms" ? audience(rows, { groups: [], ids: rows.map(r => r.id) }, ctx.state, "sms") : rows.filter(r => validEmail(r.email)))
            .map((r) => ({
              id: r.id,
              name: recipientName(r),
              email: r.email,
              phone: r.destination || r.phone,
              groups: r.distributionGroups || [],
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }
      if (path === "/api/admin/mail/batch-draft" && method === "POST") {
        if (!uuid(body.requestId)) throw error(422, "IDEMPOTENCY_REQUIRED");
        const subject = safeText(body.subject, 140),
          text = safeText(body.text, 5000),
          channel = body.channel || "email";
        if (
          !subject ||
          !text ||
          /[\r\n]/.test(subject) ||
          !["email", "sms"].includes(channel)
        )
          throw error(422, "MESSAGE_REQUIRED");
        if (channel === "sms") {
          smsPreview(text);
          if (!smsCompliantText(text))
            throw error(422, "SMS_BRAND_OR_STOP_MISSING");
        }
        const recipients = audience(
          await notion.list(),
          body,
          await ledger.read(),
          channel,
        );
        if (!recipients.length) throw error(422, "NO_ELIGIBLE_RECIPIENTS");
        const fingerprint = hash(
          JSON.stringify({
            groups: body.groups,
            ids: body.ids,
            subject,
            text,
            channel,
          }),
        );
        return ledger.transaction((s) => {
          s.campaigns ??= {};
          if (s.campaigns[body.requestId]) {
            if (s.campaigns[body.requestId].fingerprint !== fingerprint)
              throw error(409, "SETTINGS_CHANGED");
            return s.campaigns[body.requestId].result;
          }
          const ids = [];
          s.smsDrafts ??= {};
          for (const row of recipients) {
            const id = randomUUID();
            ids.push(id);
            if (channel === "sms")
              s.smsDrafts[id] = {
                id,
                householdId: row.id,
                campaignId: body.requestId,
                groups: body.groups,
                directlySelected: body.ids.includes(row.id),
                to: row.destination,
                name: row.displayName,
                text,
                state: "draft",
                at: now(),
              };
            else
              s.outbox[id] = {
                id,
                type: "custom",
                householdId: row.id,
                to: row.destination,
                subject,
                content: seal(
                  `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`,
                  key,
                ),
                state: "draft",
                createdAt: now(),
                groups: body.groups,
                directlySelected: body.ids.includes(row.id),
              };
          }
          const result = { ids, count: ids.length, channel };
          s.campaigns[body.requestId] = { fingerprint, result };
          return result;
        });
      }
      if (path === "/api/admin/whatsapp/drafts" && method === "GET")
        return whatsapp.list();
      if (path === "/api/admin/whatsapp/batch-draft" && method === "POST")
        return whatsapp.draft(body);
      if (path === "/api/admin/whatsapp/preview" && method === "GET")
        return whatsapp.review(req.query?.id);
      if (path === "/api/admin/whatsapp/send" && method === "POST") {
        if (body.confirm !== true) throw error(422, "CONFIRM_RECIPIENT");
        return whatsapp.send(body.id, body.reviewToken, session.actor);
      }
      if (path === "/api/admin/whatsapp/sync" && method === "POST")
        return whatsapp.retrySync();
      if (path === "/api/admin/sms/drafts" && method === "GET")
        return {
          drafts: Object.values(ctx.state.smsDrafts || {}).map((d) => ({
            ...d,
            delivery: ctx.state.smsDelivery?.[d.providerId]?.status || null,
          })),
          sendingEnabled: sms.enabled,
          pendingOptOutSync: Object.values(
            ctx.state.smsSuppression || {},
          ).filter((r) => r.syncState === "pending").length,
        };
      if (path === "/api/admin/sms/preview" && method === "GET")
        return sms.review(req.query?.id);
      if (path === "/api/admin/sms/send" && method === "POST") {
        if (body.confirm !== true) throw error(422, "CONFIRM_RECIPIENT");
        return sms.send(body.id, body.reviewToken, session.actor);
      }
      if (path === "/api/admin/sms/sync" && method === "POST")
        return sms.retrySync();
      if (path === "/api/admin/invitations/issue-batch" && method === "POST")
        return batches.issue(body, session.actor, events);
      if (path === "/api/admin/mail/invitation-batch" && method === "POST")
        return batches.create(body, session.actor);
      if (path === "/api/admin/mail/batches" && method === "GET")
        return { batches: batches.list(ctx.state) };
      if (path === "/api/admin/mail/batch" && method === "GET")
        return batches.detail(ctx.state, req.query?.id, (c) => unseal(c, key));
      if (path === "/api/admin/mail/batch/confirm" && method === "POST")
        return batches.confirm(body, session.actor);
      if (path === "/api/admin/mail/batch/send" && method === "POST")
        return batches.send(body, session.actor);
      if (path === "/api/admin/mail/batch/cancel" && method === "POST")
        return batches.cancel(body, session.actor);
      if (path === "/api/admin/mail/preview" && method === "GET") {
        const row = ctx.state.outbox[req.query?.id];
        if (!row) throw error(404, "NOT_FOUND");
        return {
          html: unseal(row.content, key),
          to: row.to,
          subject: row.subject,
        };
      }
      if (path === "/api/admin/mail/draft" && method === "POST") {
        if (
          !["invitation", "reminder", "details", "change", "thanks"].includes(
            body.type,
          )
        )
          throw error(422, "INVALID_MAIL_TYPE");
        const row = await notion.read(body.id, { fresh: true }),
          s = await ledger.read(),
          invite = s.invitations[row.id];
        if (!invite?.active || !row.email)
          throw error(422, "INVITATION_NOT_READY");
        if (body.type === "change" && !safeText(body.updateText || "", 2000))
          throw error(422, "MESSAGE_REQUIRED");
        let url =
          origin +
          (invite.locale === "es" ? "/es" : "") +
          (body.type === "thanks" ? "/thank-you/" : "/details/");
        // Invitations and reminders carry a private link the server mints per
        // draft (sealed in the outbox), so organizers never copy or paste links.
        // It shares the household's generation: issuing a new link revokes it.
        const personal = ["invitation", "reminder"].includes(body.type),
          minted = personal ? token() : null;
        if (personal)
          url =
            origin + (invite.locale === "es" ? "/es" : "") + "/rsvp/#" + minted;
        return ledger.transaction((s) => {
          if (
            !s.invitations[row.id]?.active ||
            s.invitations[row.id].generation !== invite.generation
          )
            throw error(409, "INVITATION_INACTIVE");
          const id = queue(s, {
            type: body.type,
            household: row,
            recipient: row.email,
            locale: invite.locale,
            url,
            updateText: safeText(body.updateText || "", 2000),
          });
          if (personal) {
            s.invitationLinks ??= {};
            s.invitationLinks[hash(minted)] = {
              householdId: row.id,
              generation: invite.generation,
              channel: "email",
              draftId: id,
            };
          }
          return { id };
        });
      }
      if (path === "/api/admin/mail/send" && method === "POST") {
        if (body.confirm !== true) throw error(422, "CONFIRM_RECIPIENT");
        await ledger.transaction((s) =>
          audit(s, session.actor, "mail-send", body.id, now()),
        );
        return dispatchMail(body.id);
      }
    }
    throw error(404, "NOT_FOUND");
  }
  return { dispatch, syncOne };
}
