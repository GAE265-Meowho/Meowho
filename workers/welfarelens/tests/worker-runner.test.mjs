import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VideoStore} from '../src/server/video/store.ts';
const runner=await import('../src/server/video/runner.ts').catch(()=>({}));
async function setup(){const root=await mkdtemp(join(tmpdir(),'wl-runner-'));const store=new VideoStore(root);const job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob(['test input']).stream());return {root,store,id:job.video_id};}
test('two processes cannot execute the same queued job concurrently; terminal execution is a no-op',async()=>{
 assert.equal(typeof runner.runClaimedVideoScan,'function');const {root,store,id}=await setup();let release,first;
 try{let calls=0;const gate=new Promise(r=>release=r);let entered;const started=new Promise(r=>entered=r);
 const work=async(s,j)=>{calls++;await s.update(j,{status:'processing',worker_pid:process.pid});entered();await gate;await s.finish(j,{status:'completed',analysis_status:'complete'});};
 first=runner.runClaimedVideoScan(store,id,{env:{},work});await started;
 assert.equal((await runner.runClaimedVideoScan(new VideoStore(root),id,{env:{},work})).outcome,'busy');release();
 assert.equal((await first).outcome,'completed');assert.equal(calls,1);
 assert.equal((await runner.runClaimedVideoScan(store,id,{env:{},work})).outcome,'skipped');assert.equal(calls,1);
 await assert.rejects(access(join(root,id,'worker.claim')));
 }finally{release?.();await first?.catch(()=>{});await rm(root,{recursive:true,force:true});}
});
test('a worker killed after entering processing is marked interrupted without replay',async()=>{
 const {root,store,id}=await setup();try{await store.update(id,{status:'processing',worker_pid:2147483647});await writeFile(join(root,id,'worker.claim'),JSON.stringify({pid:2147483647}));
 assert.equal((await runner.runClaimedVideoScan(store,id,{env:{},work:async()=>{throw Error('Must not replay');}})).outcome,'interrupted');assert.equal((await store.read(id)).status,'failed');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('dead worker claim fails safely without replay; a fresh job remains possible',async()=>{
 const {root,store,id}=await setup();try{await writeFile(join(root,id,'worker.claim'),JSON.stringify({pid:2147483647}));let calls=0;
 assert.equal((await runner.runClaimedVideoScan(store,id,{env:{},work:async()=>{calls++;}})).outcome,'interrupted');assert.equal(calls,0);
 const result=await store.get(id,'owner');assert.equal(result.status,'failed');assert.equal(result.original_deleted,true);
 const fresh=await store.create('owner');assert.notEqual(fresh.video_id,id);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cancellation stops in-flight work and releases claim without overwriting cancelled state',async()=>{
 const {root,store,id}=await setup();try{let entered;const started=new Promise(r=>entered=r);
 const pending=runner.runClaimedVideoScan(store,id,{env:{},pollMs:10,work:async(_s,_id,{signal})=>{entered();await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
 await started;await store.cancel(id,'owner');assert.equal((await pending).outcome,'cancelled');assert.equal((await store.read(id)).status,'cancelled');
 await assert.rejects(access(join(root,id,'worker.claim')));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('timeout and thrown failures are terminal, bounded, and remove only the job input copy',async()=>{
 for(const timeout of [false,true]){const {root,store,id}=await setup();try{const result=await runner.runClaimedVideoScan(store,id,{env:{},timeoutMs:20,work:async(_s,_id,{signal})=>{if(!timeout)throw Error('secret-provider-body');await new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});assert.equal(result.outcome,'failed');const j=await store.read(id);assert.equal(j.status,'failed');assert.ok(j.original_deleted);assert.doesNotMatch(j.error,/secret/);await assert.rejects(access(join(root,id,'worker.claim')));}finally{await rm(root,{recursive:true,force:true});}}
});
