import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

test('Cloud Run port binding, health, pages, and 404 remain usable in preview',async(t)=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const child=spawn(process.execPath,['scripts/serve.mjs'],{
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
