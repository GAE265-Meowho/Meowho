/** Authorized local offline evaluation only. No Azure, original mutation or metadata GPS export. */
import {mkdir,readFile,rm,stat,writeFile} from 'node:fs/promises';import {join,resolve} from 'node:path';import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {command,probeVideo,extractAt} from '../src/server/video/media.ts';
import {selectFrames} from '../src/domain/video.ts';import {compareSampling,adaptiveViewSamples} from '../src/domain/video-sampling.ts';
const input=process.argv[2];if(!input)throw Error('Pass an authorized local MOV');const out=resolve(process.argv[3]??'private-eval/real-mov');await mkdir(out,{recursive:true});
async function hashFile(path:string){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
const sourceHash=await hashFile(input);
const start=performance.now(),cpu=process.cpuUsage();let peakNodeRss=process.memoryUsage().rss;const monitor=setInterval(()=>{peakNodeRss=Math.max(peakNodeRss,process.memoryUsage().rss);},100);
try{
 const info=await probeVideo(input,undefined,180);const raw=join(out,'candidate.gray');
 const {stdout:probe}=await command('ffprobe',['-v','error','-show_entries','stream=codec_type,codec_name,avg_frame_rate,r_frame_rate:stream_side_data=rotation','-of','json',input]);
 const decodeStart=performance.now();const {stderr}=await command('ffmpeg',['-v','info','-nostdin','-y','-threads','2','-i',input,'-map','0:v:0','-an','-vf',"select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)',showinfo,scale=96:96,format=gray",'-fps_mode','vfr','-frames:v','181','-threads','2','-f','rawvideo',raw]);
 const pts=[...stderr.matchAll(/\bn:\s*\d+\s+pts:\s*[-\d]+\s+pts_time:([\d.e+-]+)/g)].map(m=>Number(m[1]));const bytes=await readFile(raw);await rm(raw,{force:true});if(bytes.length!==pts.length*9216||pts.some(t=>t>=info.duration))throw Error('Unmapped PTS');
 const frames=pts.map((timestamp,i)=>{let d=0,s=0;for(let p=1;p<9216;p++){const x=bytes[i*9216+p];if(i)d+=Math.abs(x-bytes[(i-1)*9216+p]);s+=Math.abs(x-bytes[i*9216+p-1]);}return {timestamp,novelty:d/(9215*255),sharpness:s/9215,pixels:bytes.subarray(i*9216,(i+1)*9216)};});
  const decodeMs=performance.now()-decodeStart;
 const adaptiveStart=performance.now(),adaptive=adaptiveViewSamples(frames),adaptiveMs=performance.now()-adaptiveStart;
 const strategies=Object.fromEntries(Object.entries({baseline:selectFrames(frames,8),...compareSampling(frames,info.duration,8),adaptive}).map(([name,list])=>[name,list.map(({timestamp,novelty,sharpness})=>({timestamp,novelty,sharpness}))]));
 const selected=[...new Set(Object.values(strategies).flatMap(f=>f.map(x=>x.timestamp)))].sort((a,b)=>a-b);const artifacts=[];
 for(const t of selected){const name=`at-${t.toFixed(3)}.jpg`,path=join(out,name),at=performance.now();await extractAt(input,t,path);artifacts.push({timestamp:t,path:name,sha256:createHash('sha256').update(await readFile(path)).digest('hex'),bytes:(await stat(path)).size,jpegMs:performance.now()-at});}
 // Inspectable full timeline at one-second resolution, not just the selected frames.
 await command('ffmpeg',['-v','error','-nostdin','-y','-threads','2','-i',input,'-map','0:v:0','-an','-vf',"select='isnan(prev_selected_t)+gte(t-prev_selected_t,1)',scale=180:320:force_original_aspect_ratio=decrease,pad=180:320:(ow-iw)/2:(oh-ih)/2,tile=8x5",'-frames:v','1',join(out,'timeline.jpg')]);
 const html=`<!doctype html><meta charset="utf-8"><title>Offline sampling comparison</title><style>body{font:16px sans-serif;background:#fbf5ea;color:#3f2e24}section{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}img{width:100%}figure{margin:0}h2{margin-top:36px}</style><h1>真實影片採樣：離線，非AI分析</h1><p>${info.duration}s / rotation ${info.rotation} / source ${sourceHash}</p>${Object.entries(strategies).map(([name,list])=>`<h2>${name}</h2><section>${list.map(f=>`<figure><img src="at-${f.timestamp.toFixed(3)}.jpg"><figcaption>${f.timestamp.toFixed(3)}s</figcaption></figure>`).join('')}</section>`).join('')}`;
 await writeFile(join(out,'storyboard.html'),html);
 const result={scope:'real-local-video-offline-no-AI',source_sha256:sourceHash,metadata:info,bytes:(await stat(input)).size,streams:JSON.parse(probe).streams,candidateCount:frames.length,candidates:frames.map(({timestamp,novelty,sharpness})=>({timestamp,novelty,sharpness})),strategies,artifacts,decodeMs,adaptiveMs,totalMs:performance.now()-start,cpu:process.cpuUsage(cpu),sampledPeakNodeRssMiB:peakNodeRss/1048576,memoryLimitation:'Node RSS only; does not include FFmpeg child process peak',aiCalls:0,expectedSceneCallsPerStrategy:Object.fromEntries(Object.entries(strategies).map(([name,list])=>[name,list.length]))};
 if(await hashFile(input)!==sourceHash)throw Error('Source changed');
 await writeFile(join(out,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({metadata:info,sourceBytes:result.bytes,candidates:frames.length,strategies:Object.fromEntries(Object.entries(strategies).map(([k,v])=>[k,v.map(f=>f.timestamp)])),decodeMs,adaptiveMs,totalMs:result.totalMs,nodeRssMiB:result.sampledPeakNodeRssMiB}));
}finally{clearInterval(monitor);}
