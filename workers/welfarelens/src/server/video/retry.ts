import {setTimeout as delay} from 'node:timers/promises';

type Options={maxRetries?:number;sleep?:(ms:number,signal?:AbortSignal)=>Promise<unknown>;random?:()=>number;onAttempt?:(attempt:number)=>void};
/** Single transport retry layer; photo requests and model validation are unchanged. */
export function createRetryFetch(request:typeof fetch,options:Options={}):typeof fetch{
 const max=Number.isInteger(options.maxRetries)&&options.maxRetries!>=0&&options.maxRetries!<=2?options.maxRetries!:2;
 return async(input,init)=>{
  const signal=init?.signal??(input instanceof Request?input.signal:undefined);
  for(let attempt=0;;attempt++){
   signal?.throwIfAborted();options.onAttempt?.(attempt);
   let response:Response|undefined;
   try{response=await request(input,init);}catch(error){
    signal?.throwIfAborted();
    if(!(error instanceof TypeError)||attempt>=max)throw error;
   }
   if(response&&(!(response.status===429||response.status>=500)||attempt>=max))return response;
   let wait=1000*2**attempt+Math.floor((options.random??Math.random)()*250);
   const retryAfter=response?.headers.get('retry-after');
   if(retryAfter){const seconds=Number(retryAfter),ms=Number.isFinite(seconds)?seconds*1000:Date.parse(retryAfter)-Date.now();if(Number.isFinite(ms))wait=Math.max(wait,ms);}
   const azureWait=Number(response?.headers.get('retry-after-ms')??response?.headers.get('x-ms-retry-after-ms'));
   if(Number.isFinite(azureWait))wait=Math.max(wait,azureWait);
   await response?.body?.cancel();
   signal?.throwIfAborted();
   await (options.sleep??((ms,s)=>delay(ms,undefined,{signal:s})))(wait,signal);
  }
 };
}
