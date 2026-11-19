import {open,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {VideoStore} from './store.ts';
import {runVideoScan} from './worker.ts';

type Options={env:Record<string,string|undefined>;signal?:AbortSignal;timeoutMs?:number;pollMs?:number;work?:typeof runVideoScan};
type Outcome='busy'|'skipped'|'interrupted'|'completed'|'partial'|'failed'|'cancelled';
function alive(pid:number){try{process.kill(pid,0);return true;}catch(e){return !!e&&typeof e==='object'&&'code'in e&&e.code==='EPERM';}}
/** Local single-host execution claim, NOT a distributed queue or an inference quota. */
export async function runClaimedVideoScan(store:VideoStore,id:string,options:Options):Promise<{outcome:Outcome}>{
 options.signal?.throwIfAborted();
 const job=await store.read(id);if(!['queued','processing'].includes(job.status))return {outcome:'skipped'};
 const path=join(await store.directory(id),'worker.claim');let claim;
 try{claim=await open(path,'wx',0o600);}catch(e){
  if(!e||typeof e!=='object'||!('code'in e)||e.code!=='EEXIST')throw e;
  // A killed process is not silently replayed: the preceding API request may have been billed.
  const bytes=await readFile(path,'utf8');if(bytes.length>1000)throw Error('Invalid worker claim');
  const previous=JSON.parse(bytes);if(!Number.isInteger(previous.pid)||previous.pid<=0)throw Error('Invalid worker claim');
  if(alive(previous.pid))return {outcome:'busy'};
  await store.finish(id,{status:'failed',analysis_status:'failed',worker_error:'worker_interrupted',stage:'工作已中斷',error:'背景工作已中斷，可以重新建立分析；不會自動重送先前請求。'});
  return {outcome:'interrupted'};
 }
 const abort=new AbortController(),signal=options.signal?AbortSignal.any([abort.signal,options.signal]):abort.signal;
 const timeoutMs=options.timeoutMs??18*60*1000;
 if(!Number.isFinite(timeoutMs)||timeoutMs<=0){await claim.close();await rm(path,{force:true});throw Error('Invalid worker timeout');}
 let failures=0,checking=false;
 const deadline=setTimeout(()=>abort.abort(Error('Worker deadline')),timeoutMs);
 const watch=setInterval(()=>{if(checking)return;checking=true;void store.isCancelled(id).then(cancelled=>{failures=0;if(cancelled)abort.abort();}).catch(()=>{if(++failures>=3)abort.abort();}).finally(()=>{checking=false;});},options.pollMs??1000);
 try{
  await claim.writeFile(JSON.stringify({pid:process.pid}));await claim.close();
  // Recheck after exclusive claim; a cancellation/terminal write can win the race.
  if((await store.read(id)).status!=='queued')return {outcome:'skipped'};
  await (options.work??runVideoScan)(store,id,{env:options.env,signal});
  const result=await store.read(id);
  if(['completed','partial','failed','cancelled'].includes(result.status))return {outcome:result.status as Outcome};
  throw Error('Worker did not finish');
 }catch{
  if(await store.isCancelled(id).catch(()=>true))return {outcome:'cancelled'};
  await store.finish(id,{status:'failed',analysis_status:'failed',worker_error:signal.aborted?'worker_timeout_or_abort':'worker_failure',stage:'工作未完成',error:'背景工作未完成或已逾時，可以重新建立分析。'});
  return {outcome:'failed'};
 }finally{clearInterval(watch);clearTimeout(deadline);await claim.close().catch(()=>{});await rm(path,{force:true});}
}
