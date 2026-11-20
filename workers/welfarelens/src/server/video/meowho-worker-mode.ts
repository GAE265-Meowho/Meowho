import {setTimeout as delay} from 'node:timers/promises';

type Mode = {once:true} | {once:false;pollMs:number;maxJobs?:number};

function integer(value:string|undefined,min:number,max:number):number|undefined {
 if(value===undefined)return undefined;
 const number=Number(value);
 if(!/^\d+$/.test(value)||!Number.isSafeInteger(number)||number<min||number>max)throw new Error('invalid_queue_setting');
 return number;
}

export function parseMeowhoMode(args:readonly string[],container:string,env:NodeJS.ProcessEnv):Mode {
 if(container!=='media-dev'||args.length!==1)throw new Error('invalid_queue_mode');
 if(args[0]==='--once')return {once:true};
 if(args[0]!=='--poll')throw new Error('invalid_queue_mode');
 const pollMs=integer(env.MEOWHO_WORKER_POLL_MS,1000,60000)??10000;
 const maxJobs=integer(env.MEOWHO_WORKER_MAX_JOBS,1,Number.MAX_SAFE_INTEGER);
 return maxJobs===undefined?{once:false,pollMs}:{once:false,pollMs,maxJobs};
}


/** The shared claim RPC has no scope filter. Unbounded workers require a separate queue. */
export function isDedicatedQueue(env:NodeJS.ProcessEnv){
 const ref=env.MEOWHO_DEDICATED_QUEUE_PROJECT_REF;
 return !!ref&&/^[a-z0-9]{20}$/.test(ref)&&ref!=='onebpkbkrnnwamwsoelo'&&
  env.MEOWHO_SUPABASE_URL===`https://${ref}.supabase.co`&&env.MEOWHO_BLOB_CONTAINER==='media-dev';
}

export function assertContinuousQueueScope(mode:Mode,env:NodeJS.ProcessEnv){
 if(mode.once||mode.maxJobs!==undefined){
  if(env.MEOWHO_WORKER_SERVICE==='true')throw Error('bounded_mode_cannot_restart_as_service');
  return;
 }
 if(!isDedicatedQueue(env)||env.MEOWHO_QUEUE_ENABLED!=='true'){
  throw Error('unverified_continuous_queue_scope');
 }
}

export async function runMeowhoQueue(options:{
 signal:AbortSignal;
 pollMs:number;
 maxJobs?:number;
 processNext:()=>Promise<string>;
 retryCode?:(error:unknown)=>string|undefined;
 onRetry?:(code:string,waitMs:number)=>void;
 onOutcome?:(outcome:string)=>void;
 wait?:(ms:number,signal:AbortSignal)=>Promise<unknown>;
}):Promise<void> {
 const {signal,pollMs,maxJobs}=options;
 const wait=options.wait??((ms,signal)=>delay(ms,undefined,{signal}));
 let processed=0,backoff=pollMs;
 while(!signal.aborted&&(maxJobs===undefined||processed<maxJobs)){
  let outcome:string;
  try{
   outcome=await options.processNext();
  }catch(error){
   if(signal.aborted)return;
   const code=options.retryCode?.(error);
   // With a fixed test budget, a missing RPC response may hide an already claimed job.
   if(!code||maxJobs!==undefined)throw error;
   options.onRetry?.(code,backoff);
   await wait(backoff,signal);
   backoff=Math.min(60000,backoff*2);
   continue;
  }
  backoff=pollMs;
  if(outcome==='idle'){
   if(!signal.aborted)await wait(pollMs,signal);
  }else{
   processed++;
   options.onOutcome?.(outcome);
  }
 }
}
