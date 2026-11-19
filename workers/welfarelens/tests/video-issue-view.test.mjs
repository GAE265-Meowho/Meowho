import {test} from 'node:test';import assert from 'node:assert/strict';
import {roomFixture,observation} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {buildVideoResultView} from '../src/domain/video-issue-view.ts';
const report=obs=>({version:1,video_id:'11111111-1111-4111-8111-111111111111',source:'snapshot',...aggregateVideoIssues(obs,[],key=>key.join(':'))});
test('three-item summary retains all important issues and keeps care separate',()=>{
 const r=report([...Array.from({length:5},(_,i)=>observation('w'+i,{object_ref:i})),...roomFixture().observations.filter(o=>o.kind==='enrichment')]);const v=buildVideoResultView(r,'complete');assert.equal(v.summary.length,3);assert.equal(v.priority.length,5);assert.equal(v.care.length,3);assert.equal(v.extraImportant,2);
});
test('empty incomplete/failed results never claim no risk, unresolved identity explained',()=>{
 assert.match(buildVideoResultView(report([]),'incomplete').emptyMessage,/不能.*安全/);assert.match(buildVideoResultView(report([]),'failed').emptyMessage,/不能.*安全/);assert.match(buildVideoResultView(report([]),'complete').emptyMessage,/不代表.*安全/);
 assert.equal(buildVideoResultView(report([observation('a')]),'complete').identityLimited,true);
});

test('reading groups retain separate identities, evidence and locations while diversifying summary',()=>{
 const r=report([
  observation('a',{object_label:'沙發後方黑白線材'}),
  observation('b',{object_label:'沙發背後線材',frame_id:'f004',timestamp:4}),
  observation('c',{object_label:'落地燈旁線材',frame_id:'f008',timestamp:8}),
  observation('d',{object_label:'立燈旁線材',frame_id:'f009',timestamp:9}),
  observation('e',{object_label:'沒有位置的線材',frame_id:'f010',timestamp:10}),
 ]);
 const before=JSON.stringify(r),v=buildVideoResultView(r,'complete');
 assert.equal(v.priorityGroups.length,3);assert.equal(v.priority.length,5);
 assert.deepEqual(v.priorityGroups.map(g=>g.issues.length).sort(),[1,2,2]);
 assert.equal(new Set(v.priorityGroups.flatMap(g=>g.issues.map(i=>i.issue_id))).size,5);
 assert.equal(v.summary.length,3);assert.equal(JSON.stringify(r),before);
 const sameFrame=buildVideoResultView(report([observation('x',{object_label:'沙發線材'}),observation('y',{object_label:'沙發線材',object_ref:1})]),'complete');
 assert.equal(sameFrame.priorityGroups.length,2,'two objects in one frame are never collapsed into one reading card');
});

test('plant candidate reading group is not identity or toxicity verification; prevention stays apart from missing facts',()=>{
 const plant={object_index:0,candidates:[{common_name:'虎尾蘭',scientific_name:'Dracaena trifasciata',confidence:'low'}],features:'直立葉',identification_quality:'limited'};
 const r=report([observation('p',{rule_id:'H02',kind:'precaution',object_kind:'plant',plant}),observation('q',{rule_id:'H02',kind:'precaution',object_kind:'plant',plant,frame_id:'f004',timestamp:4}),observation('prep',{rule_id:'H05',kind:'prevention',facts:[{key:'concern_present',value:true,status:'INFERENCE',evidence:'家具上有物品',confidence:'medium'}]}),observation('unknown',{rule_id:'H05',kind:'prevention',frame_id:'f008',timestamp:8,facts:[{key:'concern_present',value:null,status:'UNKNOWN',evidence:'看不清楚',confidence:'low'}]})]);
 const v=buildVideoResultView(r,'incomplete');
 assert.equal(v.needs.length,3);assert.equal(v.prevention.length,1);assert.equal(v.needsGroups.length,2);
 assert.equal(v.needsGroups.find(g=>g.issues.length===2).relation,'candidate_topic');
 assert.equal(r.issues.length,4);
});
