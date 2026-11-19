// Offline only. Repeated/transcoded room media is a decoder test, never new AI quality evidence.
import {mkdtemp,rm,stat,writeFile,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {command,probeVideo,extractVideo} from '../src/server/video/media.ts';
import {selectFrames} from '../src/domain/video.ts';
const input=process.argv[2];if(!input)throw Error('Pass the authorized local room video');
const dir=await mkdtemp(join(tmpdir(),'wl-long-')),rows=[];
try{
 for(const seconds of [14.015,120,180]){
  const local=seconds<20?input:join(dir,`repeat-${seconds}.mp4`);
  if(seconds>=20)await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-nostdin','-y','-threads','2','-stream_loop','-1','-i',input,'-t',String(seconds),'-an','-vf','scale=960:540,fps=5','-c:v','libx264','-preset','ultrafast','-crf','28','-threads','2',local],undefined,180000);
  const start=performance.now(),info=await probeVideo(local,undefined,180),out=join(dir,`frames-${seconds}`);const {mkdir}=await import('node:fs/promises');await mkdir(out);
  const frames=await extractVideo(local,out,info.duration,new AbortController().signal);
  const times=frames.map(f=>f.timestamp),old=times.filter(t=>t<=90),uniform=Array.from({length:8},(_,i)=>i*Math.max(0,info.duration-1)/7);
  const coverage=(ts:number[])=>new Set(ts.map(t=>Math.min(5,Math.floor(t/info.duration*6)))).size;
  const sizes=await Promise.all(frames.map(f=>stat(join(out,`${f.frame_id}.jpg`)).then(s=>s.size)));
  const aborted=new AbortController();aborted.abort();let cancel=false;try{await extractVideo(local,out,info.duration,aborted.signal);}catch{cancel=true;}
  rows.push({duration:info.duration,source:seconds<20?'original_real_video':'synthetic_repeated_transcoded_real_video_not_new_room_coverage',codec:info.codec,width:info.width,height:info.height,bytes:(await stat(local)).size,decodeAndJpegMs:performance.now()-start,frames:times,jpegBytes:sizes,temporalBinsSelected:coverage(times),temporalBinsOldTruncationUpperBound:coverage(old),temporalBinsUniform:coverage(uniform),cancelledPrestart:cancel,nodeRssMb:process.memoryUsage().rss/1048576,aiCalls:0});
 }
 // Temporal-only strategy evidence, not object recall. Decoding never buffers the original MP4.
 await writeFile(resolve('private-eval/visual-report/long-video-results.json'),JSON.stringify({scope:'offline-no-AI',candidateGrayBoundBytes:181*96*96,productionGateSeconds:90,rows},null,2));console.log(JSON.stringify(rows,null,2));
}finally{await rm(dir,{recursive:true,force:true});}
