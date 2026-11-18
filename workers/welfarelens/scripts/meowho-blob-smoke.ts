/**
 * Real Azure Blob smoke test, deliberately locked to `media-dev`.
 * Usage:
 *   node --env-file="PATH_TO_PRIVATE_ENV" --experimental-strip-types scripts/meowho-blob-smoke.ts
 *   node --env-file="PATH_TO_PRIVATE_ENV" --experimental-strip-types scripts/meowho-blob-smoke.ts --write
 * The --write test leaves one tiny diagnostic blob in media-dev; it NEVER deletes.
 * This does not test Supabase RPC, video inference, PDF or the Managed Identity path.
 */
import {randomUUID, createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {meowhoBlob} from '../src/server/video/meowho-blob.ts';

const SHA = (data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
const write=process.argv.includes('--write');
const local=await mkdtemp(join(tmpdir(),'welfarelens-blob-smoke-'));
try{
 // This test must never accidentally fall back to a personal az login or MI,
 // and must never use the production media container.
 if(!process.env.WELFARELENS_MEDIA_DEV_SAS_URL)throw new Error('missing_media_dev_sas');
 if(process.env.MEOWHO_BLOB_CONTAINER && process.env.MEOWHO_BLOB_CONTAINER!=='media-dev')throw new Error('not_media_dev');
 const blob=meowhoBlob('media-dev');
 const source=join(local,'cleanroom.mp4');
 const signal=new AbortController().signal;
 await blob.download('homes/cleanroom.mp4',source,signal);
 const size=(await stat(source)).size;
 const first=await readFile(source);
 if(size<1024||first.subarray(4,8).toString()!=='ftyp')throw new Error('unexpected_test_video');
 console.log(JSON.stringify({stage:'download',ok:true,container:'media-dev',file:'homes/cleanroom.mp4',bytes:size}));
 if(write){
  const file=join(local,'probe.txt');
  const content=Buffer.from('WelfareLens Blob access smoke test - '+randomUUID()+'\n');
  await writeFile(file,content,{mode:0o600});
  // A diagnostic blob, not a published report: never claim or invent output_prefix.
  const path='welfarelens-smoke/'+randomUUID()+'.txt';
  await blob.upload(path,file,'text/plain',signal);
  const readBack=join(local,'readback.txt');
  await blob.download(path,readBack,signal);
  if(SHA(await readFile(readBack))!==SHA(content))throw new Error('upload_readback_mismatch');
  console.log(JSON.stringify({stage:'upload_readback',ok:true,container:'media-dev',path,bytes:content.length}));
  console.log(JSON.stringify({event:'smoke_complete',ok:true,auth:'container_sas',limitations:'not_managed_identity_or_full_worker_e2e'}));
 }else{
  console.log(JSON.stringify({event:'smoke_read_only_complete',ok:true,note:'Use --write for upload/readback verification'}));
 }
}catch(error){
 const message=error instanceof Error?error.message:'unknown';
 // SDK errors may contain signed URLs; never print error messages from Azure.
 const safe=new Set(['missing_media_dev_sas','not_media_dev','unexpected_test_video','upload_readback_mismatch','invalid_blob_sas_config']);
 console.error(JSON.stringify({event:'smoke_failed',reason:safe.has(message)?message:'blob_operation_failed'}));
 process.exitCode=1;
}finally{await rm(local,{recursive:true,force:true});}
