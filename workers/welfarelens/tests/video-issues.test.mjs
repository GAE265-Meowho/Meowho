import {test} from 'node:test';import assert from 'node:assert/strict';
import {roomFixture,observation,match} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues,IssueReportSchema} from '../src/domain/video-issues.ts';
const ids=key=>`issue-${key.join('|')}`;
const aggregate=(obs,matches=[])=>aggregateVideoIssues(obs,matches,ids,{allowTestEvidence:true});
test('reconstructed room preserves different wires and merges only supported same-object pairs',()=>{
 const {observations,matches}=roomFixture(),r=aggregate(observations,matches);
 assert.equal(r.issues.length,6);assert.equal(r.observations.length,17);assert.equal(r.issues.filter(i=>i.category==='ENRICHMENT_ADVICE').length,3);
 assert.equal(r.issues.find(i=>i.observation_ids.includes('shelf-0')).observation_ids.length,2);
 assert.equal(r.issues.find(i=>i.observation_ids.includes('lamp-8')).observation_ids.length,1);
 assert.equal(new Set(r.issues.flatMap(i=>i.observation_ids)).size,17);
});
test('similar wording/species without identity proof never merges; same frame different pots never merge',()=>{
 const a=observation('a',{object_kind:'plant',rule_id:'H02'}),b=observation('b',{object_ref:1,object_kind:'plant',rule_id:'H02'});
 assert.equal(aggregate([a,b]).issues.length,2);assert.equal(aggregate([a,b],[match('a','b')]).issues.length,2);
 assert.equal(aggregate([a,{...b,frame_id:'f004',timestamp:4}]).issues.length,2);
});
test('same byte image + same object reference supports cross-frame identity, never absent object refs',()=>{
 const a=observation('a'),b=observation('b',{frame_id:'f004',timestamp:4,frame_hash:a.frame_hash});assert.equal(aggregate([a,b]).issues.length,1);
 assert.equal(aggregate([{...a,object_ref:null},{...b,object_ref:null}]).issues.length,2);
});
test('complete-link avoids transitive A-B/B-C merge without A-C evidence and respects negative evidence',()=>{
 const obs=['a','b','c'].map((n,i)=>observation(n,{frame_id:`f00${i}`,timestamp:i}));
 const r=aggregate(obs,[match('a','b'),match('b','c'),match('a','c',false)]);assert.equal(r.issues.length,2);
 assert.ok(r.issues.every(i=>!(i.observation_ids.includes('a')&&i.observation_ids.includes('c'))));
});
test('stable IDs, idempotence, order independence and immutable inputs',()=>{
 const {observations,matches}=roomFixture(),before=JSON.stringify(observations);const r=aggregate(observations,matches);
 assert.deepEqual(aggregate([...observations].reverse(),[...matches].reverse()),r);assert.deepEqual(aggregate([...observations,...observations],matches),r);assert.equal(JSON.stringify(observations),before);
 assert.throws(()=>aggregate([observations[0],{...observations[0],title:'conflict'}]),/conflict/i);
 assert.throws(()=>aggregateVideoIssues(observations,matches,ids),/test/i);
});
test('unknown/high concern remains separate from confirmed actionable evidence; all important items survive top three',()=>{
 const obs=Array.from({length:5},(_,i)=>observation(`wire-${i}`,{object_ref:i}));obs.push(observation('uncertain',{kind:'precaution',severity:'high',quality:'limited'}));
 const r=aggregate(obs);assert.equal(r.issues.length,6);assert.equal(r.issues[0].severity,'high');assert.equal(r.issues[0].category,'NEEDS_CONFIRMATION');assert.ok(r.issues.every(i=>i.verification_status==='inferred_not_verified'));
});
test('unknown, legacy and inadequate fields fail closed; report validation and collision guard',()=>{
 assert.equal(aggregate([]).issues.length,0);assert.throws(()=>aggregate([{title:'bad'}]));assert.throws(()=>aggregateVideoIssues([observation('a'),observation('b',{object_ref:1})],[],()=> 'collision'),/collision/);
 assert.equal(aggregate([observation('l',{fidelity:'legacy_limited',quality:'unknown'})]).issues[0].category,'NEEDS_CONFIRMATION');
 const r=aggregate([observation('x')]);assert.ok(IssueReportSchema.safeParse({...r,version:1,video_id:'11111111-1111-4111-8111-111111111111',source:'snapshot'}).success);
});
test('report rejects using unrelated pair evidence as identity support',()=>{
 const projection=aggregate([observation('a'),observation('b',{frame_id:'f004',timestamp:4})],[match('a','b',false)]);
 const report={...projection,version:1,video_id:'11111111-1111-4111-8111-111111111111',source:'snapshot'};report.issues[0].match_ids=[report.match_evidence[0].id];
 assert.equal(IssueReportSchema.safeParse(report).success,false);
});
