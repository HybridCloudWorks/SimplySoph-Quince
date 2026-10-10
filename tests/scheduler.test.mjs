import test from "node:test";
import assert from "node:assert/strict";
import { schedulerVerifier } from "../server/scheduler.mjs";
import { createHttpServer } from "../server/http.mjs";

const audience = "https://misxv-api.example.run.app";
const caller = "misxv-scheduler@project.iam.gserviceaccount.com";
const token = "eyJhbGciOiJSUzI1NiJ9.payload.signature";
// Stands in for google-auth-library: only the exact token and audience verify.
const client = (payload) => ({
  async verifyIdToken({ idToken, audience: aud }) {
    if (idToken !== token || aud !== audience) throw new Error("invalid");
    return { getPayload: () => payload };
  },
});

test("scheduler verifier is off unless both audience and caller are configured", () => {
  assert.equal(schedulerVerifier("", caller), null);
  assert.equal(schedulerVerifier(audience, ""), null);
});

test("scheduler verifier accepts only a verified token for the exact service account", async () => {
  const good = schedulerVerifier(audience, caller, client({ email: caller, email_verified: true }));
  assert.equal(await good("Bearer " + token), true);
  for (const header of [undefined, "", token, "Basic " + token, "Bearer short", "Bearer other.token.value-xyz"])
    assert.equal(await good(header), false, String(header));
  const otherCaller = schedulerVerifier(audience, caller, client({ email: "someone@example.com", email_verified: true }));
  assert.equal(await otherCaller("Bearer " + token), false);
  const unverified = schedulerVerifier(audience, caller, client({ email: caller, email_verified: false }));
  assert.equal(await unverified("Bearer " + token), false);
  const wrongAudience = schedulerVerifier("https://elsewhere.example", caller, client({ email: caller, email_verified: true }));
  assert.equal(await wrongAudience("Bearer " + token), false);
});

test("the drain route accepts a JSON POST without a browser Origin; other routes still require it", async (t) => {
  const origin = "https://example.com";
  const seen = [];
  const server = createHttpServer({
    origin,
    root: process.cwd(),
    app: { dispatch: async (req) => (seen.push(req.path), { ok: true }) },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path) =>
    fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer x" }, body: "{}" });
  assert.equal((await post("/api/internal/drain")).status, 200);
  assert.equal((await post("/api/admin/sync")).status, 403);
  assert.deepEqual(seen, ["/api/internal/drain"]);
});
