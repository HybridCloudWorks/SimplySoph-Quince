import test from 'node:test';
import assert from 'node:assert/strict';
// Event waits, not fixed 5-second timers: a start takes seconds on a busy machine.
import {startServer, runToExit} from './support/server-process.mjs';

test('production refuses missing email credentials before starting or accessing providers', async () => {
  const configured = {
    ...process.env, EVENT_BUCKET:'test-only-bucket', APP_KEY:Buffer.alloc(32,1).toString('base64'),
    NOTION_TOKEN:'test-only-notion-token', NOTION_SOURCE_ID:'test-source',
    ADMIN_GOOGLE_CLIENT_ID:'test-client', ADMIN_EMAILS:'organizer@example.test',
    SCOPED_NOTION_CONNECTION_CONFIRMED:'true', DATA_RETENTION_DATE:'2099-12-31',
    M365_TENANT_ID:'test-tenant', M365_CLIENT_ID:'test-mail-client', M365_CLIENT_SECRET:'test-only-secret',
  };
  for (const missing of ['M365_TENANT_ID','M365_CLIENT_ID','M365_CLIENT_SECRET']) {
    const {code,stdout,stderr}=await runToExit({...configured,[missing]:''});
    assert.equal(code,1,missing);
    assert.match(stderr,/Missing required production configuration/);
    assert.equal(stdout,'');
    assert.ok(!stderr.includes('test-only-secret'));
  }
});

test('Cloud Run port binding, health, pages, and 404 remain usable in preview',async(t)=>{
  const server=startServer({...process.env,PORT:'0',K_SERVICE:'local-contract-check',HOST:'127.0.0.1'});
  t.after(()=>server.stop());
  const url=await server.listening;
  if(!url){const {code,stderr}=await server.closed; assert.fail(`Server exited (${code}) instead of becoming ready: ${stderr}`);}
  const health=await fetch(new URL('healthz',url));
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',mode:'preview'});
  const home=await fetch(url);
  assert.equal(home.status,200);
  assert.match(await home.text(),/Friday, January 15, 2027/);
  const missing=await fetch(new URL('does-not-exist',url));
  assert.equal(missing.status,404);
  assert.match(home.headers.get('strict-transport-security'),/includeSubDomains/);
  assert.match(home.headers.get('permissions-policy'),/camera=\(\)/);
  // A malformed %-escape is a 400, not a 503 (SEC-14).
  const malformed=await fetch(new URL('%E0%A4%A',url));
  assert.equal(malformed.status,400);
  const head=await fetch(url,{method:'HEAD'});
  assert.equal(await head.text(),'');
  const write=await fetch(new URL('healthz',url),{method:'POST'});
  assert.equal(write.status,405);
});
