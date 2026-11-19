import {loadRoomViews} from './room-views.ts';
import {buildRiskObjects,RiskObjectReportSchema} from '../../domain/risk-objects.ts';
import {imageEditConcurrency,planVisualCases,renderComparisonPdf,renderVideoAfter} from './before-after.ts';
import {editAzureImage,imageEditConfig} from '../image-edit-client.ts';
import {createReadStream} from 'node:fs';
import {lstat,realpath,mkdir,mkdtemp,writeFile,readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {resolve,join,dirname,relative,sep} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {CandidateSchema} from '../../domain/schema.ts';
import {VIDEO_MAX_BYTES} from '../../domain/video.ts';
import {VideoStore} from './store.ts';
import {runClaimedVideoScan} from './runner.ts';
import {readIssueReport} from './issues-store.ts';
import {buildWelfareLensReport,toMeowhoEnvReport} from '../../domain/welfare-report.ts';
import {buildVisualReport,VisualReportSchema} from '../../domain/visual-report.ts';

export const WorkerFixtureSchema=z.object({version:z.literal(1),provenance:z.literal('synthetic_model_fixture_not_azure'),candidate:CandidateSchema}).strict();
export async function privateRoot(root:string){
 const local=relative(process.cwd(),root).split(sep);
 if(local.some(p=>['public','src','node_modules','.next','.git'].includes(p)))throw Error('Private job root required');
 for(let p=root;;p=dirname(p)){try{if((await lstat(p)).isSymbolicLink())throw Error('Symlink job root');}catch(e){if(!e||typeof e!=='object'||!('code'in e)||e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}
 await mkdir(root,{recursive:true,mode:0o700});
}
import type {JobProfile} from './job-profile.ts';
import type {ReportViewIdentity} from './report-view-model.ts';
type Input={profile?:JobProfile;reportViewIdentity?:ReportViewIdentity;input:string;root:string;signal?:AbortSignal;pdfBrowser?:string;meowhoInput?:boolean};
export const MEOWHO_MAX_BYTES=300_000_000;
type Mode={fixture:unknown}|{live:true;allowImageEditing?:boolean;env:Record<string,string|undefined>;providerRequests?:{vlm:typeof fetch;image:typeof fetch}};
/** Fixture mode has no cloud adapter: even inherited credentials cannot trigger inference. */
export function executeFixtureJob(options:Input&{fixture:unknown}){return executeJob(options);}
export function executeLiveJob(options:Input&Extract<Mode,{live:true}>){return executeJob(options);}
export async function reprintStandaloneReport(root:string,id:string,browser:string,reviewDraft=false){
 const directory=resolve(root);
 await privateRoot(directory);
 const store=new VideoStore(directory);
 const job=await store.read(id);
 if(!['completed','partial'].includes(job.status))throw Error('Report unavailable');
 const dir=await store.directory(id);
 const visual=VisualReportSchema.parse(JSON.parse(await readFile(join(dir,'visual-report.json'),'utf8')));
 const risk=RiskObjectReportSchema.parse(JSON.parse(await readFile(join(dir,'welfarelens-risk-objects.v1.json'),'utf8')));
 if(visual.job_id!==id||risk.analysis_id!==id)throw Error('Cross-job report');
 const signal=AbortSignal.timeout(Math.max(1,job.expires_at-Date.now()));
 const rooms=await loadRoomViews(dir,risk,signal);
 const revision=await mkdtemp(join(dir,reviewDraft?'private-review-':'reviewed-'));
 const artifacts=await renderComparisonPdf(visual,risk,revision,browser,signal,dir,reviewDraft,rooms);
 return {job_id:id,revision:relative(dir,revision),artifacts,expires_at:job.expires_at};
}
async function executeJob(options:Input&Mode){
 const started=performance.now();
 const timings={inputValidationMs:0,stagingMs:0,analysisMs:0,reportAssemblyMs:0,imageEditingMs:null as number|null,pdfMs:null as number|null,totalBeforeManifestMs:0};
 const fixture='fixture' in options?WorkerFixtureSchema.parse(options.fixture):null;
 const live='live' in options?options:null;
 if(live&&(live.env.ENABLE_CLOUD_ANALYSIS!=='true'||!live.env.AZURE_OPENAI_ENDPOINT||!live.env.AZURE_OPENAI_API_KEY||!live.env.AZURE_OPENAI_DEPLOYMENT))throw Error('Live analysis is not configured');
 const edit=live?.allowImageEditing?imageEditConfig(live.env):null;
 const editConcurrency=edit?imageEditConcurrency(live?.env.WELFARELENS_IMAGE_EDIT_CONCURRENCY):undefined;
 if(edit&&!options.pdfBrowser)throw Error('Image editing requires PDF rendering');
 if(edit&&live?.env.ENABLE_IMAGE_EDITING!=='true')throw Error('Live image editing is disabled');
 const input=resolve(options.input),root=resolve(options.root);
 const maxBytes=options.meowhoInput?MEOWHO_MAX_BYTES:VIDEO_MAX_BYTES;
 const source=await lstat(input);if(!source.isFile()||source.isSymbolicLink()||source.size<1||source.size>maxBytes)throw Error('Invalid source size or type');
 if(await realpath(input)!==input)throw Error('Source must not traverse links');
 if(!relative(root,input).startsWith('..'+sep)&&relative(root,input)!=='..')throw Error('Input must be outside the disposable job root');
 timings.inputValidationMs=performance.now()-started;
 const stagingStarted=performance.now();
 await privateRoot(root);const store=new VideoStore(root,1),owner=randomBytes(32).toString('hex'),job=await store.create(owner);
 const signal=options.signal??new AbortController().signal;
 const stream=createReadStream(input),stop=()=>stream.destroy(Error('Cancelled'));signal.addEventListener('abort',stop,{once:true});
 try{signal.throwIfAborted();await store.upload(job.video_id,owner,Readable.toWeb(stream) as ReadableStream<Uint8Array>,maxBytes);}catch(e){await store.finish(job.video_id,{status:'failed',analysis_status:'failed',error:'Input copy interrupted'}).catch(()=>{});throw e;}finally{signal.removeEventListener('abort',stop);stream.destroy();}
 timings.stagingMs=performance.now()-stagingStarted;
 const analysisStarted=performance.now();
 const env=live?.env??{ENABLE_CLOUD_ANALYSIS:'false',AZURE_OPENAI_DEPLOYMENT:'fixture-not-azure',WELFARELENS_VIDEO_CONCURRENCY:'1',WELFARELENS_VIDEO_MAX_RETRIES:'0'};
 // Reuse the production core, injecting only the analyzer at its existing test seam.
 const {runVideoScan}=await import('./worker.ts');
 const experimentalMaxSeconds=options.meowhoInput||live?.env.WELFARELENS_LOCAL_LONG_VIDEO==='true'?180:undefined;
 const result=await runClaimedVideoScan(store,job.video_id,{env,signal,work:(s:VideoStore,id:string,o:Parameters<typeof runVideoScan>[2])=>runVideoScan(s,id,{...o,experimentalMaxSeconds,providerRequest:live?.providerRequests?.vlm,...(fixture?{analyze:async()=>({candidate:structuredClone(fixture.candidate),deployment:'fixture-not-azure',usage:null})}:{})})});
 timings.analysisMs=performance.now()-analysisStarted;
 const finished=await store.read(job.video_id),dir=await store.directory(job.video_id);
 const imageFailures:string[]=[];
 const manifest={schema_version:'welfarelens.local-worker.v1',job_id:job.video_id,mode:fixture?'fixture' as const:'live' as const,actual_azure:!!live&&(finished.metrics?.request_attempts??0)>0,provenance:fixture?.provenance??'azure' as const,outcome:result.outcome,expires_at:finished.expires_at,artifacts:[] as string[],evidence:[] as {frame_id:string;timestamp:number;sha256:string;path:string}[],metrics:finished.metrics??null,stages:{analysis:result.outcome,aggregation:'not_run',before_selection:'not_run',editing:'not_requested',pdf:'not_requested',json:'not_run'}};
 if(['completed','partial'].includes(result.outcome)){
  const assemblyStarted=performance.now();
  const issues=await readIssueReport(store,job.video_id,owner),canonical=buildWelfareLensReport(issues,finished.analysis_status==='complete'?'complete':'incomplete',job.created_at),visual=buildVisualReport(issues,canonical,finished);
  for(const [name,value] of Object.entries({'report.json':canonical,'visual-report.json':visual,...(canonical.analysis_status==='complete'?{'meowho-report.json':toMeowhoEnvReport(canonical)}:{}),'issues-export.json':issues})){
   await writeFile(join(dir,name),JSON.stringify(value,null,2),{flag:'wx',mode:0o600});manifest.artifacts.push(name);
  }
  for(const f of finished.frames){const name=`${f.frame_id}.jpg`,bytes=await readFile(join(dir,name));if(createHash('sha256').update(bytes).digest('hex')!==f.hash)throw Error('Evidence hash mismatch');manifest.evidence.push({frame_id:f.frame_id,timestamp:f.timestamp,sha256:f.hash,path:name});}
  manifest.stages.aggregation='completed';
  let risk=buildRiskObjects(issues,visual,manifest.evidence,manifest.provenance);
  const planned=planVisualCases(risk,visual);
  manifest.stages.before_selection=risk.visual_comparisons.length?'completed':'no_matching_evidence';
  if(edit){
   const editStarted=performance.now();
   const editSignal=AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,finished.expires_at-Date.now()))]);
   const request=live?.providerRequests?.image;
   const editor:typeof editAzureImage|undefined=request
    ?(config,bytes,prompt,size,deadline,_request,quality,mask)=>editAzureImage(config,bytes,prompt,size,deadline,request,quality,mask)
    :undefined;
   risk=await renderVideoAfter(risk,visual,dir,edit,editSignal,editor,code=>imageFailures.push(code),editConcurrency,options.profile);
   const attempts=risk.visual_comparisons.filter(p=>p.after_generation_status.status!=='not_requested');
   manifest.stages.editing=attempts.length&&attempts.every(p=>p.after_generation_status.status==='generated')?'generated':attempts.length?'failed':'no_eligible_object';
   for(const attempt of attempts)if(attempt.after_image_ref)manifest.artifacts.push(attempt.after_image_ref);
   timings.imageEditingMs=performance.now()-editStarted;
  }
  const caseAudit=planned.map(entry=>{
   const status=risk.visual_comparisons.find(pair=>pair.comparison_id===entry.comparison_id)?.after_generation_status.status;
   const reason=status==='failed'?'image_generation_failed':status==='generated'?'generated'
    :entry.reason==='selected'?(edit?'not_attempted':'editing_disabled'):entry.reason;
   return {...entry,reason};
  });
  await writeFile(join(dir,'visual-case-audit.json'),JSON.stringify({schema_version:'welfarelens.visual-case-audit.v1',job_id:job.video_id,cases:caseAudit},null,2),{flag:'wx',mode:0o600});
  manifest.artifacts.push('visual-case-audit.json');
  const riskName='welfarelens-risk-objects.v1.json';
  await writeFile(join(dir,riskName),JSON.stringify(risk,null,2),{flag:'wx',mode:0o600});
  manifest.artifacts.push(riskName);manifest.stages.json='completed';
  timings.reportAssemblyMs=performance.now()-assemblyStarted-(timings.imageEditingMs??0);
  if(options.pdfBrowser){
   const pdfStarted=performance.now();
   try{manifest.artifacts.push(...await renderComparisonPdf(visual,risk,dir,options.pdfBrowser,signal,dir,false,undefined,!!edit,undefined,options.meowhoInput===true&&live?.env.WELFARELENS_PRIVATE_HTML==='true',options.profile,options.reportViewIdentity));manifest.stages.pdf='completed';}
   catch{manifest.stages.pdf=signal.aborted?'cancelled':'failed';}
   finally{timings.pdfMs=performance.now()-pdfStarted;}
  }
 }
 timings.totalBeforeManifestMs=performance.now()-started;
 const bundle={...manifest,timings,diagnostics:finished.diagnostics,warnings:finished.warning??[],model:finished.model,duration:finished.metadata?.duration,imageFailures};
 options.profile?.analysis(bundle.metrics,bundle.diagnostics,bundle.timings);
 await writeFile(join(dir,'bundle.json'),JSON.stringify(bundle,null,2),{flag:'wx',mode:0o600});
 return bundle;
}

export type StandaloneBundle=Awaited<ReturnType<typeof executeJob>>;

export function standaloneSucceeded(bundle:StandaloneBundle,requirePdf:boolean){
 return ['completed','partial'].includes(bundle.outcome)
  && bundle.stages.json==='completed'
  && (!requirePdf||(bundle.stages.pdf==='completed'&&bundle.artifacts.includes('before-after.pdf')));
}
