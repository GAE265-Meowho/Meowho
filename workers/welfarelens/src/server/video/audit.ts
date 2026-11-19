import {writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {VideoStore} from './store.ts';
import {boundedText} from '../bounded-json.ts';

type Context={call:number;stage:'scene'|'plant_recheck';frame_id:string;timestamp:number;object_index:number|null};
/** Private job sidecar: same TTL/cancellation boundary. No request bodies or credential headers. */
export function createAuditFetch(store:VideoStore,id:string,context:Context,request:typeof fetch=fetch):typeof fetch{
 let attempts=0;
 return async(input,init)=>{
  if(!Number.isInteger(context.call)||context.call<1||context.call>14)throw Error('audit_failed');
  const signal=init?.signal??new AbortController().signal;
  const attempt=++attempts,started=performance.now();
  const record:Record<string,unknown>={version:1,...context,attempt,started_at:new Date().toISOString(),status:null,raw_response:null,error:null,billing_uncertain:false};
  async function save(){
   signal.throwIfAborted();await store.read(id);if(await store.isCancelled(id))throw Error('audit_failed');
   const dir=await store.directory(id),temp=join(dir,`audit-${randomUUID()}.tmp`);
   try{await writeFile(temp,JSON.stringify({...record,elapsed_ms:performance.now()-started}),{flag:'wx'});await store.read(id);if(await store.isCancelled(id))throw Error('audit_failed');await rename(temp,join(dir,`audit-${String(context.call).padStart(2,'0')}${attempt>1?`-attempt-${attempt}`:''}.json`));}
   finally{await rm(temp,{force:true});}
  }
  try{await save();}catch{throw Error('audit_failed');} // Verify writable evidence before spending.
  let response:Response;
  record.billing_uncertain=true;
  try{await save();response=await request(input,init);}catch(e){record.error='network_or_cancelled';try{await save();}catch{/* Pending record retains billing uncertainty after cancellation. */}throw e;}
  record.status=response.status;record.request_id=response.headers.get('x-request-id')??response.headers.get('apim-request-id');
  try{
   const text=await boundedText(response,1_000_000,signal);record.raw_response=text;
   await save();
   const headers=new Headers({'content-type':'application/json'});for(const key of ['retry-after','retry-after-ms','x-ms-retry-after-ms']){const value=response.headers.get(key);if(value)headers.set(key,value);}
   return new Response(text,{status:response.status,headers});
  }catch(e){record.error='response_capture_failed';try{await save();}catch{}throw Error('audit_failed',{cause:e});}
 };
}
