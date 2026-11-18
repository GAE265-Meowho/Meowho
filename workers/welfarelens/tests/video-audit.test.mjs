import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VideoStore} from '../src/server/video/store.ts';
const audit=await import('../src/server/video/audit.ts').catch(()=>({}));
test('obsolete global acceptance gate is removed, independent of old lock files',async()=>{
 assert.equal(audit.claimAcceptanceRun,undefined);
});

test('retries preserve separate private response records and rate-limit headers',async()=>{
 const {createRetryFetch}=await import('../src/server/video/retry.ts');
 const root=await mkdtemp(join(tmpdir(),'wl-audit-retry-'));try{
 const store=new VideoStore(root),j=await store.create('owner');let calls=0;
 const request=createRetryFetch(audit.createAuditFetch(store,j.video_id,{call:1,stage:'scene',frame_id:'f000',timestamp:0,object_index:null},async()=>new Response(JSON.stringify({attempt:++calls}),{status:calls===1?429:200,headers:{'retry-after':'3'}})),{sleep:async ms=>assert.ok(ms>=3000)});
 assert.equal((await request('https://example.invalid')).status,200);
 const first=JSON.parse(await readFile(join(root,j.video_id,'audit-01.json'),'utf8')),second=JSON.parse(await readFile(join(root,j.video_id,'audit-01-attempt-2.json'),'utf8'));
 assert.equal(first.status,429);assert.equal(first.attempt,1);assert.equal(second.status,200);assert.equal(second.attempt,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('private audit preserves raw failed output and nested usage without headers or request images; never retries',async()=>{
 assert.equal(typeof audit.createAuditFetch,'function');
 const root=await mkdtemp(join(tmpdir(),'wl-audit-'));try{
 const store=new VideoStore(root),j=await store.create('owner');let calls=0;
 const raw=JSON.stringify({model:'actual-model',choices:[{message:{content:'{invalid'}}],usage:{prompt_tokens:12,completion_tokens:4,completion_tokens_details:{reasoning_tokens:2}}});
 const request=audit.createAuditFetch(store,j.video_id,{call:1,stage:'scene',frame_id:'f000',timestamp:0,object_index:null},async()=>{calls++;return new Response(raw,{headers:{'x-request-id':'trace','api-key':'secret'}});});
 const r=await request('https://example.invalid',{method:'POST',headers:{'api-key':'secret'},body:'private-image'});
 assert.equal(await r.text(),raw);assert.equal(calls,1);
 const saved=JSON.parse(await readFile(join(root,j.video_id,'audit-01.json'),'utf8'));
 assert.equal(saved.raw_response,raw);assert.equal(saved.status,200);assert.equal(saved.request_id,'trace');assert.equal(saved.call,1);
 assert.ok(saved.elapsed_ms>=0);assert.doesNotMatch(JSON.stringify(saved),/secret|private-image/);
 await store.delete(j.video_id,'owner');await assert.rejects(request('https://example.invalid'));assert.equal(calls,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('audit records a network failure once and fails closed when expired',async()=>{
 assert.equal(typeof audit.createAuditFetch,'function');
 const root=await mkdtemp(join(tmpdir(),'wl-audit-'));try{
 const store=new VideoStore(root),j=await store.create('owner');let calls=0;
 const request=audit.createAuditFetch(store,j.video_id,{call:1,stage:'plant_recheck',frame_id:'f004',timestamp:4,object_index:2},async()=>{calls++;throw Error('sensitive provider text');});
 await assert.rejects(request('https://example.invalid'));
 const saved=JSON.parse(await readFile(join(root,j.video_id,'audit-01.json'),'utf8'));
 assert.equal(saved.error,'network_or_cancelled');assert.equal(saved.object_index,2);assert.equal(calls,1);assert.doesNotMatch(JSON.stringify(saved),/sensitive/);
 await store.update(j.video_id,{expires_at:Date.now()-1});await assert.rejects(audit.createAuditFetch(store,j.video_id,{call:2,stage:'scene',frame_id:'f000',timestamp:0,object_index:null},async()=>{calls++;return new Response('{}');})('https://example.invalid'));assert.equal(calls,1);
 assert.equal((await readdir(join(root,j.video_id))).some(n=>n==='audit-02.json'),false);
 }finally{await rm(root,{recursive:true,force:true});}
});
