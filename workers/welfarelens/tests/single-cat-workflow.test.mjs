import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/data/knowledge.ts';
import { EvidenceSchema, evaluateAssessment, simulateAssessment, compareAssessments } from '../src/domain/assessment.ts';
import { CandidateSchema } from '../src/domain/schema.ts';
const fact = (key,value,status='OBSERVATION') => ({key,value,status:value===null?'UNKNOWN':status,evidence:'人工測試資料：具體可見條件',confidence:'medium'});
const scene = (id, values, status='OBSERVATION') => ({version:1,capture_id:'photo-a',mode:'OBSERVED',cases:[{rule_id:id,object_indices:[0],facts:Object.entries(values).map(([k,v])=>fact(k,v,status))}]});
const hazards = {
 H01:{opening_visible:true,unguarded_opening:true,access_route:true},
 H02:{species:'Epipremnum aureum',reachable:true},
 H03:{hazardous_substance:true,reachable:true}, H04:{exposed_cord:true,reachable:true},
 H05:{concern_present:true},H06:{hazardous_food:true,reachable:true},
 H07:{concern_present:true},H08:{concern_present:true},H09:{concern_present:true},
 H10:{concern_present:true},H11:{concern_present:true},H12:{concern_present:true},
 H13:{concern_present:true},H14:{concern_present:true}
};
for(const [id,values] of Object.entries(hazards)) {
 test(`${id}: concrete model evidence is provisional`,()=>assert.equal(evaluateAssessment(scene(id,values))[0].status,'POTENTIAL_RISK'));
 test(`${id}: missing decisive evidence remains unknown`,()=>assert.equal(evaluateAssessment(scene(id,{}))[0].status,'NEEDS_CONFIRMATION'));
 test(`${id}: confirmed conditions use the same source-backed rule`,()=>assert.equal(evaluateAssessment(scene(id,values,'CONFIRMATION'))[0].status,'CONFIRMED_RISK'));
}
test('only fourteen single-cat rules accepted; old multi-cat exports rejected',()=>{
 assert.deepEqual(RULES.map(r=>r.rule_id),Object.keys(hazards));
 for(const id of ['R01','R06','R08']) assert.equal(EvidenceSchema.safeParse(scene(id,{})).success,false);
});
test('a closed window permits prevention advice without inventing current exposure',()=>{
 const r=evaluateAssessment(scene('H01',{opening_visible:false}))[0];
 assert.equal(r.status,'NO_RISK_IDENTIFIED'); assert.match(r.recommendation,/開窗|關閉|防護/);
});
test('removing a confirmed lily in simulation resolves the modeled exposure, not baseline',()=>{
 const before=scene('H02',{species:'Lilium species',reachable:false},'CONFIRMATION');
 const saved=JSON.stringify(before);
 const after=simulateAssessment(before,[{case_index:0,key:'removed',value:true}]);
 assert.equal(evaluateAssessment(after)[0].status,'NO_RISK_IDENTIFIED');
 assert.equal(compareAssessments(before,after).improved.length,1);
 assert.equal(JSON.stringify(before),saved); assert.equal(after.mode,'SIMULATED');
});
test('plant unknown is neither toxic nor automatically safe',()=>{
 for(const species of [null,'unlisted']) assert.equal(evaluateAssessment(scene('H02',{species,reachable:true}))[0].status,'NEEDS_CONFIRMATION');
});
test('unknown plant identity is not resolved by a claimed inaccessible shelf',()=>{
 assert.equal(evaluateAssessment(scene('H02',{species:null,reachable:false},'CONFIRMATION'))[0].status,'NEEDS_CONFIRMATION');
});
test('placement proposals are separate from observations and reject inverted boxes',()=>{
 const data={objects:[{kind:'furniture',label:'矮櫃',bbox:[.1,.1,.5,.5],notes:''}],questions:[],limitations:[],assessments:[{rule_id:'H11',object_indices:[0],facts:[],proposal:{kind:'ENRICHMENT',action:'移走底層籃子後放入有遮蔽的紙箱',rationale:'提供自主退避空間',placement:{bbox:[.2,.4,.4,.6],description:'矮櫃底層',entrance:'朝向房間',preparation:'移走籃子',checks:'現場確認尺寸、通風及不擋通道'}}}]};
 assert.equal(CandidateSchema.safeParse(data).success,true);
 data.assessments[0].proposal.placement.bbox=[.8,.4,.2,.6];
 assert.equal(CandidateSchema.safeParse(data).success,false);
});
test('model cannot invent approved citations or mark its own action completed',()=>{
 const data={objects:[],questions:[],limitations:[],assessments:[{rule_id:'H11',object_indices:[],facts:[],proposal:{kind:'ENRICHMENT',action:'新增紙箱',rationale:'退避',placement:null,completed:true}}]};
 assert.equal(CandidateSchema.safeParse(data).success,false);
});
