import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildScanResult,buildScanEdits} from '../src/domain/scan-result.ts';
const fact=(key,value,status='OBSERVATION',evidence='可見沙發緊貼窗台')=>({key,value,status,evidence,confidence:'medium'});
const object={kind:'window',label:'雙扇窗戶',bbox:[.2,.1,.8,.7],notes:'窗戶關閉'};
const proposal={kind:'PREVENTION',action:'開窗前安排可靠防護。',rationale:'沙發扶手緊鄰窗台，可能提供攀爬路徑。',placement:null};
const candidate=(assessments,objects=[object])=>({objects,plants:[],image_quality:'adequate',questions:[],limitations:[],assessments});
test('closed window with visible climbing context retains prevention without claiming current fall hazard',()=>{
 const r=buildScanResult(candidate([{rule_id:'H01',object_indices:[0],facts:[fact('opening_visible',false),fact('access_route',true,'INFERENCE')],proposal}]));
 assert.equal(r.actions.length,1);assert.equal(r.actions[0].kind,'prevention');assert.equal(r.riskCount,0);
 assert.match(r.actions[0].observation,/沙發/);assert.match(r.actions[0].reason,/攀爬/);assert.ok(r.actions[0].impact);assert.match(r.actions[0].action,/開窗前/);
});
test('a precaution about unverified furniture fixing does not become a risk because concern_present was populated',()=>{const r=buildScanResult(candidate([{rule_id:'H05',object_indices:[0],facts:[fact('concern_present',true,'OBSERVATION','可見層板，固定不可見')],proposal:{...proposal,kind:'PREVENTION'}}],[{...object,kind:'furniture',label:'層板'}]));assert.equal(r.actions[0].kind,'prevention');assert.equal(r.riskCount,0);});
test('whole-room summary and priority preserve environmental context alongside uncertain plants',()=>{const c=candidate([{rule_id:'H01',object_indices:[0],facts:[fact('opening_visible',false),fact('access_route',true,'INFERENCE')],proposal}],[object,{...object,kind:'plant',label:'盆栽'}]);c.plants=[{object_index:1,candidates:[],features:'葉片不清',identification_quality:'limited'}];const r=buildScanResult(c);assert.match(r.summary,/居家照護改善/);assert.equal(r.actions[0].kind,'prevention');assert.doesNotMatch(r.actions[1].impact,/有毒候選屬實/);});
test('specific grounded inference and enrichment survive; unknown/no evidence is not a hazard',()=>{
 const make=(facts,kind='RISK')=>({rule_id:'H11',object_indices:[0],facts,proposal:{...proposal,kind,action:'在沙發旁可見空地放一個側開口紙箱。',rationale:'此區地面可通行，提供退避選擇。'}});
 const objects=[{...object,kind:'furniture',label:'沙發旁空地'}];
 const r=buildScanResult(candidate([make([fact('concern_present',true,'INFERENCE','紙箱入口被雜物阻擋')])],objects));assert.equal(r.actions.length,1);assert.match(r.actions[0].inference,/入口/);
 const enrich=buildScanResult(candidate([make([fact('concern_present',null,'UNKNOWN','照片未看到躲藏設施')],'ENRICHMENT')],objects));assert.equal(enrich.actions[0].kind,'enrichment');assert.equal(enrich.riskCount,0);assert.equal(enrich.actions[0].bbox,null,'cannot pretend the sofa box is a reliable new hideout location');
 assert.equal(buildScanResult(candidate([make([fact('concern_present',null,'UNKNOWN','不可判斷')])],objects)).actions.length,0);
});
test('unlocalized valid risk retains text without fabricated marker; localized placement is not an existing hazard box',()=>{
 const item={rule_id:'H04',object_indices:[],facts:[fact('exposed_cord',true),fact('reachable',true,'INFERENCE')],proposal:{...proposal,kind:'RISK'}};
 const a=buildScanResult(candidate([item],[])).actions[0];assert.ok(a);assert.equal(a.bbox,null);
});
test('uncertain botanical candidates and matched toxicity survive instead of generic dead end',()=>{
 const c=candidate([],[{...object,kind:'plant',label:'盆栽'}]);c.plants=[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'medium'}],features:'心形斑葉，莖部被遮擋',identification_quality:'limited'}];
 const r=buildScanResult(c);assert.equal(r.plants[0].status,'UNKNOWN');assert.match(r.actions[0].title,/黃金葛/);assert.match(r.actions[0].reason,/Epipremnum aureum/);assert.match(r.actions[0].action,/避免.*接觸/);assert.match(r.actions[0].action,/有毒候選/);assert.match(r.actions[0].reason,/有毒/);
});
test('grounded prevention and placed enrichment stay available to the existing image editor',()=>{
 const c=candidate([{rule_id:'H01',object_indices:[0],facts:[fact('opening_visible',false),fact('access_route',true,'INFERENCE')],proposal}]);assert.equal(buildScanEdits(c).length,1);
 const item={rule_id:'H11',object_indices:[0],facts:[fact('concern_present',null,'UNKNOWN')],proposal:{...proposal,kind:'ENRICHMENT',action:'在沙發旁空地加側開口紙箱。',placement:{bbox:[.1,.7,.3,.9],description:'沙發旁空地',entrance:'朝通道',preparation:'清出物品',checks:'不阻擋通行'}}};
 const enrich=candidate([item],[{...object,kind:'furniture',label:'沙發'}]);assert.equal(buildScanEdits(enrich).length,1);assert.deepEqual(buildScanEdits(enrich)[0].placement,item.proposal.placement);assert.deepEqual(buildScanResult(enrich).actions[0].bbox,item.proposal.placement.bbox);
 enrich.assessments[0].proposal.placement=null;assert.equal(buildScanEdits(enrich).length,0);
});
test('a concrete text placement relative to visible furniture can drive a concept edit without inventing an annotation box',()=>{const placement={bbox:null,description:'茶几右側、沙發前的可見空地',entrance:'朝向開闊室內',preparation:'保留通道並移開盆栽',checks:'現場確認尺寸及進出'};const c=candidate([{rule_id:'H11',object_indices:[0],facts:[fact('concern_present',null,'UNKNOWN')],proposal:{...proposal,kind:'ENRICHMENT',placement}}],[{...object,kind:'furniture',label:'沙發'}]);assert.equal(buildScanResult(c).actions[0].bbox,null);assert.equal(buildScanEdits(c).length,1);assert.deepEqual(buildScanEdits(c)[0].placement,placement);});
