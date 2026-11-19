import {test} from 'node:test';
import assert from 'node:assert/strict';
import {copyFile,mkdtemp,readFile,rm,truncate,writeFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {MeowhoError, meowhoRpc, processMeowhoJob} from '../src/server/video/meowho-worker.ts';
import {executeFixtureJob} from '../src/server/video/standalone.ts';
import {command} from '../src/server/video/media.ts';
import {randomUUID} from 'node:crypto';
import {runMeowhoQueue} from '../src/server/video/meowho-worker-mode.ts';
import {createBlobPort} from '../src/server/video/meowho-blob.ts';
import {openM6ModelGuard} from '../src/server/video/m6-model-guard.ts';

const id='4f8620ce-f4d3-4736-9e89-09231af83ec9';
const home='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',report='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const claim=(ms=30000,ext='mp4')=>({job_id:id,attempt:1,report_id:report,household_id:home,video_id:id,
 video_path:`homes/${home}/videos/${id}.${ext}`,output_prefix:`homes/${home}/reports/${report}/a1/`,
 lease_until:new Date(Date.now()+ms).toISOString()});
const fixture='welfarelens-video-spike/samples/synthetic-room.mp4';
async function rootFor(t){
 const root=await mkdtemp(join(tmpdir(),'wl-meowho-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 return root;
}

test('PostgREST transport sends JSON, parses SQL null and propagates only recognized errors',async()=>{
 const send=async(url,request)=>{
  assert.equal(url.pathname,'/rest/v1/rpc/meow_env_claim');
  assert.equal(request.headers.authorization,'Bearer mock-key');
  assert.deepEqual(JSON.parse(request.body),{p_worker:'mock'});
  return new Response('null');
 };
 const signal=new AbortController().signal;
 assert.equal(await meowhoRpc('https://example.test','mock-key',send)('meow_env_claim',{p_worker:'mock'},signal),null);
 const stale=meowhoRpc('https://example.test','mock-key',async()=>Response.json({message:'env_attempt_stale'},{status:400}));
 await assert.rejects(stale('meow_env_complete',{},signal),{code:'env_attempt_stale'});
});

test('empty queue returns idle without touching Blob; a foreign output prefix is rejected',async t=>{
 const root=await rootFor(t);
 const blob={download:()=>assert.fail('Unexpected download'),upload:()=>assert.fail('Unexpected upload')};
 assert.equal(await processMeowhoJob({root,workerId:'mock',blob,rpc:async()=>null}),'idle');
 await assert.rejects(processMeowhoJob({root,workerId:'mock',blob,rpc:async()=>({...claim(),output_prefix:'elsewhere/'})}));
});

test('M6 stops a mismatched claim before source reads, renewals or writes',async t=>{
 const root=await rootFor(t);
 const guard=openM6ModelGuard(join(root,'m6.jsonl'),()=>assert.fail('Unexpected model request'));
 try{
  await assert.rejects(processMeowhoJob({root,workerId:'mock',m6:{jobId:randomUUID(),guard},
   rpc:async name=>{assert.equal(name,'meow_env_claim');return claim();},
   blob:{download:()=>assert.fail('Unexpected download'),upload:()=>assert.fail('Unexpected upload')},
  }),{code:'config_error'});
 }finally{guard.close();}
});

test('M6 stops after an unusable HTTP 200 VLM body with no retry or publication',async t=>{
 const root=await rootFor(t);
 const sends=[];
 const guard=openM6ModelGuard(join(root,'m6.jsonl'),async url=>{
  sends.push(String(url));
  return Response.json({unusable:true});
 });
 try{
  const result=await processMeowhoJob({root,workerId:'mock',m6:{jobId:id,guard},
   env:{ENABLE_CLOUD_ANALYSIS:'true',ENABLE_IMAGE_EDITING:'true',AZURE_OPENAI_ENDPOINT:'https://mock.openai.azure.com',
    AZURE_OPENAI_API_KEY:'fixture',AZURE_OPENAI_DEPLOYMENT:'fixture',WELFARELENS_VIDEO_CONCURRENCY:'1',
    AZURE_IMAGE_ENDPOINT:'https://mock.openai.azure.com',AZURE_IMAGE_API_KEY:'fixture',AZURE_IMAGE_DEPLOYMENT:'fixture',
    WELFARELENS_VIDEO_MAX_RETRIES:'2',WELFARELENS_PDF_BROWSER:'unused'},
   rpc:async(name,body)=>{
    if(name==='meow_env_claim')return claim();
    assert.equal(name,'meow_env_fail');
    assert.equal(body.p_retryable,false);
    return 'failed';
   },
   blob:{download:(_path,file)=>copyFile(fixture,file),upload:()=>assert.fail('Unexpected upload')},
  });
  assert.equal(result,'failed');
  assert.equal(sends.length,1);
  assert.match(sends[0],/\/chat\/completions$/);
  assert.throws(guard.assertHealthy,/m6_vlm_response_unusable/);
 }finally{guard.close();}
});

test('heartbeat renews during a blocked analysis; a stale reply cancels it without publication',async t=>{
 const root=await rootFor(t);
 let inAnalysis=false, renewWhileAnalyzing=0;
 const result=await processMeowhoJob({root,workerId:'mock',heartbeatMs:15,
  rpc:async(name,body)=>{
   if(name==='meow_env_claim')return claim();
   assert.equal(name,'meow_env_renew');
   assert.deepEqual([body.p_job,body.p_attempt],[id,1]);
   if(inAnalysis){
    assert.equal(body.p_step,'analysis');
    if(++renewWhileAnalyzing===2)throw new MeowhoError('env_attempt_stale');
   }
   return new Date(Date.now()+30000).toISOString();
  },
  blob:{download:(_path,file)=>copyFile(fixture,file),upload:()=>assert.fail('Stale upload')},
  analyze:async(_input,_root,signal)=>{
   inAnalysis=true;
   await delay(2000,undefined,{signal});
   assert.fail('Lease loss should cancel a running analysis');
  },
 });
 assert.equal(result,'lease_lost');
 assert.equal(renewWhileAnalyzing,2);
});

test('expired claim does not download, upload, or call complete/fail',async t=>{
 const root=await rootFor(t);
 const result=await processMeowhoJob({root,workerId:'mock',
  rpc:async name=>{assert.equal(name,'meow_env_claim');return claim(-100);},
  blob:{download:()=>assert.fail('Expired download'),upload:()=>assert.fail('Expired upload')},
 });
 assert.equal(result,'lease_lost');
});

test('source, size, decode and duration failures report exact v0.4 codes before inference',async t=>{
 const root=await rootFor(t);
 const tooLong=join(root,'181.mov');
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:r=1:d=181','-c:v','libx264','-threads','1',tooLong]);
 for(const [code,download] of [
  ['source_invalid',()=>{throw new MeowhoError('source_invalid');}],
  ['video_too_large',async file=>{await writeFile(file,'x');await truncate(file,300000001);}],
  ['video_unreadable',file=>writeFile(file,'invalid mov')],
  ['video_too_long',file=>copyFile(tooLong,file)],
 ]){
  const result=await processMeowhoJob({root,workerId:'mock',
   rpc:async(name,body)=>{
    if(name==='meow_env_claim')return claim(30000,'mov');
    assert.equal(name,'meow_env_fail');assert.equal(body.p_code,code);assert.equal(body.p_retryable,false);return 'failed';
   },
   blob:{download:(_path,file)=>download(file),upload:()=>assert.fail('Invalid source upload')},
   analyze:()=>assert.fail('Invalid source reached inference'),
  });
  assert.equal(result,'failed');
 }
});

test('a failed required image edit cannot requeue a charged job or publish artifacts',async t=>{
 const root=await rootFor(t);
 for(const code of ['rate_limited','timeout','network','result_invalid']){
  const result=await processMeowhoJob({root,workerId:'mock',
   rpc:async(name,body)=>{
    if(name==='meow_env_claim')return claim();
    assert.equal(name,'meow_env_fail');
    assert.equal(body.p_code,code);
    assert.equal(body.p_retryable,false);
    return 'failed';
   },
   blob:{download:(_path,file)=>copyFile(fixture,file),upload:()=>assert.fail('Unexpected report upload')},
   analyze:async()=>({outcome:'completed',stages:{analysis:'completed',aggregation:'completed',pdf:'failed',json:'completed'},artifacts:[],imageFailures:[code]}),
  });
  assert.equal(result,'failed');
 }
});

test('Blob SDK port streams to exclusive local files and rejects oversize or truncated bodies',async t=>{
 const root=await rootFor(t),signal=new AbortController().signal;
 const port=(length,chunks)=>createBlobPort({getBlobClient:()=>({
  download:async()=>({contentLength:length,readableStreamBody:Readable.from(chunks.map(chunk=>Buffer.from(chunk)))}),
 })});
 const file=join(root,'download.mp4');
 await port(6,['abc','def']).download('source',file,signal);
 assert.equal(await readFile(file,'utf8'),'abcdef');
 await assert.rejects(port(300000001,['a']).download('source',join(root,'large'),signal),{code:'video_too_large'});
 await assert.rejects(port(6,['abc']).download('source',join(root,'truncated'),signal),{code:'network'});
});

test('Meowho entry accepts exact 180s MOV and analyzes eight frames with the offline fixture',async t=>{
 const root=await rootFor(t),source=join(root,'180.mov');
 const scene=JSON.parse(await readFile('evals/fixtures/worker-scene.json','utf8'));
 await command(process.env.FFMPEG_PATH||'ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:r=1:d=180','-c:v','libx264','-threads','1',source]);
 let analyzed=false;
 const result=await processMeowhoJob({root,workerId:'mock',
  rpc:async(name,body)=>{
   if(name==='meow_env_claim')return claim(30000,'mov');
   assert.equal(name,'meow_env_fail');assert.equal(body.p_code,'result_invalid');return 'failed';
  },
  blob:{download:(_path,file)=>copyFile(source,file),upload:()=>assert.fail('JSON-only fixture cannot publish')},
  analyze:async(input,output,signal)=>{
   const bundle=await executeFixtureJob({input,root:output,signal,meowhoInput:true,fixture:scene});
   assert.equal(bundle.outcome,'completed');assert.equal(bundle.duration,180);
   assert.equal(bundle.evidence.length,8);assert.ok(bundle.evidence.at(-1).timestamp>=178);
   analyzed=true;
   return bundle;
  },
 });
 assert.equal(result,'failed');
 assert.equal(analyzed,true);
});

test('Blob SDK port never overwrites attempt assets; only matching hash accepts a collision',async t=>{
 const root=await rootFor(t),file=join(root,'result.json'),signal=new AbortController().signal;
 await writeFile(file,'{}');
 let digest, matches=true;
 const port=createBlobPort({getBlockBlobClient:()=>({
  uploadFile:async(path,options)=>{
   assert.equal(path,file);assert.equal(options.conditions.ifNoneMatch,'*');
   digest=options.metadata.sha256;
   throw Object.assign(Error('already exists'),{statusCode:412});
  },
  getProperties:async()=>({metadata:{sha256:matches?digest:'foreign'}}),
 })});
 await port.upload('attempt/result.json',file,'application/json',signal);
 matches=false;
 await assert.rejects(port.upload('attempt/result.json',file,'application/json',signal),{code:'result_invalid'});
});

test('rejects a same-household source path referencing a different video',async t=>{
 const root=await rootFor(t);
 const blob={download:()=>assert.fail('Unexpected download'),upload:()=>assert.fail('Unexpected upload')};
 const otherVideo=claim().video_path.replace(id,randomUUID());
 await assert.rejects(processMeowhoJob({root,workerId:'mock',blob,rpc:async()=>({...claim(),video_path:otherVideo})}));
});

test('serial claims keep three households separate even after a permanent job failure',async t=>{
 const root=await rootFor(t);
 const signal=new AbortController().signal;
 const jobs=[1,2,3].map(attempt=>{
  const job={...claim(),job_id:randomUUID(),report_id:randomUUID(),household_id:randomUUID(),video_id:randomUUID(),attempt};
  return {...job,video_path:`homes/${job.household_id}/videos/${job.video_id}.mp4`,
   output_prefix:`homes/${job.household_id}/reports/${job.report_id}/a${attempt}/`};
 });
 let index=0, settled=0;
 await runMeowhoQueue({signal,pollMs:10000,maxJobs:3,processNext:()=>processMeowhoJob({
  root,workerId:'mock',signal,
  rpc:async(name,body)=>{
   if(name==='meow_env_claim'){
    assert.equal(index,settled);
    return jobs[index++];
   }
   const job=jobs[settled++];
   assert.equal(name,'meow_env_fail');
   assert.deepEqual([body.p_job,body.p_attempt,body.p_code,body.p_retryable],[job.job_id,job.attempt,'source_invalid',false]);
   return 'failed';
  },
  blob:{download:async path=>{
   assert.equal(path,jobs[settled].video_path);
   throw new MeowhoError('source_invalid');
  },upload:()=>assert.fail('Invalid sources must not publish')},
 })});
 assert.equal(settled,3);
});

test('shutdown cancels an in-flight source read without completing or failing the old attempt',async t=>{
 const root=await rootFor(t);
 const stop=new AbortController();
 let claimed=0,downloads=0;
 await runMeowhoQueue({signal:stop.signal,pollMs:10000,processNext:()=>processMeowhoJob({
  root,workerId:'mock',signal:stop.signal,
  rpc:async name=>{assert.equal(name,'meow_env_claim');claimed++;return claim();},
  blob:{download:async(_path,_file,signal)=>{downloads++;stop.abort();signal.throwIfAborted();},
   upload:()=>assert.fail('Stopped attempt cannot publish')},
 })});
 assert.deepEqual([claimed,downloads],[1,1]);
});
