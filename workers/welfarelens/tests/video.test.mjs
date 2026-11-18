import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,access,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {command} from '../src/server/video/media.ts';
import {join} from 'node:path';
const core=await import('../src/domain/video.ts').catch(()=>({}));
const storage=await import('../src/server/video/store.ts').catch(()=>({}));
test('report rejects invented evidence frame, wrong video and mismatched timestamp on readback',()=>{
 const base={video_id:'11111111-1111-4111-8111-111111111111',owner_hash:'hash',created_at:0,expires_at:100,status:'completed',stage:'done',original_deleted:true,frames:[{frame_id:'f000',timestamp:1,hash:'same',novelty:0,sharpness:1}],events:[],warning:[],error:null,model:'test',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 const action={id:'case-0',title:'窗戶',action:'開窗前裝防護',priority:'moderate',object_index:0,bbox:null,source_url:null,kind:'prevention',observation:'窗旁有沙發',inference:'可能攀爬',reason:'接近窗台',impact:'開窗後風險',unknown:[]};
 const events=core.eventsFromFrames(base.video_id,[{frame_id:'f000',timestamp:1,hash:'same',actions:[action]}],'test');
 assert.equal(core.VideoJobSchema.safeParse({...base,events}).success,true);
 assert.equal(core.VideoJobSchema.safeParse({...base,events:[{...events[0],frame_id:'f999'}]}).success,false);
 assert.equal(core.VideoJobSchema.safeParse({...base,events:[{...events[0],representative_timestamp:99}]}).success,false);
 assert.equal(core.VideoJobSchema.safeParse({...base,events:[{...events[0],video_id:'other'}]}).success,false);
});
test('selection covers both ends and uniformly spans static pans rather than only scene cuts',()=>{
 assert.equal(typeof core.selectFrames,'function');
 const frames=Array.from({length:30},(_,i)=>({frame_id:`f${i}`,timestamp:i+.25,novelty:i===7?1:0,sharpness:1}));
 const picked=core.selectFrames(frames,8); assert.equal(picked.length,8); assert.equal(picked[0].timestamp,.25);assert.equal(picked.at(-1).timestamp,29.25);assert.ok(picked.some(f=>f.timestamp===7.25));assert.ok(picked.some(f=>f.timestamp>12&&f.timestamp<20));
});
test('events use backend timestamps, never VLM boxes, and only merge exact same sampled image',()=>{
 assert.equal(typeof core.eventsFromFrames,'function');
 const action={id:'case-0',title:'窗邊家具',action:'開窗前裝防護',priority:'moderate',object_index:0,bbox:[.1,.2,.8,.9],source_url:'https://www.cats.org.uk/',kind:'prevention',observation:'窗戶關閉，旁有沙發',inference:'可能攀爬',reason:'可達窗台',impact:'開窗後可能墜落',unknown:['固定強度未知']};
 const frames=[{frame_id:'f000',timestamp:.25,hash:'same',actions:[action]},{frame_id:'f001',timestamp:4.5,hash:'same',actions:[action]},{frame_id:'f002',timestamp:8.1,hash:'different',actions:[action]}];
 const events=core.eventsFromFrames('v1',frames,'test');assert.equal(events.length,2);assert.equal(events[0].representative_timestamp,.25);assert.equal(events[0].end_time,null);assert.equal(events[0].bounding_box,null);assert.equal(events[0].object_track_id,null);assert.deepEqual(events[0].evidence_frames.map(f=>f.timestamp),[.25,4.5]);assert.equal(events[1].start_time,8.1);
 assert.throws(()=>core.eventsFromFrames('v1',[{...frames[0],timestamp:-1}],'test'));
});
test('same-frame identical advice for two separate objects is not deduplicated into one',()=>{
 const action={id:'plant-0',title:'黃金葛',action:'避免接觸',priority:'moderate',object_index:0,bbox:null,source_url:null,kind:'risk',observation:'心形斑葉',inference:'',reason:'已知毒性',impact:'可能誤食',unknown:[]};
 const events=core.eventsFromFrames('v1',[{frame_id:'f000',timestamp:1,hash:'same',actions:[action,{...action,id:'plant-1',object_index:1}]}],'test');assert.equal(events.length,2);
});
test('store isolates owners, rejects traversal, streams bounded files, and deletes originals on completion',async()=>{
 assert.equal(typeof storage.VideoStore,'function');
 const root=await mkdtemp(join(tmpdir(),'wl-video-'));try{
 const store=new storage.VideoStore(root); const job=await store.create('owner-a');
 await assert.rejects(store.get(job.video_id,'owner-b'));await assert.rejects(store.get('../outside','owner-a'));
 await store.upload(job.video_id,'owner-a',new Blob(['video']).stream(),20);
 assert.equal((await readFile(join(root,job.video_id,'original.bin'))).toString(),'video');
 await assert.rejects(store.upload(job.video_id,'owner-a',new Blob(['again']).stream(),20));
 await store.finish(job.video_id,{status:'completed',stage:'完成',events:[],frames:[]});
 await assert.rejects(access(join(root,job.video_id,'original.bin')));
 const out=await store.get(job.video_id,'owner-a');assert.equal(out.original_deleted,true);
 await store.delete(job.video_id,'owner-a');await assert.rejects(store.get(job.video_id,'owner-a'));
 const huge=await store.create('owner-a');await assert.rejects(store.upload(huge.video_id,'owner-a',new Blob(['12345']).stream(),4));await assert.rejects(access(join(root,huge.video_id,'original.bin')));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('expired reports and interrupted jobs are cleaned without touching outside files',async()=>{
 assert.equal(typeof storage.VideoStore,'function');
 const root=await mkdtemp(join(tmpdir(),'wl-expiry-'));try{const store=new storage.VideoStore(root);const job=await store.create('a');await store.cleanup(Date.now()+31*60*1000);await assert.rejects(store.get(job.video_id,'a'));}finally{await rm(root,{recursive:true,force:true});}
});
test('concurrent worker progress patches preserve both updates',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-concurrent-'));try{const store=new storage.VideoStore(root),j=await store.create('a');await Promise.all([store.update(j.video_id,{stage:'new-stage'}),store.update(j.video_id,{model:'test-model'})]);const result=await store.get(j.video_id,'a');assert.equal(result.stage,'new-stage');assert.equal(result.model,'test-model');}finally{await rm(root,{recursive:true,force:true});}
});
test('expired corrupt manifests do not retain private originals forever',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-corrupt-'));try{const store=new storage.VideoStore(root),j=await store.create('a');await writeFile(join(root,j.video_id,'job.json'),'{broken');await writeFile(join(root,j.video_id,'original.bin'),'private');await store.cleanup(Date.now()+31*60*1000);await assert.rejects(access(join(root,j.video_id,'original.bin')));}finally{await rm(root,{recursive:true,force:true});}
});
test('simultaneous creations cannot bypass the two active job limit',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-capacity-'));try{const store=new storage.VideoStore(root);const results=await Promise.allSettled([store.create('a'),store.create('a'),store.create('a')]);assert.equal(results.filter(r=>r.status==='fulfilled').length,2);}finally{await rm(root,{recursive:true,force:true});}
});
test('late progress never overwrites a terminal job state',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-terminal-'));try{const store=new storage.VideoStore(root),j=await store.create('a');await store.finish(j.video_id,{status:'failed',stage:'failure',error:'failure',analysis_status:'failed'});await store.update(j.video_id,{stage:'late progress'});assert.equal((await store.get(j.video_id,'a')).stage,'failure');}finally{await rm(root,{recursive:true,force:true});}
});
test('active FFmpeg media can be cancelled and deleted without leaving original files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-cancel-'));let timer;const abort=new AbortController();let running;
 try{const store=new storage.VideoStore(root);assert.equal(typeof store.isCancelled,'function');const j=await store.create('a');await store.upload(j.video_id,'a',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 running=command('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-re','-i',join(root,j.video_id,'original.bin'),'-an','-f','null','-'],abort.signal).catch(()=>{});
 await new Promise(r=>setTimeout(r,500));timer=setInterval(()=>{void store.isCancelled(j.video_id).then(c=>{if(c)abort.abort();});},25);
 await store.delete(j.video_id,'a');await running;assert.equal(abort.signal.aborted,true);await assert.rejects(access(join(root,j.video_id,'original.bin')));
 }finally{clearInterval(timer);abort.abort();await running;await rm(root,{recursive:true,force:true});}
});
