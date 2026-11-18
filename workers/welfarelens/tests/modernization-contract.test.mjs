import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {MeowhoResultSchema,readMeowhoQueueWait} from '../src/server/video/meowho-worker.ts';
import {JobProfile} from '../src/server/video/job-profile.ts';

test('the original compact result envelope accepts the approved golden payload only',async()=>{
 const golden=JSON.parse(await readFile(new URL('./fixtures/meowho-result-v1.golden.json',import.meta.url),'utf8'));
 assert.deepEqual(MeowhoResultSchema.parse(golden),golden);
 assert.equal(MeowhoResultSchema.safeParse({...golden,report_view:{}}).success,false);
 assert.equal(MeowhoResultSchema.safeParse({...golden,items:[{...golden.items[0],key:'unknown_hazard'}]}).success,false);
});

test('profile separates initial queue wait, overlap and processing time without serializing error messages',async()=>{
 const readWait=readMeowhoQueueWait('https://example.invalid','test-only',async(url,options)=>{
  assert.equal(url.searchParams.get('attempt'),'eq.1');
  assert.equal(options.method,undefined);
  return Response.json([{queued_at:'2026-11-18T01:00:00Z',started_at:'2026-11-18T01:00:05Z'}]);
 });
 const profile=new JobProfile();
 await profile.measure('claim',async()=>null);
 profile.claimed();
 profile.queuedFor(await readWait('mock-id',new AbortController().signal));
 await assert.rejects(profile.measure('image_edit_request',async()=>{throw Error('private-token');},0));
 const result=profile.snapshot('failed');
 assert.equal(result.queue_wait_ms,5000);
 assert.equal(result.spans[1].ok,false);
 assert.equal(result.spans[1].case_index,0);
 assert.doesNotMatch(JSON.stringify(result),/private-token|test-only/);
});
