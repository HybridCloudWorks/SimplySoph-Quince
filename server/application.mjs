import { createAdminRecords } from "./admin-records.mjs";
import { audience, recipientName, validEmail } from "./audience.mjs";
import { createWhatsapp } from "./whatsapp.mjs";
import { createSms, smsCompliantText, smsPreview, smsStatus } from "./sms.mjs";
import { createPlanning } from "./planning.mjs";
import { createAdminEmail } from "./admin-email.mjs";
import { createAdminAccess, adminRow } from "./admin-access.mjs";
import { enrollment } from "./mfa-enrollment.mjs";
import { createNotifications } from "./notifications.mjs";
import { createMailBatches } from "./mail-batches.mjs";
import { logEvent } from "./event-log.mjs";
import {
  convertVideo,
  conversionSlot,
  mediaResponse,
  withVideoDirectory,
} from "./video.mjs";
import { uploadLimits, classify } from "../site/upload-batch.mjs";
import { calendar, contactTopics, escapeHtml } from "../site/celebration.mjs";
import { siteSettings, validateSettings } from "./site-settings.mjs";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { imageGate, createGate } from "./gate.mjs";
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
  base32,
  invitationCode,
  invitationCredential,
} from "./auth.mjs";
import { validateHouseholdRsvp } from "./rsvp-validation.mjs";
import {
  renderEmail,
  emailSchedule,
  firstSentence,
  longDate,
} from "../emails/templates.mjs";
import { event as eventInfo } from "../site/content.mjs";
import { previewRoutes } from "../site/preview-content.mjs";
import { notionOutage } from "./notion.mjs";
import { attendanceOf, dinnerSeats } from "./attendance.mjs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccounts, accountActive, rosterMatch } from "./accounts.mjs";
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
// One guest upload: POST sends a piece of the file, GET says how it is going.
const uploadPiece = /^\/api\/uploads\/([a-f0-9-]{36})$/;
const audit = (s, actor, action, id, now) => {
  s.audit.push({ actor, action, id, at: new Date(now).toISOString() });
  s.audit = s.audit.slice(-5000);
};
// A minted link matches the household's current generation and, when it was
// minted for an email or SMS draft, opens only once that message was actually sent.
const linkOpens = (s, fingerprint, r) => {
  const link = s.invitationLinks?.[fingerprint];
  if (link?.householdId !== r.id || link.generation !== r.generation) return false;
  if (!link.draftId) return true;
  const draft =
    link.channel === "sms" ? s.smsDrafts?.[link.draftId] : s.outbox[link.draftId];
  return ["accepted", "unknown", "sending"].includes(draft?.state);
};
// Group messages may contain {link}; each household's draft gets its own link.
const LINK_PLACEHOLDER = "{link}";
// Constant-time comparison for secrets such as CSRF tokens.
const sameSecret = (given, expected) => {
  if (typeof given !== "string" || typeof expected !== "string") return false;
  const a = Buffer.from(given),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};
function digestInput(input) {
  return hash(JSON.stringify(input));
}
export function createApplication({
  ledger,
  notion,
  mailer,
  verifyGoogle,
  // Microsoft (personal and the family's work tenant) and Google identities for
  // SSO; see microsoftVerifier and googleIdentityVerifier in auth.mjs.
  verifyMicrosoft = async () => {
    throw error(503, "SSO_NOT_CONFIGURED");
  },
  verifyGoogleIdentity = async () => {
    throw error(503, "SSO_NOT_CONFIGURED");
  },
  microsoftClientId = "",
  // Async (authorizationHeader) => boolean from server/scheduler.mjs; null disables the drain.
  verifyScheduler = null,
  media,
  documents,
  smsTransport,
  smsWebhook,
  whatsappTransport,
  whatsappWebhook,
  whatsappTemplates = [],
  // (input file, working directory, { slot }) => { video, poster, duration };
  // see video.mjs. The media job holds the conversion slot while it runs.
  videoProcessor = convertVideo,
  key,
  origin,
  clientId = "",
  deadline = eventInfo.deadline,
  adminEmails = [],
  notificationEmails = adminEmails,
  now = Date.now,
  mailSleep,
  // The admin-only page preview built by scripts/build-pages.mjs (never published).
  previewRoot = fileURLToPath(new URL("../dist-preview/", import.meta.url)),
  // Bounds sharp decodes for guest photos; tests can pass their own gate.
  photoGate = imageGate,
  // Sign-in link requests answer no sooner than this (SEC-8); 0 in tests.
  signInFloorMs = 0,
  // How many sign-in link requests may wait out that floor at once per instance.
  signInConcurrency = 16,
  // Structured log line writer (start.mjs: one JSON line on stdout).
  log = () => {},
}) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("32-byte application key required");
  const sms = createSms({
    ledger,
    notion,
    transport: smsTransport,
    webhook: smsWebhook,
    now,
    render: (d) =>
      d.link ? d.text.replaceAll(LINK_PLACEHOLDER, unseal(d.link, key)) : d.text,
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
    deadline,
  });
  const sendNotification = createNotifications({
    ledger,
    mailer,
    adminEmails: notificationEmails,
    origin,
    now,
  });
  // Administrators: the break-glass owner(s) in ADMIN_EMAILS plus anyone whose
  // Notion row has "Administrator Eligible" ticked. Checked on every request.
  const admins = createAdminAccess({ notion, adminEmails, now });
  // Owner-only actions (schema, import, authenticator resets) stay with ADMIN_EMAILS.
  const ownerSession = (session) =>
    !session.rowId && adminEmails.includes(session.email);
  // SSO tickets are sealed and stateless. The nonce inside goes to Microsoft and
  // must come back in the ID token; it is spent in the transaction that signs in.
  // The purpose keeps admin and guest sign-in apart: a guest ticket cannot open
  // the admin route or the reverse.
  const ssoTicket = (purpose) => {
    const nonce = token();
    return {
      nonce,
      ticket: seal(JSON.stringify({ n: nonce, p: purpose, e: now() + 600000 }), key),
    };
  };
  function openTicket(raw, purpose) {
    let t;
    try {
      t = JSON.parse(unseal(safeText(raw, 1000), key));
    } catch {
      throw error(401, "SIGN_IN_AGAIN");
    }
    if (t.p !== purpose || !(t.e > now())) throw error(401, "SIGN_IN_AGAIN");
    return t.n;
  }
  function spendNonce(s, nonce) {
    s.ssoNonces ??= {};
    for (const [k, until] of Object.entries(s.ssoNonces))
      if (until <= now()) delete s.ssoNonces[k];
    if (s.ssoNonces[hash(nonce)]) throw error(401, "SIGN_IN_AGAIN");
    s.ssoNonces[hash(nonce)] = now() + 600000;
  }
  // Guest SSO: the first sign-in binds the provider account to the email. A
  // different provider account later presenting the same email (a recycled
  // address) is refused; the emailed sign-in link still works. Administrators are
  // linked under a separate "admin-microsoft:" key, only after their
  // authenticator code passes (/api/auth/mfa), so a guest sign-in never links an
  // account for admin use. An owner's authenticator reset clears that link.
  function bindSso(s, identity) {
    s.ssoBindings ??= {};
    const k = hash(identity.provider + ":" + identity.email),
      subject = hash(identity.subject);
    if (s.ssoBindings[k] && s.ssoBindings[k] !== subject)
      throw error(403, "SSO_ACCOUNT_CHANGED");
    s.ssoBindings[k] = subject;
  }
  // Append-only and never trimmed (unlike the general audit list).
  function roleEvent(s, actor, target, change) {
    s.roleEvents ??= [];
    s.roleEvents.push({ actor, target, change, at: new Date(now()).toISOString() });
    logEvent(s, now(), "role." + change, { actor, data: { target } });
  }
  // A current code from the signed-in owner's own authenticator, for changes
  // that hand out administrator access.
  function requireFreshCode(s, session, code) {
    const me = s.admins[session.actor];
    if (!me) throw error(403, "MFA_REQUIRED");
    const step = verifyTotp(unseal(me.secret, key), code, now(), me.lastStep ?? -1);
    if (step === null) throw error(401, "INVALID_MFA");
    me.lastStep = step;
  }
  // Owner recovery codes (SEC-10): ten one-time codes that stand in for the
  // owner's authenticator after a lost phone. Only keyed hashes are stored. A
  // code does not sign in by itself: it opens a new authenticator setup, so the
  // lost phone is replaced in the same step.
  const recoveryHash = (code) =>
    createHmac("sha256", key).update("recovery:" + code).digest("hex");
  const recoveryInput = (value) => {
    const v = typeof value === "string" ? value.toUpperCase().replace(/[^A-Z0-9]/g, "") : "";
    return /^[A-Z2-7]{12}$/.test(v) ? v : null;
  };
  const newRecoveryCodes = () =>
    Array.from({ length: 10 }, () => base32(randomBytes(8)).slice(0, 12)).map(
      (c) => `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}`,
    );
  // FLOW-8: where a "the family replied" email may go: the email the guest
  // signed in with, while that account is active, still in this household and
  // that email is still on the household's Notion row (re-audit D3); otherwise
  // the row's Email. Never an address typed into a form.
  function replyRecipient(s, message, row) {
    const account = s.accounts?.[message.accountId];
    if (
      account &&
      accountActive(s, account) &&
      account.householdId === message.householdId &&
      (row?.email === account.email || (row?.additionalEmails || []).includes(account.email))
    )
      return account.email;
    return row?.email || null;
  }
  const mfaPaused = (s, email) =>
    s.mfaFailures?.[hash("mfa-fail:" + email)]?.pausedUntil > now();
  function securityNote(s, title) {
    const id = randomUUID();
    s.notifications ??= {};
    s.notifications[id] = { id, kind: "security", title, at: now(), read: false, emailState: "none" };
  }
  // Admin sessions are re-checked against Notion on every request (dispatch).
  // Guest sessions are either RSVP-only (invitation link or code) or a verified
  // email sign-in (accountId); anything else, such as an older link session
  // without a scope, is no longer valid.
  // A link session belongs to one issue of the invitation link (generation): a
  // reissued or revoked link ends it. An email sign-in belongs to the person: it
  // needs only that the household's invitation is not revoked (or not issued
  // yet), so reissuing a forwarded link never signs the family out, and a
  // household can sign in before its link goes out (re-audit; owner model:
  // "put their email in Notion, nothing else is needed").
  const invitationOpen = (s, session) => {
    const invite = s.invitations[session.householdId];
    return session.accountId
      ? !invite || invite.active
      : !!invite?.active && invite.generation === session.generation;
  };
  const sessionValid = (s, row) =>
    row &&
    row.expiresAt > now() &&
    (row.kind === "admin"
      ? !!row.rowId || adminEmails.includes(row.email)
      : invitationOpen(s, row) &&
        (row.accountId
          ? accountActive(s, s.accounts?.[row.accountId])
          : row.scope === "rsvp"));
  // An invitation link or typed code opens the RSVP and nothing else: contact
  // details stay hidden and every other route treats the session as signed out.
  // Uploads, messages and edits need the email sign-in (owner's access model).
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
  // `row` is the household's Notion row: an answer typed into Notion counts
  // too (attendanceOf), even before a link is issued.
  function householdStatus(s, row) {
    const id = row.id,
      invite = s.invitations[id];
    if (invite && !invite.active) return { status: "revoked" };
    const answer = attendanceOf(s, row);
    if (answer)
      return {
        status: answer.attending ? "attending" : "declined",
        respondedAt: answer.respondedAt,
        answeredIn: answer.source,
      };
    if (!invite) return { status: "not-issued" };
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
      raw,
    };
  }
  // Page views may use the short Notion cache, and read-only views opt in to
  // the last good answer during a Notion outage (allowStale). Guest writes use
  // the cache but never stale data; RSVP submission reads fresh.
  // An email sign-in works only while that email is still on this household's
  // row: removing or moving it in Notion ends access on the next request
  // (re-audit), not when the session runs out. Pages that need no invitation
  // details (gallery, photos, My account) check only this.
  const listedOn = (row, email) =>
    row.email === email || (row.additionalEmails || []).includes(email);
  // That person's sign-ins for the household end too, so their pages show the
  // sign-in form again instead of a signed-in page that can do nothing.
  async function signOutRemoved(session) {
    await ledger.transaction((s) => {
      for (const [k, v] of Object.entries(s.sessions))
        if (v.accountId === session.accountId && v.householdId === session.householdId)
          delete s.sessions[k];
    });
    throw error(401, "SIGN_IN_REQUIRED");
  }
  async function stillListed(session) {
    const row = await notion.read(session.householdId, { allowStale: true });
    if (row.archived || !listedOn(row, session.email)) await signOutRemoved(session);
  }
  async function guestInvitation(session, { fresh = false, allowStale = false } = {}) {
    const row = await notion.read(session.householdId, { fresh, allowStale }),
      s = await ledger.read(),
      record = s.invitations[row.id];
    if (row.archived || !invitationOpen(s, session))
      throw error(401, "INVITATION_INACTIVE");
    if (session.accountId && !listedOn(row, session.email)) await signOutRemoved(session);
    if (!row.validCapacity) throw error(409, "CAPACITY_NEEDS_REVIEW");
    return {
      ...row,
      ...record,
      // False until the family issues this household's invitation link; until
      // then a signed-in guest can upload and write, but not RSVP yet.
      invitationReady: !!record?.active,
      // Notion owns the household's name and capacity; the invitation record's
      // copy of the name is from when the link was issued (NOTION-5).
      name: row.name,
      capacity: row.capacity,
      deadline,
      latestSubmissionId: record?.latestSubmissionId ?? null,
    };
  }
  // Notion sync and outbound mail are split into ledger steps (claim/finish,
  // run inside a transaction) and provider calls (outside any transaction), so
  // the RSVP path can fold both claims into its own save and both results into
  // one final save. syncOne and dispatchMail compose the same steps standalone.
  // A household synced before projectedSubmissionId was recorded keeps its
  // written answer on record when it goes back to pending, so a later retry
  // knows what the website wrote (holdBackEdited).
  function markPending(invite) {
    if (invite.projectedSubmissionId === undefined && invite.syncState === "synced" && invite.latestSubmissionId)
      invite.projectedSubmissionId = invite.latestSubmissionId;
    invite.syncState = "pending";
  }
  function claimSync(s, householdId, owner, { forceResponse = false } = {}) {
    const row = s.invitations[householdId];
    const profile = s.profiles?.[householdId];
    // An admin's choice to write the website's answer holds until that answer
    // is written: if another sync holds the row, or this attempt fails, the
    // scheduled drain writes it later (re-audit N2).
    if (forceResponse && row?.latestSubmissionId) {
      row.forceSubmissionId = row.latestSubmissionId;
      if (row.syncState === "synced") markPending(row);
    }
    if (!row || (!row.latestSubmissionId && !profile) || row.syncLease?.until > now())
      return null;
    // The RSVP column and head counts are written only when the latest answer
    // has not reached Notion yet, or when an admin chooses to write it again.
    // A contact-details change writes only the contact columns, so it never
    // reverts a change the family made to the counts in Notion. Households
    // synced before this was tracked count as already written.
    const projected =
      row.projectedSubmissionId ??
      (row.syncState === "synced" ? row.latestSubmissionId : null);
    const forced = !!row.latestSubmissionId && row.forceSubmissionId === row.latestSubmissionId;
    const withResponse =
      !!row.latestSubmissionId && (forced || projected !== row.latestSubmissionId);
    if (!withResponse && !profile) {
      if (row.syncState === "pending") (row.syncState = "synced"), (row.syncError = null);
      return null;
    }
    row.syncLease = { owner, until: now() + 90000 };
    row.syncTriedAt = now();
    return structuredClone({
      submissionId: row.latestSubmissionId || null,
      response: withResponse ? s.responses[row.latestSubmissionId] : undefined,
      // The answer the website last wrote to Notion, if any (holdBackEdited).
      written: projected ? (s.responses[projected]?.attendance ?? null) : null,
      profile,
      forced,
    });
  }
  // A retry (the scheduled drain, Retry on Overview, a later contact change)
  // never writes over an answer the family put in Notion themselves, say after
  // a phone call: Notion's RSVP shows Yes or No (an answer, as in attendanceOf)
  // and, if the website wrote an answer before, that answer or its head counts
  // differ from what is there now. Then it writes the Website columns only
  // (contact, requests, response ID) and marks the answer handled; the drift
  // check shows the difference on Invitations, where an admin chooses per
  // household (re-audit N1). Values are compared, not edit times, so an edit
  // to another column holds nothing back, and a row whose RSVP still says
  // "Not sent" (households answered before the RSVP column was written) is
  // written as usual. The guest's own RSVP and an admin's Write are written
  // as they are.
  async function holdBackEdited(householdId, task) {
    if (!task.response || task.forced) return null;
    try {
      const row = await notion.read(householdId, { fresh: true });
      const familyAnswer =
        ["Yes", "No"].includes(row.invitationStatus) &&
        (!task.written || notionDifferences(row, task.written).length > 0);
      if (familyAnswer && notionDifferences(row, task.response.attendance).length)
        task.heldBack = true;
      return null;
    } catch (e) {
      return e.code || "NOTION_UNAVAILABLE";
    }
  }
  async function projectSync(householdId, task) {
    try {
      if (task.response)
        await notion.project(
          householdId,
          { ...task.response, contact: task.profile?.contact || task.response.contact },
          { answer: !task.heldBack },
        );
      else await notion.projectContact(householdId, task.profile.contact);
      return null;
    } catch (e) {
      return e.code || "NOTION_UNAVAILABLE";
    }
  }
  function finishSync(s, householdId, owner, task, failure) {
    const row = s.invitations[householdId];
    if (row.syncLease?.owner === owner) delete row.syncLease;
    // A Notion outage, rate limit or edit conflict is retried by the scheduled
    // drain. Any other refusal (a missing column, a deleted row) will fail the
    // same way every time: mark it failed, stop retrying it automatically, and
    // tell the family once (NOTION-7). Retry on the Overview page tries it again.
    // A newer response or profile saved meanwhile was never tried, so it stays
    // pending whatever happened to the older one.
    const stale =
      (row.latestSubmissionId || null) !== (task.submissionId || null) ||
      s.profiles?.[householdId]?.version !== task.profile?.version;
    const permanent =
      failure && !stale && !notionOutage({ code: failure }) && failure !== "NOTION_409";
    if (permanent) {
      if (row.syncState !== "failed") {
        const note = randomUUID();
        s.notifications ??= {};
        s.notifications[note] = {
          id: note,
          kind: "sync",
          householdId,
          title: `${row.name}: the RSVP could not be saved to Notion`,
          text: `Notion refused it (${failure}). Check that household's row in Notion, then press "Retry pending Notion updates" on the Overview page.`,
          at: now(),
          read: false,
          emailState: "none",
        };
      }
      row.syncState = "failed";
      row.syncError = failure;
    } else if (failure || stale) {
      row.syncState = "pending";
      row.syncError = failure;
    } else {
      row.syncState = "synced";
      row.syncError = null;
      row.projectedSubmissionId = task.submissionId;
      if (row.latestSubmissionId && row.forceSubmissionId === row.latestSubmissionId) {
        // Notion now shows the website's answer the admin chose to write: the
        // difference is settled at once, not at the next check (re-audit N8).
        if (task.forced && task.response && !task.heldBack) {
          delete row.forceSubmissionId;
          delete s.drift?.[householdId];
        }
        // The admin chose to write it while another sync held the row: that
        // write is still to do, so the drain does it (re-audit H1).
        else row.syncState = "pending";
      }
    }
    logEvent(
      s,
      now(),
      { synced: "notion.synced", failed: "notion.sync_failed" }[row.syncState] ||
        "notion.sync_pending",
      failure
        ? { householdId, data: { error: failure.code || String(failure) } }
        : { householdId },
    );
    return row.syncState;
  }
  async function syncOne(householdId, options) {
    const owner = token();
    const task = await ledger.transaction((s) =>
      claimSync(s, householdId, owner, options),
    );
    if (!task) return;
    const failure =
      (await holdBackEdited(householdId, task)) ?? (await projectSync(householdId, task));
    await ledger.transaction((s) =>
      finishSync(s, householdId, owner, task, failure),
    );
    return failure;
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
        // A {link} draft dies with its link: reissuing revokes it.
        (j.generation !== undefined && invite?.generation !== j.generation) ||
        (!j.directlySelected &&
          !currentGuest.distributionGroups?.some((g) => j.groups.includes(g)))
      )
        throw error(409, "MAIL_DRAFT_STALE");
    } else if (!invite?.active || invite.generation !== j.generation)
      throw error(409, "MAIL_DRAFT_STALE");
    // An invitation or reminder drafted before the household answered (on the
    // website, or by phone into Notion) is set aside, not sent (re-audit L4).
    if (["invitation", "reminder"].includes(j.type) && attendanceOf(s, currentGuest))
      throw error(409, "ALREADY_RESPONDED");
    // An RSVP receipt goes to an address that is still on the household's
    // Notion row (Email or Additional Emails): the one the guest signed in with,
    // or the row's Email. The contact email typed into the form never counts
    // (re-audit). Other emails go to the row's current Email only.
    const to = j.to.trim().toLowerCase();
    const listed = j.responseId
      ? [currentGuest.email, ...(currentGuest.additionalEmails || [])].includes(to)
      : currentGuest.email?.trim().toLowerCase() === to;
    if (!listed || (j.responseId && j.responseId !== invite.latestSubmissionId))
      throw error(409, "MAIL_DRAFT_STALE");
    j.state = "sending";
    j.attemptAt = now();
    logEvent(s, now(), "delivery.claimed", {
      householdId: j.householdId,
      deliveryId: id,
      data: { channel: "email", type: j.type },
    });
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
    logEvent(s, now(), "delivery." + outcome.state, {
      householdId: s.outbox[id].householdId,
      deliveryId: id,
      data: outcome.code
        ? { channel: "email", error: outcome.code }
        : { channel: "email" },
    });
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
    const site = siteSettings(s),
      id = randomUUID(),
      rendered = renderEmail({
        type,
        locale,
        household: household.name,
        // A receipt cannot carry the private link (only its hash is kept), so
        // its button opens the schedule instead of the bare code form.
        url:
          url ||
          origin + (locale === "es" ? "/es" : "") + (responseId ? "/details/" : "/rsvp/"),
        // From the admin's event settings, so a schedule change reaches new emails.
        eventDate: ((d) => d[0].toUpperCase() + d.slice(1))(
          longDate(site.ceremony.start, locale),
        ),
        rsvpDeadline: longDate(deadline, locale),
        schedule: emailSchedule(
          site,
          s.invitations[household.id]?.invited,
          locale,
        ),
        note: firstSentence(site.quote?.[locale]),
        dateConfirmed: true,
        receiptCommitted: !!responseId,
        preview: false,
        updateText,
        attendance: responseId ? s.responses[responseId]?.attendance : null,
        invited: s.invitations[household.id]?.invited,
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
  // Sign-in link requests hold their request slot for the 0.9 s timing floor
  // (a wait that uses no CPU). Cloud Run serves 40 requests per instance
  // (--concurrency=40, docs/deployment.md); at most signInConcurrency of them may be
  // sign-in requests, the rest get a retryable SIGN_IN_BUSY. Blocking sign-in
  // then takes a sustained flood (about 18 requests a second per instance), and
  // the other 24 slots stay free for RSVPs and admin pages (re-audit of SEC-8).
  const signInGate = createGate({ max: signInConcurrency, queue: 0, code: "SIGN_IN_BUSY" });
  const accounts = createAccounts({
    ledger,
    mailer,
    notion,
    key,
    origin,
    now,
    syncOne,
    signInFloorMs,
    signInGate,
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
    admins,
    origin,
    now,
    signInFloorMs,
    signInGate,
  });
  // Up to 10 households whose RSVP is still waiting to reach Notion. The
  // scheduled drain retries only "pending"; an admin's Retry also re-tries
  // "failed" rows after they fix the cause in Notion.
  // The scheduled drain passes `until` (a time budget) and stops at the first
  // Notion outage, so a backlog during an outage cannot outlast the scheduler.
  async function retryPendingRsvps({ includeFailed = false, until = Infinity } = {}) {
    const s = await ledger.read();
    const ids = Object.values(s.invitations)
      // Households whose Notion row differs are not retried here: the admin
      // decides each one on Invitations (/api/admin/drift), so a family's own
      // change in Notion is never undone by a bulk Retry.
      .filter((r) => r.syncState === "pending" || (includeFailed && r.syncState === "failed"))
      // Pending before failed, then longest since last tried, so rows that keep
      // failing can never crowd out the rest.
      .sort(
        (a, b) =>
          (a.syncState === "failed") - (b.syncState === "failed") ||
          (a.syncTriedAt || 0) - (b.syncTriedAt || 0),
      )
      .slice(0, 10)
      .map((r) => r.id);
    let attempted = 0;
    for (const id of ids) {
      if (Date.now() > until) break;
      attempted++;
      const failure = await syncOne(id);
      if (failure && until !== Infinity && notionOutage({ code: failure })) break;
    }
    return { attempted };
  }
  // How a household's Notion RSVP and head counts differ from an answer, in
  // words for the family; none when Notion shows exactly that answer.
  function notionDifferences(row, attendance) {
    const count = (n, one, many) => `${n ?? 0} ${n === 1 ? one : many}`;
    const both = (c) =>
      `${count(c.adultsTeens, "adult/teen", "adults/teens")}, ${count(c.kids, "kid", "kids")}`;
    const attending = Object.values(attendance).some((v) => v.adultsTeens + v.kids > 0);
    const differences = [];
    if (row.invitationStatus !== (attending ? "Yes" : "No"))
      differences.push(
        `RSVP is "${row.invitationStatus || "empty"}" in Notion, "${attending ? "Yes" : "No"}" on the website`,
      );
    for (const event of ["ceremony", "dinner", "dance"]) {
      // An empty Notion cell means 0, as for events a household isn't invited to.
      const n = row.notionCounts?.[event] || {},
        w = attendance[event];
      if ((n.adultsTeens ?? 0) !== w.adultsTeens || (n.kids ?? 0) !== w.kids)
        differences.push(`${event}: ${both(n)} in Notion, ${both(w)} on the website`);
    }
    return differences;
  }
  // NOTION-8: does Notion still show each answered household's website RSVP?
  // Each new difference is reported once in Notifications and counted on the
  // dashboard. Notion is never overwritten here: the family may have changed
  // it on purpose, say after a phone call. On Invitations the admin chooses,
  // per household, to write the website's answer again or to keep Notion's
  // version (/api/admin/drift); a kept difference is not reported again
  // unless it changes. Applied to a copy first, so an unchanged check never
  // writes the ledger.
  function applyDrift(s, rows, started) {
    s.drift ??= {};
    let differing = 0,
      changed = false;
    const fresh = [];
    for (const invite of Object.values(s.invitations)) {
      const response = s.responses[invite.latestSubmissionId],
        row = rows.get(invite.id);
      // An admin's Write still waiting to be done keeps its difference, so the
      // admin can still change their mind and keep Notion's version instead.
      const writeWaiting =
        !!response && !!row && !row.archived && invite.forceSubmissionId === invite.latestSubmissionId;
      if (!response || !row || row.archived || invite.syncState !== "synced") {
        if (s.drift[invite.id] && !writeWaiting) (delete s.drift[invite.id], (changed = true));
        continue;
      }
      // Written moments ago (or being written): Notion may not show it yet.
      if (invite.syncTriedAt >= started - 120000) continue;
      const differences = notionDifferences(row, response.attendance);
      const entry = s.drift[invite.id];
      if (!differences.length) {
        if (entry) (delete s.drift[invite.id], (changed = true));
        continue;
      }
      const signature = differences.join("; ");
      if (entry?.accepted === signature) continue; // the admin kept Notion's version
      differing++;
      if (entry?.signature === signature) continue; // already reported
      s.drift[invite.id] = { signature, at: now() };
      changed = true;
      fresh.push({ name: row.name, householdId: invite.id, signature });
    }
    const note = (fields) => {
      const id = randomUUID();
      s.notifications ??= {};
      s.notifications[id] = { id, kind: "drift", at: now(), read: false, emailState: "none", ...fields };
    };
    // Many at once usually means a renamed column or option, not many phone calls.
    if (fresh.length > 10)
      note({
        title: `${fresh.length} households differ between Notion and the website`,
        text: `Notion's RSVP or head counts differ for ${fresh.length} households at once. A renamed column or RSVP option in Notion can cause this; check the Invitations database, then review the households on Invitations.`,
      });
    else
      for (const f of fresh)
        note({
          householdId: f.householdId,
          title: `${f.name}: Notion differs from the website's RSVP`,
          text: `${f.signature}. On Invitations, choose "Keep Notion's version" if the family changed it on purpose (for example after a phone call), or "Write the website's answer" if the website is right.`,
        });
    return { differing, changed };
  }
  async function checkDrift() {
    const started = now();
    const rows = new Map((await notion.list({ fresh: true })).map((r) => [r.id, r]));
    const preview = applyDrift(await ledger.read(), rows, started);
    if (!preview.changed) return { differing: preview.differing };
    return ledger.transaction((s) => ({ differing: applyDrift(s, rows, started).differing }));
  }
  // SEC-9: when someone is no longer an administrator in Notion (box unticked or
  // main Email changed), their authenticator and linked Microsoft account are
  // removed, so ticking them again later means a fresh QR setup, not the old
  // phone. Their admin access already ends on their next click (stillAdmin);
  // the removal waits until they have looked unticked for a day, and the
  // family is told at once, so a mistaken edit (a duplicated row, a renamed
  // column) can be put right before anything is lost. An empty Notion answer,
  // or one without the "Administrator Eligible" or "Email" column (renamed or
  // deleted), removes nothing (re-audit).
  async function pruneAdmins() {
    const rows = (await notion.list({ fresh: true })).filter((r) => !r.archived);
    if (!rows.length) return { removed: 0, skipped: "NOTION_EMPTY" };
    if (rows.some((r) => r.adminColumnsPresent === false))
      return { removed: 0, skipped: "NOTION_ADMIN_COLUMNS_MISSING" };
    const day = 86400000;
    const plan = (s) => {
      const flag = [],
        clear = [],
        remove = [];
      for (const [id, a] of Object.entries(s.admins || {})) {
        const ok = adminEmails.includes(a.email) || !!adminRow(rows, a.email);
        if (ok && a.staleSince) clear.push(id);
        else if (!ok && !a.staleSince) flag.push(id);
        else if (!ok && a.staleSince <= now() - day) remove.push(id);
      }
      return { flag, clear, remove };
    };
    const first = plan(await ledger.read());
    if (!first.flag.length && !first.clear.length && !first.remove.length) return { removed: 0 };
    return ledger.transaction((s) => {
      const { flag, clear, remove } = plan(s);
      for (const id of clear) delete s.admins[id].staleSince;
      for (const id of flag) {
        s.admins[id].staleSince = now();
        securityNote(
          s,
          `${s.admins[id].email} is no longer an administrator in Notion. Their authenticator will be removed in a day unless their row is ticked again.`,
        );
      }
      for (const id of remove) {
        const email = s.admins[id].email;
        delete s.admins[id];
        delete s.ssoBindings?.[hash("admin-microsoft:" + email)];
        for (const [k, v] of Object.entries(s.sessions))
          if (v.kind === "admin" && v.email === email) delete s.sessions[k];
        roleEvent(s, "notion", email, "authenticator-removed");
      }
      return { removed: remove.length, pending: flag.length };
    });
  }
  // Scheduled catch-up for projections that failed earlier (Notion outage,
  // rate limit). Each step is bounded and independent: one failing step never
  // blocks the others, and nothing here sends a message to a guest.
  // Cloud Scheduler waits 60 s and Cloud Run 120 s: the retry steps start no
  // new item after 30 s, and the two checks are skipped after 45 s (re-audit
  // L3), so the run and its log line always finish.
  async function drainPending() {
    const started = Date.now(),
      until = started + 30000;
    const steps = {
      rsvp: () => retryPendingRsvps({ until }),
      sms: () => sms.retrySync({ until }),
      whatsapp: () => whatsapp.retrySync({ until }),
      planning: () => planning.retryPending({ until }),
      drift: checkDrift,
      admins: pruneAdmins,
    };
    const result = {};
    for (const [name, step] of Object.entries(steps)) {
      if (Date.now() > started + 45000) {
        result[name] = { skipped: "TIME_BUDGET" };
        continue;
      }
      try {
        result[name] = await step();
      } catch (e) {
        result[name] = { error: e.code || "FAILED" };
      }
    }
    // One line per run (counts and error codes only), so a step that keeps
    // failing shows in the logs: jsonPayload.message="drain" (re-audit N6).
    log({
      severity: Object.values(result).some((r) => r?.error) ? "WARNING" : "INFO",
      message: "drain",
      drain: result,
    });
    return result;
  }
  // Guests stay signed in while they use the site (AUTHN-7). A request in the
  // last 15 minutes of a guest session extends it to 30 minutes from now, never
  // past 12 hours after an email sign-in, or 2 hours after an invitation link
  // was opened: that session only answers the RSVP, which takes minutes, and a
  // long pause no longer loses a half-filled form. The extension is saved only
  // once the request has succeeded, together with the re-sent cookie (photo
  // responses included), so the ledger and the browser always agree. Admin
  // sessions keep their fixed 30 minutes (the admin page polls in the
  // background, which would keep an unattended tab signed in).
  const linkSessionLimit = 7200000;
  async function dispatch(req) {
    const refresh = {};
    const result = await route(req, refresh);
    const r = refresh.renew;
    if (r && result && typeof result === "object" && !result.setCookie) {
      await ledger.transaction((s) => {
        const row = s.sessions[r.sessionHash];
        if (row) {
          row.startedAt ??= r.startedAt;
          row.expiresAt = Math.max(row.expiresAt, r.until);
        }
      });
      result.setCookie = cookie(r.raw);
    }
    return result;
  }
  async function route(req, refresh) {
    const { path, method = "GET", body = {}, headers = {} } = req;
    if (path === "/api/internal/drain") {
      if (method !== "POST") throw error(405, "METHOD_NOT_ALLOWED");
      if (!verifyScheduler) throw error(404, "NOT_FOUND");
      if (!(await verifyScheduler(headers.authorization)))
        throw error(401, "UNAUTHORIZED");
      return drainPending();
    }
    // Converts waiting guest videos; its own Cloud Scheduler job, with the same
    // caller identity as the drain and a longer deadline (docs/deployment.md).
    if (path === "/api/internal/media") {
      if (method !== "POST") throw error(405, "METHOD_NOT_ALLOWED");
      if (!verifyScheduler) throw error(404, "NOT_FOUND");
      if (!(await verifyScheduler(headers.authorization)))
        throw error(401, "UNAUTHORIZED");
      return processMedia();
    }
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
        microsoftClientId,
        deadline,
        mailConfigured: mailer.configured,
        live: true,
      };
    if (path === "/api/site" && method === "GET") {
      return { site: siteSettings(await ledger.read()) };
    }
    // /api/calendar/ceremony.ics in English, /api/calendar/es/ceremony.ics in
    // Spanish (the /es/ pages link there); same event UID in both.
    if (path.startsWith("/api/calendar/") && method === "GET") {
      const es = path.startsWith("/api/calendar/es/"),
        kind = path.slice(es ? 17 : 14).replace(/\.ics$/, "");
      if (!["ceremony", "dinner", "reception"].includes(kind))
        throw error(404, "NOT_FOUND");
      const site = siteSettings(await ledger.read());
      if (!site[kind].end) throw error(409, "END_TIME_PENDING");
      return {
        binary: Buffer.from(calendar(kind, site, es ? "es" : "en")),
        contentType: "text/calendar; charset=utf-8",
        disposition: 'attachment; filename="sophia-' + kind + '.ics"',
      };
    }
    if (path === "/api/public" && method === "GET") {
      const s = await ledger.read();
      return {
        // Only what the public page shows; admin notes and audit fields stay private.
        announcements: Object.values(s.announcements)
          .filter((r) => r.published && !r.archived)
          .map(({ id, title, text, titleEs, textEs, at }) => ({
            id,
            title,
            text,
            titleEs,
            textEs,
            at,
          })),
        messages: Object.values(s.messages)
          .filter((r) => r.kind === "guestbook" && r.state === "approved")
          .map((r) => ({ id: r.id, name: r.name, text: r.text })),
        photos: [], // Media metadata and bytes require a signed-in guest or administrator.
      };
    }
    if (path === "/api/auth/admin-email/request" && method === "POST")
      return adminEmail.request(body);
    if (path === "/api/auth/sso/start" && method === "POST") {
      if (!["admin", "guest"].includes(body.purpose))
        throw error(422, "INVALID_PURPOSE");
      return ssoTicket(body.purpose);
    }
    if (
      [
        "/api/auth/google",
        "/api/auth/admin-email/verify",
        "/api/auth/microsoft",
      ].includes(path) &&
      method === "POST"
    ) {
      // Provider sign-ins carry a sealed, admin-only ticket whose nonce must come
      // back inside the ID token; the emailed link is its own one-time secret.
      const nonce =
        path === "/api/auth/admin-email/verify"
          ? null
          : openTicket(body.ticket, "admin");
      const identity = await chargeFailures(
          ledger,
          "admin-login-failures",
          60,
          900000,
          now(),
          () =>
            path === "/api/auth/google"
              ? verifyGoogle(safeText(body.credential, 10000), nonce)
              : nonce
                ? verifyMicrosoft(safeText(body.credential, 20000), nonce)
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
      const microsoft = identity.provider === "microsoft",
        binding = microsoft ? hash("admin-microsoft:" + identity.email) : null;
      // Google and Microsoft reach the same administrators as the emailed link
      // (which already resolved them): the owner, or a ticked Notion row.
      let who = nonce ? await admins.find(identity.email) : identity;
      if (!who) throw error(403, "ADMIN_NOT_ALLOWED");
      // Microsoft's proof of a second factor ("mfa" in amr) replaces the code
      // only for an administrator who already has an authenticator AND whose
      // Microsoft account was linked by an earlier sign-in that passed it. A
      // mailbox alone cannot mint that: a new Microsoft account for the same
      // email is not linked, so it gets the authenticator code.
      const linked = (s) =>
        microsoft &&
        identity.mfa &&
        s.ssoBindings?.[binding] === hash(identity.subject);
      const eligible = linked(await ledger.read());
      const sessionToken = token(),
        csrf = token();
      const result = await ledger.transaction((s) => {
        if (nonce) spendNonce(s, nonce);
        for (const [id, c] of Object.entries(s.challenges))
          if (c.expiresAt <= now()) delete s.challenges[id];
        // An authenticator set up earlier under another id is found by email.
        const existing = Object.entries(s.admins).find(
          ([, a]) => a.email === who.email,
        );
        if (existing) who = { ...who, id: existing[0] };
        const admin = s.admins[who.id];
        if (eligible && admin && linked(s)) {
          pruneSessions(s, now());
          s.sessions[hash(sessionToken)] = {
            kind: "admin",
            actor: who.id,
            email: who.email,
            csrf,
            ...(who.rowId ? { rowId: who.rowId } : {}),
            expiresAt: now() + 1800000,
          };
          audit(s, who.id, "admin-sign-in-microsoft-mfa", who.id, now());
          return { signedIn: true };
        }
        // Too many wrong authenticator codes for this admin across sign-ins:
        // sign-ins are paused for an hour (each sign-in already allows only 5
        // tries). An owner may still start one, to use a recovery code.
        if (mfaPaused(s, who.email) && !adminEmails.includes(who.email))
          throw error(429, "ADMIN_SIGN_IN_PAUSED");
        // A first authenticator is set up only after the emailed link: a Google
        // or Microsoft account can carry an address its holder no longer owns,
        // and must not be able to claim an admin's empty slot (re-audit).
        if (!admin && nonce) throw error(403, "ADMIN_SETUP_BY_EMAIL");
        // Anyone Notion makes an admin may set up an authenticator; the owner is
        // told in the Notifications inbox when they do (see /api/auth/mfa).
        const secret = newMfaSecret();
        s.challenges[hash(challenge)] = {
          ...who,
          // Linked to this email only after the authenticator code passes.
          ...(microsoft
            ? { sso: { binding, subject: hash(identity.subject) } }
            : {}),
          expiresAt: now() + 300000,
          attempts: 0,
          pendingSecret: admin ? null : seal(secret, key),
        };
        return admin ? {} : { enrollmentSecret: secret };
      });
      if (result.signedIn)
        return { signedIn: true, csrf, setCookie: cookie(sessionToken) };
      // The QR is drawn after the transaction: ledger mutators stay synchronous.
      return {
        challenge,
        ...(result.enrollmentSecret
          ? await enrollment(result.enrollmentSecret, identity.email)
          : {}),
      };
    }
    // Guest SSO signs in to the guest account registered with the same email.
    // It only ever creates a guest session: administration always goes through
    // /admin/login/ and its own checks, whatever permissions the account holds.
    if (path === "/api/auth/sso/guest" && method === "POST") {
      if (!["microsoft", "google"].includes(body.provider))
        throw error(422, "INVALID_PROVIDER");
      const nonce = openTicket(body.ticket, "guest");
      const identity = await chargeFailures(
        ledger,
        "guest-sso-failures",
        300,
        900000,
        now(),
        () =>
          body.provider === "microsoft"
            ? verifyMicrosoft(safeText(body.credential, 20000), nonce)
            : verifyGoogleIdentity(safeText(body.credential, 10000), nonce),
      );
      await rateLimit(
        ledger,
        "guest-sso:" + hash(identity.email),
        10,
        900000,
        now(),
      );
      return accounts.ssoSession(identity.email, (s) => {
        spendNonce(s, nonce);
        bindSso(s, identity);
      });
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
      const still = await admins.find(pendingChallenge.email);
      if (!still) throw error(403, "ADMIN_NOT_ALLOWED");
      const sessionToken = token(),
        csrf = token();
      const outcome = await ledger.transaction((s) => {
        const c = s.challenges[hash(safeText(body.challenge, 100))];
        if (!c || c.expiresAt <= now() || c.attempts >= 5)
          throw error(401, "SIGN_IN_AGAIN");
        c.attempts++;
        const existing = s.admins[c.id];
        // Wrong codes are also counted per admin across sign-ins: the 10th
        // within an hour pauses that admin's sign-ins for an hour from then,
        // including ones already open, and tells the family once. A correct
        // code clears the count. During a pause only an owner's recovery code
        // (and then the new authenticator's code) is accepted, so the
        // break-glass path stays open (re-audit).
        const failKey = hash("mfa-fail:" + c.email);
        const recovery = recoveryInput(body.code),
          owner = adminEmails.includes(c.email);
        if (mfaPaused(s, c.email) && !c.replacing && !(recovery && owner))
          throw error(429, "ADMIN_SIGN_IN_PAUSED");
        const fail = () => {
          s.mfaFailures ??= {};
          const previous = s.mfaFailures[failKey];
          const f =
            previous?.since > now() - 3600000
              ? previous
              : { count: 0, since: now(), pausedUntil: previous?.pausedUntil };
          f.count++;
          s.mfaFailures[failKey] = f;
          if (f.count === 10) {
            f.pausedUntil = now() + 3600000;
            securityNote(
              s,
              `10 wrong authenticator codes for ${c.email} within an hour. Sign-ins for this administrator are paused for an hour${owner ? "; recovery codes still work" : ""}.`,
            );
          }
          return { failed: true };
        };
        // The owner's recovery code: spend it and start a new authenticator setup
        // on this same challenge; the sign-in finishes with the new app's code.
        if (recovery && owner && existing?.recovery?.length) {
          const i = existing.recovery.indexOf(recoveryHash(recovery));
          if (i < 0) return fail();
          existing.recovery.splice(i, 1);
          const fresh = newMfaSecret();
          c.pendingSecret = seal(fresh, key);
          c.replacing = true;
          c.attempts = 0;
          c.expiresAt = now() + 300000; // a full five minutes to scan the new code
          // Cut off the lost phone at once, as an authenticator reset does: its
          // admin sessions, its other sign-ins in progress and the linked
          // Microsoft account whose two-step sign-in could stand in for the code.
          for (const [k, v] of Object.entries(s.sessions))
            if (v.kind === "admin" && v.email === c.email) delete s.sessions[k];
          for (const [k, v] of Object.entries(s.challenges))
            if (v !== c && v.email === c.email) delete s.challenges[k];
          delete s.ssoBindings?.[hash("admin-microsoft:" + c.email)];
          roleEvent(s, c.id, c.email, "recovery-code-used");
          securityNote(
            s,
            `A recovery code was used for ${c.email}; ${existing.recovery.length} left. A new authenticator is being set up.`,
          );
          return { reenroll: fresh };
        }
        const secret = unseal(
            c.replacing ? c.pendingSecret : existing?.secret || c.pendingSecret,
            key,
          ),
          step = verifyTotp(
            secret,
            body.code,
            now(),
            c.replacing ? -1 : (existing?.lastStep ?? -1),
          );
        if (step === null) return fail();
        delete s.mfaFailures?.[failKey];
        if (!existing || c.replacing) {
          roleEvent(s, c.id, c.email, existing ? "authenticator-replaced" : "authenticator-set-up");
          securityNote(s, `Authenticator ${existing ? "replaced" : "set up"} for ${c.email}`);
        }
        s.admins[c.id] = {
          ...existing,
          secret: seal(secret, key),
          lastStep: step,
          email: c.email,
        };
        // The code passed: link the Microsoft account that started this sign-in,
        // replacing any earlier one, so its MFA can stand in for the code later.
        if (c.sso && !c.replacing) {
          s.ssoBindings ??= {};
          s.ssoBindings[c.sso.binding] = c.sso.subject;
        }
        pruneSessions(s, now());
        s.sessions[hash(sessionToken)] = {
          kind: "admin",
          actor: c.id,
          email: c.email,
          csrf,
          ...(still.rowId ? { rowId: still.rowId } : {}),
          expiresAt: now() + 1800000,
        };
        delete s.challenges[hash(body.challenge)];
        audit(s, c.id, "admin-sign-in", c.id, now());
        return { failed: false };
      });
      if (outcome.failed) throw error(401, "INVALID_MFA");
      if (outcome.reenroll)
        return {
          challenge: safeText(body.challenge, 100),
          recovered: true,
          ...(await enrollment(outcome.reenroll, pendingChallenge.email)),
        };
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
      // Links (256-bit) and typed codes (80-bit) both open the RSVP only.
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
        if (!r.openedAt) {
          r.openedAt = now();
          logEvent(s, now(), "invitation.opened", {
            householdId: row.id,
            data: { via: viaCode ? "code" : "link" },
          });
        }
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
          scope: "rsvp",
          csrf,
          startedAt: now(),
          expiresAt: now() + 1800000,
        };
      });
      return { csrf, setCookie: cookie(value) };
    }
    const ctx = await context(req);
    // Notion decides admin access: an unticked box ends every session of that
    // admin on this request, before any route runs.
    if (ctx.session?.kind === "admin" && !(await admins.stillAdmin(ctx.session))) {
      const email = ctx.session.email;
      await ledger.transaction((s) => {
        for (const [k, v] of Object.entries(s.sessions))
          if (v.kind === "admin" && v.email === email) delete s.sessions[k];
      });
      ctx.session = null;
    }
    if (
      ctx.session?.scope === "rsvp" &&
      !rsvpScopeRoutes.has(method + " " + path)
    )
      ctx.session = null;
    const { session } = ctx;
    if (
      session?.kind === "guest" &&
      (session.accountId ? !!session.email : session.scope === "rsvp") &&
      ctx.raw &&
      path !== "/api/logout" &&
      path !== "/api/logout-all" &&
      // A page checking for replies in the background is not someone using it.
      req.query?.poll !== "1" &&
      session.expiresAt - now() < 900000
    ) {
      const startedAt = session.startedAt ?? session.expiresAt - 1800000,
        until = Math.min(
          now() + 1800000,
          startedAt + (session.accountId ? 43200000 : linkSessionLimit),
        );
      // Renew an email sign-in only while that email is still on the
      // household's Notion row, so removing it still ends access within about
      // 15 minutes. A Notion error, or no answer within 2 seconds, skips the
      // renewal; it never fails or noticeably delays the request. A link
      // session was already checked against its link (sessionValid) and only
      // reaches RSVP routes, so it needs no Notion read.
      const renew =
        until > session.expiresAt &&
        (!session.accountId ||
          (await Promise.race([
            notion.list().then(
              (rows) => rosterMatch(rows, session.email)?.id === session.householdId,
              () => false,
            ),
            new Promise((resolve) => setTimeout(() => resolve(false), 2000).unref?.()),
          ])));
      if (renew)
        refresh.renew = { sessionHash: ctx.sessionHash, startedAt, until, raw: ctx.raw };
    }
    // Pieces of a photo or video upload have their own, larger budget below.
    if (session && method !== "GET" && !uploadPiece.test(path))
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
        owner: session?.kind === "admin" && ownerSession(session),
      };
    const requireAuth = (kind) => {
      if (!session || (kind && session.kind !== kind))
        throw error(401, "SIGN_IN_REQUIRED");
      if (method !== "GET" && !sameSecret(headers["x-csrf-token"], session.csrf))
        throw error(403, "CSRF_REJECTED");
    };
    if (path === "/api/gallery" && method === "GET") {
      requireAuth();
      if (session.kind !== "admin" && !session.accountId)
        throw error(403, "VERIFIED_ACCOUNT_REQUIRED");
      if (session.kind !== "admin") await stillListed(session);
      return {
        media: Object.values(ctx.state.photos)
          .filter((r) => r.state === "approved")
          .map((r) => ({
            id: r.id,
            kind: r.kind || "photo",
            album: r.album || "event",
            caption: r.caption,
            url: "/api/photo/" + r.id,
            // A still for the video's tile; videos converted before posters
            // existed have none.
            poster: r.poster ? "/api/photo/" + r.id + "?poster=1" : null,
          })),
      };
    }
    if (path === "/api/auth/email/request" && method === "POST")
      return accounts.request(body);
    if (path === "/api/auth/email/verify" && method === "POST")
      return accounts.consume(body.token);
    if (path === "/api/account" && method === "GET") {
      requireAuth("guest");
      if (session.accountId) await stillListed(session);
      const a = ctx.state.accounts?.[session.accountId];
      return {
        account: a ? { name: a.name, email: a.email } : null,
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
    // Sign out on every device (AUTHN-10): every session of this signed-in
    // guest account, or of this administrator. Invitation-link sessions can't
    // use it (they are RSVP-only), so one household member can't sign out others.
    if (path === "/api/logout-all" && method === "POST") {
      requireAuth();
      const signedOut = await ledger.transaction((s) => {
        let n = 0;
        // Every session of this person. From the admin menu that includes their
        // guest sign-ins; from My account only guest sign-ins, so a guest
        // sign-in alone cannot sign an administrator out (re-audit).
        for (const [k, v] of Object.entries(s.sessions))
          if (
            (session.kind === "admin" || v.kind !== "admin") &&
            ((session.email && v.email === session.email) ||
              (!!session.accountId && v.accountId === session.accountId))
          ) {
            delete s.sessions[k];
            n++;
          }
        audit(s, session.actor || session.accountId, "sign-out-everywhere", session.kind, now());
        return n;
      });
      return {
        signedOut,
        setCookie:
          "__session=; Path=/api; Secure; HttpOnly; SameSite=Strict; Max-Age=0",
      };
    }
    if (path === "/api/invitation" && method === "GET") {
      requireAuth("guest");
      const row = await guestInvitation(session, { allowStale: true }),
        s = await ledger.read();
      return {
        // The page keeps a half-filled RSVP per household under this id.
        householdId: row.id,
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
        invitationReady: row.invitationReady,
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
      const invitation = await guestInvitation(session, { allowStale: true }),
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
        if (!invitationOpen(s, session)) throw error(401, "INVITATION_INACTIVE");
        if (!p || p.version !== body.version)
          throw error(409, "PROFILE_CHANGED");
        p.contact = contact;
        p.version++;
        p.updatedAt = now();
        // Synced to Notion with the household's invitation record (once issued).
        if (invite) markPending(invite);
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
        // No invitation issued yet: nothing to sync until there is.
        syncState: (await ledger.read()).invitations[session.householdId]?.syncState ?? null,
      };
    }
    if (path === "/api/messages" && method === "GET") {
      requireAuth("guest");
      await guestInvitation(session, { allowStale: true });
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
      if (!row.invitationReady) throw error(409, "INVITATION_NOT_READY");
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
        // At most 5 automatic receipts per household a day. Past that, a
        // receipt waits as a draft in Communications for a person to send or
        // archive, so repeated RSVPs cannot fill a family's inbox (re-audit).
        const sentToday = Object.values(s.outbox).filter(
          (j) =>
            j.householdId === row.id &&
            ["receipt", "update"].includes(j.type) &&
            j.attemptAt > now() - 86400000,
        ).length;
        let job = null;
        if (draft && mailer.configured && sentToday < 5)
          try {
            job = claimMail(s, draft.id, row);
          } catch {
            /* Stale receipt: the RSVP stays saved; the family can review it. */
          }
        return { response, task: claimSync(s, row.id, owner), job };
      };
      const { response: receipt, task, job } = await ledger.transaction((s) => {
        const current = s.invitations[row.id];
        // The RSVP needs an issued invitation (it holds the invited events).
        if (!current) throw error(409, "INVITATION_NOT_READY");
        if (!current.active || !invitationOpen(s, session))
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
        markPending(current);
        current.latestSubmissionId = id;
        // An admin's earlier choice to write an older answer no longer applies.
        delete current.forceSubmissionId;
        // Receipts go only to a verified address: the signed-in email, or the
        // household's Email in Notion. Never to an address typed in the form.
        const receiptTo = session.email || row.email;
        if (receiptTo)
          queue(s, {
            type: response.previousSubmissionId ? "update" : "receipt",
            household: row,
            recipient: receiptTo,
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
        logEvent(
          s,
          now(),
          response.previousSubmissionId ? "rsvp.updated" : "rsvp.submitted",
          { actor: "guest", householdId: row.id, data: { responseId: id, people } },
        );
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
          // The verified sign-in behind this message, for reply emails (FLOW-8).
          accountId: session.accountId || null,
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
    // Guest photos and videos travel in pieces (site/upload-batch.mjs):
    // POST /api/uploads opens an upload, POST /api/uploads/<id>?offset=N
    // sends raw bytes from there, and GET /api/uploads/<id> says how it is
    // going. Nothing is visible to anyone until the family approves it.
    if (path === "/api/uploads" && method === "POST") {
      requireAuth("guest");
      if (!session.accountId) throw error(403, "VERIFIED_ACCOUNT_REQUIRED");
      await guestInvitation(session);
      if (body.consent !== true) throw error(422, "CONSENT_REQUIRED");
      const type = typeof body.type === "string" ? body.type.toLowerCase() : "",
        kind = classify({ type, name: "" }).kind,
        size = body.size;
      if (!kind || kind !== body.kind || !Number.isSafeInteger(size) || size < 1)
        throw error(422, "INVALID_UPLOAD");
      if (size > uploadLimits[kind === "video" ? "videoBytes" : "photoBytes"])
        throw error(413, kind === "video" ? "VIDEO_TOO_LARGE" : "PHOTO_TOO_LARGE");
      const album = safeText(body.album || "event", 40);
      if (!siteSettings(ctx.state).albums.some((a) => a.id === album))
        throw error(422, "INVALID_ALBUM");
      const caption = safeText(body.caption || "", 200);
      // 20 photos and videos per household a day, said plainly to the guest.
      // Checked here before storage opens a session, and again when saving.
      const full = (s) =>
        begunToday(s, session.householdId).length >= uploadLimits.perDay;
      if (full(ctx.state)) throw error(429, "DAILY_UPLOAD_LIMIT");
      const id = randomUUID(),
        uri = await media.begin(id, type).catch(storageTrouble);
      const dropped = await ledger.transaction((s) => {
        s.uploads ??= {};
        s.uploadsBegun ??= {};
        const gone = expireUploads(s);
        if (full(s)) throw error(429, "DAILY_UPLOAD_LIMIT");
        s.uploadsBegun[session.householdId] = [
          ...begunToday(s, session.householdId),
          now(),
        ];
        // At most one batch of unfinished uploads per person: opening one
        // more gives up the oldest (its pieces then find nothing).
        const open = Object.values(s.uploads)
          .filter((u) => u.accountId === session.accountId && u.state === "receiving")
          .sort((a, b) => a.createdAt - b.createdAt);
        for (const u of open.slice(0, Math.max(0, open.length - uploadLimits.files + 1))) {
          delete s.uploads[u.id];
          gone.push(u);
        }
        s.uploads[id] = {
          id,
          kind,
          type,
          size,
          album,
          caption,
          householdId: session.householdId,
          accountId: session.accountId,
          // The storage session URI lets whoever holds it write this upload.
          session: seal(uri, key),
          state: "receiving",
          createdAt: now(),
          consentAt: now(),
        };
        return gone;
      }).catch(async (e) => {
        // Another upload took the last place meanwhile.
        if (e.code === "DAILY_UPLOAD_LIMIT") await media.cancel(uri);
        throw e;
      });
      await discardUploads(dropped);
      return { id };
    }
    const piece = uploadPiece.exec(path);
    if (piece && method === "POST") {
      requireAuth("guest");
      const upload = ctx.state.uploads?.[piece[1]];
      if (!session.accountId || upload?.accountId !== session.accountId)
        throw error(404, "NOT_FOUND");
      // About 2.4 GB an hour in the largest pieces; a page sends one at a time.
      await rateLimit(ledger, hash("pieces:" + session.accountId), 1500, 3600000, now());
      return receivePiece(upload, Number(req.query?.offset), req.bytes);
    }
    if (piece && method === "GET") {
      requireAuth("guest");
      const upload = ctx.state.uploads?.[piece[1]],
        row = ctx.state.photos[piece[1]];
      if (!session.accountId || (upload || row)?.accountId !== session.accountId)
        throw error(404, "NOT_FOUND");
      if (upload?.state === "receiving") {
        const stored = await media
          .offset(unseal(upload.session, key))
          .catch(storageTrouble);
        return { state: "receiving", received: stored.received, size: upload.size };
      }
      if (upload?.state === "failed")
        return { state: "failed", problem: upload.problem };
      // What the guest needs to know; the family's decision stays with them.
      return ["processing", "failed"].includes(row?.state)
        ? { state: row.state, problem: row.problem || null }
        : { state: "review" };
    }
    if (path.startsWith("/api/photo/") && method === "GET") {
      requireAuth();
      if (session.kind !== "admin" && !session.accountId)
        throw error(403, "VERIFIED_ACCOUNT_REQUIRED");
      if (session.kind !== "admin") await stillListed(session);
      const id = path.slice(11);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw error(404, "NOT_FOUND");
      const row = ctx.state.photos[id],
        kind = req.query?.poster === "1" ? "poster" : row?.kind || "photo";
      if (
        !row ||
        (row.state !== "approved" && session?.kind !== "admin") ||
        // A video still converting (or that could not be) has nothing to show.
        ["processing", "failed"].includes(row.state) ||
        (kind === "poster" && !row.poster)
      )
        throw error(404, "NOT_FOUND");
      const size = await media.size(id, kind).catch((e) => {
        throw e.code === 404 ? error(404, "NOT_FOUND") : e;
      });
      return mediaResponse(
        size,
        (start, end) => media.stream(id, kind, start, end),
        kind,
        headers.range,
        req.query?.download === "1",
        id,
      );
    }
    if (path.startsWith("/api/admin/")) {
      requireAuth("admin");
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
      // The approved pages filled with the idea-book examples, for administrators
      // only (owner decision 9). Opened by plain navigation from the admin portal.
      if (path === "/api/admin/preview" && method === "GET") {
        const page = req.query?.page,
          lang = req.query?.lang || "en";
        if (!previewRoutes.includes(page) || !["en", "es"].includes(lang))
          throw error(404, "NOT_FOUND");
        const html = await readFile(join(previewRoot, lang, page + ".html")).catch(() => {
          throw error(404, "PREVIEW_NOT_BUILT");
        });
        return { binary: html, contentType: "text/html; charset=utf-8" };
      }
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
      // Who can sign in. Administrators come from Notion ("Administrator
      // Eligible") plus the break-glass owner; guests from their household's
      // Email. Nothing on this page grants access: Notion does.
      if (path === "/api/admin/accounts" && method === "GET") {
        const rows = (await notion.list({ fresh: true })).filter(
            (r) => !r.archived,
          ),
          enrolled = new Set(
            Object.values(ctx.state.admins || {}).map((a) => a.email),
          );
        const administrators = [
          ...adminEmails.map((email) => ({ email, name: "Site owner", owner: true })),
          // Only the main Email of a ticked row is an administrator.
          ...rows
            .filter((r) => r.administratorEligible && r.email)
            .map((r) => ({ email: r.email, name: r.name, owner: false })),
        ]
          .filter((x, i, all) => all.findIndex((y) => y.email === x.email) === i)
          .map((x) => ({ ...x, authenticator: enrolled.has(x.email) }));
        return {
          administrators,
          flaggedWithoutEmail: rows
            .filter((r) => r.administratorEligible && !r.email)
            .map((r) => r.name),
          missingEmails: rows.filter((r) => !r.email).length,
          households: rows.length,
          guests: Object.values(ctx.state.accounts || {})
            .filter((a) => !a.deletedAt)
            .map(({ id, name, email, householdId, verifiedAt, lastSignInAt }) => ({
              id,
              name,
              email,
              householdId,
              verifiedAt,
              lastSignInAt,
            })),
          owner: ownerSession(session),
          ...(ownerSession(session)
            ? { recoveryCodesLeft: ctx.state.admins?.[session.actor]?.recovery?.length ?? 0 }
            : {}),
        };
      }
      // Owner only: a new set of ten recovery codes (SEC-10), shown once. Making
      // a new set cancels the old one. Needs the owner's current code.
      if (path === "/api/admin/recovery-codes" && method === "POST") {
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
        const codes = newRecoveryCodes();
        await ledger.transaction((s) => {
          requireFreshCode(s, session, body.code);
          s.admins[session.actor].recovery = codes.map((c) =>
            recoveryHash(c.replaceAll("-", "")),
          );
          roleEvent(s, session.actor, session.email, "recovery-codes-created");
          securityNote(s, `New recovery codes were created for ${session.email}`);
        });
        return { codes };
      }
      // Owner only: forget a lost authenticator, so that administrator sets up a
      // new one (QR code) at their next sign-in. Needs the owner's current code.
      if (path === "/api/admin/authenticator-reset" && method === "POST") {
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
        const email = String(body.email || "")
          .trim()
          .toLowerCase();
        if (adminEmails.includes(email)) throw error(403, "OWNER_PROTECTED");
        return ledger.transaction((s) => {
          requireFreshCode(s, session, body.code);
          const had = Object.entries(s.admins).filter(([, a]) => a.email === email);
          if (!had.length) throw error(404, "NO_AUTHENTICATOR");
          for (const [id] of had) delete s.admins[id];
          for (const [id, v] of Object.entries(s.sessions))
            if (v.kind === "admin" && v.email === email) delete s.sessions[id];
          for (const [id, v] of Object.entries(s.challenges))
            if (v.email === email) delete s.challenges[id];
          delete s.ssoBindings?.[hash("admin-microsoft:" + email)];
          roleEvent(s, session.actor, email, "authenticator-reset");
          audit(s, session.actor, "authenticator-reset", email, now());
          return { reset: true };
        });
      }
      if (path === "/api/admin/role-events" && method === "GET") {
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
        return { events: (ctx.state.roleEvents || []).slice(-50).reverse() };
      }
      if (path === "/api/admin/guests" && method === "GET") {
        const rows = await notion.list({ allowStale: true }),
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
                  // A difference from Notion awaiting the admin's choice (NOTION-8).
                  notionDiffers:
                    s.drift?.[row.id] && s.drift[row.id].accepted !== s.drift[row.id].signature
                      ? s.drift[row.id].signature
                      : null,
                }
              : {}),
            response:
              s.responses[s.invitations[row.id]?.latestSubmissionId] ?? null,
            ...householdStatus(s, row),
          })),
        };
      }
      if (path === "/api/admin/dashboard" && method === "GET") {
        const s = await ledger.read(),
          rows = await notion.list({ allowStale: true }),
          responses = Object.values(s.invitations)
            .filter((r) => r.active && r.latestSubmissionId)
            .map((r) => s.responses[r.latestSubmissionId]),
          // Head counts follow the answer the family goes by: the website's,
          // or Notion's for phone RSVPs and kept differences (re-audit N2).
          answers = rows
            .filter((r) => !r.archived && s.invitations[r.id]?.active !== false)
            .map((r) => attendanceOf(s, r))
            .filter(Boolean);
        return {
          households: rows.filter((r) => !r.archived).length,
          active: Object.values(s.invitations).filter((r) => r.active).length,
          responded: answers.length,
          statuses: rows
            .filter((r) => !r.archived)
            .reduce(
              (a, r) => (a[householdStatus(s, r).status]++, a),
              Object.fromEntries(householdStatuses.map((k) => [k, 0])),
            ),
          pendingSync: Object.values(s.invitations).filter(
            (r) => r.syncState === "pending",
          ).length,
          failedSync: Object.values(s.invitations).filter(
            (r) => r.syncState === "failed",
          ).length,
          notionDrift: Object.values(s.drift || {}).filter((d) => d.accepted !== d.signature)
            .length,
          counts: Object.fromEntries(
            events.map((e) => [
              e,
              answers.reduce(
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
          logEvent(s, now(), "invitation.issued", {
            actor: session.actor,
            householdId: row.id,
            data: { generation: s.invitations[row.id].generation },
          });
          return { link, code: code.match(/.{4}/g).join("-"), id: row.id };
        });
      }
      if (path === "/api/admin/revoke" && method === "POST") {
        return ledger.transaction((s) => {
          if (!s.invitations[body.id]) throw error(404, "NOT_FOUND");
          s.invitations[body.id].active = false;
          audit(s, session.actor, "invitation-revoked", body.id, now());
          logEvent(s, now(), "invitation.revoked", {
            actor: session.actor,
            householdId: body.id,
          });
          return { revoked: true };
        });
      }
      if (path === "/api/admin/import" && method === "POST") {
        // Creates Notion rows in bulk: owners only.
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
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
      if (path === "/api/admin/schema" && method === "POST") {
        // Changes the Notion database structure: owners only.
        if (!ownerSession(session)) throw error(403, "OWNER_REQUIRED");
        return { added: await notion.prepareSchema() };
      }
      if (path === "/api/admin/sync" && method === "POST")
        return retryPendingRsvps({ includeFailed: true });
      // NOTION-8: the admin decides one household's difference. "website" writes
      // the website's answer to Notion again; "notion" keeps Notion's version and
      // stops reporting this difference (a new, different one is reported).
      if (path === "/api/admin/drift" && method === "POST") {
        if (!ctx.state.drift?.[body.id]) throw error(404, "NOT_FOUND");
        if (body.keep === "website") {
          await syncOne(body.id, { forceResponse: true });
          await ledger.transaction((s) =>
            audit(s, session.actor, "notion-drift-write-website", body.id, now()),
          );
          return { kept: "website", syncState: (await ledger.read()).invitations[body.id]?.syncState };
        }
        if (body.keep === "notion")
          return ledger.transaction((s) => {
            const entry = s.drift?.[body.id];
            if (!entry) throw error(404, "NOT_FOUND");
            entry.accepted = entry.signature;
            // Keeping Notion's version cancels a Write still waiting to be done.
            delete s.invitations[body.id]?.forceSubmissionId;
            audit(s, session.actor, "notion-drift-keep-notion", body.id, now());
            return { kept: "notion" };
          });
        throw error(422, "INVALID_CHOICE");
      }
      if (path === "/api/admin/moderation" && method === "GET") {
        // Each contact message shows, before replying, exactly where a reply
        // email would go (replyTo), so the admin confirms the real recipient.
        const notionRows = new Map(
          (await notion.list({ allowStale: true }).catch(() => [])).map((r) => [r.id, r]),
        );
        return {
          messages: Object.values(ctx.state.messages).map((m) =>
            m.kind === "contact"
              ? { ...m, replyTo: replyRecipient(ctx.state, m, notionRows.get(m.householdId)) }
              : m,
          ),
          photos: Object.values(ctx.state.photos),
          albums: siteSettings(ctx.state).albums,
          mailConfigured: mailer.configured,
        };
      }
      if (path === "/api/admin/message-reply" && method === "POST") {
        const text = safeText(body.text, 2000);
        if (!text) throw error(422, "MESSAGE_REQUIRED");
        // FLOW-8: a reply email goes out only when the admin ticked the box
        // next to the recipient shown to them, and only if that is still the
        // verified address now. Checked before the reply is saved, so a refusal
        // never leaves a saved reply that tempts a second try.
        const notifying = body.notify === true;
        let to = null,
          locale = "en";
        if (notifying) {
          if (!mailer.configured) throw error(409, "EMAIL_NOT_CONFIGURED");
          const found = ctx.state.messages[body.id];
          if (!found || found.kind !== "contact") throw error(404, "NOT_FOUND");
          const row = await notion.read(found.householdId, { fresh: true }).catch(() => null);
          to = replyRecipient(ctx.state, found, row);
          locale = ctx.state.invitations[found.householdId]?.locale || "en";
          if (!to || to !== body.to) throw error(409, "RECIPIENT_CHANGED");
        }
        await ledger.transaction((s) => {
          const message = s.messages[body.id];
          if (!message || message.kind !== "contact")
            throw error(404, "NOT_FOUND");
          message.replies ??= [];
          if (message.replies.length >= 100) throw error(422, "THREAD_LIMIT");
          message.replies.push({ text, at: now() });
          audit(s, session.actor, "message-reply", body.id, now());
        });
        if (!notifying) return { saved: true, emailed: false };
        let emailed = true;
        try {
          await mailer.send({
            id: token(),
            to,
            subject: "We answered your message / Te respondimos · Sophia’s quinceañera",
            html: `<p>We answered your message on Sophia’s quinceañera website.</p><p>Te respondimos en el sitio de los XV de Sophia.</p><p><a href="${origin}${locale === "es" ? "/es" : ""}/account/">Sign in to read our reply / Entra para leer nuestra respuesta</a></p>`,
          });
        } catch {
          emailed = false;
        }
        // The reply is already saved; a failed audit write must not look like a
        // failed reply (and invite a duplicate).
        await ledger
          .transaction((s) =>
            audit(
              s,
              session.actor,
              emailed ? "message-reply-email-sent" : "message-reply-email-failed",
              body.id,
              now(),
            ),
          )
          .catch(() => {});
        return emailed
          ? { saved: true, emailed: true, to }
          : { saved: true, emailed: false, reason: "SEND_FAILED" };
      }
      if (path === "/api/admin/moderation" && method === "POST") {
        if (
          !["photos", "messages"].includes(body.collection) ||
          !["approved", "rejected"].includes(body.state)
        )
          throw error(422, "INVALID_FIELDS");
        const moderated = await ledger.transaction((s) => {
          const row = s[body.collection][body.id];
          if (!row) throw error(404, "NOT_FOUND");
          if (row.kind === "contact" && body.state === "approved")
            throw error(422, "CONTACT_IS_PRIVATE");
          // A video can be approved once it plays: not while it is still
          // converting, nor after a conversion that failed.
          const waiting = body.collection === "photos" && row.state === "processing";
          if (
            body.state === "approved" &&
            (waiting || (body.collection === "photos" && row.state === "failed"))
          )
            throw error(409, "MEDIA_NOT_READY");
          if (body.collection === "photos" && body.album) {
            if (!siteSettings(s).albums.some((a) => a.id === body.album))
              throw error(422, "INVALID_ALBUM");
            row.album = body.album;
          }
          row.state = body.state;
          audit(s, session.actor, "moderation", body.id, now());
          return { state: row.state, discard: waiting };
        });
        // Removed before it was converted: the original is no longer needed.
        if (moderated.discard) await media.remove(body.id, "upload").catch(() => {});
        return { state: moderated.state };
      }
      // Households with an issued link, plus phone RSVPs typed into Notion;
      // dinner seats follow attendanceOf (re-audit N2).
      const seatable = (s, r) =>
        !r.archived && (s.invitations[r.id] ? s.invitations[r.id].active : !!attendanceOf(s, r));
      // With Notion unreachable and nothing cached, seating still works from
      // the issued invitations and the website's answers.
      const seatingRows = async () =>
        (await notion.list({ allowStale: true }).catch(() => null)) ??
        Object.values(ctx.state.invitations).map((r) => ({ id: r.id, name: r.name }));
      if (path === "/api/admin/seating" && method === "GET") {
        const rows = await seatingRows();
        return {
          tables: Object.values(ctx.state.tables),
          households: rows
            .filter((r) => seatable(ctx.state, r))
            .map((r) => ({
              id: r.id,
              name: r.name,
              count: dinnerSeats(attendanceOf(ctx.state, r)),
            })),
        };
      }
      if (path === "/api/admin/seating" && method === "POST") {
        const rows = new Map((await seatingRows()).map((r) => [r.id, r]));
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
            const row = typeof h === "string" ? rows.get(h) : null;
            if (!row || !seatable(s, row)) throw error(422, "INVALID_HOUSEHOLD");
            if (
              Object.values(s.tables).some(
                (t) => t.id !== id && t.households.includes(h),
              )
            )
              throw error(409, "ALREADY_SEATED");
            count += dinnerSeats(attendanceOf(s, row));
          }
          if (count > capacity) throw error(422, "TABLE_OVER_CAPACITY");
          s.tables[id] = { id, name, capacity, households };
          audit(s, session.actor, "seating", id, now());
          return s.tables[id];
        });
      }
      // FLOW-12: remove a table; its households become unseated.
      if (path === "/api/admin/seating/delete" && method === "POST")
        return ledger.transaction((s) => {
          if (!s.tables[body.id]) throw error(404, "NOT_FOUND");
          delete s.tables[body.id];
          audit(s, session.actor, "seating-delete", body.id, now());
          return { deleted: true };
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
        const rows = (await notion.list({ allowStale: true })).filter(
          (r) => !r.archived && ctx.state.invitations[r.id]?.active !== false,
        );
        const sms = req.query?.channel === "sms";
        return {
          groups: [
            ...new Set(rows.flatMap((r) => r.distributionGroups || [])),
          ].sort(),
          recipients: (sms ? audience(rows, { groups: [], ids: rows.map(r => r.id) }, ctx.state, "sms") : rows.filter(r => validEmail(r.email)))
            .map((r) => ({
              id: r.id,
              name: recipientName(r),
              email: r.email,
              phone: r.destination || r.phone,
              groups: r.distributionGroups || [],
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          // SMS: every household with its plain-words status, so the page can
          // say who is textable and what the others are waiting on.
          ...(sms && {
            households: rows
              .map((r) => ({
                id: r.id,
                name: recipientName(r),
                phone: r.phone || "",
                groups: r.distributionGroups || [],
                status: smsStatus(ctx.state, r),
              }))
              .sort((a, b) => a.name.localeCompare(b.name)),
          }),
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
        const personal = text.includes(LINK_PLACEHOLDER);
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
          const ids = [],
            skipped = [];
          s.smsDrafts ??= {};
          for (const row of recipients) {
            const id = randomUUID();
            // {link}: mint a private link per household, bound to this draft so
            // it opens only after the message is sent. Households without an
            // active invitation are skipped and reported, never sent a dead link.
            let url = null,
              invite = null;
            if (personal) {
              invite = s.invitations[row.id];
              if (!invite?.active) {
                skipped.push(row.displayName);
                continue;
              }
              const minted = token();
              url =
                origin + (invite.locale === "es" ? "/es" : "") + "/rsvp/#" + minted;
              if (channel === "sms")
                smsPreview(text.replaceAll(LINK_PLACEHOLDER, url));
              s.invitationLinks ??= {};
              s.invitationLinks[hash(minted)] = {
                householdId: row.id,
                generation: invite.generation,
                channel,
                draftId: id,
              };
            }
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
                ...(url && { link: seal(url, key), generation: invite.generation }),
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
                  `<p>${escapeHtml(text)
                    .replaceAll("\n", "<br>")
                    .replaceAll(
                      LINK_PLACEHOLDER,
                      url ? `<a href="${url}">${url}</a>` : LINK_PLACEHOLDER,
                    )}</p>`,
                  key,
                ),
                state: "draft",
                createdAt: now(),
                groups: body.groups,
                directlySelected: body.ids.includes(row.id),
                ...(url && { generation: invite.generation }),
              };
          }
          if (!ids.length && skipped.length) throw error(422, "LINKS_NOT_READY");
          const result = { ids, count: ids.length, channel, skipped };
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
          drafts: Object.values(ctx.state.smsDrafts || {}).map(({ link, ...d }) => ({
            ...d,
            delivery: ctx.state.smsDelivery?.[d.providerId]?.status || null,
          })),
          batches: sms.batches(ctx.state),
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
      if (path === "/api/admin/sms/test" && method === "POST") {
        if (body.confirm !== true) throw error(422, "CONFIRM_RECIPIENT");
        return sms.sendTest({ phone: body.phone, text: safeText(body.text, 1600) }, session.actor);
      }
      if (path === "/api/admin/sms/batch" && method === "GET") {
        const batch = sms.batches(ctx.state).find((b) => b.id === req.query?.id);
        if (!batch) throw error(404, "NOT_FOUND");
        return batch;
      }
      if (path === "/api/admin/sms/batch/confirm" && method === "POST")
        return sms.confirmBatch(body.id, body.count, session.actor);
      if (path === "/api/admin/sms/batch/send" && method === "POST")
        return sms.sendBatch(body.id, session.actor);
      if (path === "/api/admin/sms/batch/cancel" && method === "POST")
        return sms.cancelBatch(body.id, session.actor);
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
  // Guest media: receiving uploads piece by piece, converting photos as they
  // finish, and converting videos later in the scheduled media job.
  //
  // Storage trouble while receiving is worth another try from the page, except
  // a storage session that no longer exists (expired, or replaced).
  const storageTrouble = (e) => {
    if (e.status) throw e;
    log({ severity: "WARNING", message: "media storage", code: e.code ?? null });
    throw e.code === 410
      ? error(410, "UPLOAD_EXPIRED")
      : error(503, "UPLOAD_STORAGE_BUSY");
  };
  // Uploads are kept a day: long enough to resume one or repeat its last
  // piece, short enough that abandoned ones never pile up. Returns the
  // unfinished ones, whose storage session and stray file are then discarded.
  function expireUploads(s) {
    const gone = [];
    for (const u of Object.values(s.uploads || {}))
      if (u.createdAt <= now() - 86400000) {
        delete s.uploads[u.id];
        if (u.state === "receiving") gone.push(u);
      }
    for (const householdId of Object.keys(s.uploadsBegun || {}))
      if (!begunToday(s, householdId).length) delete s.uploadsBegun[householdId];
    return gone;
  }
  // The 20 a day: when each of a household's uploads in the last 24 hours
  // began. Kept in the ledger, so a restart, scaling to zero or the second
  // instance cannot start the day over (as the in-memory counter did), and
  // counted as each upload begins, so one given up for a newer batch (its
  // record is deleted), refused or never finished still counts: each may
  // bring up to 300 MB.
  function begunToday(s, householdId) {
    return (s.uploadsBegun?.[householdId] || []).filter(
      (at) => at > now() - 86400000,
    );
  }
  async function discardUploads(list) {
    for (const u of list) {
      await media.cancel(unseal(u.session, key));
      await media.remove(u.id, "upload").catch(() => {});
    }
  }
  // One piece of an upload, at byte `offset`. Only bytes storage does not have
  // yet are written, so a piece sent again (its answer was lost) is harmless;
  // the answer always says how much is stored, and the page continues there.
  async function receivePiece(upload, offset, bytes) {
    if (upload.state !== "receiving") return uploadAnswer(upload);
    const size = upload.size,
      length = Buffer.isBuffer(bytes) ? bytes.length : 0,
      last = offset + length === size;
    if (
      !length ||
      length > uploadLimits.maxPiece ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset + length > size ||
      offset % uploadLimits.unit ||
      (!last && length % uploadLimits.unit)
    )
      throw error(422, "INVALID_PIECE");
    const uri = unseal(upload.session, key);
    let stored = await media.offset(uri).catch(storageTrouble);
    if (!stored.complete && offset <= stored.received && offset + length > stored.received)
      stored = await media
        .write(uri, stored.received, bytes.subarray(stored.received - offset), last ? size : null)
        .catch(storageTrouble);
    if (!stored.complete) return { received: stored.received, complete: false };
    return finishUpload(upload.id);
  }
  // Runs when the last byte is stored, and again for a repeated last piece:
  // the upload's state makes the second answer the same as the first.
  async function finishUpload(id) {
    let upload = (await ledger.read()).uploads?.[id];
    if (!upload) throw error(404, "NOT_FOUND");
    if (upload.state !== "receiving") return uploadAnswer(upload);
    let problem = null;
    if (upload.kind === "photo")
      try {
        await media
          .put(id, await convertPhoto(id), "photo")
          // Already stored by an earlier run whose answer was lost.
          .catch((e) => {
            if (e.code !== 412) throw e;
          });
      } catch (e) {
        // Busy or storage trouble: the page sends the last piece again.
        if (e.status !== 422) throw e;
        problem = e.code;
      }
    upload = await ledger.transaction((s) => {
      const u = s.uploads?.[id];
      if (!u || u.state !== "receiving") return u;
      if (problem) {
        u.state = "failed";
        u.problem = problem;
        return u;
      }
      u.state = "received";
      const albums = siteSettings(s).albums;
      s.photos[id] = {
        id,
        kind: u.kind,
        // The album chosen at the start, unless the family removed it since.
        album: albums.some((a) => a.id === u.album) ? u.album : albums[0]?.id || "event",
        householdId: u.householdId,
        accountId: u.accountId,
        caption: u.caption,
        // A video waits for its conversion before the family can review it.
        state: u.kind === "video" ? "processing" : "pending",
        consentAt: u.consentAt,
        receivedAt: now(),
      };
      if (u.kind === "photo") {
        s.notifications ??= {};
        s.notifications[id] = { id, kind: "photo", at: now(), read: false };
      }
      return u;
    });
    if (!upload) throw error(404, "NOT_FOUND");
    if (upload.kind === "photo" || upload.state === "failed")
      await media.remove(id, "upload").catch(() => {});
    if (upload.kind === "photo" && upload.state === "received")
      await sendNotification(id);
    return uploadAnswer(upload);
  }
  function uploadAnswer(upload) {
    if (upload.state === "failed") throw error(422, upload.problem);
    return {
      received: upload.size,
      complete: true,
      state: upload.kind === "video" ? "processing" : "review",
    };
  }
  // A photo becomes a JPEG of at most 2000 px with its rotation applied and
  // its metadata (such as location) dropped. 64 MP covers the 48 and 50 MP
  // phone cameras at full resolution. Reading the file happens inside the
  // shared sharp gate, so waiting photos do not hold their bytes in memory.
  const heifBrands = /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/;
  function convertPhoto(id) {
    return photoGate(async () => {
      const bytes = await media.get(id, "upload").catch(storageTrouble);
      if (
        bytes.toString("ascii", 4, 8) === "ftyp" &&
        heifBrands.test(bytes.toString("ascii", 8, 12))
      )
        throw error(422, "HEIC_NOT_SUPPORTED");
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      if (!jpeg && !png && !webp) throw error(422, "INVALID_PHOTO");
      try {
        return await sharp(bytes, {
          limitInputPixels: 64_000_000,
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
      } catch {
        throw error(422, "INVALID_PHOTO");
      }
    });
  }
  // The scheduled media job (POST /api/internal/media, every 5 minutes):
  // gives up uploads abandoned for a day, then converts waiting videos, oldest
  // first, one at a time. It starts no new video after `budgetMs`, so a run
  // ends within the request timeout. A claimed video carries a lease, so two
  // instances never convert the same one; a run that dies leaves the lease to
  // expire and the next run tries again. After 3 runs, whether they failed or
  // died, the video is given up.
  async function processMedia({ budgetMs = 60000 } = {}) {
    const started = Date.now(),
      result = { converted: 0, refused: 0, retrying: 0, abandoned: 0 },
      // A video that failed for a server reason waits for the next run.
      tried = new Set();
    const expired = (await ledger.read()).uploads || {};
    if (Object.values(expired).some((u) => u.createdAt <= now() - 86400000)) {
      const gone = await ledger.transaction(expireUploads);
      await discardUploads(gone);
      result.abandoned = gone.length;
    }
    // This instance's one conversion (video.mjs), taken before anything is
    // claimed or downloaded. A run can take 8 minutes and the job fires
    // every 5, so the next run may find this one still converting: it then
    // ends at once, instead of pulling up to 300 MB into memory first.
    const slot = conversionSlot();
    if (!slot)
      log({
        severity: "INFO",
        message: "media job skipped: this instance is converting a video",
      });
    try {
      while (slot && Date.now() - started < budgetMs) {
        const waiting = Object.values((await ledger.read()).photos)
          .filter((r) => r.state === "processing" && !(r.lease > now()) && !tried.has(r.id))
          .sort((a, b) => (a.receivedAt || 0) - (b.receivedAt || 0))[0];
        if (!waiting) break;
        tried.add(waiting.id);
        const job = await ledger.transaction((s) => {
          const r = s.photos[waiting.id];
          if (r?.state !== "processing" || r.lease > now()) return null;
          // Claimed 3 times and still waiting: those runs died without an
          // answer, so the conversion most likely took the instance down (out
          // of memory, say), with every request on it. It is not tried again.
          if ((r.attempts || 0) >= 3) {
            delete r.lease;
            r.state = "failed";
            r.problem = "PROCESSING_FAILED";
            return { id: r.id, attempts: r.attempts, givenUp: true };
          }
          r.lease = now() + 600000;
          r.attempts = (r.attempts || 0) + 1;
          return { id: r.id, attempts: r.attempts };
        });
        if (!job) continue;
        if (job.givenUp) {
          await media.remove(job.id, "upload").catch(() => {});
          result.refused++;
          log({
            severity: "ERROR",
            message: "video conversion given up: 3 runs ended without an answer",
            attempts: job.attempts,
          });
          continue;
        }
        let done, failure;
        try {
          done = await withVideoDirectory(async (directory) => {
            const input = join(directory, "input");
            await media.download(job.id, "upload", input);
            const out = await videoProcessor(input, directory, { slot });
            const stored = (e) => {
              if (e.code !== 412) throw e;
            };
            await media.put(job.id, { path: out.video }, "video").catch(stored);
            if (out.poster)
              await media.put(job.id, { path: out.poster }, "poster").catch(stored);
            return { poster: !!out.poster, duration: Math.round(out.duration) };
          });
        } catch (e) {
          failure = e;
        }
        // The guest's file can never work (422), or its original is gone, or it
        // failed 3 times; anything else is tried again by a later run.
        const refused =
          failure &&
          (failure.status === 422 || failure.code === 404 || job.attempts >= 3);
        await ledger.transaction((s) => {
          const r = s.photos[job.id];
          if (r?.state !== "processing") return;
          delete r.lease;
          if (done) {
            r.state = "pending";
            r.poster = done.poster;
            r.duration = done.duration;
            s.notifications ??= {};
            s.notifications[job.id] = { id: job.id, kind: "video", at: now(), read: false };
          } else if (refused) {
            r.state = "failed";
            r.problem = failure.status === 422 ? failure.code : "PROCESSING_FAILED";
          }
        });
        if (done || refused) await media.remove(job.id, "upload").catch(() => {});
        if (done) {
          await sendNotification(job.id);
          result.converted++;
        } else if (refused) result.refused++;
        else {
          result.retrying++;
          log({
            severity: "WARNING",
            message: "video conversion will be retried",
            code: failure.code ?? null,
            attempts: job.attempts,
          });
          // Without ffmpeg every video would fail the same way.
          if (failure.code === "VIDEO_UNAVAILABLE") break;
        }
      }
    } finally {
      slot?.release();
    }
    log({ severity: "INFO", message: "media", media: result });
    return result;
  }
  // For the HTTP layer, before an upload body is read (http.mjs): who is
  // uploading, if this cookie is a current email sign-in or admin session,
  // otherwise null. Invitation-link sessions are RSVP-only and never upload,
  // so they cannot hold upload slots (re-audit). The key is the person, not
  // the session or the cookie's spelling, so one person signed in on several
  // devices still uploads one file at a time. The route still checks rights.
  const canUpload = async (cookieHeader) => {
    const { session } = await context({ headers: { cookie: cookieHeader } });
    if (!session) return null;
    if (session.kind === "admin") return "admin:" + session.email;
    return session.accountId ? "account:" + session.accountId : null;
  };
  return { dispatch, syncOne, canUpload, processMedia };
}
