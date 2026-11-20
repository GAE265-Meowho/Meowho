import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { BenchmarkConfig, maximumBenchmarkRound, openBenchmarkRun } from '../src/server/video/benchmark-guard.ts';
import { benchmarkAzureEnv, verifyBenchmarkImage, verifyLocalM6Image } from '../scripts/run-pipeline-benchmark.mjs';

const vlm={host:'vlm.openai.azure.com',deployment:'test-vlm',version:'test',sku:'test',confirmedRpm:60001,gapMs:1,reserveUsdMicros:10};
const image={...vlm,host:'image.openai.azure.com',deployment:'test-image',confirmedRpm:6,gapMs:12000,reserveUsdMicros:30};
const config=BenchmarkConfig.parse({approvalRef:'test',commit:'a'.repeat(40),digest:'sha256:'+'b'.repeat(64),
 inputSha256:'c'.repeat(64),pilotUsdMicros:800,batchUsdMicros:3000,vlm,image});

test('M6 local launcher accepts only the approved image ID, OCI revision and Linux AMD64',()=>{
 const imageId='sha256:'+'1'.repeat(64);
 const approved={commit:config.commit,imageId};
 const inspected={Id:imageId,Os:'linux',Architecture:'amd64',
  Config:{Labels:{'org.opencontainers.image.revision':config.commit}}};
 assert.deepEqual(verifyLocalM6Image(approved,inspected),{ref:imageId,imageId,revision:config.commit});
 assert.throws(()=>verifyLocalM6Image(approved,{...inspected,Id:config.digest}),/mismatch/);
 assert.throws(()=>verifyLocalM6Image(approved,{...inspected,Architecture:'arm64'}),/mismatch/);
 assert.throws(()=>verifyLocalM6Image(approved,{...inspected,Config:{Labels:{}}}),/mismatch/);
});

test('Docker launcher pins the inspected Linux AMD64 image and rejects mismatched release evidence',()=>{
 const ref='ghcr.io/gae265-meowho/meowho/welfarelens-worker@'+config.digest;
 const imageId='sha256:'+'1'.repeat(64);
 const inspected={RepoDigests:[ref],Id:imageId,Os:'linux',Architecture:'amd64',
  Config:{Labels:{'org.opencontainers.image.revision':config.commit}}};
 assert.deepEqual(verifyBenchmarkImage(config,inspected),{ref,imageId,revision:config.commit});
 for(const change of [{RepoDigests:[]},{RepoDigests:['other/image@'+config.digest]},
   {Id:'latest'},{Architecture:'arm64'},{Os:'windows'},
   {Config:{Labels:{'org.opencontainers.image.revision':'d'.repeat(40)}}}]){
  assert.throws(()=>verifyBenchmarkImage(config,{...inspected,...change}),/mismatch/);
 }
});

test('launcher passes only Azure AI configuration and rejects missing or multiline keys',()=>{
 const six=['AZURE_OPENAI_ENDPOINT','AZURE_OPENAI_DEPLOYMENT','AZURE_OPENAI_API_KEY',
  'AZURE_IMAGE_ENDPOINT','AZURE_IMAGE_DEPLOYMENT','AZURE_IMAGE_API_KEY'];
 const env=six.map(name=>name+'="dummy-value"').join('\n');
 assert.deepEqual(Object.keys(benchmarkAzureEnv(env+'\nMEOWHO_SUPABASE_SERVICE_ROLE_KEY=no\nWELFARELENS_MEDIA_DEV_SAS_URL=no')),six);
 assert.throws(()=>benchmarkAzureEnv(env.replace('AZURE_IMAGE_API_KEY','MISSING')),/AZURE_IMAGE_API_KEY/);
 assert.throws(()=>benchmarkAzureEnv(env.replace('AZURE_IMAGE_API_KEY="dummy-value"','AZURE_IMAGE_API_KEY="unsafe\nvalue"')),/AZURE_IMAGE_API_KEY/);
});
const invoke=(guard,kind='vlm',deployment=config[kind].deployment)=>{
 const path=kind==='vlm'?'chat/completions':'images/edits';
 return guard.providerRequests[kind](`https://${config[kind].host}/openai/v1/${path}`,
  {method:'POST',redirect:'error',headers:{'api-key':'dummy-test-secret'},body:JSON.stringify({model:deployment})});
};

async function workspace(t){
 const folder=await mkdtemp(join(tmpdir(),'welfare-benchmark-'));
 t.after(()=>rm(folder,{recursive:true,force:true}));
 return folder;
}

test('the batch is locked, order is fixed and an existing round is never reset',async t=>{
 const folder=await workspace(t);
 const first=await openBenchmarkRun(folder,config,1,'pilot',async()=>new Response('{}'));
 await assert.rejects(openBenchmarkRun(folder,config,1,'pilot'),{code:'EEXIST'});
 assert.equal(first.concurrency,1);
 await invoke(first);
 await first.close(true);
 await assert.rejects(openBenchmarkRun(folder,config,1,'pilot'),/requires_review/);
 await assert.rejects(openBenchmarkRun(folder,{...config,approvalRef:'different'},2,'pilot'),/config_changed/);
 const second=await openBenchmarkRun(folder,config,2,'pilot',async()=>new Response('{}'));
 assert.equal(second.concurrency,2);
 await second.close(true);
 await assert.rejects(openBenchmarkRun(folder,config,3,'pilot'),/run_number/);
 await assert.rejects(openBenchmarkRun(folder,config,3,'remaining'),/expansion_approval/);
 await assert.rejects(openBenchmarkRun(folder,config,3,'remaining',fetch,'reviewed-pilot'),/reconciliation/);
 await writeFile(join(folder,'verified-billing.json'),'{"1":10,"2":0}');
 const third=await openBenchmarkRun(folder,config,3,'remaining',fetch,'reviewed-pilot');
 assert.equal(third.concurrency,2);
 await third.close(true);
 await assert.rejects(openBenchmarkRun(folder,config,4,'remaining',fetch,'other-review'),/requires_review/);
 await writeFile(join(folder,'verified-billing.json'),'{"1":9,"2":0}');
 await assert.rejects(openBenchmarkRun(folder,config,4,'remaining',fetch,'reviewed-pilot'),/reconciliation/);
});

test('the $30 pilot is independent of the $40 expansion envelope',async t=>{
 const folder=await workspace(t);
 const staged=BenchmarkConfig.parse({...config,pilotUsdMicros:30_000_000,batchUsdMicros:40_000_000,
  vlm:{...vlm,reserveUsdMicros:500_000},image:{...image,reserveUsdMicros:1_000_000}});
 assert.equal(maximumBenchmarkRound(staged),15_000_000);
 assert.equal(BenchmarkConfig.safeParse({...staged,pilotUsdMicros:30_000_001}).success,false);
 assert.equal(BenchmarkConfig.safeParse({...staged,batchUsdMicros:40_000_001}).success,false);
 const first=await openBenchmarkRun(folder,staged,1,'pilot',async()=>new Response('{}'));
 await invoke(first);
 await first.close(true);
 const second=await openBenchmarkRun(folder,staged,2,'pilot');
 await second.close(true);
 await writeFile(join(folder,'verified-billing.json'),'{"1":500000,"2":0}');
 await assert.rejects(openBenchmarkRun(folder,staged,3,'remaining',fetch,'approved'),/benchmark_budget/);
});

test('expansion counts all four future rounds and carries the higher of billed and reserved amounts',async t=>{
 const folder=await workspace(t);
 const staged={...config,batchUsdMicros:1540};
 const first=await openBenchmarkRun(folder,staged,1,'pilot',async()=>new Response('{}'));
 await invoke(first);
 await first.close(true);
 const second=await openBenchmarkRun(folder,staged,2,'pilot',async()=>new Response('{}'));
 await invoke(second);
 await second.close(true);
 await writeFile(join(folder,'verified-billing.json'),'{"1":0}');
 await assert.rejects(openBenchmarkRun(folder,staged,3,'remaining',fetch,'approved'),/reconciliation/);
 await writeFile(join(folder,'verified-billing.json'),'{"1":0,"2":11}');
 await assert.rejects(openBenchmarkRun(folder,staged,3,'remaining',fetch,'approved'),/benchmark_budget/);
 await writeFile(join(folder,'verified-billing.json'),'{"1":0,"2":10}');
 const third=await openBenchmarkRun(folder,staged,3,'remaining',fetch,'approved');
 await third.close(true);
 const fourth=await openBenchmarkRun(folder,staged,4,'remaining',fetch,'approved');
 await fourth.close(true);
});

test('budget rejects a round before any network request',async t=>{
 const folder=await workspace(t);
 await assert.rejects(openBenchmarkRun(folder,{...config,pilotUsdMicros:379},1,'pilot',
  async()=>assert.fail('unexpected request')),/budget/);
});

test('transport failures count against the VLM cap and the journal omits request details',async t=>{
 const folder=await workspace(t);
 let calls=0;
 const guard=await openBenchmarkRun(folder,config,1,'pilot',async()=>{
  calls++;
  if(calls===1)throw new TypeError('private provider failure');
  return new Response('{}');
 });
 await assert.rejects(invoke(guard),TypeError);
 for(let i=1;i<14;i++)await invoke(guard);
 await assert.rejects(invoke(guard),/benchmark_limit/);
 await guard.close(true);
 assert.equal(calls,14);
 const journal=await readFile(join(folder,'requests.jsonl'),'utf8');
 assert.doesNotMatch(journal,/private provider failure|dummy-test-secret|openai\.azure/);
 assert.match(journal,/"failure":"network"/);
 assert.match(journal,/"ok":false/);
 await assert.rejects(openBenchmarkRun(folder,config,2,'pilot'),/requires_review/);
});

test('an early timer wake-up keeps waiting without dispatching or charging the journal',async t=>{
 const folder=await workspace(t);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 let monotonic=0;
 t.mock.method(performance,'now',()=>monotonic);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const starts=[];
 const guard=await openBenchmarkRun(folder,config,1,'pilot',async()=>{
  starts.push(monotonic);
  return new Response('{}');
 });
 await invoke(guard);
 const completed=invoke(guard).then(()=>null,error=>error);
 await flush();
 monotonic=0.75;
 t.mock.timers.tick(1);
 await flush();
 assert.deepEqual(starts,[0]);
 assert.equal(guard.counts().vlm,1);
 monotonic=1.75;
 t.mock.timers.tick(1);
 assert.equal(await completed,null);
 assert.deepEqual(starts,[0,1.75]);
 assert.equal(guard.counts().vlm,2);
 await guard.close(true);
});

test('a wall clock rollback blocks dispatch and leaves the request budget unchanged',async t=>{
 const folder=await workspace(t);
 const start=Date.now();
 t.mock.timers.enable({apis:['Date'],now:start});
 let calls=0;
 const guard=await openBenchmarkRun(folder,config,1,'pilot',async()=>{
  calls++;
  return new Response('{}');
 });
 await invoke(guard);
 t.mock.timers.setTime(start-1);
 await assert.rejects(invoke(guard),/benchmark_clock/);
 assert.equal(calls,1);
 assert.equal(guard.counts().vlm,1);
 await guard.close(false);
});

test('paired image starts use the same shared limiter and a 429 blocks later paid requests',async t=>{
 const folder=await workspace(t);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 const start=Date.now();
 t.mock.method(performance,'now',()=>Date.now()-start);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const starts=[];
 let release;
 const inFlight=new Promise(resolve=>{release=resolve;});
 const guard=await openBenchmarkRun(folder,config,1,'pilot',async()=>{
  starts.push(Date.now());
  return starts.length===1?inFlight:new Response('{}',{status:429});
 });
 const first=invoke(guard,'image'),second=invoke(guard,'image');
 await flush();
 assert.equal(starts.length,1);
 t.mock.timers.tick(11999);
 await flush();
 assert.equal(starts.length,1);
 t.mock.timers.tick(1);
 assert.equal((await second).status,429);
 assert.equal(starts[1]-starts[0],12000);
 release(new Response('{}'));
 await first;
 await assert.rejects(invoke(guard,'vlm'),/benchmark_stopped/);
 await guard.close(false);
});

test('unapproved deployment cannot dispatch and less than 12 seconds is rejected',async t=>{
 const folder=await workspace(t);
 assert.equal(BenchmarkConfig.safeParse({...config,image:{...image,gapMs:10000}}).success,false);
 const guard=await openBenchmarkRun(folder,config,1,'pilot',async()=>assert.fail('unexpected request'));
 await assert.rejects(invoke(guard,'vlm','wrong'),/unexpected_request/);
 await guard.close(false);
});

test('summary keeps missing measurements unknown and reports the median of all three rounds',async t=>{
 const folder=await workspace(t);
 await writeFile(join(folder,'requests.jsonl'),'{"event":"batch"}\n');
 const version={commit:config.commit,digest:config.digest,ociRevision:config.commit,imageId:'sha256:'+'1'.repeat(64)};
 for(const [run,duration_ms] of [[1,7000],[4,9000],[5,5000]]){
  await writeFile(join(folder,`run-${run}.json`),JSON.stringify({...version,ok:true,profile:{spans:[{stage:'local_pipeline',duration_ms}]}}));
 }
 const render=()=>execFileSync(process.execPath,['scripts/summarize-pipeline-benchmark.mjs',folder],{encoding:'utf8'});
 const rendered=render();
 assert.match(rendered,/實測映像 Commit／OCI revision/);
 assert.match(rendered,/路數 1 的成功樣本 3\/3。排序秒數 5、7、9。中位數 7，最慢值 9。/);
 assert.match(rendered,/路數 2 的成功樣本 0\/3。排序秒數 待測。中位數 待測，最慢值 待測。/);
 await writeFile(join(folder,'run-2.json'),JSON.stringify({ok:true,...version,imageId:'sha256:'+'2'.repeat(64)}));
 const mixed=render();
 assert.match(mixed,/映像版本存在差異/);
 assert.doesNotMatch(mixed,/中位數 7/);
});
