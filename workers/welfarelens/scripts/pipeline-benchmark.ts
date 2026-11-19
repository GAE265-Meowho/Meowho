import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { z } from 'zod';
import { BenchmarkConfig, maximumBenchmarkRound, openBenchmarkRun } from '../src/server/video/benchmark-guard.ts';
import { executeLiveJob, privateRoot } from '../src/server/video/standalone.ts';
import { validateIntegrationArtifacts } from '../src/server/video/integration-job.ts';
import { buildMeowhoResult, prepareMeowhoItems } from '../src/server/video/meowho-worker.ts';
import { JobProfile } from '../src/server/video/job-profile.ts';
import { imageEditConfig } from '../src/server/image-edit-client.ts';
import { probeVideo } from '../src/server/video/media.ts';
import { reportViewAssetNames, ReportViewSchema } from '../src/domain/report-view.ts';

const runCommand = promisify(execFile);
const ImageIdentity = z.object({
  ref:z.string().regex(/^ghcr\.io\/gae265-meowho\/meowho\/welfarelens-worker@sha256:[a-f0-9]{64}$/),
  revision:z.string().regex(/^[a-f0-9]{40}$/),
  imageId:z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

async function verifyRuntime(directory:string,input:string,browser:string){
  const scratch=await mkdtemp(join(directory,'.preflight-'));
  try{
    const frame=join(scratch,'frame.jpg');
    await runCommand(process.env.FFMPEG_PATH||'ffmpeg',[
      '-v','error','-nostdin','-protocol_whitelist','file,pipe','-i',input,
      '-map','0:v:0','-frames:v','1','-threads','1',frame,
    ],{timeout:30_000});
    const html=join(scratch,'probe.html'),pdf=join(scratch,'probe.pdf');
    await writeFile(html,'<!doctype html><meta charset="utf-8"><p>WelfareLens 預檢</p><img src="frame.jpg">');
    const args=['--headless','--disable-gpu','--disable-background-networking','--no-first-run',
      '--user-data-dir='+join(scratch,'browser'),'--print-to-pdf='+pdf,pathToFileURL(html).href];
    if(process.env.WELFARELENS_PDF_NO_SANDBOX==='true')args.unshift('--no-sandbox');
    await runCommand(browser,args,{timeout:45_000});
    if((await readFile(pdf)).subarray(0,5).toString()!=='%PDF-')throw Error('Chromium PDF probe failed');
  }finally{
    await rm(scratch,{recursive:true,force:true});
  }
}

async function hashFile(path:string){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(path))hash.update(chunk);
  return hash.digest('hex');
}

async function keepOutsideGit(directory:string){
  for(let path=directory;;path=dirname(path)){
    if(await lstat(join(path,'.git')).then(()=>true,(error:NodeJS.ErrnoException)=>{
      if(error.code==='ENOENT')return false;
      throw error;
    }))throw Error('Use a private directory outside Git');
    if(dirname(path)===path)return;
  }
}

async function verifyHtml(directory:string,id:string){
  const html=await readFile(join(directory,'report.html'),'utf8');
  const view=ReportViewSchema.parse(JSON.parse(await readFile(join(directory,'report-view.json'),'utf8')));
  const names=[...html.matchAll(/<img\b[^>]*\bsrc="html-assets\/([a-f0-9]{64}\.(?:jpg|png))"/g)].map(match=>match[1]);
  const assets=new Set(names);
  if(view.report_id!==id||view.attempt!==1||!assets.size||names.length!==[...html.matchAll(/<img\b/g)].length
    ||[...reportViewAssetNames(view)].some(name=>!assets.has(name)))throw Error('Invalid local HTML');
  for(const name of assets)if(await hashFile(join(directory,'html-assets',name))!==name.slice(0,64))throw Error('Invalid HTML asset hash');
  return {images:assets.size,statistics:view.statistics};
}

async function main(){
  const {values}=parseArgs({options:{
    config:{type:'string'},input:{type:'string'},batch:{type:'string'},run:{type:'string'},
    phase:{type:'string'},preflight:{type:'boolean'},'expansion-approval':{type:'string'},'image-identity':{type:'string'},
  }});
  if(!values.config||!values.input||!values.batch)throw Error('Arguments');
  const config=BenchmarkConfig.parse(JSON.parse(await readFile(values.config,'utf8')));
  const identity=ImageIdentity.parse(JSON.parse(values['image-identity']??'null'));
  if(identity.revision!==config.commit||!identity.ref.endsWith('@'+config.digest))throw Error('Image identity mismatch');
  const input=resolve(values.input),directory=resolve(values.batch),info=await lstat(input);
  if(!info.isFile()||info.isSymbolicLink()||await realpath(input)!==input||info.size>300_000_000
    ||await hashFile(input)!==config.inputSha256)throw Error('Unexpected input');
  await keepOutsideGit(directory);
  await privateRoot(directory);
  const metadata=await probeVideo(input,undefined,180);
  const browser=process.env.WELFARELENS_PDF_BROWSER;
  const vlm=new URL(process.env.AZURE_OPENAI_ENDPOINT??'');
  const image=imageEditConfig(process.env);
  if(!browser||!(await stat(browser)).isFile()||vlm.hostname!==config.vlm.host||vlm.protocol!=='https:'
    ||!process.env.AZURE_OPENAI_API_KEY||process.env.AZURE_OPENAI_DEPLOYMENT!==config.vlm.deployment
    ||new URL(image.url).hostname!==config.image.host||image.deployment!==config.image.deployment)
    throw Error('Configuration mismatch');
  if(values.preflight){
    const maximumRoundUsdMicros=maximumBenchmarkRound(config);
    if(maximumRoundUsdMicros*2>config.pilotUsdMicros)throw Error('Budget cannot support the pilot envelope');
    await verifyRuntime(directory,input,browser);
    console.log(JSON.stringify({event:'benchmark_preflight',ok:true,metadata,maximumRoundUsdMicros,
      commit:config.commit,digest:config.digest,imageId:identity.imageId,ociRevision:identity.revision}));
    return;
  }
  const run=Number(values.run),phase=values.phase;
  if(!Number.isInteger(run)||(phase!=='pilot'&&phase!=='remaining'))throw Error('Arguments');
  const guard=await openBenchmarkRun(directory,config,run,phase,fetch,values['expansion-approval']);
  const profile=new JobProfile(),abort=new AbortController();
  const stop=()=>abort.abort();
  process.once('SIGINT',stop);
  process.once('SIGTERM',stop);
  let ok=false;
  let stage='pipeline';
  let checks:unknown=null;
  const root=join(directory,`run-${run}`);
  const reportId=randomUUID();
  try{
    await mkdir(root,{mode:0o700});
    const bundle=await profile.measure('local_pipeline',()=>executeLiveJob({
      live:true,input,root,profile,signal:abort.signal,pdfBrowser:browser,meowhoInput:true,allowImageEditing:true,
      providerRequests:guard.providerRequests,imageTransportOwnsPacing:true,reportViewIdentity:{report_id:reportId,attempt:1},
      env:{...process.env,ENABLE_CLOUD_ANALYSIS:'true',ENABLE_IMAGE_EDITING:'true',WELFARELENS_PRIVATE_HTML:'true',
        WELFARELENS_VIDEO_CONCURRENCY:'2',WELFARELENS_VIDEO_MAX_RETRIES:'0',WELFARELENS_IMAGE_EDIT_CONCURRENCY:String(guard.concurrency)},
    }));
    stage='validation';
    abort.signal.throwIfAborted();
    if(guard.blocked()||bundle.outcome!=='completed'||bundle.stages.analysis!=='completed'
      ||bundle.stages.editing!=='generated'||bundle.imageFailures.length
      ||bundle.evidence.length!==8||bundle.metrics?.failedFrames||bundle.metrics?.refinementFailures)
      throw Error('Incomplete benchmark');
    const artifactDir=join(root,bundle.job_id);
    await profile.measure('validation',async()=>{
      const {canonical,meowho}=await validateIntegrationArtifacts(artifactDir,bundle,true);
      const html=await verifyHtml(artifactDir,reportId);
      const publication=await prepareMeowhoItems({canonical,bundle,directory:artifactDir,outputPrefix:'',signal:abort.signal,
        upload:async()=>{},ensure:()=>abort.signal.throwIfAborted()});
      const result=buildMeowhoResult({jobId:bundle.job_id,reportId,attempt:1,workerId:'local-benchmark',
        modelVersion:config.vlm.version,summary:meowho.summary,bundle,canonical,publication});
      await writeFile(join(artifactDir,'result.json'),JSON.stringify(result),{flag:'wx',mode:0o600});
      const risk=JSON.parse(await readFile(join(artifactDir,'welfarelens-risk-objects.v1.json'),'utf8'));
      const generated=risk.visual_comparisons.filter((pair:{after_generation_status:{status:string}})=>pair.after_generation_status.status==='generated');
      if(generated.length!==guard.counts().image)throw Error('Unexpected image count');
      checks={schema:result.schema,htmlImages:html.images,statistics:html.statistics,video:metadata,
        frameTimes:bundle.evidence.map(f=>f.timestamp),frameHashes:bundle.evidence.map(f=>f.sha256),
        cases:generated.length,
        coverage:result.items.map(({key,level,frame_index,t_s,crop_path})=>({key,level,frame_index,t_s,hasCrop:!!crop_path})),
        editInputs:generated.map((pair:{after_generation_status:{input_sha256:string;prompt:string;size:string;quality:string}})=>{
          const {input_sha256,prompt,size,quality}=pair.after_generation_status;
          return {input_sha256,promptSha256:createHash('sha256').update(prompt).digest('hex'),size,quality};
        }),
        imageUsage:generated.map((pair:{after_generation_status:{usage:unknown}})=>pair.after_generation_status.usage),
      };
    });
    ok=true;
  } finally {
    process.removeListener('SIGINT',stop);
    process.removeListener('SIGTERM',stop);
    // Mark a round successful only once its evidence has also been saved.
    let recorded=false;
    try{
      await writeFile(join(directory,`run-${run}.json`),JSON.stringify({
        run,concurrency:guard.concurrency,at:new Date().toISOString(),commit:config.commit,digest:config.digest,
        imageId:identity.imageId,ociRevision:identity.revision,
        ok,stage,counts:guard.counts(),checks,profile:profile.snapshot(ok?'local_validated':'failed'),
      },null,2),{flag:'wx',mode:0o600});
      recorded=true;
    }finally{
      await guard.close(ok&&recorded);
    }
  }
  console.log(JSON.stringify({event:'benchmark_run',run,ok}));
}

await main().catch(()=>{
  console.error(JSON.stringify({event:'benchmark_blocked_or_failed',hint:'Review the private journal; do not restart or reset the batch.'}));
  process.exitCode=1;
});
