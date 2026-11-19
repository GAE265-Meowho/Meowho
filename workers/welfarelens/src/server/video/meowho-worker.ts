import {JobProfile} from './job-profile.ts';
import {stat, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {processIntegrationJob} from './integration-job.ts';
import {executeLiveJob, MEOWHO_MAX_BYTES} from './standalone.ts';
import {probeVideo} from './media.ts';
import {buildMeowhoItemProposals,MeowhoHazardKeySchema} from '../../domain/meowho-hazards.ts';
import {createMeowhoEvidenceCrop} from './meowho-crop.ts';
import {uploadReportHtml} from './report-html-assets.ts';

const ClaimSchema=z.object({
 job_id:z.uuid(), report_id:z.uuid(), household_id:z.uuid(), video_id:z.uuid(), attempt:z.number().int().min(1).max(3),
 video_path:z.string(), output_prefix:z.string(), lease_until:z.iso.datetime({offset:true}),
}).refine(j=>{
 const videoBase=`homes/${j.household_id}/videos/${j.video_id}`;
 return (j.video_path===videoBase+'.mp4'||j.video_path===videoBase+'.mov')
  && j.output_prefix===`homes/${j.household_id}/reports/${j.report_id}/a${j.attempt}/`;
});
const Item=z.object({
 key:MeowhoHazardKeySchema,label:z.string().min(1).max(20),
 level:z.enum(['high','medium','low']),note:z.string().max(200),crop_path:z.string().nullable(),
}).strict();
const Warning=z.object({code:z.string().regex(/^[a-zA-Z0-9_]{1,40}$/),message:z.string().min(1).max(100)}).strict();
export const MeowhoResultSchema=z.object({
 schema:z.literal('meow_env_result/1'),job_id:z.uuid(),report_id:z.uuid(),attempt:z.number().int().min(1).max(3),
 worker:z.object({id:z.string().min(1),version:z.string().min(1)}),
 model:z.object({name:z.string().min(1),version:z.string().min(1)}),
 video:z.object({duration_s:z.number().positive().max(180),frames:z.number().int().min(1).max(8)}),
 summary:z.string().max(2000),items:z.array(Item.extend({frame_index:z.number().int().min(0).max(7),t_s:z.number().nonnegative()}).strict()).max(30),
 warnings:z.array(Warning).max(10),created_at:z.iso.datetime(),
}).strict();
type Canonical=z.infer<typeof import('../../domain/welfare-report.ts').WelfareLensReportV1Schema>;
type Bundle=Awaited<ReturnType<typeof executeLiveJob>>;
export function buildMeowhoResult(options:{
 jobId:string;reportId:string;attempt:number;workerId:string;modelVersion:string;bundle:Bundle;
 canonical:Canonical;summary:string;publication:Pick<Awaited<ReturnType<typeof prepareMeowhoItems>>,'items'|'warnings'>;
}){
 const {bundle,canonical,publication}=options;
 const result=MeowhoResultSchema.parse({schema:'meow_env_result/1',job_id:options.jobId,report_id:options.reportId,attempt:options.attempt,
  worker:{id:options.workerId,version:'welfarelens 0.4.0'},model:{name:bundle.model,version:options.modelVersion},
  video:{duration_s:bundle.duration,frames:bundle.evidence.length},summary:options.summary,items:publication.items,warnings:publication.warnings,
  created_at:new Date(canonical.generated_at).toISOString()});
 if(new Set(result.items.map(item=>item.key)).size!==result.items.length)throw new MeowhoError('result_invalid');
 return result;
}
export async function prepareMeowhoItems(options:{canonical:Canonical;bundle:Bundle;directory:string;outputPrefix:string;signal:AbortSignal;
 upload:(path:string,file:string,contentType:string,signal:AbortSignal)=>Promise<void>;ensure:()=>void}){
 const {canonical,bundle,directory,outputPrefix,signal,upload,ensure}=options;
 const warnings=(bundle.warnings??[]).slice(0,8).map(message=>({code:'analysis_warning',message:message.slice(0,100)}));
 const frameIndexById=new Map(bundle.evidence.map((frame,index)=>[frame.frame_id,index]));
 const {items:proposals,unmappedIssueKeys}=buildMeowhoItemProposals(canonical,frameIndexById);
 if(unmappedIssueKeys.length)warnings.push({code:'topics_not_mapped',message:`${unmappedIssueKeys.length} 項其他觀察或照護主題保留於完整報告，未列為共用危險項目。`});
 const items=[];
 for(const proposal of proposals){
  let cropPath:string|null=null;
  let evidenceFrameIndex=proposal.frame_index,evidenceTime=proposal.t_s;
  let cropFailed=false;
  for(const observationId of proposal.crop_observation_ids){
   const observation=canonical.observations.find(o=>o.observation_id===observationId);
   const frame=bundle.evidence.find(f=>f.frame_id===observation?.frame_id&&f.timestamp===observation.timestamp);
   if(!observation||!frame)continue;
   try{
    const localPath=join(directory,'crops',`${proposal.key}.jpg`);
    const crop=await createMeowhoEvidenceCrop({directory,observation,
     frame:{frame_id:frame.frame_id,timestamp:frame.timestamp,sha256:frame.sha256,path:frame.path},destination:localPath,signal});
    if(!crop)continue;
    const path=`${outputPrefix}crops/${proposal.key}.jpg`;
    ensure();await upload(path,localPath,'image/jpeg',signal);cropPath=path;
    evidenceFrameIndex=frameIndexById.get(frame.frame_id)??proposal.frame_index;evidenceTime=frame.timestamp;
    break;
   }catch(error){
    ensure();
    if(error instanceof MeowhoError&&lostCodes.has(error.code))throw error;
    cropFailed=true;
   }
  }
  if(proposal.crop_observation_ids.length&&cropPath===null&&warnings.length<10){
   warnings.push({code:'crop_unavailable',message:cropFailed?`${proposal.label} 的 AI 估計裁切未能保存；保留原始證據時間。`:`${proposal.label} 的候選範圍過小或不完整，未發布裁切圖；保留原始證據時間。`});
  }
  const disclosure=cropPath?'；裁切為 AI 估計範圍，僅供定位參考。':'';
  items.push({key:proposal.key,label:proposal.label,level:proposal.level,
   note:(proposal.note.slice(0,Math.max(0,200-disclosure.length))+disclosure).slice(0,200),crop_path:cropPath,
   frame_index:evidenceFrameIndex,t_s:evidenceTime});
 }
 return {items,warnings,unmappedIssueKeys};
}

const lostCodes=new Set(['env_job_not_found','env_attempt_stale','env_lease_expired','env_job_canceled','env_job_not_running']);
const retryable=new Set(['network','rate_limited','service_unavailable','timeout']);
const failureCodes=new Set([...retryable,'video_format','video_too_long','video_too_large','video_unreadable','source_invalid','config_error','permission_denied','result_invalid']);
export class MeowhoError extends Error {
 readonly code:string;
 constructor(code:string){super(code);this.code=code;}
}
type Rpc=(name:string,body:Record<string,unknown>,signal:AbortSignal)=>Promise<unknown>;
export type BlobPort={
 download(path:string,file:string,signal:AbortSignal):Promise<void>;
 upload(path:string,file:string,contentType:string,signal:AbortSignal):Promise<void>;
};
export function meowhoRpc(url:string,key:string,send=fetch):Rpc{
 const base=new URL(url);
 if(base.protocol!=='https:'||base.username||base.password||!key)throw new MeowhoError('config_error');
 return async(name,body,signal)=>{
  let response:Response;
  try{
   response=await send(new URL(`/rest/v1/rpc/${name}`,base),{
    method:'POST',redirect:'error',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.any([signal,AbortSignal.timeout(15000)]),
   });
  }catch(error){throw new MeowhoError(signal.aborted?'env_lease_expired':error instanceof Error&&error.name==='TimeoutError'?'timeout':'network');}
  const data=await response.json().catch(()=>undefined);
  if(!response.ok){
   const message=data?.message;
   if(lostCodes.has(message)||message==='env_result_invalid')throw new MeowhoError(message);
   throw new MeowhoError(response.status===429?'rate_limited':response.status>=500?'service_unavailable':
    [401,403].includes(response.status)?'permission_denied':'config_error');
  }
  if(data===undefined)throw new MeowhoError('network');
  return data;
 };
}

export function readMeowhoQueueWait(url:string,key:string,send=fetch){
 const base=new URL(url);
 return async(jobId:string,signal:AbortSignal)=>{
  try{
   const target=new URL('/rest/v1/meow_env_jobs',base);
   target.search=new URLSearchParams({id:'eq.'+jobId,attempt:'eq.1',select:'queued_at,started_at',limit:'1'}).toString();
   const response=await send(target,{redirect:'error',headers:{apikey:key,authorization:'Bearer '+key},
    signal:AbortSignal.any([signal,AbortSignal.timeout(2000)])});
   if(!response.ok){void response.body?.cancel().catch(()=>{});return null;}
   const [row]=z.array(z.object({queued_at:z.string(),started_at:z.string()})).max(1).parse(await response.json());
   const elapsed=Date.parse(row?.started_at)-Date.parse(row?.queued_at);
   return Number.isFinite(elapsed)&&elapsed>=0?elapsed:null;
  }catch{return null;}
 };
}

type Analyze=Parameters<typeof processIntegrationJob>[1]['analyze'];
export async function processMeowhoJob(options:{
 root:string; workerId:string; rpc:Rpc; blob:BlobPort; env?:NodeJS.ProcessEnv;
 signal?:AbortSignal; heartbeatMs?:number;
 queueWait?:(jobId:string,signal:AbortSignal)=>Promise<number|null>;
 onProfile?:(profile:ReturnType<JobProfile['snapshot']>)=>void;
 analyze?:(input:string,root:string,signal:AbortSignal)=>ReturnType<Analyze>;
}){
 const {rpc,blob}=options, controller=new AbortController();
 const profile=new JobProfile();
 let outcome='error';
 let queueWait:Promise<void>|undefined;
 const upload:BlobPort['upload']=(...args)=>profile.measure('upload',()=>blob.upload(...args));
 const signal=AbortSignal.any([controller.signal,...(options.signal?[options.signal]:[])]);
 const heartbeatMs=Math.min(180000,Math.max(1,options.heartbeatMs??120000));
 let claim:z.infer<typeof ClaimSchema>, expiry=0, step='download', ending=false;
 let heartbeat:ReturnType<typeof setTimeout>|undefined, deadline:ReturnType<typeof setTimeout>|undefined;
 let renewal:Promise<void>|undefined;
 const owns=()=>!signal.aborted&&Date.now()<expiry;
 const ensure=()=>{if(!owns())throw new MeowhoError('env_lease_expired');};
 const rpcIds=()=>({p_job:claim.job_id,p_attempt:claim.attempt});
 function setExpiry(value:string){
  expiry=Date.parse(value);
  clearTimeout(deadline);
  deadline=setTimeout(()=>controller.abort(),Math.max(0,expiry-Date.now()));
 }
 function schedule(){
  if(ending||!owns())return;
  heartbeat=setTimeout(()=>{
   renewal=(async()=>{
    try{
     ensure();
     const result=await profile.measure('renew',()=>rpc('meow_env_renew',{...rpcIds(),p_step:step},signal));
     ensure();
     setExpiry(z.iso.datetime({offset:true}).parse(result));
    }catch{controller.abort();}
    schedule();
   })();
  },heartbeatMs);
 }
 async function finish(name:'meow_env_complete'|'meow_env_fail',body:Record<string,unknown>):Promise<boolean>{
  ending=true;clearTimeout(heartbeat);
  await renewal;
  if(!owns())return false;
  const accepted=name==='meow_env_complete'?['done','already_done']:['failed','requeued'];
  for(let attempt=0;attempt<2;attempt++){
   try{return accepted.includes(String(await profile.measure(name==='meow_env_complete'?'complete':'fail',()=>rpc(name,{...rpcIds(),...body},signal))));}
   catch(error){
    if(!(error instanceof MeowhoError))throw error;
    if(lostCodes.has(error.code))return false;
    if(name==='meow_env_complete'&&error.code==='env_result_invalid'){
     await finish('meow_env_fail',{p_code:'result_invalid',p_detail:'Publication payload rejected',p_retryable:false});
     return false;
    }
    if(attempt===1||!owns()||!retryable.has(error.code))throw error;
   }
  }
  return false;
 }
 try{
  outcome=await processIntegrationJob(options.root,{
   async claim(){
    const result=await profile.measure('claim',()=>rpc('meow_env_claim',{p_worker:options.workerId},signal));
    if(result===null)return undefined;
    claim=ClaimSchema.parse(result);
    profile.claimed();
    if(claim.attempt===1&&options.queueWait)queueWait=options.queueWait(claim.job_id,signal).then(ms=>profile.queuedFor(ms),()=>{});
    setExpiry(claim.lease_until);schedule();
    return {id:claim.job_id,source:claim.video_path,attempt:claim.attempt,requireImages:true};
   },
   async readSource(job,destination){
    ensure();await profile.measure('source_download',()=>blob.download(job.source,destination,signal));
    const {size}=await stat(destination);
    if(size>MEOWHO_MAX_BYTES)throw new MeowhoError('video_too_large');
    if(!size)throw new MeowhoError('video_unreadable');
    await profile.measure('source_probe',()=>probeVideo(destination,signal,180)).catch(error=>{
     const code=error?.code;
     throw new MeowhoError(code==='video_too_long'||code==='video_format'?code:'video_unreadable');
    });
   },
   async analyze(input,root){
    ensure();step='analysis';
    if(options.analyze)return options.analyze(input,root,signal);
    const env=options.env??process.env;
    if(!env.WELFARELENS_PDF_BROWSER||env.ENABLE_IMAGE_EDITING!=='true')throw new MeowhoError('config_error');
    return executeLiveJob({input,root,profile,signal,meowhoInput:true,live:true,env,allowImageEditing:true,pdfBrowser:env.WELFARELENS_PDF_BROWSER,
     reportViewIdentity:env.WELFARELENS_PRIVATE_REPORT_VIEW==='true'?{report_id:claim.report_id,attempt:claim.attempt}:undefined});
   },
   async preparePublication(_job,dir,bundle,canonical,summary){
    ensure();step='upload';
    const {items,warnings}=await prepareMeowhoItems({canonical,bundle,directory:dir,outputPrefix:claim.output_prefix,signal,
     upload,ensure});
    const result=buildMeowhoResult({jobId:claim.job_id,reportId:claim.report_id,attempt:claim.attempt,workerId:options.workerId,
     modelVersion:options.env?.WELFARELENS_MODEL_VERSION??'unknown',bundle,canonical,summary,publication:{items,warnings}});
    const jsonFile=join(dir,'result.json'),jsonPath=claim.output_prefix+'result.json',pdfPath=claim.output_prefix+'report.pdf';
    await profile.measure('json_generate',()=>writeFile(jsonFile,JSON.stringify(result),{flag:'wx',mode:0o600}));
    // Keep the exact payload for idempotent acknowledgement retry.
    const body={p_summary:result.summary,p_items:result.items.map(({frame_index,t_s,...item})=>item),
     p_warnings:result.warnings,p_json_path:jsonPath,p_pdf_path:pdfPath};
    ensure();await upload(jsonPath,jsonFile,'application/json',signal);
    ensure();await upload(pdfPath,join(dir,'before-after.pdf'),'application/pdf',signal);
    if((options.env??process.env).WELFARELENS_PRIVATE_HTML==='true'){
     const htmlSignal=AbortSignal.any([signal,AbortSignal.timeout(45_000)]);
     try{
      await uploadReportHtml(dir,claim.output_prefix,(path,file,mime)=>{
       ensure();htmlSignal.throwIfAborted();
       return upload(path,file,mime,htmlSignal);
      },(options.env??process.env).WELFARELENS_PRIVATE_REPORT_VIEW==='true');
     }catch{console.warn('welfarelens: optional HTML upload unavailable');}
    }
    ensure();
    return ()=>finish('meow_env_complete',body);
   },
   async fail(_job,stage,error){
    if(!owns())return false;
    const observed=error as {code?:string;diagnostics?:{error_type:string|null}[]};
    const errors=new Set(observed?.diagnostics?.map(entry=>entry.error_type));
    const code=observed?.code??'';
    const mapped=failureCodes.has(code)?code:errors.has('credentials')?'permission_denied':
     errors.has('quota')?'rate_limited':errors.has('timeout')?'timeout':errors.has('provider_unavailable')?'service_unavailable':
     errors.has('configuration')||errors.has('disabled')?'config_error':stage==='analysis'&&!observed?.diagnostics?'config_error':'result_invalid';
    return finish('meow_env_fail',{p_code:mapped,p_detail:`${stage}: ${mapped}`,p_retryable:retryable.has(mapped)&&claim.attempt<3});
   },
   async save(){throw new MeowhoError('config_error');},
   async complete(){throw new MeowhoError('config_error');},
  },profile);
  return outcome;
 }finally{
  ending=true;clearTimeout(heartbeat);clearTimeout(deadline);
  await queueWait;
  controller.abort();
  await renewal;
  if(outcome!=='idle')options.onProfile?.(profile.snapshot(outcome));
 }
}
