import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {observation,id} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {buildWelfareLensReport} from '../src/domain/welfare-report.ts';
import {prepareMeowhoItems,MeowhoResultSchema} from '../src/server/video/meowho-worker.ts';
import {command} from '../src/server/video/media.ts';

test('Meowho publication creates a provenance-checked estimated crop under attempt prefix and carries exact danger keys',async t=>{
 const root=await mkdtemp(join(tmpdir(),'wl-crop-contract-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const scene=join(root,'analysis');
 const directory=join(scene,'job');
 const {mkdir,writeFile}=await import('node:fs/promises');
 await mkdir(directory,{recursive:true});
 const framePath=join(directory,'f000.jpg');
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=red:s=320x240:d=1','-frames:v','1','-q:v','2',framePath]);
 const bytes=await readFile(framePath),sha256=createHash('sha256').update(bytes).digest('hex');
 const raw=observation('wire',{candidate_bbox:[.2,.2,.8,.8]});
 const issueReport={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([raw],[],keys=>`issue-${keys.join('-')}`)};
 const canonical=buildWelfareLensReport(issueReport,'complete',123);
 const uploaded=[];
 const bundle={warnings:[],evidence:[{frame_id:'f000',timestamp:0,sha256,path:'f000.jpg'}],model:'mock fixture',duration:1};
 const signal=new AbortController().signal;
 const prepared=await prepareMeowhoItems({canonical,bundle,directory,outputPrefix:'homes/home/reports/report/a1/',signal,
  ensure:()=>{},upload:async(path,file,type)=>{uploaded.push({path,file,type});assert.ok((await stat(file)).size>100);}});
 assert.equal(prepared.items.length,1);
 assert.equal(prepared.items[0].key,'cable');
 assert.equal(prepared.items[0].frame_index,0);
 assert.equal(prepared.items[0].crop_path,'homes/home/reports/report/a1/crops/cable.jpg');
 assert.match(prepared.items[0].note,/AI 估計範圍/);
 assert.ok(prepared.items[0].note.length<=200);
 assert.match(prepared.items[0].note,/建議：/);
 assert.deepEqual(uploaded.map(x=>[x.path,x.type]),[['homes/home/reports/report/a1/crops/cable.jpg','image/jpeg']]);
 const result=MeowhoResultSchema.parse({schema:'meow_env_result/1',job_id:id,report_id:id,attempt:1,
  worker:{id:'test',version:'test'},model:{name:'fixture',version:'synthetic'},video:{duration_s:1,frames:1},summary:'合約測試',
  items:prepared.items,warnings:prepared.warnings,created_at:new Date(123).toISOString()});
 assert.deepEqual(Object.keys(result.items[0]).sort(),['crop_path','frame_index','key','label','level','note','t_s'].sort());
});

test('a candidate crop too small to read is omitted with a warning while the item remains',async t=>{
 const root=await mkdtemp(join(tmpdir(),'wl-crop-small-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const {mkdir}=await import('node:fs/promises');
 await mkdir(root,{recursive:true});
 const framePath=join(root,'f000.jpg');
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x240:d=1','-frames:v','1','-q:v','2',framePath]);
 const bytes=await readFile(framePath),sha256=createHash('sha256').update(bytes).digest('hex');
 const raw=observation('wire',{candidate_bbox:[.3,.3,.31,.31]});
 const issueReport={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([raw],[],keys=>`issue-${keys.join('-')}`)};
 const canonical=buildWelfareLensReport(issueReport,'complete',123);
 let uploads=0;
 const prepared=await prepareMeowhoItems({canonical,bundle:{warnings:[],evidence:[{frame_id:'f000',timestamp:0,sha256,path:'f000.jpg'}],model:'fixture',duration:1},directory:root,
  outputPrefix:'homes/home/reports/report/a1/',signal:new AbortController().signal,ensure:()=>{},upload:async()=>uploads++});
 assert.equal(prepared.items.length,1);
 assert.equal(prepared.items[0].crop_path,null);
 assert.equal(uploads,0);
 assert.ok(prepared.warnings.some(w=>w.code==='crop_unavailable'));
});

test('a small first estimate falls through to a valid same-key frame and updates its evidence time',async t=>{
 const root=await mkdtemp(join(tmpdir(),'wl-crop-fallback-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const {mkdir,copyFile}=await import('node:fs/promises');
 await mkdir(root,{recursive:true});
 const first=join(root,'f000.jpg'),second=join(root,'f001.jpg');
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=blue:s=320x240:d=1','-frames:v','1','-q:v','2',first]);
 await copyFile(first,second);
 const a=await readFile(first),b=await readFile(second);
 const observations=[
  observation('tiny-wire',{candidate_bbox:[.3,.3,.31,.31]}),
  observation('visible-wire',{frame_id:'f001',timestamp:1,object_label:'電線',candidate_bbox:[.1,.1,.8,.8]}),
 ];
 const issueReport={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(observations,[],keys=>`issue-${keys.join('-')}`)};
 const canonical=buildWelfareLensReport(issueReport,'complete',123);
 const uploaded=[];
 const prepared=await prepareMeowhoItems({canonical,bundle:{warnings:[],evidence:[
  {frame_id:'f000',timestamp:0,sha256:createHash('sha256').update(a).digest('hex'),path:'f000.jpg'},
  {frame_id:'f001',timestamp:1,sha256:createHash('sha256').update(b).digest('hex'),path:'f001.jpg'},
 ],model:'fixture',duration:2},directory:root,outputPrefix:'homes/home/reports/report/a1/',signal:new AbortController().signal,
  ensure:()=>{},upload:async(path,file)=>uploaded.push({path,file})});
 assert.equal(prepared.items.length,1);
 assert.equal(prepared.items[0].crop_path,'homes/home/reports/report/a1/crops/cable.jpg');
 assert.equal(prepared.items[0].frame_index,1);
 assert.equal(prepared.items[0].t_s,1);
 assert.equal(uploaded.length,1);
});

test('missing or mismatched evidence position never creates or uploads a crop',async t=>{
 const root=await mkdtemp(join(tmpdir(),'wl-crop-none-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const raw=observation('wire',{candidate_bbox:null});
 const issueReport={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([raw],[],keys=>`issue-${keys.join('-')}`)};
 const canonical=buildWelfareLensReport(issueReport,'complete',123);
 let uploads=0;
 const prepared=await prepareMeowhoItems({canonical,bundle:{warnings:[],evidence:[],model:'fixture',duration:1},directory:root,
  outputPrefix:'homes/home/reports/report/a1/',signal:new AbortController().signal,ensure:()=>{},upload:async()=>uploads++});
 assert.equal(prepared.items[0].crop_path,null);
 assert.equal(uploads,0);
});
