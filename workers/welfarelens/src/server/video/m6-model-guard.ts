import {closeSync, fsyncSync, openSync, writeFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {isDedicatedQueue} from './meowho-worker-mode.ts';

const limits={vlm:{count:14,cents:50},image:{count:8,cents:75}} as const;
const maxCents=1300;
type Kind=keyof typeof limits;

export function assertM6Config(env:NodeJS.ProcessEnv,once:boolean){
 if(!once||!isDedicatedQueue(env)||env.WELFARELENS_IMAGE_EDIT_CONCURRENCY!==undefined||
  env.WELFARELENS_PRIVATE_HTML!=='true'||!env.MEOWHO_M6_JOB_ID||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(env.MEOWHO_M6_JOB_ID))throw Error('m6_config');
 return env.MEOWHO_M6_JOB_ID;
}

/** One attempt per approved ledger. A crash or ambiguous response requires manual reconciliation. */
export function openM6ModelGuard(path:string,transport:typeof fetch=fetch){
 if(!isAbsolute(path))throw Error('m6_ledger_path');
 const fd=openSync(path,'wx',0o600);
 const started=performance.now();
 const counts={vlm:0,image:0};
 const inFlight={vlm:0,image:0};
 let reserved=0,stopped:string|undefined;
 function record(event:Record<string,unknown>){
  try{
   writeFileSync(fd,JSON.stringify({utc:new Date().toISOString(),...event})+'\n');
   fsyncSync(fd);
  }catch{
   stopped='m6_ledger_error';
   throw Error(stopped);
  }
 }
 try{record({event:'open',vlm_cap:limits.vlm.count,image_cap:limits.image.count,reservation_cap_cents:maxCents});}
 catch(error){closeSync(fd);throw error;}

 function assertHealthy(){if(stopped)throw Error(stopped);}
 function wrap(kind:Kind):typeof fetch {
  return async(input,init)=>{
   const signal=init?.signal??(input instanceof Request?input.signal:undefined);
   signal?.throwIfAborted();
   assertHealthy();
   const limit=limits[kind];
   if(counts[kind]>=limit.count||reserved+limit.cents>maxCents){
    stopped='m6_request_limit';
    record({event:'stop',kind,code:stopped});
    throw Error(stopped);
   }
   const number=++counts[kind];
   reserved+=limit.cents;
   record({event:'start',kind,number,reserved_cents:reserved});
   // Record the reservation durably before invoking the model transport.
   signal?.throwIfAborted();
   const at=performance.now()-started;
   const active=++inFlight[kind];
   try{
    let response:Response;
    try{response=await transport(input,init);}
    catch(error){
     const name=signal?.reason?.name??(error instanceof Error?error.name:undefined);
     const code=name==='TimeoutError'?'timeout':name==='AbortError'?'aborted':'unknown';
     stopped??=`m6_${code}`;
     record({event:'error',kind,number,code,dispatch_ms:at,elapsed_ms:performance.now()-started-at,in_flight_at_dispatch:active});
     throw error;
    }
    if(!response.ok)stopped??='m6_http_error';
    record({event:'response',kind,number,status:response.status,dispatch_ms:at,elapsed_ms:performance.now()-started-at,in_flight_at_dispatch:active});
    return response;
   }finally{inFlight[kind]--;}
  };
 }
 function stopAfterVlmFailure(){
  if(stopped)return;
  stopped='m6_vlm_response_unusable';
  record({event:'stop',kind:'vlm',code:stopped});
 }
 return {requests:{vlm:wrap('vlm'),image:wrap('image')},assertHealthy,stopAfterVlmFailure,close:()=>closeSync(fd)};
}
