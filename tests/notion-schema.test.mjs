import test from 'node:test';
import assert from 'node:assert/strict';
import {notionId,schemaClient} from '../server/notion-schema.mjs';
const db='11111111-1111-4111-8111-111111111111',source='22222222-2222-4222-8222-222222222222';
const database={object:'database',data_sources:[{id:source}]};
const metadata={object:'data_source',properties:{Name:{id:'title',type:'title'}},description:'Do not return this'};
const response=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers});
test('parse Notion IDs without confusing view IDs; reject arbitrary external URLs',()=>{
  assert.equal(notionId(`https://www.notion.so/Guests-${db.replaceAll('-','')}?v=other`),db);
  assert.equal(notionId(`https://app.notion.com/p/Guests-${db.replaceAll('-','')}?source=copy_link`),db);
  assert.throws(()=>notionId('https://evil.test/'+db));assert.throws(()=>notionId('../../pages'));
});
test('inspector retrieves metadata only, strips extra data, and refuses redirects',async()=>{
  const calls=[];
  const client=schemaClient({token:'fixture-token',fetchImpl:async(url,opts)=>{
    calls.push(url);assert.equal(opts.method,'GET');assert.equal(opts.redirect,'error');assert.equal(opts.headers['Notion-Version'],'2025-09-03');
    return response(calls.length===1?database:metadata);
  }});
  const result=await client.inspectDatabase(db);
  assert.deepEqual(calls,[`https://api.notion.com/v1/databases/${db}`,`https://api.notion.com/v1/data_sources/${source}`]);
  assert.equal(result.dataSources[0].properties[0].type,'title');assert.ok(!JSON.stringify(result).includes('Do not return'));
});
test('429 retries respect provider delay; blocked or long waits return sanitized errors',async()=>{
  const waits=[];let count=0;
  const client=schemaClient({token:'fixture-token',sleep:async ms=>waits.push(ms),random:()=>0,fetchImpl:async()=>{
    count++;return count===1?response({},429,{'retry-after':'3'}):response(count===2?database:metadata);
  }});
  await client.inspectDatabase(db);assert.deepEqual(waits,[3000]);
  for(const [body,headers] of [[{message:'private-token',additional_data:{rate_limit_reason:'public_api_request_blocked'}},{}],[{message:'private-token'},{'retry-after':'90'}]]){
    const blocked=schemaClient({token:'fixture-token',fetchImpl:async()=>response(body,429,headers),sleep:async()=>assert.fail('must not sleep')});
    await assert.rejects(blocked.inspectDatabase(db),e=>e.status===429&&!e.message.includes('private-token'));
  }
});
test('upstream transport exceptions do not leak credentials',async()=>{
  const client=schemaClient({token:'fixture-token',fetchImpl:async()=>{throw new Error('fixture-token');}});
  await assert.rejects(client.inspectDatabase(db),e=>e.status===503&&!e.message.includes('fixture-token'));
});
