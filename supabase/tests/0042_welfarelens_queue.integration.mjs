import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { runMeowhoQueue } from '../../workers/welfarelens/src/server/video/meowho-worker-mode.ts';
import { meowhoRpc, processMeowhoJob } from '../../workers/welfarelens/src/server/video/meowho-worker.ts';
import { command } from '../../workers/welfarelens/src/server/video/media.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const db = new PGlite();
const root = await mkdtemp(join(tmpdir(), 'wl-scoped-'));
try {
 await db.exec(await read('./stub_supabase.sql'));
 for (const file of [
  '0001_meow', '0002_meow_hq', '0003_meow_site_assets', '0004_meow_cat_profile',
  '0005_meow_cat_models', '0006_meow_household_roles', '0007_meow_adoption_forms',
  '0008_meow_cat_favorites', '0009_meow_cat_returns', '0010_meow_adoption_notify',
  '0011_meow_threads', '0012_meow_thread_homed', '0013_meow_decline_reason_transfer',
  '0014_meow_room_models', '0014_meow_returns_in_threads', '0015_meow_room_floorplan',
  '0016_meow_cat_model_variants', '0017_meow_adoption_tasks', '0018_meow_task_templates_seed',
  '0019_meow_household_avatar', '0020_meow_households_module', '0022_meow_home_storage_fix',
  '0031_meow_env_jobs', '0034_meow_env_notifications', '0042_meow_env_scoped_queue',
  '0042_meow_env_scoped_queue',
 ]) await db.exec(await read('../migrations/'+file+'.sql'));

 const first = async (sql, args=[]) => (await db.query(sql,args)).rows[0]?.value;
 async function household() {
  const user=randomUUID(), id=randomUUID(), email=user+'@example.test';
  await db.query('insert into auth.users (id,email) values ($1,$2)',[user,email]);
  await db.query("insert into public.meow_profiles (id,email,display_name) values ($1,$2,'test')",[user,email]);
  await db.query("insert into public.meow_households (id,owner_id,name,caretaker_type,city,district) values ($1,$2,'test','cat_owner','桃園市','中壢區')",[id,user]);
  return id;
 }
 async function schedule(home) {
  const video=randomUUID(), request=randomUUID(), path='homes/'+home+'/videos/'+video+'.mp4';
  await db.query("insert into public.meow_home_videos (id,household_id,path,purpose,status) values ($1,$2,$3,'safety','uploaded')",[video,home,path]);
  const submit=()=>first('select meow_create_home_processing($1,null,$2) as value',[video,request]);
  const job=await submit();
  assert.deepEqual(await submit(),job);
  return {...job,path};
 }
 const allowed=await household(), foreign=await household();
 const old=await schedule(allowed), outsider=await schedule(foreign);
 await db.query('insert into public.meow_env_queue_households (household_id) values ($1)',[allowed]);
 assert.equal(await first('select meow_env_claim_household($1,$2) as value',['worker',allowed]),null);
 await assert.rejects(first('select meow_env_claim_household($1,$2) as value',['worker',foreign]),/env_scope_denied/);
 for (const role of ['anon','authenticated']) {
  assert.equal(await first("select has_function_privilege($1,'meow_env_claim_household(text,uuid)','execute') as value",[role]),false);
  assert.equal(await first("select has_function_privilege($1,'meow_env_reserve_models(uuid,int,text,uuid)','execute') as value",[role]),false);
 }
 assert.equal(await first("select has_table_privilege('service_role','meow_env_queue_households','insert') as value"),false);
 const lockJob=await schedule(allowed);
 const claim=()=>first('select meow_env_claim_household($1,$2) as value',['recovery',allowed]);
 const claims=await Promise.all([claim(),claim()]);
 assert.equal(claims.filter(Boolean).length,1);
 assert.equal(claims.find(Boolean).job_id,lockJob.env_job_id);
 const reserve=(attempt,worker)=>first('select meow_env_reserve_models($1,$2,$3,$4) as value',[lockJob.env_job_id,attempt,worker,allowed]);
 assert.equal(await reserve(1,'wrong-worker'),false);
 const expire=()=>db.query("update public.meow_env_jobs set lease_until=now()-interval '1 second' where id=$1",[lockJob.env_job_id]);
 await expire();
 assert.equal(await reserve(1,'recovery'),false);
 assert.equal((await claim()).attempt,2);
 await assert.rejects(first("select meow_env_renew($1,1,'analysis') as value",[lockJob.env_job_id]),/env_attempt_stale/);
 assert.equal(await reserve(2,'recovery'),true);
 assert.equal(await reserve(2,'recovery'),false);
 await expire();
 assert.equal(await claim(),null);
 assert.equal(await first('select status as value from meow_env_jobs where id=$1',[lockJob.env_job_id]),'failed');

 const canceled=await schedule(allowed);
 assert.equal((await claim()).job_id,canceled.env_job_id);
 await db.query('delete from public.meow_home_videos where id=$1',[canceled.video_id]);
 assert.equal(await first('select status as value from public.meow_env_jobs where id=$1',[canceled.env_job_id]),'canceled');
 await assert.rejects(first("select meow_env_renew($1,1,'analysis') as value",[canceled.env_job_id]),/env_job_canceled/);

 const broken=await schedule(allowed);
 await db.query('update public.meow_env_jobs set report_id=$1 where id=$2',[outsider.report_id,broken.env_job_id]);
 assert.equal(await claim(),null);
 assert.equal(await first('select error_code as value from public.meow_env_jobs where id=$1',[broken.env_job_id]),'source_invalid');
 assert.equal(await first('select status as value from public.meow_env_reports where id=$1',[outsider.report_id]),'queued');

 const source=join(root,'video.mp4'), background=join(root,'scene.ppm');
 const ffmpeg=process.env.FFMPEG_PATH || 'ffmpeg';
 // Stable, textured landmarks let the real report align the original and mock edit.
 const width=640,height=480,block=8,blocks=Buffer.alloc(width*height/block**2);
 let seed=19;
 for(let i=0;i<blocks.length;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  blocks[i]=seed>>>24;
 }
 const pixels=Buffer.alloc(width*height*3);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const offset=(y*width+x)*3;
  pixels.fill(blocks[Math.floor(y/block)*width/block+Math.floor(x/block)],offset,offset+3);
 }
 await writeFile(background,Buffer.concat([Buffer.from('P6\n640 480\n255\n'),pixels]));
 await command(ffmpeg,['-v','error','-loop','1','-framerate','6','-i',background,'-t','12',
  '-pix_fmt','yuv420p','-c:v','libx264','-threads','1',source]);
 const {candidate}=JSON.parse(await read('../../workers/welfarelens/evals/fixtures/worker-scene.json'));
 const uploads=new Map(), jobs=[], renewals=new Set(), outcomes=[], delays=[], failures=[], stop=new AbortController();
 const sql={
  meow_env_claim_household:'select meow_env_claim_household($1,$2) as value',
  meow_env_reserve_models:'select meow_env_reserve_models($1,$2,$3,$4) as value',
  meow_env_renew:'select meow_env_renew($1,$2,$3) as value',
  meow_env_complete:'select meow_env_complete($1,$2,$3,$4,$5,$6,$7) as value',
  meow_env_fail:'select meow_env_fail($1,$2,$3,$4,$5) as value',
 };
 let disconnected=true;
 const rpc=meowhoRpc('https://isolation.test','fixture',async (url, request)=>{
  const name=url.pathname.split('/').at(-1);
  assert.ok(sql[name], 'Only the scoped RPC can claim work');
  if(disconnected){disconnected=false;throw Error('mock network disconnect');}
  const body=JSON.parse(request.body);
  if(name==='meow_env_renew')renewals.add(body.p_job);
  if(name==='meow_env_fail')failures.push(body.p_detail);
  const args=Object.values(body).map(value=>Array.isArray(value)?JSON.stringify(value):value);
  const value=await db.transaction(async tx=>{
   await tx.exec('set local role service_role');
   return (await tx.query(sql[name],args)).rows[0].value;
  });
  return Response.json(value);
 });
 const browser=process.env.WELFARELENS_TEST_PDF_BROWSER;
 assert.ok(browser,'Set WELFARELENS_TEST_PDF_BROWSER to the packaged Chromium');
 const env={
  ENABLE_CLOUD_ANALYSIS:'true',ENABLE_IMAGE_EDITING:'true',
  AZURE_OPENAI_ENDPOINT:'https://fixture.openai.azure.com',AZURE_OPENAI_API_KEY:'fixture',AZURE_OPENAI_DEPLOYMENT:'fixture',
  AZURE_IMAGE_ENDPOINT:'https://fixture.openai.azure.com',AZURE_IMAGE_API_KEY:'fixture',AZURE_IMAGE_DEPLOYMENT:'fixture',
  WELFARELENS_PRIVATE_HTML:'true',WELFARELENS_PRIVATE_REPORT_VIEW:'true',WELFARELENS_PDF_BROWSER:browser,
 };
 const blob={
  async download(path,file){
   assert.ok(jobs.some(job=>job.path===path));
   await copyFile(source,file);
  },
  async upload(path,file){
   assert.ok(!uploads.has(path));
   uploads.set(path,await readFile(file));
  },
 };
 const next=()=>{
  let scenes=0;
  return processMeowhoJob({root,workerId:'integration',rpc,blob,env,heartbeatMs:40,signal:stop.signal,
  automatic:{householdId:allowed,ledgerDirectory:root,async modelTransport(url,request){
   if(String(url).endsWith('/chat/completions')){
    await new Promise(resolve=>setTimeout(resolve,65));
    const frame=++scenes===1?candidate:{...candidate,objects:[],assessments:[]};
    return Response.json({choices:[{message:{content:JSON.stringify(frame)}}]});
   }
   assert.match(String(url),/\/images\/edits$/);
   const scratch=await mkdtemp(join(root,'edit-'));
   const original=join(scratch,'original.jpg'), edit=join(scratch,'after.png');
   await writeFile(original,Buffer.from(await request.body.get('image').arrayBuffer()));
   await command(ffmpeg,['-v','error','-i',original,'-vf','drawbox=x=iw*.3:y=ih*.4:w=iw*.15:h=ih*.15:color=blue:t=fill',
    '-frames:v','1','-threads','1',edit]);
   return Response.json({data:[{b64_json:(await readFile(edit)).toString('base64')}]});
  }},
  });
 };
 const watchdog=setTimeout(()=>stop.abort(),120000);
 try {
  await runMeowhoQueue({signal:stop.signal,pollMs:1000,processNext:next,
   retryCode:error=>error.code==='network'?'network':undefined,
   onOutcome:outcome=>{
    outcomes.push(outcome);
    if(outcome!=='ready')stop.abort();
   },
   async wait(ms){
    delays.push(ms);
    if(delays.length===2){jobs.push(await schedule(allowed),await schedule(allowed));}
    else if(delays.length>2)stop.abort();
   },
  });
 } finally {clearTimeout(watchdog);}
 assert.deepEqual(outcomes,['ready','ready'],JSON.stringify(failures));
 assert.deepEqual(delays,[1000,1000,1000]);
 for (const job of jobs) {
  assert.ok(renewals.has(job.env_job_id));
  assert.equal(await first('select status as value from public.meow_env_jobs where id=$1',[job.env_job_id]),'done');
  assert.equal(await first('select status as value from public.meow_env_reports where id=$1',[job.report_id]),'ready');
  const prefix='homes/'+allowed+'/reports/'+job.report_id+'/a1/';
  assert.equal(JSON.parse(uploads.get(prefix+'result.json')).job_id,job.env_job_id);
  assert.ok(JSON.parse(uploads.get(prefix+'report-view.json')));
  assert.match(uploads.get(prefix+'report.html').toString(),/<html/i);
  assert.equal(uploads.get(prefix+'report.pdf').subarray(0,5).toString(),'%PDF-');
  const files=[...uploads].filter(([path])=>path.startsWith(prefix+'html-assets/'));
  assert.ok(files.length);
  for(const [path,bytes] of files)assert.equal(path.split('/').at(-1).split('.')[0],createHash('sha256').update(bytes).digest('hex'));
  const journal=(await readFile(join(root,job.env_job_id+'.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  for(const kind of ['vlm','image']) assert.ok(journal.some(event=>event.event==='start'&&event.kind===kind));
 }
 for(const job of [old,outsider])assert.equal(await first('select status as value from public.meow_env_jobs where id=$1',[job.env_job_id]),'queued');
 console.log('PASS scoped queue: two automatic mock-model reports, idle/reconnect, leases, reservation, publication and untouched out-of-scope jobs');
} finally {
 await db.close();
 await rm(root,{recursive:true,force:true});
}
