import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,access,writeFile,mkdir,symlink} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';import {createHash} from 'node:crypto';
import {WelfareLensReportV1Schema} from '../src/domain/welfare-report.ts';import {VisualReportSchema} from '../src/domain/visual-report.ts';import {VideoStore} from '../src/server/video/store.ts';
const worker=await import('../src/server/video/standalone.ts').catch(()=>({}));
const fixture={version:1,provenance:'synthetic_model_fixture_not_azure',candidate:{objects:[],plants:[],image_quality:'limited',questions:[],limitations:['合成回應，不代表模型品質'],assessments:[]}};
test('shipped Docker fixture validates and contains a non-empty rule case',async()=>{const value=JSON.parse(await readFile('evals/fixtures/worker-scene.json','utf8'));const {WorkerFixtureSchema}=await import('../src/server/video/standalone.ts');const parsed=WorkerFixtureSchema.parse(value);assert.ok(parsed.candidate.assessments.length);});
test('standalone preserves partial diagnostic JSON without producing a ready envelope',async()=>{
 assert.equal(typeof worker.executeFixtureJob,'function');const root=await mkdtemp(join(tmpdir(),'wl-standalone-'));const input=resolve('welfarelens-video-spike/samples/synthetic-room.mp4');const before=createHash('sha256').update(await readFile(input)).digest('hex');const previous=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Network forbidden');};
 try{const result=await worker.executeFixtureJob({input,root,fixture});assert.equal(result.outcome,'partial');assert.equal(result.mode,'fixture');assert.equal(result.actual_azure,false);assert.ok(result.expires_at>Date.now());const dir=join(root,result.job_id);
 const canonical=WelfareLensReportV1Schema.parse(JSON.parse(await readFile(join(dir,'report.json'),'utf8'))),visual=VisualReportSchema.parse(JSON.parse(await readFile(join(dir,'visual-report.json'),'utf8')));
 assert.equal(canonical.report_id,result.job_id);assert.deepEqual(visual.issues.map(i=>i.key),canonical.issues.map(i=>i.key));assert.equal(canonical.analysis_status,'incomplete');await assert.rejects(access(join(dir,'meowho-report.json')));assert.equal(worker.standaloneSucceeded(result,false),true);assert.equal(visual.analysis_metadata.model,'fixture-not-azure');
 const {timings}=JSON.parse(await readFile(join(dir,'bundle.json'),'utf8'));
 assert.deepEqual(timings,result.timings);
 assert.equal(timings.imageEditingMs,null);
 assert.equal(timings.pdfMs,null);
 for(const stage of ['inputValidationMs','stagingMs','analysisMs','reportAssemblyMs']){
  assert.ok(Number.isFinite(timings[stage])&&timings[stage]>=0&&timings[stage]<=timings.totalBeforeManifestMs);
 }
 await assert.rejects(access(join(dir,'original.bin')));assert.equal(createHash('sha256').update(await readFile(input)).digest('hex'),before);
 await new VideoStore(root).cleanup(result.expires_at+1);await assert.rejects(access(dir));
 }finally{globalThis.fetch=previous;await rm(root,{recursive:true,force:true});}
});
test('fixture contract rejects missing provenance, unknown fields and invalid output before creating work',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-invalid-fixture-'));try{for(const invalid of [{...fixture,provenance:'azure'}, {...fixture,extra:true},{...fixture,candidate:{}}])await assert.rejects(worker.executeFixtureJob({input:resolve('welfarelens-video-spike/samples/synthetic-room.mp4'),root,fixture:invalid}));}finally{await rm(root,{recursive:true,force:true});}
});
test('private root rejects public/build/source directories and source links; no unbounded source copy',async()=>{
 for(const root of ['public/worker','src/worker','node_modules/worker','.next/worker'])await assert.rejects(worker.executeFixtureJob({input:resolve('welfarelens-video-spike/samples/synthetic-room.mp4'),root:resolve(root),fixture}));
 const root=await mkdtemp(join(tmpdir(),'wl-bad-input-'));try{const input=join(root,'empty.mp4');await writeFile(input,'');await assert.rejects(worker.executeFixtureJob({input,root:join(root,'jobs'),fixture}));}finally{await rm(root,{recursive:true,force:true});}
});
test('source and root cannot traverse a directory junction',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-worker-links-'));try{const real=join(dir,'real'),link=join(dir,'link');await mkdir(real);await writeFile(join(real,'input.mp4'),'not video');await symlink(real,link,process.platform==='win32'?'junction':'dir');
 await assert.rejects(worker.executeFixtureJob({input:join(link,'input.mp4'),root:join(dir,'jobs'),fixture}),/links/);
 await assert.rejects(worker.executeFixtureJob({input:resolve('welfarelens-video-spike/samples/synthetic-room.mp4'),root:join(link,'jobs'),fixture}),/Symlink/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('JSON-only complete analysis exports a validated ready envelope without requesting a PDF',async t=>{
 const root=await mkdtemp(join(tmpdir(),'wl-json-only-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const scene=JSON.parse(await readFile('evals/fixtures/worker-scene.json','utf8'));
 const bundle=await worker.executeFixtureJob({root,fixture:scene,input:resolve('welfarelens-video-spike/samples/synthetic-room.mp4')});
 assert.equal(bundle.outcome,'completed');assert.equal(bundle.stages.pdf,'not_requested');
 assert.equal(worker.standaloneSucceeded(bundle,false),true);assert.equal(worker.standaloneSucceeded(bundle,true),false);
 const report=JSON.parse(await readFile(join(root,bundle.job_id,'meowho-report.json'),'utf8'));
 assert.equal(report.status,'ready');assert.equal(report.analysis_status,'complete');
});
