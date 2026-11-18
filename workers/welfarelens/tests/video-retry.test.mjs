import {test} from 'node:test';
import assert from 'node:assert/strict';
const retry=await import('../src/server/video/retry.ts').catch(()=>({}));
test('cancellation during a real retry wait stops immediately and audit failures are never retried',async()=>{
 assert.equal(typeof retry.createRetryFetch,'function');const controller=new AbortController();let calls=0;
 const pending=retry.createRetryFetch(async()=>{calls++;return new Response('',{status:503,headers:{'retry-after':'60'}});})('https://example.invalid',{signal:controller.signal});
 setTimeout(()=>controller.abort(),10);await assert.rejects(pending);assert.equal(calls,1);
 calls=0;await assert.rejects(retry.createRetryFetch(async()=>{calls++;throw Error('audit_failed');})('https://example.invalid'),/audit_failed/);assert.equal(calls,1);
});
test('transient network and 503 retry at most two extra attempts',async()=>{
 assert.equal(typeof retry.createRetryFetch,'function');let calls=0;const waits=[];
 const request=retry.createRetryFetch(async()=>{calls++;if(calls===1)throw new TypeError('fetch failed');return new Response('{}',{status:calls===2?503:200});},{sleep:async ms=>waits.push(ms),random:()=>0});
 assert.equal((await request('https://example.invalid')).status,200);assert.equal(calls,3);assert.deepEqual(waits,[1000,2000]);
 calls=0;const failed=retry.createRetryFetch(async()=>{calls++;return new Response('',{status:500});},{sleep:async()=>{}});
 assert.equal((await failed('https://example.invalid')).status,500);assert.equal(calls,3);
});
test('429 respects Retry-After; auth, input and timeout never automatically retry',async()=>{
 assert.equal(typeof retry.createRetryFetch,'function');let calls=0;const waits=[];
 const request=retry.createRetryFetch(async()=>new Response('',{status:++calls===1?429:200,headers:{'retry-after':'4'}}),{sleep:async ms=>waits.push(ms)});
 await request('https://example.invalid');assert.deepEqual(waits,[4000]);
 for(const status of [400,401,403,422]){calls=0;await retry.createRetryFetch(async()=>{calls++;return new Response('',{status});})('https://example.invalid');assert.equal(calls,1);}
 calls=0;await assert.rejects(retry.createRetryFetch(async()=>{calls++;throw new DOMException('timeout','TimeoutError');})('https://example.invalid'));assert.equal(calls,1);
});
test('retry disabled by config and cancellation interrupts backoff without new request',async()=>{
 assert.equal(typeof retry.createRetryFetch,'function');let calls=0;await retry.createRetryFetch(async()=>{calls++;return new Response('',{status:503});},{maxRetries:0})('https://example.invalid');assert.equal(calls,1);
 const controller=new AbortController();calls=0;const pending=retry.createRetryFetch(async()=>{calls++;controller.abort();return new Response('',{status:429,headers:{'retry-after':'60'}});})('https://example.invalid',{signal:controller.signal});
 await assert.rejects(pending);assert.equal(calls,1);
});
