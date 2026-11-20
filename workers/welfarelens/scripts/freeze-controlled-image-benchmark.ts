import { createHash } from 'node:crypto';
import { lstat, mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { BenchmarkConfig } from '../src/server/video/benchmark-guard.ts';
import { RiskObjectReportSchema } from '../src/domain/risk-objects.ts';
import { FrozenImageManifest, loadFrozenImages, readPrivateFile } from './controlled-image-benchmark.ts';

const hash=(value:Buffer|string)=>createHash('sha256').update(value).digest('hex');
const readJson=async(path:string)=>JSON.parse((await readPrivateFile(path,16_000_000)).toString('utf8'));

async function main(){
  const {values}=parseArgs({options:{pilot:{type:'string'},'run-a':{type:'string'},output:{type:'string'}}});
  if(!values.pilot||!values.output||!values['run-a']||!/^[a-f0-9-]{36}$/.test(values['run-a']))throw Error('arguments');
  const pilot=await realpath(values.pilot), batch=join(pilot,'batch');
  const runA=join(batch,'run-1',values['run-a']);
  const config=BenchmarkConfig.parse(await readJson(join(pilot,'approval.json')));
  const sourceRevision='36a0bb270582bcf3a7c7061c08f4651ae1bd2aeb';
  const sourceDigest='sha256:894eda7afbe4c1405e2191e131a4b8472529c8859b7c218c8b133b1b620cdef9';
  if(config.commit!==sourceRevision||config.digest!==sourceDigest)throw Error('historical image identity');
  const journal=await readPrivateFile(join(batch,'requests.jsonl'),1_048_576);
  const events=journal.toString('utf8').trimEnd().split('\n').map(line=>JSON.parse(line));
  if(!journal.toString('utf8').endsWith('\n')||
    events[0]?.fingerprint!==hash(JSON.stringify(config)))throw Error('historical journal identity');
  const dispatches=events.filter(event=>event.event==='dispatch');
  const responses=events.filter(event=>event.event==='response');
  const priorReservedUsdMicros=dispatches.reduce((sum,item)=>sum+item.reservedUsdMicros,0);
  if(dispatches.length!==27||responses.length!==27||new Set(responses.map(r=>r.dispatch)).size!==27||
    responses.some(r=>!Number.isInteger(r.dispatch)||r.dispatch<1||r.dispatch>27||r.failure!==null||r.status!==200)||
    dispatches.some(d=>(d.run!==1&&d.run!==2)||(d.kind!=='image'&&d.kind!=='vlm')||d.reservedUsdMicros!==config[d.kind as 'image'|'vlm'].reserveUsdMicros)||
    priorReservedUsdMicros!==16_250_000)throw Error('historical journal state');

  const [a,b]=await Promise.all([1,2].map(run=>readJson(join(batch,`run-${run}.json`))));
  for(const [index,record] of [a,b].entries()){
    const run=index+1, image=run===1?6:5;
    if(record.run!==run||record.concurrency!==run||record.ociRevision!==sourceRevision||
      record.digest!==sourceDigest||record.ok!==true||record.counts?.vlm!==8||record.counts?.image!==image||
      dispatches.filter(d=>d.run===run&&d.kind==='image').length!==image||
      dispatches.filter(d=>d.run===run&&d.kind==='vlm').length!==8||
      events.filter(e=>e.event==='run_end'&&e.run===run&&e.ok===true).length!==1)throw Error('historical round evidence');
  }
  const report=RiskObjectReportSchema.parse(await readJson(join(runA,'welfarelens-risk-objects.v1.json')));
  if(report.analysis_id!==values['run-a']||report.source!=='azure')throw Error('historical report identity');
  const selected=report.visual_comparisons.filter(c=>c.after_generation_status.status==='generated');
  const bytes=new Map<string,Buffer>();
  const cases=[];
  for(let i=1;i<=6;i++){
    // The historical runner assigned after.png, after-2.png, … in actual plan order.
    const filename=i===1?'after.png':`after-${i}.png`;
    const c=selected.find(c=>c.after_image_ref===filename);
    const historical=c?.after_generation_status;
    if(!c||historical?.status!=='generated'||historical.model!==config.image.deployment||
      historical.quality!=='high'||historical.size!=='auto'||historical.path!==filename||
      !/^f\d{3}\.jpg$/.test(c.before_image_ref))throw Error('historical case missing');
    const input=await readPrivateFile(join(runA,c.before_image_ref),20_000_000);
    const output=await readPrivateFile(join(runA,filename),20_000_000);
    const inputSha256=hash(input),promptSha256=hash(historical.prompt);
    const frame=c.before_image_ref.slice(0,-4);
    if(inputSha256!==historical.input_sha256||hash(output)!==historical.output_sha256||
      !report.provenance.frames.some(f=>f.path===c.before_image_ref&&f.sha256===inputSha256)||
      !a.checks?.editInputs?.some((r:Record<string,string>)=>r.input_sha256===inputSha256&&
        r.promptSha256===promptSha256&&r.quality==='high'&&r.size==='auto'))throw Error('historical hash mismatch');
    bytes.set(inputSha256,input);
    cases.push({id:c.comparison_id,frame,prompt:historical.prompt,promptSha256,inputSha256});
  }
  if(selected.length!==6||a.checks?.editInputs?.length!==6)throw Error('historical case count');
  const manifest=FrozenImageManifest.parse({schema:'welfarelens.controlled-image/v1',sourceRevision,sourceDigest,
    pilotJournalSha256:hash(journal),priorReservedUsdMicros,image:config.image,
    request:{apiVersion:'v1',size:'auto',quality:'high',n:1,format:'png',mime:'image/jpeg',filename:'room.jpg',timeoutMs:180000},
    cases});
  const output=resolve(values.output);
  const parent=await realpath(join(output,'..'));
  if(parent!==join(output,'..')||!(await lstat(parent)).isDirectory())throw Error('private destination');
  await mkdir(output,{mode:0o700});
  for(const [digest,image] of bytes)await writeFile(join(output,digest+'.jpg'),image,{flag:'wx',mode:0o400,flush:true});
  await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o400,flush:true});
  const frozen=await loadFrozenImages(output);
  console.log(JSON.stringify({event:'controlled_image_frozen',cases:cases.length,distinctFrames:bytes.size,
    manifestSha256:frozen.sha256,priorReservedUsdMicros}));
}

main().catch(()=>{console.error('Cannot reconstruct all six historical requests. Check the private source and destination.');process.exitCode=1;});
