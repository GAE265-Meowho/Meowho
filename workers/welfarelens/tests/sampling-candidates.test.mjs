import test from 'node:test';import assert from 'node:assert/strict';
import * as sampling from '../src/domain/video-sampling.ts';
test('offline strategies preserve source PTS and cover distinct temporal windows deterministically',()=>{
 const frames=Array.from({length:40},(_,i)=>({timestamp:i,novelty:i>30?1:0,sharpness:i===11?20:1}));
 assert.equal(typeof sampling.compareSampling,'function');
 const a=sampling.compareSampling(frames,40,8);assert.deepEqual(a,sampling.compareSampling(frames,40,8));
 for(const strategy of ['uniform','windowed_change']){const selected=a[strategy];assert.equal(selected.length,8);assert.equal(new Set(selected).size,8);assert.ok(selected.every(f=>frames.includes(f)));assert.deepEqual([...new Set(selected.map(f=>Math.floor(f.timestamp/5)))],[0,1,2,3,4,5,6,7]);}
 assert.equal(a.windowed_change[2].timestamp,11);
});
test('offline sampling rejects invalid chronology and does not duplicate sparse evidence',()=>{
 assert.equal(typeof sampling.compareSampling,'function');assert.throws(()=>sampling.compareSampling([{timestamp:2,novelty:0,sharpness:1},{timestamp:1,novelty:0,sharpness:1}],3,8));
 assert.deepEqual(sampling.compareSampling([],10,8),{uniform:[],windowed_change:[]});
 assert.equal(sampling.compareSampling([{timestamp:0,novelty:0,sharpness:1}],10,8).uniform.length,1);
});

test('adaptive view samples skip duplicate pixels and preserve source timestamps',()=>{
 const frames=[0,0,80,160,160,255].map((value,timestamp)=>({timestamp,sharpness:10,pixels:Uint8Array.of(value)}));
 const selected=sampling.adaptiveViewSamples(frames,{maxFrames:4});
 assert.equal(selected.length,4);
 assert.deepEqual(selected.map(x=>x.timestamp),[0,2,3,5]);
 assert.deepEqual(sampling.adaptiveViewSamples(frames.slice(0,2)),[frames[0]]);
 assert.throws(()=>sampling.adaptiveViewSamples(frames,{maxFrames:0}));
});
