import { createHash } from 'node:crypto';
import { closeSync, fsyncSync, openSync, writeFileSync } from 'node:fs';
import { lstat, mkdir, readFile, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as timers from 'node:timers/promises';
import { z } from 'zod';

const positive = z.number().int().positive();
const kindSchema = z.enum(['vlm', 'image']);
type Kind = z.infer<typeof kindSchema>;
const model = z.object({
  host: z.string().regex(/^[a-z0-9-]+\.openai\.azure\.com$/),
  deployment: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  version: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  sku: z.string().regex(/^[a-zA-Z0-9._-]{1,80}$/),
  confirmedRpm: positive,
  gapMs: positive,
  reserveUsdMicros: positive.max(100_000_000),
}).strict();
export const BenchmarkConfig = z.object({
  approvalRef: z.string().regex(/^[a-zA-Z0-9._-]{1,100}$/),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pilotUsdMicros: positive.max(30_000_000),
  batchUsdMicros: positive.max(40_000_000),
  vlm: model,
  image: model,
}).strict().refine(c => c.pilotUsdMicros <= c.batchUsdMicros
  && c.vlm.confirmedRpm > 1 && c.image.confirmedRpm > 1
  && c.vlm.gapMs >= Math.ceil(60_000 / (c.vlm.confirmedRpm - 1))
  && c.image.gapMs >= Math.max(12_000, Math.ceil(60_000 / (c.image.confirmedRpm - 1))));
export type BenchmarkConfig = z.infer<typeof BenchmarkConfig>;
const controlledIdentity = {
  approvalRef: BenchmarkConfig.shape.approvalRef,
  commit: BenchmarkConfig.shape.commit,
  imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  manifestSha256: BenchmarkConfig.shape.inputSha256,
};
export const ControlledImageApproval = z.union([
  z.object({...controlledIdentity,approvedUsdMicros:z.literal(9_000_000)}).strict(),
  z.object({...controlledIdentity,approvedUsdMicros:z.literal(27_000_000),
    study:z.enum(['concurrency-234','concurrency-123']),batchPathSha256:BenchmarkConfig.shape.inputSha256}).strict(),
]);
export const ControlledImageDeployment = model.extend({
  reserveUsdMicros: z.literal(750_000),
}).refine(c => c.confirmedRpm > 1 && c.gapMs >= Math.max(12_000, Math.ceil(60_000 / (c.confirmedRpm - 1))));
type ControlledPolicy = z.infer<typeof ControlledImageApproval> & {
  image: z.infer<typeof ControlledImageDeployment>;
  priorReservedUsdMicros: number;
  mode: 'offline'|'live';
};
export const benchmarkOrder = [1, 2, 2, 1, 1, 2] as const;
export function controlledOrder(study?: 'concurrency-234'|'concurrency-123'){
  if(study==='concurrency-123')return [1, 2, 3, 3, 2, 1] as const;
  if(study==='concurrency-234')return [2, 3, 4, 4, 3, 2] as const;
  return [1, 2] as const;
}
const caps = {vlm: 14, image: 8};
export function maximumBenchmarkRound(config:BenchmarkConfig){
  return caps.vlm*config.vlm.reserveUsdMicros + caps.image*config.image.reserveUsdMicros;
}
const billedMicros = z.number().int().nonnegative();
const reconciliationSchema = z.tuple([billedMicros,billedMicros]);
const billingSchema = z.object({'1':billedMicros,'2':billedMicros});
const eventSchema = z.discriminatedUnion('event', [
  z.object({event:z.literal('batch'),fingerprint:z.string()}),
  z.object({event:z.literal('run_start'),run:positive,concurrency:z.union([z.literal(1),z.literal(2),z.literal(3),z.literal(4)]),at:z.iso.datetime(),
    expansionApproval:z.string().optional(),pilotBillingUsdMicros:reconciliationSchema.optional()}),
  z.object({event:z.literal('dispatch'),run:positive,kind:kindSchema,atMs:positive,waitMs:z.number().nonnegative(),
    pacingSleepMs:z.number().nonnegative().optional(),reservedUsdMicros:positive}),
  z.object({event:z.literal('response'),dispatch:positive,status:z.number().int().min(100).max(599).nullable(),elapsedMs:z.number().nonnegative(),failure:z.enum(['network','timeout','cancelled']).nullable(),
    transportAtMs:positive.optional(),headerAtMs:positive.optional()}),
  z.object({event:z.literal('run_end'),run:positive,ok:z.boolean(),at:z.iso.datetime()}),
]);
type Event = z.infer<typeof eventSchema>;

function durableAppend(path:string,event:Event){
  const fd = openSync(path,'a',0o600);
  try {
    writeFileSync(fd, JSON.stringify(event)+'\n');
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/** One local private batch directory, with a persistent lock on abnormal termination. */
export async function openBenchmarkRun(directory:string,config:BenchmarkConfig,run:number,phase:'pilot'|'remaining',
  request:typeof fetch=fetch,expansionApproval?:string){
  return openRun(directory,config,run,phase,request,expansionApproval);
}

export async function openControlledImageRun(directory:string,approval:z.infer<typeof ControlledImageApproval>,
  image:z.infer<typeof ControlledImageDeployment>,mode:ControlledPolicy['mode'],run:number,request:typeof fetch,
  verifyPayload:(body:FormData,index:number)=>Promise<void>,offlineSleep?:(ms:number,signal?:AbortSignal)=>Promise<void>){
  if(mode!=='offline'&&offlineSleep)throw Error('benchmark_live_clock');
  const approved=ControlledImageApproval.parse(approval);
  const deployment=ControlledImageDeployment.parse(image);
  const expanded='study' in approved;
  if(expanded&&(deployment.confirmedRpm!==6||deployment.gapMs!==12_000))throw Error('benchmark_study_pacing');
  const priorReservedUsdMicros=expanded?(approved.study==='concurrency-123'?52_250_000:25_250_000):16_250_000;
  return openRun(directory,{...approved,image:deployment,
    mode,priorReservedUsdMicros},run,'pilot',request,undefined,verifyPayload,offlineSleep);
}

async function openRun(directory:string,config:BenchmarkConfig|ControlledPolicy,run:number,phase:'pilot'|'remaining',
  request:typeof fetch,expansionApproval?:string,verifyPayload?:(body:FormData,index:number)=>Promise<void>,
  sleep:(ms:number,signal?:AbortSignal)=>Promise<void>=(ms,signal)=>timers.setTimeout(ms,undefined,{signal})){
  const controlled='manifestSha256' in config;
  const runCaps=controlled?{vlm:0,image:6}:caps;
  const order=controlled?controlledOrder('study' in config?config.study:undefined):benchmarkOrder;
  const concurrency = order[run-1];
  if(!concurrency || (!controlled&&(run<=2 ? phase!=='pilot' : phase!=='remaining')))throw Error('benchmark_run_number');
  if(!controlled&&run>2?!/^[a-zA-Z0-9._-]{1,100}$/.test(expansionApproval??''):expansionApproval!==undefined)
    throw Error('benchmark_expansion_approval');
  const lock = join(directory,'active.lock');
  await mkdir(lock,{mode:0o700});
  const path = join(directory,'requests.jsonl');
  try {
    const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
    const existing = await lstat(path).then(info=>{
      if(!info.isFile()||info.isSymbolicLink()||info.size>1024*1024)throw Error('benchmark_journal');
      return readFile(path,'utf8');
    }).catch((error:NodeJS.ErrnoException)=>{
      if(error.code==='ENOENT'&&run===1)return '';
      throw error;
    });
    if(existing&&!existing.endsWith('\n'))throw Error('benchmark_incomplete_journal');
    const entries = existing ? existing.trimEnd().split('\n').map(line=>eventSchema.parse(JSON.parse(line))) : [];
    if(entries.length && (entries[0]?.event!=='batch'||entries[0].fingerprint!==fingerprint))
      throw Error('benchmark_config_changed');
    const starts = entries.filter(e=>e.event==='run_start');
    const ends = entries.filter(e=>e.event==='run_end');
    const dispatched = entries.filter(e=>e.event==='dispatch');
    const responses = entries.filter(e=>e.event==='response');
    if(starts.length!==run-1||starts.some((e,index)=>e.run!==index+1||e.concurrency!==order[index]
      ||(!controlled&&index>=2&&e.expansionApproval!==expansionApproval))
      ||ends.length!==starts.length||ends.some((e,index)=>!e.ok||e.run!==index+1)
      ||responses.length!==dispatched.length||new Set(responses.map(e=>e.dispatch)).size!==dispatched.length
      ||responses.some(e=>e.dispatch>dispatched.length||e.status===429)
      ||(controlled&&(dispatched.length!==(run-1)*6||dispatched.some((e,index)=>e.run!==Math.floor(index/6)+1||e.kind!=='image'||e.reservedUsdMicros!==750_000)
        ||responses.some(e=>e.status===null||e.status<200||e.status>=300||e.failure!==null||
          e.headerAtMs===undefined||e.transportAtMs===undefined))))throw Error('benchmark_batch_requires_review');
    const last = {vlm:0,image:0};
    let spent = controlled?config.priorReservedUsdMicros:0, dispatchCount = dispatched.length;
    for(const entry of dispatched){
      last[entry.kind] = Math.max(last[entry.kind],entry.atMs);
      spent += entry.reservedUsdMicros;
    }
    if(controlled)for(const response of responses)last.image=Math.max(last.image,response.transportAtMs!);
    const budget = controlled?config.priorReservedUsdMicros+config.approvedUsdMicros
      :run<=2 ? config.pilotUsdMicros : config.batchUsdMicros;
    let pilotBillingUsdMicros:z.infer<typeof reconciliationSchema>|undefined;
    if(!controlled&&run>2){
      const billingPath=join(directory,'verified-billing.json');
      const billing=await lstat(billingPath).then(info=>{
        if(!info.isFile()||info.isSymbolicLink()||info.size>4096)throw Error('invalid billing file');
        return readFile(billingPath,'utf8');
      }).then(raw=>billingSchema.parse(JSON.parse(raw))).catch(()=>{
        throw Error('benchmark_pilot_reconciliation');
      });
      pilotBillingUsdMicros=[billing['1'],billing['2']];
      const prior=starts[2]?.pilotBillingUsdMicros;
      if(run>3 && (!prior || prior.some((value,index)=>value!==pilotBillingUsdMicros?.[index])))
        throw Error('benchmark_pilot_reconciliation');
      let pilotExposure=0;
      for(const [index,billed] of pilotBillingUsdMicros.entries()){
        const reserved=dispatched.reduce((sum,entry)=>sum+(entry.run===index+1?entry.reservedUsdMicros:0),0);
        const increase=Math.max(0,billed-reserved);
        spent+=increase;
        pilotExposure+=reserved+increase;
      }
      if(pilotExposure>config.pilotUsdMicros)throw Error('benchmark_pilot_budget_exceeded');
    }
    const remainingRounds=(controlled?order.length:run<=2?2:order.length)-run+1;
    const roundReserve=controlled?runCaps.image*config.image.reserveUsdMicros:maximumBenchmarkRound(config);
    if(spent + remainingRounds*roundReserve > budget)
      throw Error('benchmark_budget');
    const counts = {vlm:0,image:0};
    const lastMonotonic = {vlm:-Infinity,image:-Infinity};
    const tail = {vlm:Promise.resolve(),image:Promise.resolve()};
    let stopped = false, finished = false, blocked = false, active = 0;
    if(!entries.length)durableAppend(path,{event:'batch',fingerprint});
    durableAppend(path,{event:'run_start',run,concurrency,at:new Date().toISOString(),expansionApproval,
      pilotBillingUsdMicros:run===3?pilotBillingUsdMicros:undefined});

    function makeRequest(kind:Kind):typeof fetch{
      return async (input,init)=>{
        const settings=kind==='image'?config.image:controlled?null:config.vlm;
        if(!settings){blocked=true;throw Error('benchmark_unexpected_request');}
        const expected = new URL(kind==='image'?'/openai/v1/images/edits':'/openai/v1/chat/completions',`https://${settings.host}`).href;
        const body = init?.body;
        let deployment:unknown;
        try{deployment=body instanceof FormData ? body.get('model') : typeof body==='string' ? JSON.parse(body)?.model : null;}
        catch{blocked=true;throw Error('benchmark_unexpected_request');}
        if(String(input)!==expected || init?.method!=='POST'||init.redirect!=='error'||deployment!==settings.deployment){
          blocked=true;
          throw Error('benchmark_unexpected_request');
        }
        const signal = init.signal ?? undefined;
        const queuedAt = performance.now();
        const previous = tail[kind];
        let release!:()=>void;
        tail[kind] = new Promise<void>(resolve=>{release=resolve;});
        let dispatchedRequest!:Promise<Response>;
        let dispatch!:number;
        let started!:number;
        let transportAtMs:number|undefined;
        try{
          await previous;
          if(controlled){
            if(!(body instanceof FormData)||!verifyPayload||counts[kind]>=runCaps[kind])throw Error('benchmark_limit');
            await verifyPayload(body,counts.image);
          }
          const gap = settings.gapMs;
          let previousWall = last[kind];
          let previousMonotonic = lastMonotonic[kind];
          let pacingSleepMs=0;
          let atMs: number;
          let monotonic: number;
          for (;;) {
            signal?.throwIfAborted();
            if(stopped||blocked)throw Error('benchmark_stopped');
            atMs = Date.now();
            monotonic = performance.now();
            if(atMs<previousWall||monotonic<previousMonotonic)throw Error('benchmark_clock');
            const remaining = Math.max(last[kind]+gap-atMs,lastMonotonic[kind]+gap-monotonic);
            if(remaining<=0)break;
            // A timer can wake before the monotonic deadline. Recheck both clocks before dispatch.
            previousWall = atMs;
            previousMonotonic = monotonic;
            await sleep(Math.ceil(remaining),signal);
            pacingSleepMs+=performance.now()-monotonic;
          }
          const cost = settings.reserveUsdMicros;
          if(counts[kind]>=runCaps[kind]||spent+cost>budget){
            blocked=true;
            throw Error('benchmark_limit');
          }
          durableAppend(path,{event:'dispatch',run,kind,atMs,waitMs:Math.round(performance.now()-queuedAt),
            pacingSleepMs:controlled?Math.round(pacingSleepMs):undefined,reservedUsdMicros:cost});
          last[kind] = atMs;
          lastMonotonic[kind] = monotonic;
          counts[kind]++;
          spent += cost;
          dispatch = ++dispatchCount;
          started = performance.now();
          active++;
          dispatchedRequest = Promise.resolve().then(()=>{
            if(controlled){
              // The durable record holds dispatch intent. Pace from the actual start,
              // after the prior fsync, so variable write latency cannot compress starts.
              transportAtMs=Date.now();
              if(transportAtMs<last[kind])throw Error('benchmark_clock');
              last[kind]=transportAtMs;
              started=lastMonotonic[kind]=performance.now();
            }
            return request(input,init);
          });
        } catch(error) {
          blocked=true;
          throw error;
        } finally {
          release();
        }
        let status:number|null = null;
        let headerAtMs:number|undefined;
        let failure:'timeout'|'cancelled'|'network'|null = null;
        try {
          const response = await dispatchedRequest;
          if(controlled)headerAtMs=Date.now();
          status = response.status;
          if(status===429||(controlled&&!response.ok))blocked=true;
          return response;
        } catch(error){
          failure=signal?.aborted ? (signal.reason?.name==='TimeoutError'?'timeout':'cancelled') : 'network';
          if(controlled){
            blocked=true;
            if(error instanceof Error&&error.name==='TimeoutError')failure='timeout';
          }
          throw error;
        } finally {
          active--;
          try{durableAppend(path,{event:'response',dispatch,status,elapsedMs:Math.round(performance.now()-started),failure,transportAtMs,headerAtMs});}
          catch(error){blocked=true;throw error;}
        }
      };
    }
    return {
      providerRequests:{vlm:makeRequest('vlm'),image:makeRequest('image')},concurrency,
      counts:()=>({...counts}), blocked:()=>blocked,
      async close(ok:boolean){
        if(finished||active)throw Error('benchmark_run_active');
        stopped=true;
        durableAppend(path,{event:'run_end',run,ok:ok&&!blocked&&(!controlled||counts.image===6),at:new Date().toISOString()});
        finished=true;
        await rmdir(lock);
      },
    };
  } catch(error) {
    await rmdir(lock);
    throw error;
  }
}
