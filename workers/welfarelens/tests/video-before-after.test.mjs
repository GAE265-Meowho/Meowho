import {test} from 'node:test';
import {processMeowhoJob, MeowhoError} from '../src/server/video/meowho-worker.ts';
import assert from 'node:assert/strict';
import {copyFile,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {observation,id} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {buildWelfareLensReport} from '../src/domain/welfare-report.ts';
import {buildVisualReport} from '../src/domain/visual-report.ts';
import {buildRiskObjects,RiskObjectReportSchema} from '../src/domain/risk-objects.ts';
import {buildComparisonHtml,planVisualCases,renderComparisonPdf,renderVideoAfter} from '../src/server/video/before-after.ts';
import {command} from '../src/server/video/media.ts';
import {createImageEditPacer} from '../src/server/video/image-edit-pacing.ts';
import {openM6ModelGuard} from '../src/server/video/m6-model-guard.ts';
import {buildDetailImages,detailRegions} from '../src/server/video/comparison-detail.ts';
import {reportViewFromPrepared} from '../src/server/video/report-view-model.ts';
import {readHumanReview} from '../src/server/video/comparison-review.ts';
import {evidenceMarker,renderProfessionalHtml} from '../src/server/video/comparison-report.ts';

test('print markers reject invalid boxes and distinguish aligned simulations',()=>{
 assert.equal(evidenceMarker([.8,.1,.2,.4],1),'');
 assert.equal(evidenceMarker(null,1,true),'');
 assert.match(evidenceMarker([.1,.2,.3,.4],2),/<rect x="10" y="20"/);
 assert.match(evidenceMarker([.2,.2,.4,.4],2,true),/evidence-marker simulated/);
});
import {prepareProfessionalReport} from '../src/server/video/professional-report.ts';
import {processIntegrationJob} from '../src/server/video/integration-job.ts';
import {toMeowhoEnvReport} from '../src/domain/welfare-report.ts';
const sha=b=>createHash('sha256').update(b).digest('hex');
function setup(hash='a'.repeat(64),source='azure',extra=[]){
 const raw=[observation('wire',{frame_hash:hash,candidate_bbox:[.1,.2,.4,.8],facts:[{key:'exposed_cord',value:true,status:'OBSERVATION',evidence:'visible cable',confidence:'high'}]})];
 let next=0;
 const input={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([...raw,...extra],[],()=> 'issue-'+(++next))};
 const visual=buildVisualReport(input,buildWelfareLensReport(input,'complete',1000),{video_id:id,created_at:1000,expires_at:1801000,frames:[{frame_id:'f000',timestamp:0,hash,novelty:0,sharpness:1}],model:'test'});
 return {visual,input,risk:buildRiskObjects(input,visual,[{frame_id:'f000',timestamp:0,sha256:hash,path:'f000.jpg'}],source)};
}
test('risk export rejects traversal, cross-linked actions and fabricated edit status',()=>{
 const {risk}=setup();assert.equal(risk.risk_objects.length,1);assert.equal(risk.visual_comparisons[0].after_generation_status.status,'not_requested');
 for(const corrupt of [
  x=>{x.visual_comparisons[0].before_image_ref='../f000.jpg'},
  x=>{x.game_task_candidates[0].action_id='missing'},
  x=>{x.visual_comparisons[0].after_is_ai_generated=true},
  x=>{x.risk_objects[0].localization_source='verified_model'},
 ]){const copy=structuredClone(risk);corrupt(copy);assert.equal(RiskObjectReportSchema.safeParse(copy).success,false);}
});

test('visual planning considers a plant outside the priority summary and records uncertain locations',()=>{
 const hash='a'.repeat(64);
 const plant=(name,ref,bbox)=>observation(name,{frame_hash:hash,rule_id:'H02',object_ref:ref,object_kind:'plant',object_label:name,title:name,kind:'precaution',recommendation:'暫時移到貓咪無法接近的位置',candidate_bbox:bbox});
 const {risk,visual}=setup(hash,'azure',[plant('visible-plant',1,[.5,.2,.8,.65]),plant('unlocated-plant',2,null)]);
 const names=new Map(risk.risk_objects.map(object=>[object.object_id,object.display_name_zh]));
 const plan=planVisualCases(risk,visual);
 assert.equal(plan.find(entry=>names.get(entry.object_id)==='visible-plant').reason,'selected');
 assert.equal(plan.find(entry=>names.get(entry.object_id)==='unlocated-plant').reason,'insufficient_evidence');
 assert.equal(plan.filter(entry=>entry.reason==='selected').length,2);
});
test('worker passes exact original bytes to one editor and validates PNG, association, and honest fallback',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-pair-'));
 try{
  const signal=new AbortController().signal,original=join(dir,'f000.jpg'),edited=join(dir,'test-only.png');
  for(const [color,path] of [['black',original],['white',edited]])await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','color='+color+':s=64x64','-frames:v','1','-threads','1',path],signal);
  const jpeg=await readFile(original),png=await readFile(edited),{risk,visual}=setup(sha(jpeg));
  const config={url:'unused',key:'unused',deployment:'test-editor'};let attempts=0;
  const editor=async(_config,image,prompt)=>{attempts++;assert.deepEqual(image,jpeg);assert.match(prompt,/理線槽/);return {ok:true,png,encoded:png.toString('base64'),width:64,height:64,usage:null};};
  const failed=await renderVideoAfter(risk,visual,dir,config,signal,async()=>({ok:false,status:429}));
  assert.equal(failed.visual_comparisons[0].after_generation_status.status,'failed');
  assert.match(await buildComparisonHtml(visual,failed,dir),/改善示意生成失敗/);
  const result=await renderVideoAfter(risk,visual,dir,config,signal,editor);
  assert.equal(attempts,1);assert.equal(result.visual_comparisons[0].after_generation_status.status,'generated');
  assert.doesNotMatch(await buildComparisonHtml(visual,result,dir),/alt="改善後｜AI 模擬示意"/);
  const legacy=structuredClone(result);
  const pair=legacy.visual_comparisons[0],g=pair.after_generation_status;
  g.status='review_required';
  const review={schema_version:'welfarelens.visual-review.v1',job_id:result.analysis_id,comparison_id:pair.comparison_id,automated_status:'review_required',model:g.model,input_sha256:g.input_sha256,output_sha256:g.output_sha256,decision:'approved',reviewed_at:g.generated_at,reason:'Reviewed test image'};
  await writeFile(join(dir,'after.png.review.json'),JSON.stringify(review));
  assert.equal((await readHumanReview(dir,result.analysis_id,pair)).decision,'approved');
  // Human approval cannot override missing alignment.
  assert.doesNotMatch(await buildComparisonHtml(visual,legacy,dir),/alt="改善後｜AI 模擬示意"/);
  assert.equal(pair.after_generation_status.status,'review_required');
  await writeFile(join(dir,'after.png.review.json'),JSON.stringify({...review,output_sha256:'a'.repeat(64)}));
  assert.equal(await readHumanReview(dir,result.analysis_id,pair),null);
  await assert.rejects(renderVideoAfter(result,visual,dir,config,signal,editor));
  await assert.rejects(renderVideoAfter(setup(sha(jpeg),'synthetic_model_fixture_not_azure').risk,visual,dir,config,signal,editor));
  assert.equal(attempts,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('detail registration follows translated landmarks and rejects unrelated or blank images',()=>{
 let seed=1;
 const a=Buffer.alloc(96*64),b=Buffer.alloc(a.length);
 for(let i=0;i<a.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;a[i]=seed>>>24;}
 for(let y=0;y<62;y++)for(let x=0;x<93;x++)b[(y+2)*96+x+3]=a[y*96+x];
 const box=[.35,.3,.53,.7];
 const [original,shifted]=detailRegions(a,b,box);
 assert.ok(Math.abs(shifted[0]-original[0]-3/96)<=1/96);
 assert.ok(Math.abs(shifted[1]-original[1]-2/64)<=1/64);
 assert.equal(detailRegions(a,Buffer.alloc(a.length),box),null);
});

test('unattempted edits stay in the compact action list instead of creating empty comparison cards',async()=>{
 const {visual,risk}=setup();
 const html=await buildComparisonHtml(visual,risk,'unused');
 assert.match(html,/後續查核與照護建議/);
 assert.doesNotMatch(html,/<article class="comparison">|BEFORE｜|data:image/);
});

test('all three concurrency settings preserve case indices and report contracts',async t=>{
 const preview=process.env.WELFARELENS_QA_PDF_DIR;
 const dir=preview??await mkdtemp(join(tmpdir(),'wl-professional-'));
 if(preview)await mkdir(dir,{recursive:true});
 try{
  const signal=new AbortController().signal;
  const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
  const ppm=join(dir,'fixture-only.ppm');
  const cells=Array.from({length:64*36},(_,i)=>((Math.imul(i+13,1073741827)^Math.imul(i*i+125,1664525))>>>16)&255);
  const pixels=Buffer.alloc(640*360*3);
  for(let y=0;y<360;y++)for(let x=0;x<640;x++)pixels.fill(cells[Math.floor(y/10)*64+Math.floor(x/10)],(y*640+x)*3,(y*640+x)*3+3);
  await writeFile(ppm,Buffer.concat([Buffer.from('P6\n640 360\n255\n'),pixels]));
  await command(ffmpeg,['-v','error','-i',ppm,'-frames:v','1','-threads','1',join(dir,'f000.jpg')],signal);
  const jpeg=await readFile(join(dir,'f000.jpg')),hash=sha(jpeg);
  const fact=key=>({key,value:true,status:'OBSERVATION',evidence:'合成測試條件',confidence:'high'});
  const box=[.42,.35,.59,.63];
  const extra=[
   ...[1,2,3].map(i=>observation('cord-'+i,{frame_hash:hash,object_ref:i,candidate_bbox:box,object_label:'測試線材 '+i,title:'測試線材 '+i,facts:[fact('exposed_cord')]})),
   observation('window',{frame_hash:hash,object_ref:4,rule_id:'H01',object_kind:'window',object_label:'合成圖：開口範例',title:'合成圖：開口範例',candidate_bbox:box,facts:[fact('opening_visible')],recommendation:'關閉可接近的窗扇，開窗前確認防墜措施。'}),
   observation('scratch',{frame_hash:hash,object_ref:null,object_label:null,object_kind:null,rule_id:'H12',kind:'enrichment',title:'合成圖：磨爪區範例',placement:{bbox:box,description:'測試格中心',entrance:'面向開放區',preparation:'保留通道',checks:'檢查底座'},recommendation:'可考慮加設抓柱。'}),
  ].map(o=>({...o,observation:'離線測試圖樣，僅驗證版面及證據關聯。',unknown:['沒有真實居家判斷。']}));
  const {risk,visual,input}=setup(hash,'azure',extra);
  assert.equal(planVisualCases(risk,visual).filter(c=>c.reason==='selected').length,6);
  const config={url:'https://fixture.openai.azure.com/openai/v1/images/edits',key:'fixture',deployment:'test-editor'};
  const entries=planVisualCases(risk,visual).filter(c=>c.reason==='selected');
  const byLabel=new Map();
  const pngs=[];
  for(const [index,entry] of entries.entries()){
   byLabel.set(risk.risk_objects.find(o=>o.object_id===entry.object_id).display_name_zh,index);
   const file=join(dir,`mock-${index}.png`);
   await command(ffmpeg,['-v','error','-i',ppm,'-vf',`drawbox=x=270:y=130:w=105:h=84:color=0x${index+1}0aa80:t=fill`,'-frames:v','1','-threads','1','-compression_level','0',file],signal);
   pngs.push(await readFile(file));
  }
  let generated;
  for(const [concurrency,expectedPeak] of [[undefined,2],[1,1],[2,2],[3,3]]){
   const target=concurrency===3?dir:join(dir,`mode-${concurrency??'default'}`);
   if(target!==dir){await mkdir(target);await copyFile(join(dir,'f000.jpg'),join(target,'f000.jpg'));}
   let calls=0,active=0,peak=0;
   const editor=async(_config,_image,prompt,_size,_signal,_fetch,quality)=>{
    assert.equal(quality,'high');
    calls++;
    peak=Math.max(peak,++active);
    const index=byLabel.get(JSON.parse(prompt.slice(prompt.indexOf('{'))).object);
    await new Promise(resolve=>setTimeout(resolve,15+6*(5-index)));
    active--;
    const png=pngs[index];
    return {ok:true,png,encoded:png.toString('base64'),width:640,height:360,usage:null};
   };
   if(concurrency===undefined){
    let now=0,releaseFirst;
    const starts=[];
    const secondStarted=new Promise(resolve=>{releaseFirst=resolve;});
    const pace=createImageEditPacer(()=>now,async ms=>{now+=ms;});
    const deadline=AbortSignal.timeout(30_000);
    const ledger=join(target,'requests.jsonl');
    const guard=openM6ModelGuard(ledger,async(_url,init)=>{
     starts.push(now);
     const requestNumber=++calls;
     peak=Math.max(peak,++active);
     try{
      if(requestNumber===1){
       await new Promise((resolve,reject)=>{
        deadline.addEventListener('abort',()=>reject(deadline.reason),{once:true});
        void secondStarted.then(resolve);
       });
      }else if(requestNumber===2){
       releaseFirst();
      }
      assert.equal(init.body.get('quality'),'high');
      const prompt=init.body.get('prompt');
      const index=byLabel.get(JSON.parse(prompt.slice(prompt.indexOf('{'))).object);
      return Response.json({data:[{b64_json:pngs[index].toString('base64')}]});
     }finally{active--;}
    });
    try{
     generated=await renderVideoAfter(risk,visual,target,config,deadline,undefined,undefined,undefined,undefined,pace,guard.requests.image);
     assert.deepEqual(starts,[0,12000,24000,36000,48000,60000]);
     const records=(await readFile(ledger,'utf8')).trim().split('\n').map(JSON.parse);
     assert.equal(records.filter(record=>record.event==='start').length,6);
     assert.equal(Math.max(...records.filter(record=>record.event==='response').map(record=>record.in_flight_at_dispatch)),2);
    }finally{guard.close();}
   }else{
    generated=await renderVideoAfter(risk,visual,target,config,signal,editor,undefined,concurrency);
   }
   assert.equal(calls,6);
   assert.equal(peak,expectedPeak);
   for(const [index,entry] of entries.entries()){
    const pair=generated.visual_comparisons.find(c=>c.comparison_id===entry.comparison_id);
    const output=index===0?'after.png':`after-${index+1}.png`;
    assert.equal(pair.after_image_ref,output);
    assert.deepEqual(await readFile(join(target,output)),pngs[index]);
   }
  }
  for(const failure of [429,408,'unknown','cancelled']){
   const target=join(dir,`batch-${failure}`);
   await mkdir(target);await copyFile(join(dir,'f000.jpg'),join(target,'f000.jpg'));
   const job=new AbortController();
   const failures=[];
   let calls=0,waiting=0,finishFirst,release;
   const first=new Promise(resolve=>{finishFirst=resolve;});
   const ready=new Promise(resolve=>{release=resolve;});
   const mock=t.mock.method(globalThis,'fetch',async(_url,init)=>{
    if(++calls===1){
     await first;
     init.signal.throwIfAborted();
     return Response.json({data:[{b64_json:pngs[0].toString('base64')}]});
    }
    if(failure==='cancelled')job.abort();
    finishFirst();
    return typeof failure==='number'?new Response(null,{status:failure}):Response.json({unexpected:true});
   });
   const pace=async(waitSignal,send)=>{
    if(++waiting===1)return send();
    if(waiting===2){await ready;waitSignal.throwIfAborted();return send();}
    release();
    await new Promise(resolve=>waitSignal.addEventListener('abort',resolve,{once:true}));
    waitSignal.throwIfAborted();
   };
   try{
    const stopped=await renderVideoAfter(risk,visual,target,config,job.signal,undefined,code=>failures.push(code),3,undefined,pace);
    assert.equal(calls,2);
    assert.equal(stopped.visual_comparisons.filter(c=>c.after_generation_status.status==='not_requested').length,4);
    assert.equal(stopped.visual_comparisons.filter(c=>c.after_generation_status.status==='generated').length,failure==='cancelled'?0:1);
    assert.deepEqual(failures,failure==='cancelled'?[]:[failure===429?'rate_limited':failure===408?'timeout':'result_invalid']);
   }finally{mock.mock.restore();}
  }
  assert.deepEqual(generated.visual_comparisons.map(c=>c.after_image_ref).filter(Boolean).sort(),['after-2.png','after-3.png','after-4.png','after-5.png','after-6.png','after.png']);
  const edited=structuredClone(generated);
  const first=edited.visual_comparisons.find(pair=>pair.after_image_ref);
  const {model,input_sha256}=first.after_generation_status;
  first.after_generation_status={status:'failed',model,input_sha256,error:'provider'};
  first.after_image_ref=null;
  first.after_is_ai_generated=false;
  assert.equal(edited.visual_comparisons.filter(p=>p.after_image_ref).length,5);
  const prepared=await prepareProfessionalReport(visual,edited,dir,signal);
  assert.equal(prepared.cases.filter(c=>c.summary.disposition==='illustrated').length,5);
  assert.equal(prepared.cases.filter(c=>c.summary.disposition==='image_generation_failed').length,1);
  assert.equal(prepared.cases.filter(c=>c.summary.disposition==='quality_review_required').length,0);
  const html=await buildComparisonHtml(visual,edited,dir,signal);
  for(const document of [html,renderProfessionalHtml(prepared,undefined,[],true)]){
   assert.match(document,/<title>貓咪居家環境健檢報告｜MeowHome<\/title>/);
   assert.match(document,/<p class="kicker">MeowHome｜AI 居家環境安全檢測<\/p><h1>貓咪居家環境健檢報告<\/h1>/);
   assert.doesNotMatch(document,/WelfareLens × MeowHome|WELFARELENS · 居家改善計畫/);
  }
  assert.equal((html.match(/<img /g)??[]).length,21);
  assert.match(html,/影片多影格｜改善位置總覽/);
  assert.equal((html.match(/id="case-/g)??[]).length,5);
  assert.equal((html.match(/href="#case-/g)??[]).length,5);
  assert.ok(prepared.cases.filter(c=>c.summary.disposition==='illustrated').every(c=>c.summary.evidence_frame_id==='f000'&&c.summary.detail_regions?.length===2));
  assert.doesNotMatch(html,/待審閱｜AI 模擬改善示意/);
  const draft=await prepareProfessionalReport(visual,edited,dir,signal,true);
  const draftHtml=renderProfessionalHtml(draft);
  assert.equal((draftHtml.match(/<img /g)??[]).length,21);
  assert.equal((draftHtml.match(/待審閱｜AI 模擬改善示意/g)??[]).length,0);
  assert.equal(draft.cases.filter(c=>c.summary.disposition==='illustrated').length,5);
  assert.match(draftHtml,/私人影像審閱稿/);
  assert.match(html,/可選環境改善/);
  const square=join(dir,'square.png');
  await command(ffmpeg,['-v','error','-i',ppm,'-vf','scale=360:360','-frames:v','1','-threads','1',square],signal);
  assert.equal(await buildDetailImages('data:image/jpeg;base64,'+jpeg.toString('base64'),'data:image/png;base64,'+(await readFile(square)).toString('base64'),box,signal),null);
  const invalid=edited.visual_comparisons.find(pair=>pair.after_image_ref);
  const original=await readFile(join(dir,invalid.after_image_ref));
  await writeFile(join(dir,invalid.after_image_ref),Buffer.from('invalid image'));
  const rejected=await prepareProfessionalReport(visual,edited,dir,signal);
  assert.equal(rejected.cases.find(c=>c.summary.comparison_id===invalid.comparison_id).summary.disposition,'missing_or_invalid_asset');
  await writeFile(join(dir,invalid.after_image_ref),original);
  if(process.env.WELFARELENS_TEST_PDF_BROWSER){
   await assert.rejects(renderComparisonPdf(visual,edited,dir,process.env.WELFARELENS_TEST_PDF_BROWSER,signal,dir,false,undefined,true),/Required AI illustrations failed validation/);
  }
  assert.ok(prepared.overview.markers.some(marker=>marker.labels.length>1));
  const complete=await prepareProfessionalReport(visual,generated,dir,signal);
  const view=reportViewFromPrepared(complete,{report_id:id,attempt:1});
  assert.equal(view.statistics.improvements,view.improvements.length);
  assert.ok(view.improvements.some(i=>i.comparisons.length>0));
  assert.ok(view.improvements.flatMap(i=>i.comparisons).every(c=>c.before.width===640&&c.after.height===360));
  const printable=renderProfessionalHtml(complete);
  const web=renderProfessionalHtml(await prepareProfessionalReport(visual,generated,dir,signal),undefined,[],true);
  const statistics=html=>html.match(/<section class="report-statistics">[\s\S]*?<\/section>/)?.[0];
  const expected=visual.issues.filter(issue=>issue.category==='PRIORITY_ACTION').length;
  assert.match(printable,/居家環境安全檢測結果總覽/);
  assert.equal((web.match(/<li data-label=/g)??[]).length,expected);
  assert.ok(web.includes(`<dt>需要改善</dt><dd>${expected}</dd>`));
  assert.equal(statistics(printable),statistics(web));
  assert.ok(web.includes('<dt>原始證據影格</dt><dd>1</dd>'));
  assert.doesNotMatch(statistics(printable),/危險指數|事故機率|%/);
  if(process.env.WELFARELENS_TEST_REPORT_OUTPUT){
   const output=process.env.WELFARELENS_TEST_REPORT_OUTPUT;
   await mkdir(output,{recursive:true});
   const fixtureLabel='<p>離線測試｜合成分析與測試圖片</p>';
   const labelFixture=html=>html.replace('<h2>居家環境安全檢測結果總覽</h2>', '<h2>居家環境安全檢測結果總覽</h2>'+fixtureLabel);
   await writeFile(join(output,'print-source.html'),labelFixture(printable));
   await writeFile(join(output,'web-preview.html'),labelFixture(web));
  }
  const browser=process.env.WELFARELENS_TEST_PDF_BROWSER;
  if(browser){
   const artifacts=await renderComparisonPdf(visual,generated,dir,browser,signal,dir,false,undefined,true,undefined,true,undefined,{report_id:id,attempt:1});
   const publishedView=JSON.parse(await readFile(join(dir,'report-view.json'),'utf8'));
   const pngDerivative=publishedView.improvements.flatMap(i=>i.comparisons).find(c=>c.after.webp_name)?.after;
   assert.ok(pngDerivative,'a generated PNG has a WebP derivative');
   for(const item of publishedView.improvements)for(const c of item.comparisons)for(const asset of [c.before,c.after,c.before_detail,c.after_detail]){
    if(!asset.webp_name)continue;
    const derivative=await readFile(join(dir,'html-assets',asset.webp_name));
    assert.equal(asset.webp_name,createHash('sha256').update(derivative).digest('hex')+'.webp');
    delete asset.webp_name;
   }
   assert.deepEqual(publishedView,view);
   const publishedHtml=await readFile(join(dir,'report.html'),'utf8');
   assert.match(publishedHtml,/data-webp="html-assets\/[a-f0-9]{64}\.webp"/);
   assert.match(publishedHtml,/<h1>貓咪居家環境健檢報告<\/h1>/);
   assert.equal((publishedHtml.match(/id="case-/g)??[]).length,6);
   const assetPaths=[...publishedHtml.matchAll(/src="(html-assets\/([a-f0-9]{64})\.(?:jpg|png))"/g)];
   assert.ok(assetPaths.length>=24);
   for(const [,path,hash] of assetPaths)assert.equal(sha(await readFile(join(dir,path))),hash);
   const canonical=buildWelfareLensReport(input,'complete',1000);
   const data={'report.json':canonical,'meowho-report.json':toMeowhoEnvReport(canonical),
    'visual-report.json':visual,'welfarelens-risk-objects.v1.json':generated};
   const files=['f000.jpg',...generated.visual_comparisons.map(pair=>pair.after_image_ref).filter(Boolean),...artifacts];
   for(const tamper of [false,true]){
    let saved=0,completed=false;
    const result=await processIntegrationJob(dir,{
     claim:async()=>({id:'mock-claim',attempt:1,source:'unused',requireImages:true}),
     readSource:async()=>{},
     analyze:async(_input,root)=>{
      const target=join(root,id);
      await mkdir(target,{recursive:true});
      for(const name of files)await copyFile(join(dir,name),join(target,name));
      for(const [name,value] of Object.entries(data))await writeFile(join(target,name),JSON.stringify(value));
      if(tamper)await writeFile(join(target,'after.png'),'corrupted after image');
      return {job_id:id,outcome:'completed',stages:{analysis:'completed',aggregation:'completed',editing:'generated',json:'completed',pdf:'completed'},artifacts:[...artifacts,...Object.keys(data)]};
     },
     save:async(_job,name,file)=>{
      if(name==='welfarelens-illustrations.v1.json'){
       const audit=JSON.parse(await readFile(file,'utf8'));
       assert.ok(audit.cases.filter(c=>c.disposition==='illustrated').every(c=>
        c.generation_metadata.input_sha256===hash&&c.generation_metadata.output_sha256.length===64));
      }
      saved++;
      return name;
     },
     complete:async()=>{completed=true;return true;},
     fail:async(_job,stage)=>{assert.equal(stage,'artifacts');return true;},
    });
    assert.equal(result,tamper?'failed':'ready');
    assert.equal(saved,tamper?0:4);
    assert.equal(completed,!tamper);
   }
   const reportId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',householdId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
   const prefix=`homes/${householdId}/reports/${reportId}/a2/`;
   for(const mode of ['lost_ack','upload_error','missing_image','stale']){
    const calls=[],uploads=[];
    let uploadedResult, completeBody;
    const outcome=await processMeowhoJob({
     root:dir,workerId:'mock:123',
     blob:{
      download:async(path,file)=>{assert.match(path,/\/videos\//);await copyFile('welfarelens-video-spike/samples/synthetic-room.mp4',file);},
      upload:async(path,file)=>{
       uploads.push(path);
       if(path.endsWith('result.json'))uploadedResult=JSON.parse(await readFile(file,'utf8'));
       if(mode==='upload_error'&&path.endsWith('report.pdf'))throw new MeowhoError('service_unavailable');
      },
     },
     rpc:async(name,body)=>{
      calls.push(name);
      if(name==='meow_env_claim')return {job_id:id,report_id:reportId,household_id:householdId,video_id:id,attempt:2,
       video_path:`homes/${householdId}/videos/${id}.mp4`,output_prefix:prefix,lease_until:new Date(Date.now()+60000).toISOString()};
      assert.equal(body.p_attempt,2);
      if(name==='meow_env_fail'){
       assert.equal(body.p_retryable,mode==='upload_error');return 'requeued';
      }
      assert.equal(name,'meow_env_complete');
      assert.deepEqual(uploads,[prefix+'result.json',prefix+'report.pdf']);
      if(mode==='stale')throw new MeowhoError('env_attempt_stale');
      if(!completeBody){completeBody=body;throw new MeowhoError('network');}
      assert.deepEqual(body,completeBody);return 'already_done';
     },
     analyze:async(_input,root)=>{
      const target=join(root,id);
      await mkdir(target,{recursive:true});
      for(const name of files)await copyFile(join(dir,name),join(target,name));
      for(const [name,value] of Object.entries(data))await writeFile(join(target,name),JSON.stringify(value));
      if(mode==='missing_image')await rm(join(target,generated.visual_comparisons.find(p=>p.after_image_ref).after_image_ref));
      return {job_id:id,outcome:'completed',stages:{analysis:'completed',aggregation:'completed',editing:'generated',json:'completed',pdf:'completed'},
       artifacts:[...artifacts,...Object.keys(data)],warnings:['部分影格細節不足'],model:'mock',duration:111.325,evidence:[{frame_id:'f000'}]};
     },
    });
    assert.equal(outcome,mode==='lost_ack'?'ready':mode==='stale'?'lease_lost':'failed');
    assert.equal(calls.filter(c=>c==='meow_env_complete').length,mode==='lost_ack'?2:mode==='stale'?1:0);
    if(mode==='lost_ack'){
     assert.equal(uploadedResult.report_id,reportId);
     assert.equal(uploadedResult.job_id,id);
     assert.equal(uploadedResult.schema,'meow_env_result/1');
     const output=process.env.WELFARELENS_TEST_REPORT_OUTPUT;
     if(output){
      await mkdir(join(output,'html-assets'),{recursive:true});
      for(const name of ['report.html',...new Set(assetPaths.map(match=>match[1]))]){
       await copyFile(join(dir,name),join(output,name));
      }
      await copyFile(join(dir,'before-after.pdf'),join(output,'report.pdf'));
      await writeFile(join(output,'result.json'),JSON.stringify(uploadedResult,null,2));
      await writeFile(join(output,'visual-report.json'),JSON.stringify(visual,null,2));
     }
     assert.deepEqual(uploadedResult.warnings,completeBody.p_warnings);
     assert.deepEqual(uploadedResult.items.map(({frame_index,t_s,...item})=>item),completeBody.p_items);
    }
   }
  }
  if(preview&&process.env.WELFARELENS_PDF_BROWSER){
   if(!browser)await renderComparisonPdf(visual,edited,dir,process.env.WELFARELENS_PDF_BROWSER,signal);
   const reviewDir=join(dir,'review-draft');
   await mkdir(reviewDir);
   await renderComparisonPdf(visual,edited,reviewDir,process.env.WELFARELENS_PDF_BROWSER,signal,dir,true);
  }
 }finally{if(!preview)await rm(dir,{recursive:true,force:true});}
});

test('room proposals and unreviewed room images cannot enter publication',async()=>{
 const {risk,visual}=setup();
 const prepared=await prepareProfessionalReport(visual,risk,tmpdir());
 const room={before:'data:image/jpeg;base64,BEFORE',after:'data:image/png;base64,AFTER',timestamp:0,actions:[
  {title:'床尾抓板',observation:'可見地面',instruction:'保留通道',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11383066/',kind:'optional_welfare_enrichment',region:[0.1,0.2,0.3,0.4]},
 ]};
 const published=renderProfessionalHtml(prepared,room);
 assert.doesNotMatch(published,/床尾抓板|base64,AFTER/);
 const draft=renderProfessionalHtml({...prepared,reviewDraft:true},room);
 assert.match(draft,/床尾抓板/);
 assert.match(draft,/待審閱 AI 模擬改善示意/);
 assert.match(draft,/base64,AFTER/);
 assert.match(renderProfessionalHtml({...prepared,reviewDraft:true},{...room,after:undefined}),/尚無可審閱影像/);
});


test('multi-view reports keep pending views private and include only approved views in publication',async()=>{
 const {risk,visual}=setup();
 const prepared=await prepareProfessionalReport(visual,risk,tmpdir());
 const make=(title,approved)=>({title,approved,before:'data:image/jpeg;base64,BEFORE',after:'data:image/png;base64,AFTER',timestamp:4,actions:[]});
 const views=[make('臥室提案',true),make('書桌提案',false)];
 const draft=renderProfessionalHtml({...prepared,reviewDraft:true},views);
 assert.match(draft,/臥室提案/);
 assert.match(draft,/書桌提案/);
 const published=renderProfessionalHtml(prepared,views);
 assert.match(published,/臥室提案/);
 assert.doesNotMatch(published,/書桌提案|待審閱 AI 模擬/);
});

test('room action details stay with their proposal and placement checks appear in the field checklist',async()=>{
 const {risk,visual}=setup();
 const prepared=await prepareProfessionalReport(visual,risk,tmpdir());
 const room={approved:true,before:'data:image/jpeg;base64,BEFORE',after:'data:image/png;base64,AFTER',timestamp:0,actions:[
  {title:'有遮蔽的休息處',observation:'可見床面',instruction:'放置有頂貓窩',source:'https://pmc.ncbi.nlm.nih.gov/articles/PMC11383066/',kind:'optional_welfare_enrichment',topic_id:'refuge',region:[.1,.2,.3,.4],detail:['data:image/jpeg;base64,BEFOREDETAIL','data:image/jpeg;base64,AFTERDETAIL'],placement_conditions:['核對實際床面穩固度']},
 ]};
 const html=renderProfessionalHtml(prepared,room);
 const [illustrated,checks]=html.split('04｜現場查核');
 assert.match(illustrated,/有遮蔽的休息處[\s\S]*BEFOREDETAIL[\s\S]*AFTERDETAIL/);
 assert.doesNotMatch(illustrated,/核對實際床面穩固度/);
 assert.match(checks,/核對實際床面穩固度/);
});
