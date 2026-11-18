import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRoomPlan } from '../src/domain/room-improvement.ts';
import { demoEvidence, demoScene } from '../src/data/demo.ts';

const objects=demoScene().objects.map(o=>({kind:o.kind,label:o.label,bbox:o.bbox,notes:'fixture'}));
test('direct plan retains sources and unknowns without simulating baseline or removing unknown plants',()=>{
 const evidence=demoEvidence(), before=JSON.stringify(evidence);
 const plan=buildRoomPlan(evidence,objects);
 assert.equal(plan.actions.length,3);
 assert.ok(plan.actions.every(a=>a.source_url.startsWith('https://')));
 assert.deepEqual(plan.visualEdits.map(a=>a.rule_id),['H01','H11']);
 assert.ok(plan.confirmations.some(q=>q.key==='species'));
 assert.equal(JSON.stringify(evidence),before);
 assert.equal(Object.hasOwn(plan,'cat'),false);
});
test('unlocalized additions and already resolved cases do not become invented visual changes',()=>{
 const evidence=demoEvidence(); evidence.cases[2].proposal.placement=null;
 const plan=buildRoomPlan(evidence,objects);
 assert.ok(!plan.visualEdits.some(a=>a.rule_id==='H11'));
 const empty=buildRoomPlan({version:1,capture_id:'empty',mode:'OBSERVED',cases:[]},[]);
 assert.equal(empty.visualEdits.length,0);assert.equal(empty.unassessed.length,14);
});
