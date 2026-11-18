import {readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {VideoStore} from './store.ts';
import {probeVideo,extractVideo,extractPhoto,plantCrop} from './media.ts';
import {createAnalyzeHandler} from '../azure.ts';
import {CandidateSchema} from '../../domain/schema.ts';
import type {Candidate} from '../../domain/schema.ts';
import {needsPlantRefinement,mergePlantRefinement} from '../../domain/plant-refinement.ts';
import {buildScanResult} from '../../domain/scan-result.ts';
import {eventsFromFrames} from '../../domain/video.ts';
import type {VideoJob} from '../../domain/video.ts';
import {writeIssueSnapshot} from './issues-store.ts';
import {createAuditFetch} from './audit.ts';
import {createRetryFetch} from './retry.ts';
type ModelResult={candidate:Candidate;deployment:string;usage:{prompt_tokens:number;completion_tokens:number}|null};
export async function analyzeVideoImage(image:string,plant:boolean,env:Record<string,string|undefined>,signal:AbortSignal,request:typeof fetch=fetch):Promise<ModelResult>{
 const handler=createAnalyzeHandler(env,request,120000,true);
 const response=await handler(new Request('http://127.0.0.1:3100/api/analyze',{method:'POST',headers:{origin:'http://127.0.0.1:3100','content-type':'application/json'},body:JSON.stringify({consent:true,imageDataUrl:image,...(plant?{refinement:'plant'}:{})}),signal}));
 const result=await response.json();if(!response.ok)throw Error(['credentials','quota','timeout','invalid_output','disabled','configuration'].includes(result.code)?result.code:'provider_unavailable');
 return {candidate:CandidateSchema.parse(result.candidate),usage:result.usage,deployment:result.deployment};
}
export async function runVideoScan(store:VideoStore,id:string,options:{env:Record<string,string|undefined>;signal:AbortSignal;analyze?:typeof analyzeVideoImage;experimentalMaxSeconds?:number}){
 const begin=performance.now(),cpuStart=process.cpuUsage(),dir=await store.directory(id),input=join(dir,'original.bin'),signal=options.signal;
 // Existing two-call ceiling remains the safe default; operators may reduce it for quota pressure.
 const concurrency=options.env.WELFARELENS_VIDEO_CONCURRENCY==='1'?1:2;
 const metrics={extractionMs:0,inferenceMs:0,totalMs:0,calls:0,request_attempts:0,sampledFrames:0,analyzedFrames:0,prompt_tokens:0,completion_tokens:0,failedFrames:0,refinementFailures:0,retry_count:0,estimated_api_cost:null,sceneMs:0,plantMs:0,cropWorkMs:0,aggregationMs:0,finalizationMs:0,maxActiveCalls:0,concurrency,cpuUserMs:0,cpuSystemMs:0,sampledPeakRssMb:process.memoryUsage().rss/1048576};
 let activeCalls=0;
 function sampleResources(){const cpu=process.cpuUsage(cpuStart);metrics.cpuUserMs=cpu.user/1000;metrics.cpuSystemMs=cpu.system/1000;metrics.sampledPeakRssMb=Math.max(metrics.sampledPeakRssMb,process.memoryUsage().rss/1048576);}
 const warnings:string[]=[],logs:NonNullable<VideoJob['diagnostics']>=[];
 let deployment=options.env.AZURE_OPENAI_DEPLOYMENT||'',fatal:string|null=null;
 const serviceErrors:Record<string,string>={audit_failed:'診斷紀錄無法保存，已停止新分析；已送出的請求仍可能計費。',credentials:'Azure 憑證或部署存取失敗，請檢查伺服器設定後重新掃描。',configuration:'Azure 部署設定尚未就緒，請檢查伺服器設定。',disabled:'Azure 分析尚未開放。',quota:'Azure 配額或速率限制，請稍後重試。',timeout:'Azure 回應逾時，可以重新嘗試；已送出的請求可能仍會計費。',provider_unavailable:'Azure 服務暫時無法使用，請稍後重試。',invalid_output:'Azure 回傳資料無法驗證，請重新嘗試。'};
 async function progress(stage:string){
  try{await store.update(id,{stage});}catch(e){
   signal.throwIfAborted();const code=e&&typeof e==='object'&&'code'in e?String(e.code):'';
   if(!['EPERM','EBUSY','EACCES'].includes(code))throw e;
   // Progress is ancillary; retain valid observations if the journal remains readable.
   await store.read(id);console.warn(JSON.stringify({job_id:id,processing_stage:'progress',error_type:code}));
  }
 }
 async function settle(work:Promise<void>[]){const all=await Promise.allSettled(work);for(const result of all)if(result.status==='rejected')throw result.reason;}
 const analyze=async(image:string,plant:boolean,frameId:string,timestamp:number,objectIndex:number|null=null,queueWait=0)=>{
  signal.throwIfAborted();if(fatal)throw Error(fatal);metrics.calls++;activeCalls++;metrics.maxActiveCalls=Math.max(metrics.maxActiveCalls,activeCalls);sampleResources();const call=metrics.calls,started=performance.now();let auditFailed=false;
  try{
   const recorded=createAuditFetch(store,id,{call,stage:plant?'plant_recheck':'scene',frame_id:frameId,timestamp,object_index:objectIndex});
   const configuredRetries=Number(options.env.WELFARELENS_VIDEO_MAX_RETRIES??2);
   const retrying=createRetryFetch(recorded,{maxRetries:configuredRetries,onAttempt:attempt=>{metrics.request_attempts++;if(attempt)metrics.retry_count++;}});
   const request:typeof fetch=async(...args)=>{try{return await retrying(...args);}catch(e){if(e instanceof Error&&e.message==='audit_failed')auditFailed=true;throw e;}};
   const result=await (options.analyze??analyzeVideoImage)(image,plant,options.env,signal,request);
   if(auditFailed)throw Error('audit_failed');
   metrics.prompt_tokens+=result.usage?.prompt_tokens??0;metrics.completion_tokens+=result.usage?.completion_tokens??0;deployment=result.deployment;
   logs.push({frame_id:frameId,processing_stage:plant?'plant_recheck':'scene',inference_latency:performance.now()-started,queue_wait_ms:queueWait,error_type:null,token_usage:result.usage});return result.candidate;
  }catch(e){
   if(auditFailed){fatal='audit_failed';e=Error('audit_failed');}
   const code=e instanceof Error&&['credentials','configuration','disabled','quota','timeout','invalid_output','provider_unavailable'].includes(e.message)?e.message as NonNullable<VideoJob['diagnostics']>[number]['error_type']:'analysis_failed';
   logs.push({frame_id:frameId,processing_stage:plant?'plant_recheck':'scene',inference_latency:performance.now()-started,queue_wait_ms:queueWait,error_type:code,token_usage:null});throw e;
  }finally{activeCalls--;sampleResources();}
 };
 try{
  const j=await store.read(id);if(j.status!=='queued')throw Error('state');
  await store.update(id,{status:'processing',worker_pid:process.pid,stage:'驗證影片與選取清晰影格'});
  const extractionStart=performance.now();const prepared=j.input_kind==='photo'?await extractPhoto(input,dir,signal):null;const metadata=prepared?.metadata??await probeVideo(input,signal,options.experimentalMaxSeconds),frames=prepared?.frames??await extractVideo(input,dir,metadata.duration,signal);metrics.extractionMs=performance.now()-extractionStart;metrics.sampledFrames=frames.length;
  await store.update(id,{metadata,frames,stage:`AI 分析 ${frames.length} 個時間點`});
  const start=performance.now(),results=new Map<string,Promise<Candidate>>(),candidates=new Map<string,Candidate>(),initialCandidates=new Map<string,Candidate>();
  let cursor=0,done=0,usable=0,adequate=0;
  async function frameWorker(){while(cursor<frames.length&&!fatal){
   signal.throwIfAborted();const f=frames[cursor++],queueWait=performance.now()-start;
   try{
    let pending=results.get(f.hash);
    if(!pending){pending=(async()=>{
     const bytes=await readFile(join(dir,`${f.frame_id}.jpg`));if(bytes.length>1100000)throw Error('image_size');
     return analyze(`data:image/jpeg;base64,${bytes.toString('base64')}`,false,f.frame_id,f.timestamp,null,queueWait);
    })();results.set(f.hash,pending);}
    const candidate=CandidateSchema.parse(await pending);metrics.analyzedFrames++;candidates.set(f.frame_id,candidate);initialCandidates.set(f.frame_id,candidate);
    if(candidate.image_quality==='unusable'){warnings.push('部分影格過暗、模糊或無法判讀，不代表沒有風險。');}else{usable++;if(candidate.image_quality==='adequate')adequate++;if(candidate.image_quality==='limited')warnings.push('部分影格細節不足，結果僅限可見資訊。');}
   }catch(e){signal.throwIfAborted();metrics.failedFrames++;if(e instanceof Error&&serviceErrors[e.message]){if(['audit_failed','credentials','configuration','disabled','quota'].includes(e.message))fatal=e.message;warnings.push(serviceErrors[e.message]);}warnings.push('部分時間點的 AI 分析未完成，不代表沒有風險。');}
   done++;await progress(`AI 已分析 ${done}／${frames.length} 個時間點`);
  }}
  await settle(Array.from({length:concurrency},()=>frameWorker()));signal.throwIfAborted();metrics.sceneMs=performance.now()-start;sampleResources();
  // Observe all sampled views before spending detail budget; prioritize clearer botanical evidence.
  const taskKeys=new Set<string>();
  const tasks=frames.flatMap(f=>{
   const c=candidates.get(f.frame_id);if(!c||c.image_quality==='unusable')return [];
   return needsPlantRefinement(c).flatMap(index=>{
    const key=`${f.hash}:${index}`;if(taskKeys.has(key))return [];taskKeys.add(key);
    const p=c.plants?.find(p=>p.object_index===index),high=buildScanResult(c).plants.find(p=>p.object_index===index)?.highConcern;
    return [{f,index,score:(high?10000:0)+(p?.identification_quality==='adequate'?2000:0)+(c.image_quality==='adequate'?1000:0)+f.sharpness}];
   });
  }).sort((a,b)=>b.score-a.score);
  if(tasks.length>6)warnings.push('部分植物仍待辨識；本次細節分析已達資源上限，未判定為安全。');
  const details=tasks.slice(0,6),plantStart=performance.now();let detailCursor=0,detailDone=0;
  await progress(details.length?'正在確認植物候選':'正在整合改善建議');
  async function detailWorker(){while(detailCursor<details.length&&!fatal){
   signal.throwIfAborted();const {f,index}=details[detailCursor++],queueWait=performance.now()-plantStart;
   try{const c=candidates.get(f.frame_id)!,cropStart=performance.now();let crop:string;try{crop=await plantCrop(input,f.timestamp,c.objects[index].bbox,dir,Number(f.frame_id.slice(1))*100+index,signal,j.input_kind==='photo');}finally{metrics.cropWorkMs+=performance.now()-cropStart;}const detail=await analyze(crop,true,f.frame_id,f.timestamp,index,queueWait);const refined=mergePlantRefinement(candidates.get(f.frame_id)!,index,detail);for(const same of frames.filter(x=>x.hash===f.hash))candidates.set(same.frame_id,refined);}
   catch(e){signal.throwIfAborted();metrics.refinementFailures++;if(e instanceof Error&&serviceErrors[e.message]){if(['audit_failed','credentials','configuration','disabled','quota'].includes(e.message))fatal=e.message;warnings.push(serviceErrors[e.message]);}warnings.push('部分植物細節辨識未完成，保留候選與不確定性。');}
   detailDone++;await progress(`植物細節已分析 ${detailDone}／${details.length}`);
  }}
  await settle(Array.from({length:concurrency},()=>detailWorker()));signal.throwIfAborted();metrics.plantMs=performance.now()-plantStart;metrics.inferenceMs=performance.now()-start;
  await progress('正在整合改善建議');const aggregationStart=performance.now();
  const observed=frames.flatMap(f=>{const c=candidates.get(f.frame_id);return c?[{...f,actions:buildScanResult(c).actions}]:[];});
  const events=eventsFromFrames(id,observed,deployment);
  // Preserve validated before/after candidates privately; old public events contract is unchanged.
  let snapshotSaved=false;
  try{
   await writeIssueSnapshot(store,id,frames.flatMap(frame=>{const candidate=candidates.get(frame.frame_id);return candidate?[{frame,candidate,initial_candidate:initialCandidates.get(frame.frame_id)}]:[];}),events,signal,deployment);
   snapshotSaved=true;
  }catch{
   signal.throwIfAborted();warnings.push('問題整合資料未完成；仍保留原始事件，可查看逐筆證據。');
  }
  metrics.aggregationMs=performance.now()-aggregationStart;const finalizationStart=performance.now();
  if(events.some(e=>e.identification_status==='unknown'))warnings.push('植物候選尚未定種，不能當作已確認有毒或無毒。');
  const keep=new Set(events.flatMap(e=>e.evidence_frames.map(f=>f.frame_id))),kept=frames.filter(f=>keep.has(f.frame_id));
  // Keep only event evidence after report; remove other whole-room frames and original immediately.
  for(const name of await readdir(dir))if(/^(?:f\d{3}\.jpg|plant-\d+\.jpg)$/.test(name)&&options.env.WELFARELENS_VIDEO_ACCEPTANCE_ONCE!=='true'&&!keep.has(name.slice(0,-4)))await rm(join(dir,name),{force:true});
  metrics.finalizationMs=performance.now()-finalizationStart;metrics.totalMs=performance.now()-begin;sampleResources();
  signal.throwIfAborted();
  // Every sampled time point must be usable, with at least one adequate view.
  const complete=usable===frames.length&&adequate>0&&snapshotSaved&&fatal!=='audit_failed';
  const status=usable===0?'failed':complete?'completed':'partial';
  await store.finish(id,{status,analysis_status:status==='failed'?'failed':status==='partial'?'incomplete':'complete',stage:status==='failed'?'分析未完成':status==='partial'?'部分分析完成':'分析完成',events,frames:kept,model:deployment,warning:[...new Set(warnings)],error:status==='failed'?(fatal?serviceErrors[fatal]:'AI 未能完成可用分析，請稍後重新掃描。'):null,metrics,diagnostics:logs});
 }catch(error){
  metrics.totalMs=performance.now()-begin;
  const code=error&&typeof error==='object'&&'code'in error?String(error.code):'';
  const errorType=signal.aborted?'cancelled':error instanceof Error&&error.name==='ZodError'?'contract':['EPERM','EACCES','EBUSY','ENOENT'].includes(code)?`filesystem_${code}`:'worker_failure';
  console.error(JSON.stringify({job_id:id,processing_stage:'worker',error_type:errorType}));
  await store.finish(id,{status:'failed',analysis_status:'failed',stage:'處理未完成',error:error instanceof Error&&serviceErrors[error.message]?serviceErrors[error.message]:'影片無法處理、服務未就緒或工作逾時；請確認 MP4／MOV、90 秒及 120 MiB 限制後重新掃描。',worker_error:errorType,metrics,diagnostics:logs}).catch(()=>{});
 }finally{
  // Fixed metadata only; no images, prompts, raw model output, credentials or filenames.
  if(await store.isCancelled(id).catch(()=>true))await rm(input,{force:true}).catch(()=>{});
  console.info(JSON.stringify({job_id:id,video_id:id,processing_stage:'finished',frame_count:metrics.sampledFrames,model:deployment,retry_count:metrics.retry_count,metrics,calls:logs}));
 }
}
