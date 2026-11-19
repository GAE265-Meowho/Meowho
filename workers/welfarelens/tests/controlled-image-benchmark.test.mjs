import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { executeControlledImages, FrozenImageManifest, loadFrozenImages } from '../scripts/controlled-image-benchmark.ts';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const start = Date.UTC(2026, 10, 19, 6);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR2QAAAAASUVORK5CYII=', 'base64');
const manifest = {
  schema: 'welfarelens.controlled-image/v1', sourceRevision: 'a'.repeat(40), sourceDigest: 'sha256:'+'b'.repeat(64),
  pilotJournalSha256: 'c'.repeat(64), priorReservedUsdMicros: 16250000,
  image: { host:'image.openai.azure.com', deployment:'image', version:'2026-09-08', sku:'GlobalStandard',
    confirmedRpm:6, gapMs:12000, reserveUsdMicros:750000 },
  request: {apiVersion:'v1', size:'auto', quality:'high', n:1, format:'png', mime:'image/jpeg', filename:'room.jpg', timeoutMs:180000},
  cases:Array.from({length:6}, (_,i)=>({
    id:'case-'+i, frame:'f00'+i, prompt:'  不改動 '+i+'\n', promptSha256:hash('  不改動 '+i+'\n'),
    inputSha256:hash('image-'+i),
  })),
};
const config = { commit:'d'.repeat(40), imageId:'sha256:'+'e'.repeat(64), approvalRef:'test', approvedUsdMicros:9000000 };
async function fixture(t){
  const dir=await mkdtemp(join(tmpdir(),'welfarelens-controlled-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  for (const [i,c] of manifest.cases.entries()) await writeFile(join(dir,c.inputSha256+'.jpg'),'image-'+i);
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
  const frozen=await loadFrozenImages(dir);
  return {dir,frozen,approval:{...config,manifestSha256:frozen.sha256}};
}
const realSetTimeout=setTimeout;
const flush=()=>new Promise(resolve=>realSetTimeout(resolve,3));
async function drive(t,work) {
  let result;
  work.then(value=>{result={value};},error=>{result={error};});
  for(let i=0;i<500 && !result;i++){
    await flush();
    t.mock.timers.tick(6000);
  }
  assert.ok(result,'controlled run must settle');
  if(result.error)throw result.error;
  return result.value;
}
function clock(t){
  t.mock.timers.enable({apis:['Date','setTimeout'],now:start});
  t.mock.method(performance,'now',()=>Date.now()-start);
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('frozen schema checks six unique cases and rejects altered prompts and input bytes',async t=>{
  const {dir}=await fixture(t);
  assert.throws(()=>FrozenImageManifest.parse({...manifest,cases:manifest.cases.slice(1)}));
  assert.throws(()=>FrozenImageManifest.parse({...manifest,cases:Array(6).fill(manifest.cases[0])}));
  const changed=structuredClone(manifest); changed.cases[0].prompt+='changed';
  await writeFile(join(dir,'manifest.json'),JSON.stringify(changed));
  await assert.rejects(loadFrozenImages(dir),/benchmark_frozen_prompt/);
  await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest));
  await writeFile(join(dir,manifest.cases[0].inputSha256+'.jpg'),'other');
  await assert.rejects(loadFrozenImages(dir),/benchmark_frozen_image/);
});

test('A and B repeat all six semantic multipart payloads with shared pacing and stable result IDs',async t=>{
  clock(t);
  const {dir,frozen,approval}=await fixture(t);
  const payloads=[], maxima=[];
  for(const run of [1,2]){
    let active=0,max=0;
    const requests=[];
    const result=await drive(t,executeControlledImages(dir,frozen,approval,run,'offline',async (_url,{body,signal})=>{
      requests.push({at:Date.now(), prompt:body.get('prompt'), model:body.get('model'), n:body.get('n'),
        size:body.get('size'), quality:body.get('quality'), format:body.get('output_format'),
        image:hash(Buffer.from(await body.get('image').arrayBuffer()))});
      max=Math.max(max,++active);
      assert.equal(signal.aborted,false);
      await new Promise(resolve=>setTimeout(resolve,requests.length%2?30000:6000));
      active--;
      return Response.json({data:[{b64_json:png.toString('base64')}],usage:{input_tokens:1,output_tokens:2}});
    },async()=>{},dir,'offline',undefined,undefined,sleep));
    assert.equal(result.ok,true);
    assert.equal(result.counts.image,6);
    assert.deepEqual(result.cases.map(c=>c.id),manifest.cases.map(c=>c.id));
    assert.equal(result.cases.every(c=>c.outputSha256===hash(png)),true);
    assert.ok(requests.slice(1).every((r,i)=>r.at-requests[i].at>=12000));
    maxima.push(max);
    payloads.push(requests.map(({at,...request})=>request));
  }
  assert.deepEqual(maxima,[1,2]);
  assert.deepEqual(payloads[0],payloads[1]);
  const journal=await readFile(join(dir,'requests.jsonl'),'utf8');
  assert.doesNotMatch(journal,/room.jpg|不改動|image.openai/);
  assert.equal(journal.split('\n').filter(line=>line.includes('"reservedUsdMicros":750000')).length,12);
  await assert.rejects(executeControlledImages(dir,frozen,approval,1,'offline',assert.fail,assert.fail),/requires_review/);
});

for(const failure of ['429','timeout','network']){
  test(failure+' stops the batch without dropping the dispatch reserve',async t=>{
    clock(t);
    const {dir,frozen,approval}=await fixture(t);
    const result=await drive(t,executeControlledImages(dir,frozen,approval,1,'offline',async()=>{
      if(failure==='429')return new Response('',{status:429});
      throw new DOMException('failure',failure==='timeout'?'TimeoutError':'NetworkError');
    },async()=>{}));
    assert.equal(result.ok,false);
    assert.equal(result.counts.image,1);
    const events=(await readFile(join(dir,'requests.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    assert.equal(events.find(e=>e.event==='dispatch').reservedUsdMicros,750000);
    assert.equal(events.find(e=>e.event==='response').failure,failure==='429'?null:failure);
    await assert.rejects(executeControlledImages(dir,frozen,approval,2,'offline',assert.fail,assert.fail),/requires_review/);
  });
}

test('manifest identity and the exact two-round spending envelope fail closed',async t=>{
  const {dir,frozen,approval}=await fixture(t);
  for(const config of [{...approval,manifestSha256:'1'.repeat(64)},{...approval,approvedUsdMicros:8999999}])
    await assert.rejects(executeControlledImages(dir,frozen,config,1,'offline',assert.fail,assert.fail));
  await assert.rejects(executeControlledImages(dir,frozen,approval,3,'offline',assert.fail,assert.fail),/run_number/);
});

test('a changed payload is blocked before dispatch, even if the file was valid at load',async t=>{
  const {dir,frozen,approval}=await fixture(t);
  frozen.inputs[0]=Buffer.from('changed');
  const result=await executeControlledImages(dir,frozen,approval,1,'offline',assert.fail,assert.fail);
  assert.equal(result.ok,false);
  assert.equal(result.counts.image,0);
  assert.doesNotMatch(await readFile(join(dir,'requests.jsonl'),'utf8'),/"event":"dispatch"/);
});

test('live policy stops on missing usage or an estimate exceeding the per-request reserve',async t=>{
  for(const [usage,status] of [[undefined,'usage_unknown'],[{input_tokens:200000,output_tokens:1},'estimate_exceeds_reserve']]){
    const {dir,frozen,approval}=await fixture(t);
    const result=await executeControlledImages(dir,frozen,approval,1,'live',async()=>
      Response.json({data:[{b64_json:png.toString('base64')}],usage}),async()=>{});
    assert.equal(result.ok,false);
    assert.equal(result.counts.image,1);
    assert.equal(result.cases[0].status,status);
    assert.ok(result.cases[0].outputSha256);
  }
});
