import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { editAzureImage, imageEditConfig } from '../src/server/image-edit-client.ts';
import { BenchmarkConfig, ControlledImageApproval, ControlledImageDeployment, controlledConcurrencyOrder, openControlledImageRun } from '../src/server/video/benchmark-guard.ts';
import { runImageEditPool } from '../src/server/video/image-edit-pool.ts';
import { command } from '../src/server/video/media.ts';

const hash = (value:Buffer|string) => createHash('sha256').update(value).digest('hex');
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const requestParameters = {apiVersion:'v1',size:'auto',quality:'high',n:1,format:'png',
  mime:'image/jpeg',filename:'room.jpg',timeoutMs:180000} as const;
export const FrozenImageManifest = z.object({
  schema:z.literal('welfarelens.controlled-image/v1'),
  sourceRevision:BenchmarkConfig.shape.commit,
  sourceDigest:digest,
  pilotJournalSha256:sha,
  priorReservedUsdMicros:z.literal(16_250_000),
  image:ControlledImageDeployment,
  request:z.object({
    apiVersion:z.literal(requestParameters.apiVersion),size:z.literal(requestParameters.size),
    quality:z.literal(requestParameters.quality),n:z.literal(requestParameters.n),format:z.literal(requestParameters.format),
    mime:z.literal(requestParameters.mime),filename:z.literal(requestParameters.filename),timeoutMs:z.literal(requestParameters.timeoutMs),
  }).strict(),
  cases:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9-]{1,128}$/),
    frame:z.string().regex(/^f\d{3}$/),prompt:z.string().min(1).max(16000),promptSha256:sha,inputSha256:sha,
  }).strict()).length(6),
}).strict().refine(x=>new Set(x.cases.map(c=>c.id)).size===6,'Duplicate case ID');
type Manifest = z.infer<typeof FrozenImageManifest>;

export async function readPrivateFile(path:string,maxBytes:number){
  const info=await lstat(path);
  if(!info.isFile()||info.isSymbolicLink()||info.size>maxBytes)throw Error('benchmark_private_file');
  return readFile(path);
}

export async function loadFrozenImages(directory:string) {
  const raw=await readPrivateFile(join(directory,'manifest.json'),160_000);
  const manifest=FrozenImageManifest.parse(JSON.parse(raw.toString('utf8')));
  const inputs=await Promise.all(manifest.cases.map(async c=>{
    if(hash(c.prompt)!==c.promptSha256)throw Error('benchmark_frozen_prompt');
    const input=await readPrivateFile(join(directory,c.inputSha256+'.jpg'),20_000_000);
    if(hash(input)!==c.inputSha256)throw Error('benchmark_frozen_image');
    return input;
  }));
  return {manifest,sha256:hash(raw),inputs};
}

type Frozen = Awaited<ReturnType<typeof loadFrozenImages>>;
type Approval = z.infer<typeof ControlledImageApproval>;
type Verify = (before:string,after:string,signal:AbortSignal)=>Promise<void>;
type ImageUsage={input_tokens?:number;output_tokens?:number;total_tokens?:number};
function estimateImageUsd(usage:ImageUsage|null){
  return usage?.input_tokens===undefined||usage.output_tokens===undefined?null:
    (usage.input_tokens*8+usage.output_tokens*30)/1e6;
}

async function verifyPixels(before:string,after:string,signal:AbortSignal) {
  const pixels=async(path:string)=>(await command(process.env.FFMPEG_PATH||'ffmpeg',
    ['-v','error','-xerror','-nostdin','-i',path,'-frames:v','1','-pix_fmt','rgb24','-f','hash','-'],signal,15000)).stdout;
  if(await pixels(before)===await pixels(after))throw Error('benchmark_unchanged_pixels');
}

async function verifyForm(body:FormData,manifest:Manifest,index:number) {
  const c=manifest.cases[index];
  const {request,image}=manifest;
  const expected={model:image.deployment,prompt:c?.prompt,n:String(request.n),size:request.size,
    quality:request.quality,output_format:request.format};
  const media=body.get('image');
  if(!c||[...body.keys()].length!==7||Object.entries(expected).some(([key,value])=>body.get(key)!==value)
    ||!(media instanceof File)||media.name!==request.filename||media.type!==request.mime
    ||hash(Buffer.from(await media.arrayBuffer()))!==c.inputSha256)throw Error('benchmark_frozen_payload');
}

export async function executeControlledImages(directory:string,frozen:Frozen,approval:Approval,run:number,
  mode:'offline'|'live',transport:typeof fetch,verify:Verify=verifyPixels,frozenDir=directory,key='offline',
  signal?:AbortSignal, provenance?:{containerHost:string;hostPlatform:string;hostArch:string},
  offlineSleep?:(ms:number,signal?:AbortSignal)=>Promise<void>) {
  if(approval.manifestSha256!==frozen.sha256)throw Error('benchmark_frozen_manifest');
  const order='study' in approval?controlledConcurrencyOrder:[1,2];
  if(!order[run-1])throw Error('benchmark_run_number');
  const {manifest,inputs}=frozen;
  let referenceWallMs:number|undefined;
  if(run>1){
    const a=await readPrivateFile(join(directory,`run-${run-1}.json`),128_000).then(raw=>JSON.parse(raw.toString('utf8')))
      .catch(()=>{throw Error('benchmark_batch_requires_review');});
    if(a.ok!==true||a.run!==run-1||a.concurrency!==order[run-2]||a.mode!==mode||a.commit!==approval.commit||a.imageId!==approval.imageId||
      a.manifestSha256!==frozen.sha256||a.cases?.length!==6||!Number.isFinite(a.wallMs)||a.wallMs<=0)
      throw Error('benchmark_batch_requires_review');
    referenceWallMs=a.wallMs;
    for(const [index,c] of manifest.cases.entries()){
      const record=a.cases[index];
      const after=await readPrivateFile(join(directory,`run-${run-1}`,(index+1)+'.png'),20_000_000);
      if(record?.id!==c.id||record.status!=='validated'||record.inputSha256!==c.inputSha256||
        record.promptSha256!==c.promptSha256||hash(after)!==record.outputSha256)
        throw Error('benchmark_batch_requires_review');
    }
  }
  const guard=await openControlledImageRun(directory,approval,manifest.image,mode,run,transport,
    (form,index)=>verifyForm(form,manifest,index),offlineSleep);
  const root=join(directory,'run-'+run);
  const abort=new AbortController();
  const stop=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  const startedAt=new Date().toISOString();
  const began=performance.now();
  const elapsed=()=>Math.round(performance.now()-began);
  const records=manifest.cases.map(({id,frame,inputSha256,promptSha256})=>({
    id,frame,inputSha256,promptSha256,enqueuedMs:0,assignedMs:null as number|null,
    parsedMs:null as number|null,finishedMs:null as number|null,outputSha256:null as string|null,
    status:'not_started',usage:null as ImageUsage|null,
  }));
  let ok=false;
  let setupFailure=false;
  try {
    await mkdir(root,{mode:0o700});
    const config={url:`https://${manifest.image.host}/openai/v1/images/edits`,deployment:manifest.image.deployment,key};
    for(const item of records)item.enqueuedMs=elapsed();
    await runImageEditPool(records.length,guard.concurrency,stop,async index=>{
      const record=records[index];
      record.assignedMs=elapsed();
      const deadline=AbortSignal.any([stop,AbortSignal.timeout(manifest.request.timeoutMs)]);
      try{
        const output=await editAzureImage(config,inputs[index],manifest.cases[index].prompt,
          manifest.request.size,deadline,guard.providerRequests.image,manifest.request.quality);
        record.parsedMs=elapsed();
        if(!output.ok){record.status='http_'+output.status;abort.abort();return;}
        record.usage=output.usage;
        const after=join(root,(index+1)+'.png');
        if(hash(output.png)===record.inputSha256)throw Error('benchmark_copied_image');
        await writeFile(after,output.png,{flag:'wx',mode:0o600,flush:true});
        await verify(join(frozenDir,record.inputSha256+'.jpg'),after,deadline);
        record.outputSha256=hash(output.png);
        const estimate=estimateImageUsd(record.usage);
        if(mode==='live'&&(estimate===null||estimate*1e6>manifest.image.reserveUsdMicros)){
          record.status=estimate===null?'usage_unknown':'estimate_exceeds_reserve';
          abort.abort();
          return;
        }
        record.status='validated';
      }catch(error){
        record.status=deadline.aborted?(deadline.reason?.name==='TimeoutError'?'timeout':'cancelled')
          :error instanceof Error&&error.name==='TimeoutError'?'timeout':'request_or_validation_failed';
        abort.abort();
      }finally{
        record.finishedMs=elapsed();
      }
    });
    ok=!stop.aborted&&!guard.blocked()&&records.every(c=>c.status==='validated')&&guard.counts().image===6;
  }catch{
    setupFailure=true;
  }
  const wallMs=elapsed()-(records[0]?.enqueuedMs??0);
  let recorded=false;
  try{
    const events=(await readPrivateFile(join(directory,'requests.jsonl'),1_048_576)).toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
    const responseById=new Map(events.filter(e=>e.event==='response').map(e=>[e.dispatch,e]));
    const dispatches=events.filter(e=>e.event==='dispatch').map((e,i)=>({...e,response:responseById.get(i+1)})).filter(e=>e.run===run);
    const requests=dispatches.map((e,i)=>({caseId:records[i].id,dispatchIntentAtMs:e.atMs,
      dispatchAtMs:e.response?.transportAtMs??null,pacingSleepMs:e.pacingSleepMs??null,
      headerAtMs:e.response?.headerAtMs??null,waitMs:e.waitMs,
      throughHeadersMs:e.response?.status!=null?e.response.elapsedMs:null,httpStatus:e.response?.status??null,
      failure:e.response?.failure??null,reservedUsdMicros:e.reservedUsdMicros}));
    const intervals=requests.flatMap(r=>r.headerAtMs===null||r.dispatchAtMs===null?[]:[[r.dispatchAtMs,r.headerAtMs]]);
    const boundaries=[...new Set(intervals.flat())].sort((a,b)=>a-b);
    const inFlightMs=[0,0,0,0,0];
    boundaries.slice(1).forEach((right,i)=>{
      const left=boundaries[i];
      const inFlight=intervals.filter(([start,end])=>start<=left&&end>=right).length;
      inFlightMs[inFlight]+=right-left;
    });
    const overlapMs=inFlightMs.slice(2).reduce((sum,ms)=>sum+ms,0);
    const estimates=records.map(r=>estimateImageUsd(r.usage));
    const estimateUsd=estimates.every(value=>value!==null)?estimates.reduce((sum,value)=>sum+value,0):null;
    const result={ok,setupFailure,mode,run,concurrency:guard.concurrency,startedAt,wallMs,
      overlapMs,inFlightMs,peakInFlight:Math.max(0,inFlightMs.findLastIndex(ms=>ms>0)),
      slotWaitMs:records.reduce((sum,r)=>sum+(r.assignedMs===null?0:r.assignedMs-r.enqueuedMs),0),
      throttleWaitMs:requests.reduce((sum,r)=>sum+r.waitMs,0),
      pacingSleepMs:requests.reduce((sum,r)=>sum+(r.pacingSleepMs??0),0),retryCount:0,
      counts:guard.counts(),estimateUsd,actualBilledUsd:null,manifestSha256:frozen.sha256,
      commit:approval.commit,imageId:approval.imageId,provenance,finishedAt:new Date().toISOString(),
      pair:!('study' in approval)&&ok&&referenceWallMs!==undefined&&wallMs>0?{aWallMs:referenceWallMs,bWallMs:wallMs,
        savedMs:referenceWallMs-wallMs,speedup:referenceWallMs/wallMs,reduction:(referenceWallMs-wallMs)/referenceWallMs}:null,
      cases:records,requests};
    await writeFile(join(directory,`run-${run}.json`),JSON.stringify(result,null,2),{flag:'wx',mode:0o600,flush:true});
    recorded=true;
    return result;
  }finally{
    await guard.close(ok&&recorded);
  }
}

async function privateDirectory(path:string){
  const resolved=resolve(path);
  if(await realpath(resolved)!==resolved)throw Error('benchmark_private_directory');
  for(let ancestor=resolved;;ancestor=dirname(ancestor)){
    if(await lstat(join(ancestor,'.git')).then(()=>true,(error:NodeJS.ErrnoException)=>{
      if(error.code==='ENOENT')return false;
      throw error;
    }))throw Error('benchmark_private_directory');
    if(dirname(ancestor)===ancestor)return resolved;
  }
}

async function main(){
  const {values}=parseArgs({options:{
    frozen:{type:'string'},batch:{type:'string'},approval:{type:'string'},run:{type:'string'},
    'dry-run':{type:'boolean'},'six-round':{type:'boolean'},identity:{type:'string'},'host-platform':{type:'string'},'host-arch':{type:'string'},
  }});
  const sixRound=values['six-round']===true;
  if(!values.frozen||!values.batch||!values.run||!(sixRound?/^[1-6]$/:/^[12]$/).test(values.run)
    ||Boolean(values.approval)===Boolean(values['dry-run']))throw Error('benchmark_arguments');
  const frozenDir=await privateDirectory(values.frozen);
  const directory=await privateDirectory(values.batch);
  if(directory===frozenDir)throw Error('benchmark_private_directory');
  const frozen=await loadFrozenImages(frozenDir);
  const identity=z.object({commit:BenchmarkConfig.shape.commit,imageId:digest}).strict()
    .parse(JSON.parse(values.identity??'null'));
  const mode=values['dry-run']?'offline':'live';
  const approval=ControlledImageApproval.parse(mode==='offline'?{...identity,approvalRef:'offline',
    manifestSha256:frozen.sha256,...(sixRound?{study:'concurrency-234',batchPathSha256:hash(directory),approvedUsdMicros:27000000}
      :{approvedUsdMicros:9000000})}
    :JSON.parse((await readPrivateFile(values.approval!,4096)).toString('utf8')));
  if(approval.imageId!==identity.imageId||approval.commit!==identity.commit||('study' in approval)!==sixRound)
    throw Error('benchmark_image_identity');
  let transport:typeof fetch;
  let key='offline';
  if(mode==='offline'){
    // Static synthetic PNG. This transport cannot reach the network.
    const fixture='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    transport=async()=>Response.json({data:[{b64_json:fixture}]});
  }else{
    const image=imageEditConfig(process.env);
    if(new URL(image.url).hostname!==frozen.manifest.image.host||image.deployment!==frozen.manifest.image.deployment)
      throw Error('benchmark_image_deployment');
    key=image.key;
    transport=fetch;
  }
  const controller=new AbortController();
  const stop=()=>controller.abort();
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);
  try{
    const result=await executeControlledImages(directory,frozen,approval,Number(values.run),mode,transport,
      verifyPixels,frozenDir,key,controller.signal,{containerHost:hostname(),hostPlatform:values['host-platform']??'unknown',
        hostArch:values['host-arch']??'unknown'});
    console.log(JSON.stringify({event:'controlled_image_benchmark',run:result.run,mode,ok:result.ok,
      counts:result.counts,wallMs:result.wallMs}));
    if(!result.ok)process.exitCode=1;
  }finally{
    process.removeListener('SIGINT',stop);
    process.removeListener('SIGTERM',stop);
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  main().catch(()=>{console.error('Controlled image benchmark stopped. Review local batch and configuration.');process.exitCode=1;});
}
