import {createHash} from 'node:crypto';
import {lstat,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve,relative,sep} from 'node:path';
import type {RawObservation} from '../../domain/video-issues.ts';
import {cropPixels,frameInfo} from './crops.ts';
import {command} from './media.ts';

export type MeowhoFrame={frame_id:string;timestamp:number;sha256:string;path:string};

/** Make a traceable, AI-estimated crop from the matching analyzed frame; never invent coordinates. */
export async function createMeowhoEvidenceCrop(options:{
 directory:string; observation:RawObservation; frame:MeowhoFrame; destination:string; signal:AbortSignal;
}):Promise<{sha256:string;bytes:number}|null>{
 const {directory,observation,frame,destination,signal}=options;
 if(!observation.candidate_bbox||observation.frame_id!==frame.frame_id||observation.timestamp!==frame.timestamp||frame.path!==`${frame.frame_id}.jpg`)return null;
 const root=resolve(directory),source=resolve(root,frame.path),out=resolve(destination);
 const inside=(path:string)=>{const rel=relative(root,path);return rel!==''&&rel!=='.'&&rel!=='..'&&!rel.startsWith(`..${sep}`);};
 if(!inside(source)||!inside(out)||!out.endsWith('.jpg'))throw Error('Invalid crop path');
 const sourceStat=await lstat(source);if(!sourceStat.isFile()||sourceStat.isSymbolicLink()||sourceStat.size<1||sourceStat.size>8*1024*1024)throw Error('Invalid evidence frame');
 const bytes=await readFile(source),sourceHash=createHash('sha256').update(bytes).digest('hex');
 if(sourceHash!==frame.sha256)throw Error('Evidence frame hash mismatch');
 const {width,height}=await frameInfo(bytes);
 const [left,top,right,bottom]=observation.candidate_bbox, padX=(right-left)*.15,padY=(bottom-top)*.15;
 const box=cropPixels([Math.max(0,left-padX),Math.max(0,top-padY),Math.min(1,right+padX),Math.min(1,bottom+padY)],width,height);
 // Very small crops are not useful evidence in Meowho cards. Keep the finding and
 // timestamp, but omit the optional crop instead of publishing a nearly empty tile.
 if(box.width*box.height<4096)return null;
 await mkdir(join(root,'crops'),{recursive:true});
 const temporary=out.slice(0,-4)+'.tmp.jpg';
 try{
  await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-n','-protocol_whitelist','file,pipe','-i',source,
   '-vf',`crop=${box.width}:${box.height}:${box.x}:${box.y}:exact=1,scale=w='min(1200,iw)':h='min(1200,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`,
   '-frames:v','1','-q:v','3',temporary],signal,15000);
  const crop=await readFile(temporary);if(crop.length<100||crop.length>2*1024*1024)throw Error('Invalid crop output');
  await frameInfo(crop);await writeFile(out,crop,{flag:'wx',mode:0o600});
  return {sha256:createHash('sha256').update(crop).digest('hex'),bytes:crop.length};
 }catch(error){await rm(temporary,{force:true});await rm(out,{force:true});throw error;}
 finally{await rm(temporary,{force:true});}
}
