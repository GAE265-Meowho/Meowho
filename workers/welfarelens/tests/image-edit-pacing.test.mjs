import assert from 'node:assert/strict';
import test from 'node:test';
import {createImageEditPacer} from '../src/server/video/image-edit-pacing.ts';
import {imageEditConcurrency} from '../src/server/video/before-after.ts';

test('Worker accepts 1/2/3, defaults to 1 and rejects 4',()=>{
 assert.deepEqual([undefined,'1','2','3'].map(imageEditConcurrency),[1,1,2,3]);
 for(const value of ['4','0','',' 2','2.5'])assert.throws(()=>imageEditConcurrency(value));
});

test('transport starts are paced across batches without serializing in-flight requests',async()=>{
 let now=0;
 const pace=createImageEditPacer(()=>now,async ms=>{now+=ms;});
 const signal=new AbortController().signal;
 const starts=[];
 let finish;
 const first=pace(signal,()=>{starts.push(now);return new Promise(resolve=>{finish=resolve;});});
 await pace(signal,async()=>starts.push(now));
 await pace(signal,async()=>starts.push(now));
 assert.deepEqual(starts,[0,12000,24000]);
 finish();await first;
});

test('cancelled pacing waits never start a transport or spend a slot',async()=>{
 let now=0,starts=0;
 const job=new AbortController();
 const pace=createImageEditPacer(()=>now,async ms=>{now+=1;job.abort();assert.equal(ms,12000);});
 const signal=new AbortController().signal;
 await pace(signal,async()=>{starts++;});
 await assert.rejects(pace(job.signal,async()=>{starts++;}),{name:'AbortError'});
 now=12000;
 await pace(signal,async()=>{starts++;});
 assert.equal(starts,2);
});
