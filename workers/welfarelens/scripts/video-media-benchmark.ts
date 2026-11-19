// Local paired decoding only: no environment secrets, network, AI or retained media.
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {command,probeVideo} from '../src/server/video/media.ts';
import {cropRegion} from '../src/domain/plant-refinement.ts';
const input=process.argv[2];if(!input)throw Error('Pass a local MP4');
const filter='scale=1440:1440:force_original_aspect_ratio=decrease:force_divisible_by=2';
const times=[0,4.004,8.008,9.009,10.010,11.011,12.012,13.013];
const jobs=times.map(timestamp=>({timestamp,filter}));
if(process.argv[3]){
 const privateDir=join(process.cwd(),'.video-scans',process.argv[3]);
 if(!/^[a-f0-9-]{36}$/.test(process.argv[3]))throw Error('Invalid job ID');
 const job=JSON.parse(await readFile(join(privateDir,'job.json'),'utf8'));if(job.expires_at<=Date.now())throw Error('Expired');
 const snapshot=JSON.parse(await readFile(join(privateDir,'issues.json'),'utf8'));
 jobs.length=0;
 for(let i=9;i<=14;i++){
  const a=JSON.parse(await readFile(join(privateDir,`audit-${String(i).padStart(2,'0')}.json`),'utf8'));
  const c=snapshot.frames.find((f:{frame:{frame_id:string}})=>f.frame.frame_id===a.frame_id).initial_candidate;
  const r=cropRegion(c.objects[a.object_index].bbox,100000,100000);if(!r)throw Error('Missing crop');
  jobs.push({timestamp:a.timestamp,filter:`crop=w='max(2,trunc(iw*${r.width/100000}/2)*2)':h='max(2,trunc(ih*${r.height/100000}/2)*2)':x='iw*${r.x/100000}':y='ih*${r.y/100000}',scale=1536:1536:force_original_aspect_ratio=decrease:force_divisible_by=2`});
 }
}
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const dir=await mkdtemp(join(tmpdir(),'wl-media-paired-'));
try{
 await probeVideo(input);const rows=[];
 for(const {timestamp,filter} of jobs){
  const hashes=[],ms=[];
  for(const fast of [false,true]){
   const path=join(dir,`${fast?'fast':'old'}.jpg`),start=performance.now();
   await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y','-threads','2','-protocol_whitelist','file,pipe','-format_whitelist','mov',...(fast?['-ss',timestamp.toFixed(6)]:[]),'-i',input,...(fast?[]:['-ss',timestamp.toFixed(6)]),'-map','0:v:0','-an','-frames:v','1','-vf',filter,'-q:v','3','-threads','2',path]);
   ms.push(performance.now()-start);hashes.push(hash(await readFile(path)));
  }
  rows.push({timestamp,legacyMs:ms[0],inputSeekMs:ms[1],identical:hashes[0]===hashes[1]});
 }
 console.log(JSON.stringify({scope:process.argv[3]?'paired-local-plant-crops-no-AI':'paired-local-scene-jpeg-no-AI',rows,legacyMs:rows.reduce((n,r)=>n+r.legacyMs,0),inputSeekMs:rows.reduce((n,r)=>n+r.inputSeekMs,0)},null,2));
}finally{await rm(dir,{recursive:true,force:true});}
