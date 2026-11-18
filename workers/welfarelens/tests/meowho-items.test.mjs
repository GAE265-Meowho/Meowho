import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observation,id} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {buildWelfareLensReport,toMeowhoEnvReport} from '../src/domain/welfare-report.ts';
import {buildMeowhoItemProposals} from '../src/domain/meowho-hazards.ts';

function report(raw){
 const issueReport={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(raw,[],keys=>`issue-${keys.join('-')}`)};
 return buildWelfareLensReport(issueReport,'complete',123);
}

test('Meowho items use shared hazard keys and coalesce repeated same-category findings',()=>{
 const r=report([
  observation('shelf-wire',{candidate_bbox:[.1,.2,.4,.7]}),
  observation('lamp-wire',{frame_id:'f001',timestamp:4,object_label:'落地燈電線',candidate_bbox:[.4,.2,.8,.9]}),
 ]);
 const projection=buildMeowhoItemProposals(r);
 assert.deepEqual(projection.items.map(x=>x.key),['cable']);
 assert.equal(projection.items[0].label,'電線與插座');
 assert.equal(projection.items[0].crop_observation_id,'shelf-wire');
 assert.equal(projection.items[0].source_issue_keys.length,2);
 assert.equal(buildMeowhoItemProposals(r,new Map([['f000',6],['f001',2]])).items[0].frame_index,6);
 assert.ok(projection.items[0].note.includes('未確認：'));
});

test('known shared plant and window keys are emitted without upgrading unknown conditions',()=>{
 const plant=observation('plant',{rule_id:'H02',object_kind:'plant',object_label:'疑似直立葉盆栽',kind:'precaution',candidate_bbox:[.2,.1,.6,.8]});
 const window=observation('window',{rule_id:'H01',object_kind:'window',object_label:'窗戶',candidate_bbox:null});
 const projection=buildMeowhoItemProposals(report([plant,window]));
 assert.deepEqual(projection.items.map(x=>x.key).sort(),['plant','window']);
 assert.equal(projection.items.find(x=>x.key==='plant').crop_observation_id,'plant');
 assert.equal(projection.items.find(x=>x.key==='window').crop_observation_id,null);
 assert.match(projection.items.find(x=>x.key==='plant').note,/未確認：/);
});

test('unmapped chemical and enrichment issues stay out of hazard items but remain auditable',()=>{
 const chemical=observation('chemical',{rule_id:'H03',object_kind:'bottle',object_label:'清潔用品',title:'清潔用品',kind:'precaution'});
 const care=observation('hide',{rule_id:'H11',object_kind:'furniture',object_label:'沙發',kind:'enrichment',title:'躲藏空間'});
 const projection=buildMeowhoItemProposals(report([chemical,care]));
 assert.deepEqual(projection.items,[]);
 assert.equal(projection.unmappedIssueKeys.length,2);
});

test('Meowho crop paths must use the current attempt prefix and standardized item key',()=>{
 const r=report([observation('wire',{candidate_bbox:[.1,.1,.8,.8]})]);
 const prefix='homes/home/reports/report/a1/';
 assert.equal(toMeowhoEnvReport(r).items[0].crop_path,null);
 assert.equal(toMeowhoEnvReport(r,{output_prefix:prefix,crop_paths:{cable:`${prefix}crops/cable.jpg`}}).items[0].crop_path,`${prefix}crops/cable.jpg`);
 assert.throws(()=>toMeowhoEnvReport(r,{output_prefix:prefix,crop_paths:{cable:'https://example.test/cable.jpg'}}),/output_prefix/);
 assert.throws(()=>toMeowhoEnvReport(r,{output_prefix:prefix,crop_paths:{issue_wire:`${prefix}crops/issue_wire.jpg`}}));
});
