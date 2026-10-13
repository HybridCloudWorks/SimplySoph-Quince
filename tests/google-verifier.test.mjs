import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { googleVerifier, googleIdentityVerifier } from "../server/auth.mjs";

// The real Google ID-token checks (#74). auth.mjs builds its own OAuth2Client,
// and the library downloads Google's certificates through gaxios and
// node-fetch, so there is no fetch to inject. The narrowest seam is the
// library's public certificate getter: only the download is replaced, by a key
// made here, and verifyIdToken's own signature, issuer, audience and time
// checks run unchanged, followed by the checks in auth.mjs.
const CLIENT = "000000000000-fixture.apps.googleusercontent.com";
const KID = "fixture-key";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const certs = { [KID]: publicKey.export({ type: "spki", format: "pem" }) };
let certFetches = 0,
  certsUnavailable = false;
const realGetCerts = OAuth2Client.prototype.getFederatedSignonCertsAsync;
before(() => {
  OAuth2Client.prototype.getFederatedSignonCertsAsync = async function () {
    certFetches++;
    if (certsUnavailable) throw new Error("Failed to retrieve verification certificates");
    return { certs, format: "PEM" };
  };
});
after(() => {
  OAuth2Client.prototype.getFederatedSignonCertsAsync = realGetCerts;
});

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const seconds = () => Math.floor(Date.now() / 1000);
function idToken(over = {}, header = { alg: "RS256", kid: KID, typ: "JWT" }) {
  const now = seconds();
  const claims = {
    iss: "https://accounts.google.com",
    aud: CLIENT,
    sub: "100000000000000000001",
    email: "aunt.fixture@gmail.com",
    email_verified: true,
    nonce: "nonce-1",
    iat: now,
    exp: now + 3600,
    ...over,
  };
  const body = b64(header) + "." + b64(claims);
  return body + "." + sign("RSA-SHA256", Buffer.from(body), privateKey).toString("base64url");
}
const refused = (status, code) => (e) => e.status === status && e.code === code;

test("Google admin sign-in accepts a genuinely signed token for this client and lowercases the address (#74)", async () => {
  const verify = googleVerifier(CLIENT, null);
  assert.deepEqual(await verify(idToken({ email: "Aunt.Fixture@gmail.com" }), "nonce-1"), {
    id: "100000000000000000001",
    email: "aunt.fixture@gmail.com",
  });
  // Google uses both spellings of its issuer.
  assert.equal((await verify(idToken({ iss: "accounts.google.com" }), "nonce-1")).id, "100000000000000000001");
  // A Google Workspace account (hd) on the family's own domain.
  assert.equal(
    (await verify(idToken({ email: "organizer@family.example", hd: "family.example" }), "nonce-1")).email,
    "organizer@family.example",
  );
  // A Google account registered with another provider's address is not vouched for.
  await assert.rejects(verify(idToken({ email: "aunt@example.com" }), "nonce-1"), refused(403, "ADMIN_NOT_ALLOWED"));
  // An allow-list, when given, is exact.
  const listed = googleVerifier(CLIENT, ["aunt.fixture@gmail.com"]);
  assert.equal((await listed(idToken(), "nonce-1")).email, "aunt.fixture@gmail.com");
  await assert.rejects(
    listed(idToken({ email: "cousin.fixture@gmail.com" }), "nonce-1"),
    refused(403, "ADMIN_NOT_ALLOWED"),
  );
});

test("Google admin and guest sign-in refuse tokens for another client or issuer, outside their time window, or not signed by Google (#74)", async () => {
  const now = seconds();
  const genuine = idToken(),
    altered = idToken({ email: "intruder.fixture@gmail.com" });
  const unsignedHeader = { alg: "none", kid: KID, typ: "JWT" };
  const cases = {
    "another client's token": idToken({ aud: "999999999999-other.apps.googleusercontent.com" }),
    "another issuer": idToken({ iss: "https://accounts.example.com" }),
    expired: idToken({ iat: now - 7200, exp: now - 3600 }),
    "not yet valid": idToken({ iat: now + 3600, exp: now + 7200 }),
    "lifetime over a day": idToken({ exp: now + 2 * 86400 }),
    "claims altered after signing": [genuine.split(".")[0], altered.split(".")[1], genuine.split(".")[2]].join("."),
    "unknown signing key": idToken({}, { alg: "RS256", kid: "rotated-away", typ: "JWT" }),
    unsigned: b64(unsignedHeader) + "." + genuine.split(".")[1] + ".",
    malformed: "not-a-token",
  };
  for (const [name, verify] of [
    ["admin", googleVerifier(CLIENT, null)],
    ["guest", googleIdentityVerifier(CLIENT)],
  ]) {
    // The same verifier accepts a good token, so each refusal below is for its stated reason.
    assert.equal((await verify(genuine, "nonce-1")).email, "aunt.fixture@gmail.com", name);
    for (const [reason, credential] of Object.entries(cases))
      await assert.rejects(verify(credential, "nonce-1"), refused(401, "SIGN_IN_FAILED"), `${name}: ${reason}`);
    // The one-time nonce ties the token to this page's sign-in ticket.
    await assert.rejects(verify(genuine, "nonce-2"), refused(401, "SIGN_IN_FAILED"), `${name}: replayed`);
    await assert.rejects(verify(genuine, undefined), refused(401, "SIGN_IN_FAILED"), `${name}: no ticket`);
    await assert.rejects(
      verify(idToken({ nonce: undefined }), "nonce-1"),
      refused(401, "SIGN_IN_FAILED"),
      `${name}: token without a nonce`,
    );
  }
});

test("Google sign-in refuses an address Google has not verified, even on a valid token (#74)", async () => {
  const admin = googleVerifier(CLIENT, null),
    guest = googleIdentityVerifier(CLIENT);
  // Only a real "verified" passes: a string "false" or any other value is refused (#95).
  for (const over of [{ email_verified: false }, { email_verified: undefined }, { email_verified: "false" }, { email_verified: 1 }, { email_verified: "yes" }]) {
    await assert.rejects(admin(idToken(over), "nonce-1"), refused(403, "ADMIN_NOT_ALLOWED"), JSON.stringify(over));
    await assert.rejects(guest(idToken(over), "nonce-1"), refused(403, "SSO_EMAIL_NOT_VERIFIED"), JSON.stringify(over));
  }
});

test("Google sign-in accepts a verified address whatever its letter case, and the string \"true\" some Google endpoints send (#95)", async () => {
  const admin = googleVerifier(CLIENT, null),
    guest = googleIdentityVerifier(CLIENT);
  // A Gmail address in capitals is still a Gmail address; it is stored lowercased.
  assert.equal((await admin(idToken({ email: "Aunt.Fixture@GMAIL.COM" }), "nonce-1")).email, "aunt.fixture@gmail.com");
  assert.equal((await guest(idToken({ email: "Aunt.Fixture@GMAIL.COM" }), "nonce-1")).email, "aunt.fixture@gmail.com");
  assert.equal((await admin(idToken({ email_verified: "true" }), "nonce-1")).email, "aunt.fixture@gmail.com");
  assert.equal((await guest(idToken({ email_verified: "true" }), "nonce-1")).email, "aunt.fixture@gmail.com");
});

test("without a client ID neither Google verifier contacts Google (#74)", async () => {
  const before = certFetches;
  await assert.rejects(googleVerifier("", null)(idToken(), "nonce-1"), refused(503, "ADMIN_NOT_CONFIGURED"));
  await assert.rejects(googleIdentityVerifier(undefined)(idToken(), "nonce-1"), refused(503, "SSO_NOT_CONFIGURED"));
  assert.equal(certFetches, before);
});

test("when Google's certificates cannot be fetched, sign-in fails closed (#74)", async (t) => {
  certsUnavailable = true;
  t.after(() => {
    certsUnavailable = false;
  });
  await assert.rejects(googleVerifier(CLIENT, null)(idToken(), "nonce-1"), refused(401, "SIGN_IN_FAILED"));
  await assert.rejects(googleIdentityVerifier(CLIENT)(idToken(), "nonce-1"), refused(401, "SIGN_IN_FAILED"));
});
