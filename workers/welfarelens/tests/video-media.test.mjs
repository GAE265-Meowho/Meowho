import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const media=await import('../src/server/video/media.ts').catch(()=>({}));
import {readFile} from 'node:fs/promises';
test('real FFmpeg probes synthetic MP4, decodes original timestamp samples and rejects corrupt media',async()=>{
 assert.equal(typeof media.extractVideo,'function');const dir=await mkdtemp(join(tmpdir(),'wl-media-'));try{
 const input=resolve('welfarelens-video-spike/samples/synthetic-room.mp4');const info=await media.probeVideo(input);assert.ok(info.duration>1&&info.duration<=90);assert.equal(info.codec,'h264');
 const frames=await media.extractVideo(input,dir,info.duration,new AbortController().signal);assert.ok(frames.length>=2&&frames.length<=8);assert.ok(frames[0].timestamp>=0);assert.ok(frames.at(-1).timestamp<=info.duration);assert.ok(frames.every((f,i)=>i===0||f.timestamp>frames[i-1].timestamp));
 await writeFile(join(dir,'bad.mp4'),'not a movie');await assert.rejects(media.probeVideo(join(dir,'bad.mp4')));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('accurate input seeking preserves JPEG bytes at decoded PTS',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wl-seek-'));try{
 const input=resolve('welfarelens-video-spike/samples/synthetic-room.mp4');
 for(const t of [0,1,2]){
  const old=join(dir,`old-${t}.jpg`),now=join(dir,`now-${t}.jpg`);
  await media.command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-threads','2','-protocol_whitelist','file,pipe','-format_whitelist','mov','-i',input,'-ss',t.toFixed(6),'-map','0:v:0','-an','-frames:v','1','-vf','scale=1440:1440:force_original_aspect_ratio=decrease:force_divisible_by=2','-q:v','3','-threads','2',old]);
  await media.extractAt(input,t,now);assert.deepEqual(await readFile(now),await readFile(old));
 }
 }finally{await rm(dir,{recursive:true,force:true});}
});
