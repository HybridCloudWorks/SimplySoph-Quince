import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

test('production refuses missing email credentials before starting or accessing providers', async () => {
  const configured = {
    ...process.env, EVENT_BUCKET:'test-only-bucket', APP_KEY:Buffer.alloc(32,1).toString('base64'),
    NOTION_TOKEN:'test-only-notion-token', NOTION_SOURCE_ID:'test-source',
    ADMIN_GOOGLE_CLIENT_ID:'test-client', ADMIN_EMAILS:'organizer@example.test',
    SCOPED_NOTION_CONNECTION_CONFIRMED:'true', DATA_RETENTION_DATE:'2027-04-15',
    M365_TENANT_ID:'test-tenant', M365_CLIENT_ID:'test-mail-client', M365_CLIENT_SECRET:'test-only-secret',
  };
  for (const missing of ['M365_TENANT_ID','M365_CLIENT_ID','M365_CLIENT_SECRET']) {
    const child=spawn(process.execPath,['server/start.mjs'],{env:{...configured,[missing]:''},stdio:['ignore','pipe','pipe']});
    let stdout='', stderr='';
    child.stdout.on('data',data=>{stdout+=data;});
    child.stderr.on('data',data=>{stderr+=data;});
    const code=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{child.kill(); reject(new Error('Unconfigured server did not exit'));},5000);
      child.once('error',error=>{clearTimeout(timer);reject(error);});
      child.once('exit',code=>{clearTimeout(timer);resolve(code);});
    });
    assert.equal(code,1,missing);
    assert.match(stderr,/Missing required production configuration/);
    assert.equal(stdout,'');
    assert.ok(!stderr.includes('test-only-secret'));
  }
});

test('Cloud Run port binding, health, pages, and 404 remain usable in preview',async(t)=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const child=spawn(process.execPath,['server/start.mjs'],{
    cwd:root,env:{...process.env,PORT:'0',K_SERVICE:'local-contract-check',HOST:'127.0.0.1'},stdio:['ignore','pipe','pipe']
  });
  t.after(()=>child.kill());
  const url=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server did not become ready')),5000);
    let output='';
    child.stdout.on('data',data=>{
      output+=data;
      const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if(match){clearTimeout(timer);resolve(match[0]);}
    });
    child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited: ${code}`));});
  });
  const health=await fetch(new URL('healthz',url));
  assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',mode:'preview'});
  const home=await fetch(url);
  assert.equal(home.status,200);
  assert.match(await home.text(),/Friday, January 15, 2027/);
  const missing=await fetch(new URL('does-not-exist',url));
  assert.equal(missing.status,404);
  const head=await fetch(url,{method:'HEAD'});
  assert.equal(await head.text(),'');
  const write=await fetch(new URL('healthz',url),{method:'POST'});
  assert.equal(write.status,405);
});
