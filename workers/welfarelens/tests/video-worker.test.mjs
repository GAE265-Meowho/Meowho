import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,writeFile,rm,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {VideoStore} from '../src/server/video/store.ts';
import {readIssueReport} from '../src/server/video/issues-store.ts';
const worker=await import('../src/server/video/worker.ts').catch(()=>({}));
const candidate={objects:[],plants:[],image_quality:'unusable',questions:[],limitations:['模糊'],assessments:[]};

test('legacy once flag and existing lock cannot block model entry, and lock is left intact',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-obsolete-lock-'));try{
 const store=new VideoStore(root);await writeFile(join(root,'acceptance-once.lock'),'historical acceptance');
 for(let i=0;i<2;i++){const j=await store.create('owner');await store.upload(j.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 // No injected analyzer: disabled cloud safely proves the real adapter is reached, without network traffic.
 await worker.runVideoScan(store,j.video_id,{env:{WELFARELENS_VIDEO_ACCEPTANCE_ONCE:'true',ENABLE_CLOUD_ANALYSIS:'false'},signal:new AbortController().signal});
 const out=await store.get(j.video_id,'owner');assert.match(out.error,/尚未開放/);assert.ok(out.metrics.calls>0);assert.equal(out.metrics.request_attempts,0);
 }assert.equal(await readFile(join(root,'acceptance-once.lock'),'utf8'),'historical acceptance');
 }finally{await rm(root,{recursive:true,force:true});}
});
test('worker uses real frames but injected model output; unusable frames never yield complete safe report, originals removed',async()=>{
 assert.equal(typeof worker.runVideoScan,'function');const dir=await mkdtemp(join(tmpdir(),'wl-worker-'));try{
 const store=new VideoStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 await worker.runVideoScan(store,job.video_id,{analyze:async()=>({candidate,usage:null,deployment:'test'}),env:{},signal:new AbortController().signal});
 const out=await store.get(job.video_id,'owner');assert.equal(out.status,'failed');assert.equal(out.analysis_status,'failed');assert.equal(out.events.length,0);assert.ok(out.warning.length);assert.equal(out.original_deleted,true);await assert.rejects(access(join(dir,job.video_id,'original.bin')));assert.ok(out.metrics.calls>=1);assert.equal(out.metrics.estimated_api_cost,null);
 assert.ok(out.metrics.sceneMs>=0);assert.ok(out.metrics.aggregationMs>=0);assert.ok(out.metrics.sampledPeakRssMb>0);assert.ok(out.metrics.maxActiveCalls<=2);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('credential failures halt remaining model calls and explain failure rather than zero-risk success',async()=>{
 assert.equal(typeof worker.runVideoScan,'function');const dir=await mkdtemp(join(tmpdir(),'wl-worker-fail-'));try{const store=new VideoStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());await worker.runVideoScan(store,job.video_id,{analyze:async()=>{throw Error('credentials');},env:{},signal:new AbortController().signal});const out=await store.get(job.video_id,'owner');assert.equal(out.status,'failed');assert.equal(out.analysis_status,'failed');assert.ok(out.original_deleted);assert.match(out.error,/憑證/);assert.ok(out.metrics.calls<=2);}finally{await rm(dir,{recursive:true,force:true});}
});
test('plant rechecks wait for whole-video observations and use bounded detail budget',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-plants-'));try{const store=new VideoStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 let scenes=0,crops=0,firstCropAfter=0;
 const scene={objects:[{kind:'plant',label:'盆栽',bbox:[.2,.2,.7,.8],notes:'葉形部分可見'}],plants:[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'medium'}],features:'部分心形斑葉',identification_quality:'limited'}],image_quality:'adequate',questions:[],limitations:[],assessments:[]};
 await worker.runVideoScan(store,job.video_id,{env:{},signal:new AbortController().signal,analyze:async(_image,plant)=>{if(plant){if(!crops)firstCropAfter=scenes;crops++;}else scenes++;return {candidate:scene,usage:null,deployment:'test'};}});
 const out=await store.get(job.video_id,'owner');assert.equal(out.status,'completed');assert.match(out.warning.join(' '),/植物/);assert.equal(firstCropAfter,out.metrics.sampledFrames);assert.ok(crops>0&&crops<=6);assert.equal(out.metrics.calls,scenes+crops);assert.ok(out.events.every(e=>e.bounding_box===null));
 const report=await readIssueReport(store,job.video_id,'owner');assert.equal(report.source,'snapshot');assert.ok(report.observations.every(o=>o.plant&&o.event_ids.length));assert.equal(new Set(report.issues.flatMap(i=>i.observation_ids)).size,report.observations.length);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('parallel details for two pots in one frame preserve both improved identities',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-parallel-pots-'));try{const store=new VideoStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 const pot=(label,bbox)=>({kind:'plant',label,bbox,notes:'可見葉片'}),id=i=>({object_index:i,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'medium'}],features:'心形斑葉',identification_quality:'adequate'});
 const scene={objects:[pot('左盆栽',[.1,.1,.4,.6]),pot('右盆栽',[.6,.1,.9,.6])],plants:[id(0),id(1)],image_quality:'adequate',questions:[],limitations:[],assessments:[]};
 const detail={...scene,objects:[scene.objects[0]],plants:[{...id(0),candidates:[{...id(0).candidates[0],confidence:'high'}]}]};
 await worker.runVideoScan(store,job.video_id,{env:{},signal:new AbortController().signal,analyze:async(_image,plant)=>{if(plant)await new Promise(r=>setTimeout(r,40));return {candidate:plant?detail:scene,usage:null,deployment:'test'};}});
 const out=await store.get(job.video_id,'owner');assert.equal(out.events.filter(e=>e.kind==='risk').length,6);assert.ok(out.diagnostics.every(d=>d.frame_id&&d.error_type===null));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('a transient progress write failure cannot discard completed model observations',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-progress-'));try{
 class ProgressStore extends VideoStore{failed=false;async update(id,patch){if(!this.failed&&patch.stage?.startsWith('植物細節')){this.failed=true;throw Object.assign(Error('simulated Windows file lock'),{code:'EPERM'});}return super.update(id,patch);}}
 const store=new ProgressStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 const scene={objects:[{kind:'plant',label:'盆栽',bbox:[.1,.1,.8,.8],notes:'可見心形斑葉'}],plants:[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'medium'}],features:'心形斑葉',identification_quality:'adequate'}],image_quality:'adequate',questions:[],limitations:[],assessments:[]};
 await worker.runVideoScan(store,job.video_id,{env:{},signal:new AbortController().signal,analyze:async()=>({candidate:scene,usage:null,deployment:'test'})});const out=await store.get(job.video_id,'owner');assert.notEqual(out.status,'failed');assert.ok(out.events.length>0);assert.equal(out.metrics.analyzedFrames,8);assert.equal(out.metrics.calls,14);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('single concurrency keeps every frame and records queue time without retries',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-serial-'));try{
 const store=new VideoStore(dir),job=await store.create('owner');await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 let active=0,peak=0,calls=0;
 await worker.runVideoScan(store,job.video_id,{env:{WELFARELENS_VIDEO_CONCURRENCY:'1'},signal:new AbortController().signal,analyze:async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;return {candidate,usage:null,deployment:'test'};}});
 const out=await store.get(job.video_id,'owner');assert.equal(peak,1);assert.equal(out.metrics.maxActiveCalls,1);assert.equal(out.metrics.analyzedFrames,out.metrics.sampledFrames);assert.equal(calls,out.metrics.calls);assert.equal(out.metrics.retry_count,0);assert.equal(out.diagnostics.length,calls);assert.ok(out.diagnostics.every(d=>d.queue_wait_ms>=0));assert.equal(new Set(out.diagnostics.map(d=>d.frame_id)).size,out.metrics.sampledFrames);
 }finally{await rm(dir,{recursive:true,force:true});}
});

import {command} from '../src/server/video/media.ts';
test('async photo uses real decode plus mocked scene and plant detail, keeps issue traceability and removes source',async()=>{const dir=await mkdtemp(join(tmpdir(),'wl-photo-worker-'));try{const image=join(dir,'input.png');await command('ffmpeg',['-v','error','-y','-f','lavfi','-i','testsrc=size=600x900','-frames:v','1',image]);const store=new VideoStore(join(dir,'jobs')),j=await store.create('owner');await store.update(j.video_id,{input_kind:'photo'});await store.upload(j.video_id,'owner',new Blob([await readFile(image)]).stream());const scene={objects:[{kind:'plant',label:'測試盆栽',bbox:[.1,.1,.8,.8],notes:'合成測試'}],plants:[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'medium'}],features:'測試候選',identification_quality:'adequate'}],image_quality:'adequate',questions:[],limitations:[],assessments:[]};let calls=0;await worker.runVideoScan(store,j.video_id,{env:{},signal:new AbortController().signal,analyze:async()=>{calls++;return {candidate:scene,deployment:'mock',usage:null};}});const result=await store.get(j.video_id,'owner');assert.notEqual(result.status,'failed');assert.equal(result.metrics.sampledFrames,1);assert.equal(calls,2);assert.equal(result.original_deleted,true);const report=await readIssueReport(store,j.video_id,'owner');assert.ok(report.issues.length);assert.ok(report.observations.every(o=>o.frame_id==='f000'));}finally{await rm(dir,{recursive:true,force:true});}});

test('seven adequate frames and one usable limited frame complete with the quality warning', async () => {
 const dir=await mkdtemp(join(tmpdir(),'wl-quality-'));try{
 const store=new VideoStore(dir),job=await store.create('owner');
 await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 let scenes=0;
 await worker.runVideoScan(store,job.video_id,{env:{WELFARELENS_VIDEO_CONCURRENCY:'1'},signal:new AbortController().signal,
  analyze:async()=>({candidate:{...candidate,image_quality:++scenes===6?'limited':'adequate'},usage:null,deployment:'mock'})});
 const result=await store.get(job.video_id,'owner');
 assert.equal(result.metrics.sampledFrames,8);assert.equal(result.metrics.analyzedFrames,8);
 assert.equal(result.status,'completed');assert.match(result.warning.join(' '),/細節不足/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('a failed sampled scene leaves usable analysis partial', async () => {
 const dir=await mkdtemp(join(tmpdir(),'wl-coverage-'));try{
 const store=new VideoStore(dir),job=await store.create('owner');
 await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 let scenes=0;
 await worker.runVideoScan(store,job.video_id,{env:{WELFARELENS_VIDEO_CONCURRENCY:'1'},signal:new AbortController().signal,
  analyze:async()=>{if(++scenes===6)throw Error('timeout');return {candidate:{...candidate,image_quality:'adequate'},usage:null,deployment:'mock'};}});
 const result=await store.get(job.video_id,'owner');
 assert.equal(result.metrics.failedFrames,1);assert.equal(result.status,'partial');
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('an optional plant recheck failure keeps the uncertainty and complete scene coverage', async () => {
 const dir=await mkdtemp(join(tmpdir(),'wl-optional-plant-'));try{
 const store=new VideoStore(dir),job=await store.create('owner');
 await store.upload(job.video_id,'owner',new Blob([await readFile('welfarelens-video-spike/samples/synthetic-room.mp4')]).stream());
 const scene={...candidate,image_quality:'adequate',
  objects:[{kind:'plant',label:'未定種盆栽',bbox:[.1,.1,.8,.8],notes:'部分葉片可見'}],
  plants:[{object_index:0,candidates:[],features:'部分葉片',identification_quality:'limited'}]};
 await worker.runVideoScan(store,job.video_id,{env:{},signal:new AbortController().signal,
  analyze:async(_image,plant)=>{if(plant)throw Error('timeout');return {candidate:scene,usage:null,deployment:'mock'};}});
 const result=await store.get(job.video_id,'owner');
 assert.equal(result.status,'completed');assert.ok(result.metrics.refinementFailures>0);
 assert.match(result.warning.join(' '),/植物細節辨識未完成/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
