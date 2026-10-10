import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHmac } from "node:crypto";
import { Ledger, memoryAdapter } from "../server/store.mjs";
import { createApplication } from "../server/application.mjs";
import { hash, error, totp, microsoftVerifier, MSA_TENANT } from "../server/auth.mjs";

const origin = "https://misxv.simplysoph.com",
  at = Date.parse("2026-10-09T18:00:00Z"),
  household = "12345678-1234-1234-1234-123456789012",
  key = Buffer.alloc(32, 4),
  TENANT = "83d9aa10-e1de-455e-a9b8-1cc73e99685a",
  CLIENT = "11111111-2222-3333-4444-555555555555";

// ---- Microsoft ID token verification ---------------------------------------
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", kty: "RSA" };
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
function idToken(claims, header = { alg: "RS256", kid: "k1", typ: "JWT" }) {
  const body = b64(header) + "." + b64(claims);
  return body + "." + sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
}
const claims = (over = {}) => ({
  aud: CLIENT,
  iss: `https://login.microsoftonline.com/${MSA_TENANT}/v2.0`,
  tid: MSA_TENANT,
  sub: "subject-1",
  email: "Guest@Outlook.com",
  nonce: "n-1",
  exp: at / 1000 + 3600,
  nbf: at / 1000 - 10,
  ver: "2.0",
  ...over,
});
function verifier() {
  const fetched = [];
  const verify = microsoftVerifier({
    clientId: CLIENT,
    tenantId: TENANT,
    now: () => at,
    fetchImpl: async (url) => {
      fetched.push(url);
      return { ok: true, json: async () => ({ keys: [jwk] }) };
    },
  });
  return { verify, fetched };
}

test("a signed personal-account token verifies and normalizes the email", async () => {
  const { verify, fetched } = verifier();
  const id = await verify(idToken(claims()), "n-1");
  assert.deepEqual(id, {
    provider: "microsoft",
    subject: MSA_TENANT + ":subject-1",
    email: "guest@outlook.com",
    mfa: false,
  });
  assert.deepEqual(fetched, [`https://login.microsoftonline.com/${MSA_TENANT}/discovery/v2.0/keys`]);
});

test("amr mfa is the only proof of a second factor", async () => {
  const { verify } = verifier();
  const work = { tid: TENANT, iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, acct: 0, xms_edov: true };
  assert.equal((await verify(idToken(claims({ ...work, amr: ["pwd", "mfa"] })), "n-1")).mfa, true);
  assert.equal((await verify(idToken(claims({ ...work, amr: ["pwd"] })), "n-1")).mfa, false);
  assert.equal((await verify(idToken(claims({ ...work, amr: "mfa" })), "n-1")).mfa, false);
});

test("other tenants are refused before any key fetch", async () => {
  const { verify, fetched } = verifier();
  const other = "99999999-9999-9999-9999-999999999999";
  await assert.rejects(
    verify(idToken(claims({ tid: other, iss: `https://login.microsoftonline.com/${other}/v2.0` })), "n-1"),
    (e) => e.code === "SSO_TENANT_NOT_ALLOWED",
  );
  assert.equal(fetched.length, 0);
});

test("audience, issuer, nonce, expiry, signature and algorithm are enforced", async () => {
  const { verify } = verifier();
  const bad = (p) => assert.rejects(p, (e) => [401, 403].includes(e.status));
  await bad(verify(idToken(claims({ aud: "someone-else" })), "n-1"));
  await bad(verify(idToken(claims({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0` })), "n-1"));
  await bad(verify(idToken(claims()), "n-2"));
  await bad(verify(idToken(claims({ nonce: undefined })), "n-1"));
  await bad(verify(idToken(claims({ exp: at / 1000 - 600 })), "n-1"));
  await bad(verify(idToken(claims({ nbf: at / 1000 + 600 })), "n-1"));
  await bad(verify(idToken(claims(), { alg: "none", kid: "k1" }), "n-1"));
  const t = idToken(claims()).split(".");
  await bad(verify(t[0] + "." + b64(claims({ email: "owner@outlook.com" })) + "." + t[2], "n-1"));
  await bad(verify("not-a-token", "n-1"));
});

test("a token without a verified email is refused", async () => {
  const { verify } = verifier();
  await assert.rejects(verify(idToken(claims({ email: undefined })), "n-1"), (e) => e.code === "SSO_EMAIL_NOT_VERIFIED");
});

test("work accounts must be tenant members with a verified email domain", async () => {
  const { verify } = verifier();
  const work = { tid: TENANT, iss: `https://login.microsoftonline.com/${TENANT}/v2.0` };
  const refused = (extra) =>
    assert.rejects(verify(idToken(claims({ ...work, ...extra })), "n-1"), (e) => e.code === "SSO_EMAIL_NOT_VERIFIED");
  await refused({});
  await refused({ acct: 1, xms_edov: true });
  await refused({ acct: 0, xms_edov: false });
  assert.equal((await verify(idToken(claims({ ...work, acct: 0, xms_edov: "1" })), "n-1")).email, "guest@outlook.com");
});

test("a nonce with the same length in characters but not bytes is a 401", async () => {
  const { verify } = verifier();
  await assert.rejects(verify(idToken(claims({ nonce: "n-é" })), "n-1"), (e) => e.status === 401);
});

test("concurrent sign-ins share one key fetch", async () => {
  const { verify, fetched } = verifier();
  await Promise.all([1, 2, 3].map(() => verify(idToken(claims()), "n-1")));
  assert.equal(fetched.length, 1);
});

test("an unknown key id refetches keys at most once every five minutes", async () => {
  const { verify, fetched } = verifier();
  await verify(idToken(claims()), "n-1");
  await assert.rejects(verify(idToken(claims(), { alg: "RS256", kid: "rotated" }), "n-1"));
  assert.equal(fetched.length, 1);
});

// ---- Routes: admin and guest stay separate ----------------------------------
async function fixture() {
  const ledger = new Ledger(memoryAdapter());
  let clock = at;
  const row = {
    id: household,
    name: "Test family",
    capacity: { adultsTeens: 2, kids: 1 },
    email: "guest@outlook.com",
    phone: "",
    validCapacity: true,
    administratorEligible: false,
    archived: false,
  };
  // Fake providers: the "credential" is JSON naming the identity and echoing the nonce.
  const verifyMicrosoft = async (credential, nonce) => {
    const c = JSON.parse(credential);
    if (c.nonce !== nonce) throw error(401, "SIGN_IN_FAILED");
    return { provider: "microsoft", subject: c.sub, email: c.email, mfa: !!c.mfa };
  };
  const app = createApplication({
    ledger,
    notion: {
      read: async () => structuredClone(row),
      list: async () => [structuredClone(row)],
      project: async () => {},
      projectContact: async () => {},
      projectAccount: async () => {},
    },
    mailer: { configured: true, send: async () => {} },
    verifyGoogle: async () => ({ id: "g", email: "owner@outlook.com" }),
    verifyMicrosoft,
    verifyGoogleIdentity: async (credential, nonce) => {
      const c = JSON.parse(credential);
      if (c.nonce !== nonce) throw error(401, "SIGN_IN_FAILED");
      return { provider: "google", subject: "g-" + c.email, email: c.email, mfa: false };
    },
    microsoftClientId: CLIENT,
    media: { put: async () => {}, get: async () => Buffer.alloc(0) },
    key,
    origin,
    adminEmails: ["owner@outlook.com"],
    now: () => clock,
  });
  await ledger.transaction((s) => {
    s.invitations[household] = { id: household, name: row.name, active: true, generation: 1, invited: { ceremony: true, dinner: true, dance: true } };
    s.accounts = {
      a1: {
        id: "a1",
        householdId: household,
        name: "Guest",
        email: "guest@outlook.com",
        emailKey: createHmac("sha256", key).update("email:guest@outlook.com").digest("hex"),
        active: true,
        // Even an account holding the admin permission gets only a guest session here.
        permissions: ["admin"],
        version: 1,
      },
    };
  });
  const post = (path, body, cookie) =>
    app.dispatch({ path: "/api/" + path, method: "POST", body, headers: { origin, ...(cookie ? { cookie } : {}) }, ip: "x" });
  const session = (cookie) => app.dispatch({ path: "/api/session", method: "GET", headers: { origin, cookie }, ip: "x" });
  const start = (purpose) => post("auth/sso/start", { purpose });
  const ms = (t, email, extra = {}) => JSON.stringify({ nonce: t.nonce, email, sub: "s-" + email, ...extra });
  return { app, ledger, post, session, start, ms, advance: (ms) => (clock += ms), now: () => clock };
}
const cookieOf = (r) => r.setCookie.split(";")[0];

test("config advertises the Microsoft client id", async () => {
  const f = await fixture();
  assert.equal((await f.app.dispatch({ path: "/api/config", method: "GET", headers: {} })).microsoftClientId, CLIENT);
});

// Signs in with Microsoft and finishes with the authenticator code when asked.
async function adminWithCode(f, extra = {}) {
  const t = await f.start("admin");
  const r = await f.post("auth/microsoft", { ticket: t.ticket, credential: f.ms(t, "owner@outlook.com", { mfa: true, ...extra }) });
  if (r.signedIn) return r;
  f.secret ??= r.enrollmentSecret;
  f.advance(30000); // a fresh 30-second step, so the code is not a replay
  return f.post("auth/mfa", { challenge: r.challenge, code: totp(f.secret, Math.floor(f.now() / 30000)) });
}

test("Microsoft MFA skips the code only after a sign-in that passed the code linked that account", async () => {
  const f = await fixture();
  const t = await f.start("admin");
  const first = await f.post("auth/microsoft", { ticket: t.ticket, credential: f.ms(t, "owner@outlook.com", { mfa: true }) });
  assert.ok(first.challenge && !first.setCookie, "the first Microsoft sign-in still needs the authenticator");
  assert.equal((await f.ledger.read()).ssoBindings?.[hash("microsoft:owner@outlook.com")], undefined, "not linked before the code passes");
  f.secret = first.enrollmentSecret;
  f.advance(30000);
  await f.post("auth/mfa", { challenge: first.challenge, code: totp(f.secret, Math.floor(f.now() / 30000)) });
  const t2 = await f.start("admin");
  const second = await f.post("auth/microsoft", { ticket: t2.ticket, credential: f.ms(t2, "owner@outlook.com", { mfa: true }) });
  assert.equal(second.signedIn, true);
  const s = await f.session(cookieOf(second));
  assert.equal(s.kind, "admin");
  assert.ok((await f.ledger.read()).audit.some((a) => a.action === "admin-sign-in-microsoft-mfa"));
});

test("a new Microsoft account for an admin's email cannot skip the code (mailbox takeover)", async () => {
  const f = await fixture();
  await adminWithCode(f); // the real owner links their Microsoft account
  const t = await f.start("admin");
  const attacker = await f.post("auth/microsoft", { ticket: t.ticket, credential: f.ms(t, "owner@outlook.com", { mfa: true, sub: "attacker" }) });
  assert.ok(attacker.challenge && !attacker.setCookie);
  // Only passing the owner's authenticator relinks the email to another account.
  assert.notEqual((await f.ledger.read()).ssoBindings[hash("microsoft:owner@outlook.com")], hash("attacker"));
});

test("without Microsoft MFA the administrator always needs the code", async () => {
  const f = await fixture();
  await adminWithCode(f);
  const t = await f.start("admin");
  const r = await f.post("auth/microsoft", { ticket: t.ticket, credential: f.ms(t, "owner@outlook.com") });
  assert.ok(r.challenge && !r.setCookie && !r.enrollmentSecret);
});

test("a Microsoft account that is not an administrator is refused on the admin route", async () => {
  const f = await fixture();
  const t = await f.start("admin");
  await assert.rejects(
    f.post("auth/microsoft", { ticket: t.ticket, credential: f.ms(t, "stranger@outlook.com", { mfa: true }) }),
    (e) => e.code === "ADMIN_NOT_ALLOWED",
  );
});

test("guest sign-in never grants administration, even to an account with the admin permission", async () => {
  const f = await fixture();
  const t = await f.start("guest");
  const r = await f.post("auth/sso/guest", { provider: "microsoft", ticket: t.ticket, credential: f.ms(t, "guest@outlook.com", { mfa: true }) });
  const s = await f.session(cookieOf(r));
  assert.equal(s.kind, "guest");
  assert.equal(s.verified, true);
  assert.equal(s.owner, false);
});

test("Google guest sign-in needs its own one-time guest ticket", async () => {
  const f = await fixture();
  const t = await f.start("guest"),
    body = { provider: "google", ticket: t.ticket, credential: f.ms(t, "guest@outlook.com") };
  assert.equal((await f.session(cookieOf(await f.post("auth/sso/guest", body)))).kind, "guest");
  await assert.rejects(f.post("auth/sso/guest", body), (e) => e.code === "SIGN_IN_AGAIN");
  await assert.rejects(f.post("auth/sso/guest", { provider: "google", credential: "{}" }), (e) => e.code === "SIGN_IN_AGAIN");
  const a = await f.start("admin");
  await assert.rejects(f.post("auth/sso/guest", { provider: "google", ticket: a.ticket, credential: f.ms(a, "guest@outlook.com") }), (e) => e.code === "SIGN_IN_AGAIN");
});

test("admin Google sign-in needs an admin ticket", async () => {
  const f = await fixture();
  await assert.rejects(f.post("auth/google", { credential: "x" }), (e) => e.code === "SIGN_IN_AGAIN");
  const g = await f.start("guest");
  await assert.rejects(f.post("auth/google", { credential: "x", ticket: g.ticket }), (e) => e.code === "SIGN_IN_AGAIN");
});

test("tickets are bound to their purpose", async () => {
  const f = await fixture();
  const g = await f.start("guest"),
    a = await f.start("admin");
  await assert.rejects(f.post("auth/microsoft", { ticket: g.ticket, credential: f.ms(g, "owner@outlook.com", { mfa: true }) }), (e) => e.code === "SIGN_IN_AGAIN");
  await assert.rejects(f.post("auth/sso/guest", { provider: "microsoft", ticket: a.ticket, credential: f.ms(a, "guest@outlook.com") }), (e) => e.code === "SIGN_IN_AGAIN");
  await assert.rejects(f.post("auth/sso/start", { purpose: "owner" }), (e) => e.code === "INVALID_PURPOSE");
  await assert.rejects(f.post("auth/microsoft", { ticket: "forged", credential: "{}" }), (e) => e.code === "SIGN_IN_AGAIN");
});

test("a ticket works once and expires after ten minutes", async () => {
  const f = await fixture();
  const t = await f.start("guest"),
    body = { provider: "microsoft", ticket: t.ticket, credential: f.ms(t, "guest@outlook.com") };
  await f.post("auth/sso/guest", body);
  await assert.rejects(f.post("auth/sso/guest", body), (e) => e.code === "SIGN_IN_AGAIN");
  const late = await f.start("guest");
  f.advance(600001);
  await assert.rejects(f.post("auth/sso/guest", { provider: "microsoft", ticket: late.ticket, credential: f.ms(late, "guest@outlook.com") }), (e) => e.code === "SIGN_IN_AGAIN");
});

test("guest SSO needs a registered account and never creates one", async () => {
  const f = await fixture();
  const t = await f.start("guest");
  await assert.rejects(f.post("auth/sso/guest", { provider: "google", ticket: t.ticket, credential: f.ms(t, "nobody@gmail.com") }), (e) => e.code === "SSO_NO_ACCOUNT");
  assert.equal(Object.keys((await f.ledger.read()).accounts).length, 1);
  await assert.rejects(f.post("auth/sso/guest", { provider: "github", credential: "x" }), (e) => e.code === "INVALID_PROVIDER");
});

test("a different provider account claiming a guest's bound email is refused", async () => {
  const f = await fixture();
  const t1 = await f.start("guest");
  await f.post("auth/sso/guest", { provider: "microsoft", ticket: t1.ticket, credential: f.ms(t1, "guest@outlook.com") });
  const t2 = await f.start("guest");
  await assert.rejects(
    f.post("auth/sso/guest", { provider: "microsoft", ticket: t2.ticket, credential: f.ms(t2, "guest@outlook.com", { sub: "someone-new" }) }),
    (e) => e.code === "SSO_ACCOUNT_CHANGED",
  );
});
