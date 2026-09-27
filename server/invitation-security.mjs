// Server-only building blocks. No guest access is enabled until durable storage is wired.
import {
  randomBytes,
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

const audience = "misxv-2027";
const opaque = (value) =>
  typeof value === "string" &&
  /^[A-Za-z0-9_-]{43}$/.test(value) &&
  Buffer.from(value, "base64url").length === 32 &&
  Buffer.from(value, "base64url").toString("base64url") === value;
const id = (value) =>
  typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const hash = (value) => createHash("sha256").update(value).digest("hex");
export const newOpaqueToken = () => randomBytes(32).toString("base64url");
export function invitationTokenHash(token) {
  if (!opaque(token)) throw new Error("Invalid invitation token");
  return hash(token);
}
// record must come from trusted storage on EVERY request, so revocation is immediate.
export function isActiveInvitation(record, now = Date.now()) {
  return (
    !!record &&
    record.active === true &&
    record.revokedAt == null &&
    id(record.householdId) &&
    Number.isSafeInteger(record.generation) &&
    record.generation >= 1 &&
    Number.isFinite(record.expiresAt) &&
    record.expiresAt > now &&
    typeof record.tokenHash === "string" &&
    /^[a-f0-9]{64}$/.test(record.tokenHash)
  );
}
export function verifyInvitationToken(token, record, now = Date.now()) {
  return (
    opaque(token) &&
    isActiveInvitation(record, now) &&
    same(hash(token), record.tokenHash)
  );
}
export function sessionCodec(key) {
  if (!Buffer.isBuffer(key) || key.length < 32)
    throw new Error("Session key must contain at least 32 random bytes");
  const signingKey = Buffer.from(key);
  const sign = (body) =>
    createHmac("sha256", signingKey).update(body).digest("base64url");
  return Object.freeze({
    issue(record, now = Date.now()) {
      if (!isActiveInvitation(record, now))
        throw new Error("Inactive invitation");
      const claims = {
        aud: audience,
        householdId: record.householdId,
        generation: record.generation,
        tokenHash: record.tokenHash,
        issuedAt: now,
        expiresAt: Math.min(now + 3600000, record.expiresAt),
        csrf: newOpaqueToken(),
      };
      const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return {
        value: `${body}.${sign(body)}`,
        csrf: claims.csrf,
        expiresAt: claims.expiresAt,
      };
    },
    verify(value, now = Date.now()) {
      if (typeof value !== "string" || value.length > 2048) return null;
      const parts = value.split(".");
      if (
        parts.length !== 2 ||
        !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
        !same(sign(parts[0]), parts[1])
      )
        return null;
      try {
        const c = JSON.parse(Buffer.from(parts[0], "base64url").toString());
        if (
          c.aud !== audience ||
          !id(c.householdId) ||
          !Number.isSafeInteger(c.generation) ||
          c.generation < 1 ||
          !/^[a-f0-9]{64}$/.test(c.tokenHash) ||
          !opaque(c.csrf) ||
          !Number.isFinite(c.issuedAt) ||
          c.issuedAt > now ||
          !Number.isFinite(c.expiresAt) ||
          c.expiresAt <= now ||
          c.expiresAt <= c.issuedAt ||
          c.expiresAt - c.issuedAt > 3600000
        )
          return null;
        return c;
      } catch {
        return null;
      }
    },
  });
}
export function sessionMatchesInvitation(claims, record, now = Date.now()) {
  return (
    !!claims &&
    claims.expiresAt > now &&
    isActiveInvitation(record, now) &&
    claims.householdId === record.householdId &&
    claims.generation === record.generation &&
    same(claims.tokenHash, record.tokenHash)
  );
}
export function allowedOrigin(origin, expected) {
  try {
    const u = new URL(expected);
    return (
      u.protocol === "https:" && u.origin === expected && origin === expected
    );
  } catch {
    return false;
  }
}
export function validCsrf(origin, expectedOrigin, supplied, claims) {
  return (
    allowedOrigin(origin, expectedOrigin) &&
    opaque(supplied) &&
    !!claims &&
    same(supplied, claims.csrf)
  );
}
// Firebase Hosting forwards only __session cookies to Cloud Run. Never set Domain.
export function sessionCookie(value, maxAge = 3600) {
  if (
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) ||
    !Number.isInteger(maxAge) ||
    maxAge < 1 ||
    maxAge > 3600
  )
    throw new Error("Invalid session cookie");
  return `__session=${value}; Path=/api; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Strict`;
}
export const clearSessionCookie =
  "__session=; Path=/api; Max-Age=0; Secure; HttpOnly; SameSite=Strict";
