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
  newMfaSecret,
  verifyTotp,
} from "./auth.mjs";
import { validateHouseholdRsvp } from "./rsvp-validation.mjs";
import { renderEmail } from "../emails/templates.mjs";
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
  key,
  origin,
  clientId = "",
  deadline = "2026-10-31T23:59:00-05:00",
  adminEmails = [],
  now = Date.now,
}) {
  if (!Buffer.isBuffer(key) || key.length !== 32)
    throw new Error("32-byte application key required");
  const sessionValid = (s, row) =>
    row &&
    row.expiresAt > now() &&
    (row.kind === "admin"
      ? adminEmails.includes(row.email)
      : s.invitations[row.householdId]?.active &&
        s.invitations[row.householdId].generation === row.generation);
  async function context(req) {
    const raw = (req.headers.cookie || "")
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
  async function guestInvitation(session) {
    const row = await notion.read(session.householdId),
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
  async function syncOne(householdId) {
    const owner = token();
    const task = await ledger.transaction((s) => {
      const row = s.invitations[householdId];
      if (!row?.latestSubmissionId || row.syncLease?.until > now()) return null;
      row.syncLease = { owner, until: now() + 90000 };
      return structuredClone(s.responses[row.latestSubmissionId]);
    });
    if (!task) return;
    let failure = null;
    try {
      await notion.project(householdId, task);
    } catch (e) {
      failure = e.code || "NOTION_UNAVAILABLE";
    }
    await ledger.transaction((s) => {
      const row = s.invitations[householdId];
      if (row.syncLease?.owner === owner) delete row.syncLease;
      // Always leave a newer response pending after an old projection finishes.
      if (failure || row.latestSubmissionId !== task.id) {
        row.syncState = "pending";
        row.syncError = failure;
      } else {
        row.syncState = "synced";
        row.syncError = null;
      }
    });
  }
  async function dispatchMail(id) {
    if (!mailer.configured) throw error(503, "MAIL_NOT_CONFIGURED");
    const pending = (await ledger.read()).outbox[id];
    if (!pending) throw error(404, "NOT_FOUND");
    const currentGuest = await notion.read(pending.householdId);
    if (currentGuest.archived) throw error(409, "INVITATION_INACTIVE");
    const job = await ledger.transaction((s) => {
      const j = s.outbox[id];
      if (!j) throw error(404, "NOT_FOUND");
      if (j.state !== "draft") throw error(409, "MAIL_ALREADY_ATTEMPTED");
      const invite = s.invitations[j.householdId];
      if (!invite?.active || invite.generation !== j.generation)
        throw error(409, "MAIL_DRAFT_STALE");
      const expectedRecipient = j.responseId
        ? s.responses[invite.latestSubmissionId]?.contact.email
        : currentGuest.email;
      if (
        expectedRecipient !== j.to ||
        (j.responseId && j.responseId !== invite.latestSubmissionId)
      )
        throw error(409, "MAIL_DRAFT_STALE");
      j.state = "sending";
      j.attemptAt = now();
      return structuredClone(j);
    });
    let state = "accepted",
      code = null;
    try {
      await mailer.send({ ...job, id, html: unseal(job.content, key) });
    } catch (e) {
      code = e.code;
      state = code === "MAIL_DELIVERY_UNKNOWN" ? "unknown" : "failed";
    }
    await ledger.transaction((s) => {
      s.outbox[id].state = state;
      s.outbox[id].error = code;
      s.outbox[id].finishedAt = now();
    });
    return { id, state };
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
        url: url || origin + "/rsvp/",
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
  async function dispatch(req) {
    const { path, method = "GET", body = {}, headers = {} } = req;
    if (method !== "GET" && headers.origin !== origin)
      throw error(403, "ORIGIN_REJECTED");
    if (method !== "GET")
      await rateLimit(ledger, "global-writes", 6000, 3600000, now());
    if (path === "/api/config" && method === "GET")
      return {
        clientId,
        deadline,
        mailConfigured: mailer.configured,
        live: true,
      };
    if (path === "/api/public" && method === "GET") {
      const s = await ledger.read();
      return {
        announcements: Object.values(s.announcements).filter(
          (r) => r.published,
        ),
        messages: Object.values(s.messages)
          .filter((r) => r.kind === "guestbook" && r.state === "approved")
          .map((r) => ({ id: r.id, name: r.name, text: r.text })),
        photos: Object.values(s.photos)
          .filter((r) => r.state === "approved")
          .map((r) => ({
            id: r.id,
            caption: r.caption,
            url: "/api/photo/" + r.id,
          })),
      };
    }
    if (path === "/api/auth/google" && method === "POST") {
      await rateLimit(ledger, "google-login", 60, 900000, now());
      const identity = await verifyGoogle(safeText(body.credential, 10000)),
        challenge = token();
      const result = await ledger.transaction((s) => {
        for (const [id, c] of Object.entries(s.challenges))
          if (c.expiresAt <= now()) delete s.challenges[id];
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
      await rateLimit(ledger, "mfa-global", 300, 900000, now());
      const sessionToken = token(),
        csrf = token();
      const outcome = await ledger.transaction((s) => {
        const c = s.challenges[hash(safeText(body.challenge, 100))];
        if (!c || c.expiresAt <= now() || c.attempts >= 5)
          throw error(401, "SIGN_IN_AGAIN");
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
        s.sessions[hash(sessionToken)] = {
          kind: "admin",
          actor: c.id,
          email: c.email,
          csrf,
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
      await rateLimit(ledger, "invite-global", 600, 900000, now());
      if (!/^[A-Za-z0-9_-]{43}$/.test(body.token || ""))
        throw error(401, "INVALID_INVITATION");
      const fingerprint = hash(body.token),
        s = await ledger.read();
      const row = Object.values(s.invitations).find(
        (r) => r.tokenHash === fingerprint && r.active,
      );
      if (!row) throw error(401, "INVALID_INVITATION");
      await rateLimit(ledger, hash("invite:" + row.id), 20, 900000, now());
      const current = await notion.read(row.id);
      if (current.archived || !current.validCapacity)
        throw error(401, "INVALID_INVITATION");
      const value = token(),
        csrf = token();
      await ledger.transaction((s) => {
        const r = s.invitations[row.id];
        if (!r?.active || r.tokenHash !== fingerprint)
          throw error(401, "INVALID_INVITATION");
        s.sessions[hash(value)] = {
          kind: "guest",
          householdId: r.id,
          generation: r.generation,
          csrf,
          expiresAt: now() + 1800000,
        };
      });
      return { csrf, setCookie: cookie(value) };
    }
    const ctx = await context(req),
      { session } = ctx;
    if (session && method !== "GET")
      await rateLimit(
        ledger,
        hash("actor:" + (session.actor || session.householdId)),
        120,
        3600000,
        now(),
      );
    if (path === "/api/session" && method === "GET")
      return { kind: session?.kind ?? null, csrf: session?.csrf ?? null };
    const requireAuth = (kind) => {
      if (!session || (kind && session.kind !== kind))
        throw error(401, "SIGN_IN_REQUIRED");
      if (method !== "GET" && headers["x-csrf-token"] !== session.csrf)
        throw error(403, "CSRF_REJECTED");
    };
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
          ? s.responses[row.latestSubmissionId]
          : null,
        contact: { email: row.email, phone: row.phone, address: null },
        syncState: row.syncState,
      };
    }
    if (path === "/api/rsvp" && method === "POST") {
      requireAuth("guest");
      const id = headers["idempotency-key"];
      if (!uuid(id)) throw error(422, "IDEMPOTENCY_REQUIRED");
      const row = await guestInvitation(session),
        fingerprint = digestInput(body);
      const receipt = await ledger.transaction((s) => {
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
          return existing;
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
        const response = {
          ...data,
          id,
          householdId: row.id,
          fingerprint,
          submittedAt: new Date(now()).toISOString(),
        };
        s.responses[id] = response;
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
        return response;
      });
      await syncOne(row.id);
      return {
        id: receipt.id,
        submittedAt: receipt.submittedAt,
        saved: true,
        syncState: (await ledger.read()).invitations[row.id].syncState,
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
      await ledger.transaction((s) => {
        s.messages[id] = {
          id,
          householdId: session.householdId,
          name,
          text,
          kind: body.kind,
          state: "pending",
          at: now(),
        };
      });
      return { id, state: "pending" };
    }
    if (path === "/api/photos" && method === "POST") {
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
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const png = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const webp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      if (!jpeg && !png && !webp) throw error(422, "INVALID_PHOTO");
      const caption = safeText(body.caption || "", 200);
      let image;
      try {
        image = await sharp(bytes, {
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
      } catch {
        throw error(422, "INVALID_PHOTO");
      }
      const id = randomUUID();
      await media.put(id, image);
      await ledger.transaction((s) => {
        s.photos[id] = {
          id,
          householdId: session.householdId,
          caption,
          state: "pending",
          consentAt: now(),
        };
      });
      return { id, state: "pending" };
    }
    if (path.startsWith("/api/photo/") && method === "GET") {
      const id = path.slice(11);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw error(404, "NOT_FOUND");
      const row = ctx.state.photos[id];
      if (!row || (row.state !== "approved" && session?.kind !== "admin"))
        throw error(404, "NOT_FOUND");
      return { binary: await media.get(id), contentType: "image/jpeg" };
    }
    if (path.startsWith("/api/admin/")) {
      requireAuth("admin");
      for (const id of [body.id, req.query?.id])
        if (
          id !== undefined &&
          (typeof id !== "string" ||
            !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
              id,
            ))
        )
          throw error(422, "INVALID_ID");
      if (path === "/api/admin/guests" && method === "GET") {
        const rows = await notion.list(),
          s = await ledger.read();
        return {
          guests: rows.map((row) => ({
            ...row,
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
        const row = await notion.read(body.id);
        if (!row.validCapacity || row.archived)
          throw error(422, "CAPACITY_NEEDS_REVIEW");
        if (events.some((e) => typeof body.invited?.[e] !== "boolean"))
          throw error(422, "EVENTS_REQUIRED");
        const value = token();
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
          };
          const link =
            origin + (body.locale === "es" ? "/es" : "") + "/rsvp/#" + value;
          audit(s, session.actor, "invitation-issued", row.id, now());
          return { link, id: row.id };
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
        };
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
        const row = await notion.read(body.id),
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
        if (["invitation", "reminder"].includes(body.type)) {
          url = safeText(body.link, 1000);
          let u;
          try {
            u = new URL(url);
          } catch {
            throw error(422, "PRIVATE_LINK_REQUIRED");
          }
          if (
            u.origin !== origin ||
            !["/rsvp/", "/es/rsvp/"].includes(u.pathname) ||
            hash(u.hash.slice(1)) !== invite.tokenHash
          )
            throw error(422, "PRIVATE_LINK_REQUIRED");
        }
        return ledger.transaction((s) => {
          if (
            !s.invitations[row.id]?.active ||
            s.invitations[row.id].generation !== invite.generation
          )
            throw error(409, "INVITATION_INACTIVE");
          return {
            id: queue(s, {
              type: body.type,
              household: row,
              recipient: row.email,
              locale: invite.locale,
              url,
              updateText: safeText(body.updateText || "", 2000),
            }),
          };
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
