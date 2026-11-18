import {test} from 'node:test';import assert from 'node:assert/strict';
import {approximateObjectHint} from '../src/domain/approximate-location.ts';
import {observation} from './fixtures/video-p0.mjs';
const o=observation('wire',{candidate_bbox:[.1,.2,.4,.8],frame_hash:'a'.repeat(64)});
const issue={issue_id:'i',category:'PRIORITY_ACTION',observation_ids:['wire']};
const e={observation_id:'wire',frame_id:'f000',timestamp:0};const f={frame_id:'f000',timestamp:0,hash:o.frame_hash};
test('exact selected object produces explicitly approximate AI hint without changing input',()=>{const before=JSON.stringify(o);const h=approximateObjectHint(issue,e,o,f);assert.deepEqual(h?.bbox,o.candidate_bbox);assert.equal(h?.label,'壁架下線材');assert.equal(h?.source,'ai_estimate');assert.equal(JSON.stringify(o),before);});
test('does not borrow positions across issues, times, frames or image hashes',()=>{for(const patch of [{observation_id:'other'},{frame_id:'f001'},{timestamp:4}])assert.equal(approximateObjectHint(issue,{...e,...patch},o,f),null);assert.equal(approximateObjectHint({...issue,observation_ids:['other']},e,o,f),null);assert.equal(approximateObjectHint(issue,e,o,{...f,hash:'b'.repeat(64)}),null);});
test('no fabricated location for missing, invalid, legacy, unusable or general advice',()=>{for(const patch of [{candidate_bbox:null},{candidate_bbox:[.5,.2,.1,.4]},{candidate_bbox:[0,0,2,1]},{object_ref:null},{quality:'unusable'},{fidelity:'legacy_limited'},{kind:'enrichment'}])assert.equal(approximateObjectHint(issue,e,{...o,...patch},f),null);assert.equal(approximateObjectHint({...issue,category:'ENRICHMENT_ADVICE'},e,o,f),null);assert.equal(approximateObjectHint(issue,e,undefined,f),null);});
