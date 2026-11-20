import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {assertM6Config, openM6ModelGuard} from '../src/server/video/m6-model-guard.ts';

function ledger(t) {
 const dir=mkdtempSync(join(tmpdir(),'wl-m6-test-'));
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return join(dir,'requests.jsonl');
}

test('M6 rejects the shared project, polling, explicit concurrency and missing HTML',()=>{
 const env={MEOWHO_DEDICATED_QUEUE_PROJECT_REF:'abcdefghijklmnopqrst',MEOWHO_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',MEOWHO_BLOB_CONTAINER:'media-dev',WELFARELENS_PRIVATE_HTML:'true',MEOWHO_M6_JOB_ID:'e49dc4be-68c9-4df8-8709-f77fc7645bac'};
 assert.doesNotThrow(()=>assertM6Config(env,true));
 assert.throws(()=>assertM6Config({...env,MEOWHO_SUPABASE_URL:'https://onebpkbkrnnwamwsoelo.supabase.co'},true));
 assert.throws(()=>assertM6Config(env,false));
 assert.throws(()=>assertM6Config({...env,WELFARELENS_IMAGE_EDIT_CONCURRENCY:'2'},true));
 assert.throws(()=>assertM6Config({...env,WELFARELENS_PRIVATE_HTML:'false'},true));
});

for(const [kind,cap] of [['vlm',14],['image',8]])test(`M6 ${kind} refuses request ${cap+1} before dispatch and cannot reopen its ledger`,async t=>{
 const path=ledger(t);let calls=0;
 const guard=openM6ModelGuard(path,async()=>{calls++;return new Response(null,{status:200});});
 try{
  for(let n=0;n<cap;n++)await guard.requests[kind]('https://test.invalid');
  await assert.rejects(guard.requests[kind]('https://test.invalid'),/request_limit/);
  assert.equal(calls,cap);
  assert.throws(guard.assertHealthy,/request_limit/);
 }finally{guard.close();}
 assert.throws(()=>openM6ModelGuard(path),/EEXIST/);
 const records=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(records.filter(record=>record.event==='start').length,cap);
 assert.equal(records.filter(record=>record.event==='response').length,cap);
 assert.equal(records.filter(record=>record.event==='start').at(-1).reserved_cents,kind==='vlm'?700:600);
});

for(const failure of [429,'TimeoutError','AbortError','network'])test(`M6 stops new dispatches after ${failure} and settles requests already in flight`,async t=>{
 const path=ledger(t);let calls=0,finish;
 const guard=openM6ModelGuard(path,async()=>{
  if(++calls===1)return new Promise(resolve=>{finish=resolve;});
  if(failure===429)return new Response(null,{status:429});
  throw new DOMException('private endpoint',failure);
 });
 try{
  const active=guard.requests.image('https://test.invalid');
  const failureRequest=guard.requests.vlm('https://test.invalid');
  if(failure===429)assert.equal((await failureRequest).status,429);
  else await assert.rejects(failureRequest);
  await assert.rejects(guard.requests.image('https://test.invalid'));
  finish(new Response(null,{status:200}));
  assert.equal((await active).status,200);
  assert.equal(calls,2);
  assert.throws(guard.assertHealthy);
 }finally{guard.close();}
 assert.doesNotMatch(readFileSync(path,'utf8'),/private endpoint|test\.invalid/);
});

test('M6 never spends a reservation after caller cancellation',async t=>{
 const path=ledger(t);let calls=0;
 const guard=openM6ModelGuard(path,async()=>{calls++;return new Response();});
 try{
  await assert.rejects(guard.requests.image('https://test.invalid',{signal:AbortSignal.abort()}));
  assert.equal(calls,0);
  assert.doesNotMatch(readFileSync(path,'utf8'),/"event":"start"/);
 }finally{guard.close();}
});

test('M6 shares the US$13 reservation across both model transports',async t=>{
 const path=ledger(t);
 const guard=openM6ModelGuard(path,async()=>new Response(null,{status:200}));
 try{
  await Promise.all(Array.from({length:14},()=>guard.requests.vlm('https://test.invalid')));
  await Promise.all(Array.from({length:8},()=>guard.requests.image('https://test.invalid')));
  guard.assertHealthy();
 }finally{guard.close();}
 const entries=readFileSync(path,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(entries.filter(entry=>entry.event==='start').at(-1).reserved_cents,1300);
});
