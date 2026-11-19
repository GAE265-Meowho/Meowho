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
  pilotUsdMicros: positive.max(10_000_000),
  batchUsdMicros: positive.max(40_000_000),
  vlm: model,
  image: model,
}).strict().refine(c => c.pilotUsdMicros <= c.batchUsdMicros
  && c.vlm.confirmedRpm > 1 && c.image.confirmedRpm > 1
  && c.vlm.gapMs >= Math.ceil(60_000 / (c.vlm.confirmedRpm - 1))
  && c.image.gapMs >= Math.max(12_000, Math.ceil(60_000 / (c.image.confirmedRpm - 1))));
export type BenchmarkConfig = z.infer<typeof BenchmarkConfig>;
export const benchmarkOrder = [1, 2, 2, 1, 1, 2] as const;
const caps = {vlm: 14, image: 8};
const eventSchema = z.discriminatedUnion('event', [
  z.object({event:z.literal('batch'),fingerprint:z.string()}),
  z.object({event:z.literal('run_start'),run:positive,concurrency:z.union([z.literal(1),z.literal(2)]),at:z.iso.datetime(),expansionApproval:z.string().optional()}),
  z.object({event:z.literal('dispatch'),run:positive,kind:kindSchema,atMs:positive,waitMs:z.number().nonnegative(),reservedUsdMicros:positive}),
  z.object({event:z.literal('response'),dispatch:positive,status:z.number().int().min(100).max(599).nullable(),elapsedMs:z.number().nonnegative(),failure:z.enum(['network','timeout','cancelled']).nullable()}),
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
  const concurrency = benchmarkOrder[run-1];
  if(!concurrency || (run<=2 ? phase!=='pilot' : phase!=='remaining'))throw Error('benchmark_run_number');
  if(run>2?!/^[a-zA-Z0-9._-]{1,100}$/.test(expansionApproval??''):expansionApproval!==undefined)
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
    if(!entries.length && run===1){durableAppend(path,{event:'batch',fingerprint});}
    else if(entries[0]?.event!=='batch'||entries[0].fingerprint!==fingerprint)throw Error('benchmark_config_changed');
    const starts = entries.filter(e=>e.event==='run_start');
    const ends = entries.filter(e=>e.event==='run_end');
    const dispatched = entries.filter(e=>e.event==='dispatch');
    const responses = entries.filter(e=>e.event==='response');
    if(starts.length!==run-1||starts.some((e,index)=>e.run!==index+1||e.concurrency!==benchmarkOrder[index]
      ||(index>=2&&e.expansionApproval!==expansionApproval))
      ||ends.length!==starts.length||ends.some((e,index)=>!e.ok||e.run!==index+1)
      ||responses.length!==dispatched.length||new Set(responses.map(e=>e.dispatch)).size!==dispatched.length
      ||responses.some(e=>e.dispatch>dispatched.length||e.status===429))throw Error('benchmark_batch_requires_review');
    const last = {vlm:0,image:0};
    let spent = 0, dispatchCount = dispatched.length;
    for(const entry of dispatched){
      last[entry.kind] = Math.max(last[entry.kind],entry.atMs);
      spent += entry.reservedUsdMicros;
    }
    const budget = run<=2 ? config.pilotUsdMicros : config.batchUsdMicros;
    // Refuse to start a round if it cannot afford its maximum request envelope.
    if(spent + caps.vlm*config.vlm.reserveUsdMicros + caps.image*config.image.reserveUsdMicros > budget)
      throw Error('benchmark_budget');
    const counts = {vlm:0,image:0};
    const lastMonotonic = {vlm:-Infinity,image:-Infinity};
    const tail = {vlm:Promise.resolve(),image:Promise.resolve()};
    let stopped = false, finished = false, blocked = false, active = 0;
    durableAppend(path,{event:'run_start',run,concurrency,at:new Date().toISOString(),expansionApproval});

    function makeRequest(kind:Kind):typeof fetch{
      return async (input,init)=>{
        const expected = new URL(kind==='image'?'/openai/v1/images/edits':'/openai/v1/chat/completions',`https://${config[kind].host}`).href;
        const body = init?.body;
        let deployment:unknown;
        try{deployment=body instanceof FormData ? body.get('model') : typeof body==='string' ? JSON.parse(body)?.model : null;}
        catch{blocked=true;throw Error('benchmark_unexpected_request');}
        if(String(input)!==expected || init?.method!=='POST'||init.redirect!=='error'||deployment!==config[kind].deployment){
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
        try{
          await previous;
          signal?.throwIfAborted();
          if(stopped||blocked)throw Error('benchmark_stopped');
          const remaining = Math.max(last[kind]+config[kind].gapMs-Date.now(),
            lastMonotonic[kind]+config[kind].gapMs-performance.now());
          if(remaining>0)await timers.setTimeout(Math.ceil(remaining),undefined,{signal});
          signal?.throwIfAborted();
          const cost = config[kind].reserveUsdMicros;
          if(stopped||blocked||counts[kind]>=caps[kind]||spent+cost>budget){
            blocked=true;
            throw Error('benchmark_limit');
          }
          const atMs = Date.now();
          const monotonic = performance.now();
          if(atMs<last[kind]+config[kind].gapMs||monotonic<lastMonotonic[kind]+config[kind].gapMs)
            throw Error('benchmark_clock');
          durableAppend(path,{event:'dispatch',run,kind,atMs,waitMs:Math.round(performance.now()-queuedAt),reservedUsdMicros:cost});
          last[kind] = atMs;
          lastMonotonic[kind] = monotonic;
          counts[kind]++;
          spent += cost;
          dispatch = ++dispatchCount;
          started = performance.now();
          active++;
          dispatchedRequest = Promise.resolve().then(()=>request(input,init));
        } catch(error) {
          blocked=true;
          throw error;
        } finally {
          release();
        }
        let status:number|null = null;
        let failure:'timeout'|'cancelled'|'network'|null = null;
        try {
          const response = await dispatchedRequest;
          status = response.status;
          if(status===429)blocked=true;
          return response;
        } catch(error){
          failure=signal?.aborted ? (signal.reason?.name==='TimeoutError'?'timeout':'cancelled') : 'network';
          throw error;
        } finally {
          active--;
          try{durableAppend(path,{event:'response',dispatch,status,elapsedMs:Math.round(performance.now()-started),failure});}
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
        durableAppend(path,{event:'run_end',run,ok:ok&&!blocked,at:new Date().toISOString()});
        finished=true;
        await rmdir(lock);
      },
    };
  } catch(error) {
    await rmdir(lock);
    throw error;
  }
}
