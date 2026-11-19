import {hostname} from 'node:os';
import {mkdtemp, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {meowhoBlob} from '../src/server/video/meowho-blob.ts';
import {MeowhoError, meowhoRpc, processMeowhoJob, readMeowhoQueueWait} from '../src/server/video/meowho-worker.ts';
import {privateRoot} from '../src/server/video/standalone.ts';
import {imageEditConcurrency} from '../src/server/video/before-after.ts';
import {imageEditConfig} from '../src/server/image-edit-client.ts';
import {assertContinuousQueueScope,parseMeowhoMode,runMeowhoQueue} from '../src/server/video/meowho-worker-mode.ts';

const env=process.env;
const shutdown=new AbortController();
for(const name of ['SIGINT','SIGTERM'] as const)process.once(name,()=>shutdown.abort());
let root:string|undefined;
try{
 const container=env.MEOWHO_BLOB_CONTAINER;
 if(container!=='media-dev')throw new MeowhoError('config_error');
 const mode=parseMeowhoMode(process.argv.slice(2),container,env);
 assertContinuousQueueScope(mode,env);
 if(!env.MEOWHO_WORKER_TMP||!env.MEOWHO_SUPABASE_URL||!env.MEOWHO_SUPABASE_SERVICE_ROLE_KEY||
  env.ENABLE_CLOUD_ANALYSIS!=='true'||env.ENABLE_IMAGE_EDITING!=='true'||!env.WELFARELENS_PDF_BROWSER||
  !env.AZURE_OPENAI_ENDPOINT||!env.AZURE_OPENAI_API_KEY||!env.AZURE_OPENAI_DEPLOYMENT)throw new MeowhoError('config_error');
 imageEditConfig(env);
 let editConcurrency:ReturnType<typeof imageEditConcurrency>;
 try{editConcurrency=imageEditConcurrency(env.WELFARELENS_IMAGE_EDIT_CONCURRENCY);}
 catch{throw new MeowhoError('config_error');}
 const parent=resolve(env.MEOWHO_WORKER_TMP);
 await privateRoot(parent);
 const workerRoot=await mkdtemp(join(parent,'meowho-worker-'));
 root=workerRoot;
 const workerId=`${hostname()}:${process.pid}`,blob=meowhoBlob(container);
 const rpc=meowhoRpc(env.MEOWHO_SUPABASE_URL,env.MEOWHO_SUPABASE_SERVICE_ROLE_KEY);
 const queueWait=readMeowhoQueueWait(env.MEOWHO_SUPABASE_URL,env.MEOWHO_SUPABASE_SERVICE_ROLE_KEY);
 const processNext=()=>processMeowhoJob({root:workerRoot,workerId,rpc,blob,env,queueWait,signal:shutdown.signal,
  onProfile:profile=>console.log(JSON.stringify(profile))});
 console.log(JSON.stringify({event:'meowho_worker_start',image_edit_concurrency:editConcurrency}));
 if(mode.once){
  const outcome=await processNext();
  console.log(JSON.stringify({event:'meowho_job',mode:'once',outcome}));
  if(!shutdown.signal.aborted&&(outcome==='failed'||outcome==='lease_lost'))process.exitCode=1;
 }else{
  await runMeowhoQueue({
   ...mode,signal:shutdown.signal,processNext,
   retryCode(error){
    if(error instanceof MeowhoError&&['network','timeout','service_unavailable','rate_limited'].includes(error.code))return error.code;
   },
   onOutcome:outcome=>console.log(JSON.stringify({event:'meowho_job',mode:'poll',outcome})),
   onRetry:(code,waitMs)=>console.warn(JSON.stringify({event:'meowho_rpc_retry_later',code,wait_ms:waitMs})),
  });
 }
}catch(error){
 if(!shutdown.signal.aborted){
  console.error(JSON.stringify({event:'meowho_worker_error',code:error instanceof MeowhoError?error.code:'config_or_contract_error'}));
  process.exitCode=1;
 }
}finally{
 if(root)await rm(root,{recursive:true,force:true});
}
