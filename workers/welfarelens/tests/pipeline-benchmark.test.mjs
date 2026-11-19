import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { BenchmarkConfig, openBenchmarkRun } from '../src/server/video/benchmark-guard.ts';

const vlm={host:'vlm.openai.azure.com',deployment:'test-vlm',version:'test',sku:'test',confirmedRpm:60001,gapMs:1,reserveUsdMicros:10};
const image={...vlm,host:'image.openai.azure.com',deployment:'test-image',confirmedRpm:6,gapMs:12000,reserveUsdMicros:30};
const config=BenchmarkConfig.parse({approvalRef:'test',commit:'a'.repeat(40),digest:'sha256:'+'b'.repeat(64),
 inputSha256:'c'.repeat(64),pilotUsdMicros:800,batchUsdMicros:3000,vlm,image});
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
 const third=await openBenchmarkRun(folder,config,3,'remaining',fetch,'reviewed-pilot');
 assert.equal(third.concurrency,2);
 await third.close(true);
 await assert.rejects(openBenchmarkRun(folder,config,4,'remaining',fetch,'other-review'),/requires_review/);
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

test('paired image starts use the same shared limiter and a 429 blocks later paid requests',async t=>{
 const folder=await workspace(t);
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
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
 for(const [run,duration_ms] of [[1,7000],[4,9000],[5,5000]]){
  await writeFile(join(folder,`run-${run}.json`),JSON.stringify({ok:true,profile:{spans:[{stage:'local_pipeline',duration_ms}]}}));
 }
 const rendered=execFileSync(process.execPath,['scripts/summarize-pipeline-benchmark.mjs',folder],{encoding:'utf8'});
 assert.match(rendered,/路數 1 的成功樣本 3\/3。排序秒數 5、7、9。中位數 7，最慢值 9。/);
 assert.match(rendered,/路數 2 的成功樣本 0\/3。排序秒數 待測。中位數 待測，最慢值 待測。/);
});
