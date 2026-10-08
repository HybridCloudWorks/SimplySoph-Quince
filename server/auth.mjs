import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { OAuth2Client } from "google-auth-library";
export const token = () => randomBytes(32).toString("base64url");
export const invitationCode = () => base32(randomBytes(10));
export function invitationCredential(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(raw)) return raw;
  const code = raw.replace(/[\s-]/g, "").toUpperCase();
  return /^[A-Z2-7]{16}$/.test(code) ? code : null;
}
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const error = (status, code) =>
  Object.assign(new Error(code), { status, code });
export function seal(value, key) {
  const iv = randomBytes(12),
    c = createCipheriv("aes-256-gcm", key, iv);
  return Buffer.concat([
    iv,
    c.update(value, "utf8"),
    c.final(),
    c.getAuthTag(),
  ]).toString("base64url");
}
export function unseal(value, key) {
  const bytes = Buffer.from(value, "base64url"),
    c = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  c.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([
    c.update(bytes.subarray(12, -16)),
    c.final(),
  ]).toString();
}
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(bytes) {
  let bits = 0,
    value = 0,
    out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decode32(s) {
  let bits = 0,
    value = 0,
    out = [];
  for (const c of s) {
    const n = alphabet.indexOf(c);
    if (n < 0) throw new Error("Invalid secret");
    value = (value << 5) | n;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
export function totp(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decode32(secret)).update(counter).digest();
  return ((digest.readUInt32BE(digest.at(-1) & 15) & 0x7fffffff) % 1e6)
    .toString()
    .padStart(6, "0");
}
export function verifyTotp(secret, code, now, lastStep = -1) {
  if (!/^\d{6}$/.test(code || "")) return null;
  const current = Math.floor(now / 30000);
  for (const step of [current, current - 1, current + 1])
    if (
      step > lastStep &&
      timingSafeEqual(Buffer.from(totp(secret, step)), Buffer.from(code))
    )
      return step;
  return null;
}
export const cookie = (value) =>
  `__session=${value}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=1800`;
export function googleVerifier(clientId, allowEmails) {
  const client = new OAuth2Client();
  return async (credential) => {
    if (!clientId) throw error(503, "ADMIN_NOT_CONFIGURED");
    let p;
    try {
      p = (
        await client.verifyIdToken({ idToken: credential, audience: clientId })
      ).getPayload();
    } catch {
      throw error(401, "SIGN_IN_FAILED");
    }
    if (
      !p.email_verified ||
      !allowEmails.includes(p.email?.toLowerCase()) ||
      (!p.email.endsWith("@gmail.com") && !p.hd)
    )
      throw error(403, "ADMIN_NOT_ALLOWED");
    return { id: p.sub, email: p.email.toLowerCase() };
  };
}
// Rate-limit counters live in process memory, keyed per ledger instance, not in
// the ledger: one counter write per request multiplied contention on the single
// ledger object. Limits therefore apply per Cloud Run instance (max 2).
const counters = new WeakMap();
export async function rateLimit(ledger, key, max, windowMs, now) {
  let map = counters.get(ledger);
  if (!map) counters.set(ledger, (map = new Map()));
  if (map.size > 5000)
    for (const [k, v] of map) if (v.until <= now) map.delete(k);
  let row = map.get(key);
  if (!row || row.until <= now)
    map.set(key, (row = { count: 0, until: now + windowMs }));
  if (row.count >= max) throw error(429, "TOO_MANY_REQUESTS");
  row.count++;
}
// Shared budgets count only rejected credentials, so anonymous junk can never
// lock out a caller presenting a valid one (it only turns further failures into 429).
export async function chargeFailures(ledger, key, max, windowMs, now, attempt) {
  try {
    return await attempt();
  } catch (e) {
    if (e.status === 401 || e.status === 403)
      await rateLimit(ledger, key, max, windowMs, now);
    throw e;
  }
}
// Expired sessions were previously pruned as a side effect of every rate-limit
// write; prune inside the transactions that create sessions instead.
export function pruneSessions(s, now) {
  for (const [id, session] of Object.entries(s.sessions))
    if (session.expiresAt <= now) delete s.sessions[id];
  delete s.limits;
}
export function newMfaSecret() {
  return base32(randomBytes(20));
}
