import {test} from 'node:test';
import assert from 'node:assert/strict';
import {simulatePlan, primaryObjectIndex, planAction} from '../src/domain/improvement-plan.ts';
const objects=[{kind:'furniture',label:'沙發',bbox:[0,.5,.3,.9],notes:''},{kind:'window',label:'窗戶',bbox:[.3,.1,.8,.6],notes:''}];
const evidence={version:1,capture_id:'a',mode:'OBSERVED',cases:[{rule_id:'H01',object_indices:[0,1],facts:[]}]};
test('support furniture does not receive the window issue marker',()=>assert.equal(primaryObjectIndex(evidence.cases[0],objects),1));
test('invalid action selection rejects instead of partial simulation',()=>assert.throws(()=>simulatePlan(evidence,[0,99])));
test('selecting prevention has isolated explicit hypothesis and reset restores baseline',()=>{
 const saved=JSON.stringify(evidence), after=simulatePlan(evidence,[0]);
 assert.equal(after.cases[0].facts[0].key,'unguarded_opening');
 assert.equal(after.cases[0].facts[0].status,'HYPOTHESIS');
 assert.equal(JSON.stringify(evidence),saved);
 assert.deepEqual(simulatePlan(evidence,[]).cases,evidence.cases);
});
test('unknown plants get identification advice, never unconditional removal',()=>assert.match(planAction({rule_id:'H02',object_indices:[],facts:[]}),/辨識|品種|學名/));
test('selecting plant identification does not simulate removal or resolve unknown toxicity',()=>{
 const before={...evidence,cases:[{rule_id:'H02',object_indices:[],facts:[]}]};
 assert.deepEqual(simulatePlan(before,[0]).cases[0].facts,[]);
});
