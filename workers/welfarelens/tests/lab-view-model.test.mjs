import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectionItems, preparationPlan} from '../src/domain/lab-view-model.ts';
import {demoEvidence, demoScene} from '../src/data/demo.ts';

test('priority and evidence remain independent; unknown plant is not titled toxic',()=>{
 const items=inspectionItems(demoEvidence(),demoScene().objects);
 assert.equal(items[1].title,'植物品種與接觸');
 assert.equal(items[1].priority,'安全優先');
 assert.equal(items[1].finding.status,'NEEDS_CONFIRMATION');
 assert.equal(items[1].objectName,'品種待確認的盆栽');
 assert.equal(items[2].group,'resources');
 assert.equal(items[2].evidenceLabel,'已確認配置需求');
});
test('missing coordinates remain absent and available through list',()=>{
 const items=inspectionItems(demoEvidence(),[]);
 assert.equal(items[0].located,false);
 assert.equal(items.length,3);
});
test('report retains baseline unknown plant questions even after identification task selected',()=>{
 const evidence=demoEvidence(), saved=JSON.stringify(evidence);
 const plan=preparationPlan(evidence,[0,1,2]);
 assert.equal(plan.actions.length,3);
 assert.equal(plan.improved.length,2);
 assert.ok(plan.confirmations.some(q=>q.key==='species'));
 assert.ok(plan.unassessed.some(r=>r.rule_id==='H07'));
 assert.ok(!plan.unassessed.some(r=>r.rule_id==='H01'));
 assert.equal(JSON.stringify(evidence),saved);
 assert.equal(plan.after[1].status,'NEEDS_CONFIRMATION');
});
test('empty simulation creates no claimed improvement and cancellation recomputes independently',()=>{
 const evidence=demoEvidence();
 assert.equal(preparationPlan(evidence,[]).improved.length,0);
 assert.equal(preparationPlan(evidence,[0]).improved.length,1);
 assert.equal(preparationPlan(evidence,[]).improved.length,0);
 assert.throws(()=>preparationPlan(evidence,[100]));
});
