import {
  randomBytes,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  createPublicKey,
  verify as verifySignature,
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
// Nonces are compared as bytes: equal character counts can still differ in byte
// length, which timingSafeEqual would turn into a 500 instead of a 401.
export const sameNonce = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
export function googleVerifier(clientId, allowEmails) {
  const client = new OAuth2Client();
  return async (credential, expectedNonce) => {
    if (!clientId) throw error(503, "ADMIN_NOT_CONFIGURED");
    let p;
    try {
      p = (
        await client.verifyIdToken({ idToken: credential, audience: clientId })
      ).getPayload();
    } catch {
      throw error(401, "SIGN_IN_FAILED");
    }
    // The page's one-time admin ticket: a token captured elsewhere cannot be replayed here.
    if (!sameNonce(p.nonce, expectedNonce)) throw error(401, "SIGN_IN_FAILED");
    if (
      !p.email_verified ||
      (allowEmails && !allowEmails.includes(p.email?.toLowerCase())) ||
      (!p.email?.endsWith("@gmail.com") && !p.hd)
    )
      throw error(403, "ADMIN_NOT_ALLOWED");
    return { id: p.sub, email: p.email.toLowerCase() };
  };
}
// Guest sign-in with Google: any verified Gmail or Workspace address. The caller
// matches it to the guest list in Notion; it never grants administration.
export function googleIdentityVerifier(clientId) {
  const client = new OAuth2Client();
  return async (credential, expectedNonce) => {
    if (!clientId) throw error(503, "SSO_NOT_CONFIGURED");
    let p;
    try {
      p = (
        await client.verifyIdToken({ idToken: credential, audience: clientId })
      ).getPayload();
    } catch {
      throw error(401, "SIGN_IN_FAILED");
    }
    if (!sameNonce(p.nonce, expectedNonce)) throw error(401, "SIGN_IN_FAILED");
    if (!p.email_verified || (!p.email?.endsWith("@gmail.com") && !p.hd))
      throw error(403, "SSO_EMAIL_NOT_VERIFIED");
    // Google ID tokens carry no reliable proof of two-step verification.
    return {
      provider: "google",
      subject: p.sub,
      email: p.email.toLowerCase(),
      mfa: false,
    };
  };
}
// Personal Microsoft accounts (Outlook, Hotmail, Live) sign in through this tenant.
export const MSA_TENANT = "9188040d-6c67-4c5b-b112-36a304b66dad";
// Verifies a v2.0 Microsoft ID token obtained by the browser (authorization code
// with PKCE, no client secret). Only personal accounts and the family's own work
// tenant are accepted; every other organization is refused even though the app
// registration lets Microsoft show its sign-in page.
export function microsoftVerifier({
  clientId,
  tenantId,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const tenants = new Set([MSA_TENANT, tenantId].filter(Boolean)),
    keys = new Map(),
    inflight = new Map();
  async function fetchKeys(tid) {
    let body;
    try {
      const r = await fetchImpl(
        `https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`,
        { signal: AbortSignal.timeout(10000) },
      );
      if (!r.ok) throw new Error();
      body = await r.json();
    } catch {
      throw error(503, "SSO_KEYS_UNAVAILABLE");
    }
    return {
      at: now(),
      byKid: new Map(
        (body.keys || []).filter((k) => k.kty === "RSA").map((k) => [k.kid, k]),
      ),
    };
  }
  async function key(tid, kid) {
    let entry = keys.get(tid);
    // Keys rotate: refetch on an unknown kid, at most once every 5 minutes.
    // Concurrent requests share one fetch; a failed fetch is not cached.
    if (!entry?.byKid.has(kid) && (!entry || now() - entry.at > 300000)) {
      let pending = inflight.get(tid);
      if (!pending) {
        pending = fetchKeys(tid).finally(() => inflight.delete(tid));
        inflight.set(tid, pending);
      }
      entry = await pending;
      keys.set(tid, entry);
    }
    return entry.byKid.get(kid);
  }
  const part = (s) => JSON.parse(Buffer.from(s, "base64url").toString());
  return async (credential, expectedNonce) => {
    if (!clientId) throw error(503, "SSO_NOT_CONFIGURED");
    const pieces = typeof credential === "string" ? credential.split(".") : [];
    let header, p;
    try {
      if (pieces.length !== 3) throw new Error();
      [header, p] = [part(pieces[0]), part(pieces[1])];
    } catch {
      throw error(401, "SIGN_IN_FAILED");
    }
    // Check the cheap claims first so other tenants never trigger a key fetch.
    if (
      header.alg !== "RS256" ||
      typeof header.kid !== "string" ||
      typeof p.tid !== "string" ||
      !tenants.has(p.tid)
    )
      throw error(403, "SSO_TENANT_NOT_ALLOWED");
    const jwk = await key(p.tid, header.kid);
    if (
      !jwk ||
      !verifySignature(
        "RSA-SHA256",
        Buffer.from(pieces[0] + "." + pieces[1]),
        createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(pieces[2], "base64url"),
      )
    )
      throw error(401, "SIGN_IN_FAILED");
    const t = now() / 1000,
      skew = 300;
    if (
      p.aud !== clientId ||
      p.iss !== `https://login.microsoftonline.com/${p.tid}/v2.0` ||
      !(p.exp > t - skew) ||
      (p.nbf && p.nbf > t + skew) ||
      !sameNonce(p.nonce, expectedNonce) ||
      typeof p.sub !== "string"
    )
      throw error(401, "SIGN_IN_FAILED");
    // Microsoft includes email for multitenant apps only when the domain owner
    // verified it (personal accounts, or a verified domain in the tenant). For
    // the work tenant also require a member (acct 0, not a B2B guest) whose
    // email domain is verified (xms_edov). Both are optional claims, so a
    // missing claim refuses the sign-in rather than trusting the address.
    if (
      p.tid !== MSA_TENANT &&
      !(p.acct === 0 && [true, 1, "1", "true"].includes(p.xms_edov))
    )
      throw error(403, "SSO_EMAIL_NOT_VERIFIED");
    const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
      throw error(403, "SSO_EMAIL_NOT_VERIFIED");
    return {
      provider: "microsoft",
      subject: p.tid + ":" + p.sub,
      email,
      // "mfa" in amr is Microsoft's proof of a second factor (optional claim).
      mfa: Array.isArray(p.amr) && p.amr.includes("mfa"),
    };
  };
}
// Rate-limit counters live in process memory, keyed per ledger instance, not in
// the ledger: one counter write per request multiplied contention on the single
// ledger object. Limits therefore apply per Cloud Run instance (max 2).
const counters = new WeakMap(),
  maxCounters = 20000;
export async function rateLimit(ledger, key, max, windowMs, now) {
  let map = counters.get(ledger);
  if (!map) counters.set(ledger, (map = { rows: new Map(), prunedAt: 0 }));
  // Prune expired rows at most once a minute, and bound memory by evicting the
  // oldest counters (Map keeps insertion order) when unique keys flood in.
  if (now - map.prunedAt > 60000) {
    map.prunedAt = now;
    for (const [k, v] of map.rows) if (v.until <= now) map.rows.delete(k);
  }
  while (map.rows.size >= maxCounters)
    map.rows.delete(map.rows.keys().next().value);
  map = map.rows;
  let row = map.get(key);
  if (!row || row.until <= now)
    map.set(key, (row = { count: 0, until: now + windowMs }));
  if (row.count >= max) throw error(429, "TOO_MANY_REQUESTS");
  row.count++;
}
// Like rateLimit, but reports exhaustion instead of throwing, for budgets whose
// exhaustion must stay invisible to the caller (e.g. outgoing sign-in mail).
export async function withinLimit(ledger, key, max, windowMs, now) {
  try {
    await rateLimit(ledger, key, max, windowMs, now);
    return true;
  } catch (e) {
    if (e.status === 429) return false;
    throw e;
  }
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
