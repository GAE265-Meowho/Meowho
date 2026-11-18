import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {VideoStore} from '../src/server/video/store.ts';
test('same submission is idempotent, intentional new submissions retain all completed history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-recovery-'));try{const store=new VideoStore(root);
 const jobs=await Promise.all([store.create('owner','a'),store.create('owner','a')]);assert.equal(jobs[0].video_id,jobs[1].video_id);
 for(let i=0;i<12;i++){const j=i===0?jobs[0]:await store.create('owner',String(i));await store.finish(j.video_id,{status:'completed'});}
 assert.equal((await store.get(jobs[0].video_id,'owner')).status,'completed');
 const next=await store.create('owner','new');assert.notEqual(next.video_id,jobs[0].video_id);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cancel preserves history, blocks late completion and permits new job',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-cancel-'));try{const store=new VideoStore(root),j=await store.create('owner');
 await writeFile(join(root,j.video_id,'audit-01.json'),'private evidence');
 await store.cancel(j.video_id,'owner');assert.equal(await store.isCancelled(j.video_id),true);
 await store.update(j.video_id,{status:'completed'});assert.equal((await store.get(j.video_id,'owner')).status,'cancelled');
 assert.equal(await readFile(join(root,j.video_id,'audit-01.json'),'utf8'),'private evidence');
 await assert.rejects(store.cancel(j.video_id,'other'));assert.notEqual((await store.create('owner')).video_id,j.video_id);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('configured active-job limit frees slots on failure and cancellation without deleting old reports',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-slots-'));try{const store=new VideoStore(root,1),first=await store.create('owner');
 await assert.rejects(store.create('owner'),/Busy/);await store.finish(first.video_id,{status:'failed'});
 const second=await store.create('owner');await store.cancel(second.video_id,'owner');
 const third=await store.create('owner');assert.notEqual(third.video_id,first.video_id);
 assert.equal((await store.get(first.video_id,'owner')).status,'failed');assert.equal((await store.get(second.video_id,'owner')).status,'cancelled');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('dead worker recovers to failed after server restart; active worker is retained',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-restart-'));try{const store=new VideoStore(root),j=await store.create('owner');
 await store.update(j.video_id,{status:'processing',worker_pid:2147483647});
 const restarted=new VideoStore(root);await restarted.cleanup();assert.equal((await restarted.get(j.video_id,'owner')).status,'failed');
 const next=await restarted.create('owner');await restarted.update(next.video_id,{status:'processing',worker_pid:process.pid});await restarted.cleanup();assert.equal((await restarted.get(next.video_id,'owner')).status,'processing');
 }finally{await rm(root,{recursive:true,force:true});}
});
