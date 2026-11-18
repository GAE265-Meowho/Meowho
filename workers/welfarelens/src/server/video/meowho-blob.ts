import {ManagedIdentityCredential} from '@azure/identity';
import {AnonymousCredential, ContainerClient} from '@azure/storage-blob';
import {selectMeowhoBlobAuth} from './meowho-blob-auth.ts';
import {createReadStream, createWriteStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {MEOWHO_MAX_BYTES} from './standalone.ts';
import {MeowhoError, type BlobPort} from './meowho-worker.ts';

function classify(error:unknown, downloading:boolean){
 if(error instanceof MeowhoError)return error;
 const {statusCode,code}=(error??{}) as {statusCode?:number;code?:string};
 return new MeowhoError(statusCode===404&&downloading?'source_invalid':statusCode===401||statusCode===403?'permission_denied':
  statusCode===429?'rate_limited':statusCode===408||code==='ETIMEDOUT'?'timeout':
  statusCode&&statusCode>=500?'service_unavailable':statusCode?'result_invalid':
  ['ENOSPC','EACCES','EPERM','CredentialUnavailableError'].includes(code??'')||(error instanceof Error&&error.name==='CredentialUnavailableError')?'config_error':'network');
}

export function meowhoBlob(container:'media-dev'|'media',env:NodeJS.ProcessEnv=process.env):BlobPort{
 if(!['media-dev','media'].includes(container))throw new MeowhoError('config_error');
 let auth:ReturnType<typeof selectMeowhoBlobAuth>;
 try{auth=selectMeowhoBlobAuth(container,env);}
 catch{throw new MeowhoError('config_error');}
 // The container SAS URL is already signed. Never include it in logs or errors.
 const client=auth.kind==='container-sas'
  ?new ContainerClient(auth.url,new AnonymousCredential(),{retryOptions:{maxTries:1}})
  :new ContainerClient(`https://meowhomedia.blob.core.windows.net/${container}`,
    new ManagedIdentityCredential(),{retryOptions:{maxTries:1}});
 return createBlobPort(client);
}
export function createBlobPort(client:Pick<ContainerClient,'getBlobClient'|'getBlockBlobClient'>):BlobPort{
 return {
  async download(path,file,signal){
   const abortSignal=AbortSignal.any([signal,AbortSignal.timeout(240000)]);
   try{
    const response=await client.getBlobClient(path).download(0,undefined,{abortSignal});
    const stream=response.readableStreamBody;
    if(!stream)throw new MeowhoError('source_invalid');
    let bytes=0;
    const bounded=new Transform({transform(chunk:Buffer,_encoding,callback){
     bytes+=chunk.length;
     callback(bytes>MEOWHO_MAX_BYTES?new MeowhoError('video_too_large'):null,chunk);
    }});
    if((response.contentLength??0)>MEOWHO_MAX_BYTES){
     (stream as import('node:stream').Readable).destroy();
     throw new MeowhoError('video_too_large');
    }
    await pipeline(stream,bounded,createWriteStream(file,{flags:'wx',mode:0o600}),{signal:abortSignal});
    if(response.contentLength!==undefined&&response.contentLength!==bytes)throw new MeowhoError('network');
   }catch(error){throw abortSignal.aborted&&!signal.aborted?new MeowhoError('timeout'):classify(error,true);}
  },
  async upload(path,file,contentType,signal){
   const abortSignal=AbortSignal.any([signal,AbortSignal.timeout(240000)]);
   try{
    const hash=createHash('sha256');
    for await(const chunk of createReadStream(file,{signal:abortSignal}))hash.update(chunk);
    const sha256=hash.digest('hex'),blob=client.getBlockBlobClient(path);
    try{
     await blob.uploadFile(file,{abortSignal,conditions:{ifNoneMatch:'*'},metadata:{sha256},blobHTTPHeaders:{blobContentType:contentType}});
    }catch(error){
     if((error as {statusCode?:number}).statusCode!==412)throw error;
     const saved=await blob.getProperties({abortSignal});
     if(saved.metadata?.sha256!==sha256)throw new MeowhoError('result_invalid');
    }
   }catch(error){throw abortSignal.aborted&&!signal.aborted?new MeowhoError('timeout'):classify(error,false);}
  },
 };
}
