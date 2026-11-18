import {execFile} from 'node:child_process';
import {readFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {videoProbeLimit,candidateFrameLimit} from '../../domain/video-sampling.ts';
import {selectFrames} from '../../domain/video.ts';
import {cropRegion} from '../../domain/plant-refinement.ts';
import type {Candidate} from '../../domain/schema.ts';
export function command(executable:string,args:string[],signal?:AbortSignal,timeout=120000):Promise<{stdout:string;stderr:string}>{
 return new Promise((resolve,reject)=>execFile(executable,args,{windowsHide:true,timeout,maxBuffer:4*1024*1024,signal},(error,stdout,stderr)=>error?reject(Error(signal?.aborted?'cancelled':'影片處理失敗，請確認格式或重新拍攝')):resolve({stdout,stderr})));
}
const inputFlags=['-protocol_whitelist','file,pipe','-format_whitelist','mov'];
export async function probeVideo(path:string,signal?:AbortSignal,experimentalMaxSeconds=90){
 const {stdout}=await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error',...inputFlags,'-select_streams','v:0','-show_entries','format=duration,format_name:stream=width,height,codec_name:stream_side_data=rotation','-of','json',path],signal,30000);
 const maxSeconds=videoProbeLimit(experimentalMaxSeconds);
 const info=JSON.parse(stdout),s=info.streams?.[0],duration=Number(info.format?.duration);
 if(Number.isFinite(duration)&&duration>maxSeconds)throw Object.assign(Error(`影片長度超過 ${maxSeconds} 秒`),{code:'video_too_long'});
 if(!s||!Number.isFinite(duration)||duration<.3||!['h264','hevc'].includes(s.codec_name)||s.width<1||s.height<1||s.width>8192||s.height>8192||s.width*s.height>34000000)throw Object.assign(Error(`請使用 0.3–${maxSeconds} 秒、H.264／H.265 的 MP4 或 MOV 影片`),{code:'video_format'});
 return {duration,width:Number(s.width),height:Number(s.height),codec:String(s.codec_name),rotation:Number(s.side_data_list?.find((x:{rotation?:number})=>x.rotation!==undefined)?.rotation??0)};
}
export async function extractAt(input:string,timestamp:number,destination:string,signal?:AbortSignal,filter?:string){
 // Accurate input seek decodes from the preceding keyframe, instead of decoding the entire prefix.
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-threads','2',...inputFlags,'-ss',timestamp.toFixed(6),'-i',input,'-map','0:v:0','-an','-frames:v','1','-vf',filter||'scale=1440:1440:force_original_aspect_ratio=decrease:force_divisible_by=2','-q:v','3','-threads','2',destination],signal);
 if(!(await stat(destination)).size)throw Error('無法取得影片畫面');
}
/** select retains decoded source PTS; unlike fps=n this does not invent a regular timestamp. */
export async function extractVideo(input:string,dir:string,duration:number,signal:AbortSignal){
 const raw=join(dir,'candidates.gray');
 const {stderr}=await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','info','-nostdin','-y','-threads','2',...inputFlags,'-i',input,'-map','0:v:0','-an','-vf',"select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)',showinfo,scale=96:96,format=gray",'-fps_mode','vfr','-frames:v',String(candidateFrameLimit(duration)),'-threads','2','-f','rawvideo',raw],signal);
 const times=[...stderr.matchAll(/\bn:\s*\d+\s+pts:\s*[-\d]+\s+pts_time:([\d.e+-]+)/g)].map(m=>Number(m[1]));
 const bytes=await readFile(raw);await rm(raw,{force:true});const count=bytes.length/(96*96);
 if(!Number.isInteger(count)||count===0||times.length!==count||times.some((t,i)=>!Number.isFinite(t)||t<0||t>=duration+.1||(i>0&&t<=times[i-1])))throw Error('影片時間戳無法可靠對應');
 const frames=times.map((timestamp,i)=>{const pixels=bytes.subarray(i*9216,(i+1)*9216),previous=bytes.subarray(Math.max(0,i-1)*9216,i*9216);let difference=0,sharpness=0;for(let j=1;j<pixels.length;j++){if(i)difference+=Math.abs(pixels[j]-previous[j]);sharpness+=Math.abs(pixels[j]-pixels[j-1]);}return {frame_id:`f${String(i).padStart(3,'0')}`,timestamp,novelty:difference/(9215*255),sharpness:sharpness/9215,hash:''};});
 const selected=selectFrames(frames,8);
 for(const f of selected){await extractAt(input,f.timestamp,join(dir,`${f.frame_id}.jpg`),signal);f.hash=createHash('sha256').update(await readFile(join(dir,`${f.frame_id}.jpg`))).digest('hex');}
 return selected;
}
export async function plantCrop(input:string,t:number,bbox:Candidate['objects'][number]['bbox'],dir:string,index:number,signal:AbortSignal,isPhoto=false){
 // ffmpeg autorotates first; crop fractions refer to display orientation of the analyzed frame.
 const region=cropRegion(bbox,100000,100000);if(!region)throw Error('無植物位置');
 const filter=`crop=w='max(2,trunc(iw*${region.width/100000}/2)*2)':h='max(2,trunc(ih*${region.height/100000}/2)*2)':x='iw*${region.x/100000}':y='ih*${region.y/100000}',scale=1536:1536:force_original_aspect_ratio=decrease:force_divisible_by=2`;
 const path=join(dir,`plant-${index}.jpg`);try{if(isPhoto)await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-format_whitelist','image2,jpeg_pipe,png_pipe','-i',input,'-frames:v','1','-vf',filter,path],signal);else await extractAt(input,t,path,signal,filter);const image=await readFile(path);if(image.length>1100000)throw Error('植物局部過大');return `data:image/jpeg;base64,${image.toString('base64')}`;}finally{await rm(path,{force:true});}
}

/** Still images use the existing one-frame analysis, rules and plant refinement; never 3D/floor-plan inference. */
export async function extractPhoto(input:string,dir:string,signal:AbortSignal){
 const {stdout}=await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-protocol_whitelist','file,pipe','-format_whitelist','image2,jpeg_pipe,png_pipe','-i',input,'-show_entries','stream=width,height','-of','json'],signal,10000);
 const source=JSON.parse(stdout).streams?.[0];if(!source||source.width<1||source.height<1||source.width>8192||source.height>8192||source.width*source.height>34000000)throw Error('Invalid image');
 const path=join(dir,'f000.jpg');await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-y','-protocol_whitelist','file,pipe','-format_whitelist','image2,jpeg_pipe,png_pipe','-i',input,'-frames:v','1','-vf','scale=1440:1440:force_original_aspect_ratio=decrease:force_divisible_by=2','-q:v','3',path],signal,15000);
 return {metadata:{duration:0,width:source.width as number,height:source.height as number,codec:'image',rotation:0},frames:[{frame_id:'f000',timestamp:0,novelty:0,sharpness:0,hash:createHash('sha256').update(await readFile(path)).digest('hex')}]};
}
