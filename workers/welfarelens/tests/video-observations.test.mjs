import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {captureObservations,fromLegacyEvents} from '../src/domain/video-observations.ts';
import {writeIssueSnapshot,readIssueReport} from '../src/server/video/issues-store.ts';
import {VideoStore} from '../src/server/video/store.ts';
const candidate={objects:[{kind:'plant',label:'黃金葛',bbox:[.1,.1,.4,.7],notes:'可見心形斑葉'}],plants:[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'high'}],features:'心形斑葉',identification_quality:'adequate'}],image_quality:'adequate',questions:[],limitations:[],assessments:[]};
const frame={frame_id:'f000',timestamp:0,hash:'image',novelty:0,sharpness:1};
test('capture retains validated plant candidates and source refs, duplicate images keep both observations',()=>{
 const r=captureObservations([{frame,candidate},{frame:{...frame,frame_id:'f004',timestamp:4},candidate}],key=>'obs-'+key);assert.equal(r.length,2);assert.equal(r[0].plant.candidates[0].scientific_name,'Epipremnum aureum');assert.equal(r[0].rule_id,'H02');assert.equal(r[0].object_ref,0);assert.equal(r[0].candidate_bbox[0],.1);assert.notEqual(r[0].observation_id,r[1].observation_id);
 assert.throws(()=>captureObservations([{frame:{...frame,timestamp:-1},candidate}],key=>key));
});
test('private snapshot inherits owner, TTL, cancel/delete, validates readback and never sends salt',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-issues-'));try{
 const store=new VideoStore(root),job=await store.create('owner');await store.update(job.video_id,{status:'processing',frames:[frame]});
 await writeIssueSnapshot(store,job.video_id,[{frame,candidate,initial_candidate:candidate}],[],new AbortController().signal);
 await store.finish(job.video_id,{status:'completed',analysis_status:'complete'});
 const r=await readIssueReport(store,job.video_id,'owner');assert.equal(r.source,'snapshot');assert.equal(r.issues.length,1);assert.equal(r.observations[0].plant.candidates.length,1);assert.ok(!JSON.stringify(r).includes('salt'));
 assert.deepEqual(await readIssueReport(store,job.video_id,'owner'),r);await assert.rejects(readIssueReport(store,job.video_id,'other'));
 const file=join(root,job.video_id,'issues.json'),bytes=await readFile(file,'utf8');await writeFile(file,'{broken');await assert.rejects(readIssueReport(store,job.video_id,'owner'));await writeFile(file,bytes);
 const journal=JSON.parse(await readFile(join(root,job.video_id,'job.json'),'utf8'));journal.expires_at=0;await writeFile(join(root,job.video_id,'job.json'),JSON.stringify(journal));await assert.rejects(readIssueReport(store,job.video_id,'owner'));journal.expires_at=Date.now()+10000;await writeFile(join(root,job.video_id,'job.json'),JSON.stringify(journal));
 await store.delete(job.video_id,'owner');await assert.rejects(readIssueReport(store,job.video_id,'owner'));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('cancelled writes do not create snapshots; missing legacy fields stay null',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-issues-cancel-'));try{const store=new VideoStore(root),job=await store.create('owner');const signal=AbortSignal.abort();await assert.rejects(writeIssueSnapshot(store,job.video_id,[{frame,candidate}],[],signal));assert.equal(fromLegacyEvents({...job,events:[]}).length,0);}finally{await rm(root,{recursive:true,force:true});}
});
test('same-looking two pots map to their own event, never cross-link merely identical text',async()=>{
 const {buildScanResult}=await import('../src/domain/scan-result.ts'),{eventsFromFrames}=await import('../src/domain/video.ts');
 const two={...candidate,objects:[candidate.objects[0],{...candidate.objects[0],bbox:[.6,.1,.9,.7]}],plants:[candidate.plants[0],{...candidate.plants[0],object_index:1}]};
 const events=eventsFromFrames('11111111-1111-4111-8111-111111111111',[{...frame,actions:buildScanResult(two).actions}],'mock'),obs=captureObservations([{frame,candidate:two}],key=>key,events,'mock');
 assert.equal(events.length,2);assert.deepEqual(obs.map(o=>o.event_ids),[['ev-1'],['ev-2']]);
});
