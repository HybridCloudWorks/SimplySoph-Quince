import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHttpServer } from "../server/http.mjs";

async function serve(dispatch) {
  const entries = [];
  const server = createHttpServer({
    app: { dispatch },
    root: process.cwd(),
    origin: "https://example.test",
    log: (e) => entries.push(e),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  return { entries, base, close: () => server.close() };
}
const settle = () => new Promise((r) => setImmediate(r));

test("API requests log method, path and status without query strings or bodies", async (t) => {
  const s = await serve(async () => ({ ok: true }));
  t.after(s.close);
  await fetch(s.base + "/api/config?token=secret-value");
  await settle();
  assert.equal(s.entries.length, 1);
  const [e] = s.entries;
  assert.equal(e.severity, "INFO");
  assert.equal(e.httpRequest.requestUrl, "/api/config");
  assert.equal(e.httpRequest.status, 200);
  assert.ok(!JSON.stringify(e).includes("secret-value"));
});

test("unexpected failures log ERROR with a stack; known 5xx codes log WARNING", async (t) => {
  let fail = () => {
    throw new TypeError("boom");
  };
  const s = await serve(async () => fail());
  t.after(s.close);
  assert.equal((await fetch(s.base + "/api/config")).status, 503);
  fail = () => {
    throw Object.assign(new Error(), { status: 503, code: "BUSY" });
  };
  await fetch(s.base + "/api/config");
  fail = () => {
    throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
  };
  const leaked = await fetch(s.base + "/api/config");
  assert.deepEqual(await leaked.json(), { error: "SERVICE_UNAVAILABLE" });
  await settle();
  assert.equal(s.entries[0].severity, "ERROR");
  assert.equal(s.entries[2].severity, "ERROR", "system error codes are unexpected");
  assert.match(s.entries[2].stack_trace, /socket hang up/);
  assert.match(s.entries[0].stack_trace, /TypeError: boom/);
  assert.equal(s.entries[1].severity, "WARNING");
  assert.equal(s.entries[1].code, "BUSY");
  assert.equal(s.entries[1].stack_trace, undefined);
});

test("static pages are not logged by the API logger", async (t) => {
  const s = await serve(async () => ({}));
  t.after(s.close);
  await fetch(s.base + "/does-not-exist");
  await settle();
  assert.equal(s.entries.length, 0);
});
