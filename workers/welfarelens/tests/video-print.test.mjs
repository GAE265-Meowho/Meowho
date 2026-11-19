import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadTsx} from './helpers/load-tsx.mjs';
import {roomFixture,id} from './fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {buildWelfareLensReport} from '../src/domain/welfare-report.ts';
import {buildVisualReport} from '../src/domain/visual-report.ts';
const Print=loadTsx('src/components/VideoPrintReport.tsx').default;
const fixture=roomFixture();
const report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(fixture.observations,fixture.matches,k=>k.join('-'),{allowTestEvidence:true})};
const render=(r=report,status='complete')=>renderToStaticMarkup(React.createElement(Print,{report:r,analysisStatus:status}));
test('print contains all aggregated issues once, including care, never controls or raw appendix',()=>{
 const html=render();assert.equal((html.match(/class="video-print-issue"/g)||[]).length,6);
 assert.doesNotMatch(html,/<button|<details|<video|<img|全部原始觀察/);
 assert.match(html,/00:04/);assert.match(html,/00:12/);assert.match(html,/https:\/\/www.cats.org.uk/);
 assert.match(html,/不代表已確認缺少資源/);assert.match(html,/重建/);
});
test('partial or empty reports never imply whole-home safety',()=>{
 const html=render({...report,issues:[],observations:[],match_evidence:[]},'incomplete');
 assert.match(html,/<h1>貓咪居家環境健檢<\/h1>/);
 assert.match(html,/部分/);assert.match(html,/不能.*安全/);
 assert.match(render({...report,issues:[],observations:[],match_evidence:[]}),/不代表.*安全/);
});
test('print preserves each alternative action, unknown and escaped source text',()=>{
 const target=report.issues.find(i=>i.observation_ids.length===2);assert.ok(target);
 const issue={...target,title:'<script>danger</script>',unknown:['通電未知']};
 const observations=report.observations.filter(o=>issue.observation_ids.includes(o.observation_id)).map((o,n)=>({...o,recommendation:n?'另一必要動作':'第一個動作'}));
 const html=render({...report,issues:[issue],observations,match_evidence:report.match_evidence.filter(m=>m.observation_ids.every(id=>issue.observation_ids.includes(id)))});
 assert.match(html,/第一個動作/);assert.match(html,/另一必要動作/);assert.match(html,/通電未知/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});

test('illustrated print uses exact source frame and explicitly estimated coordinates, raw uncertainty stays in JSON',()=>{
 const one=structuredClone(report);one.observations.forEach(o=>{o.candidate_bbox=[.1,.2,.4,.6];});
 const frames=[...new Map(one.observations.map(o=>[o.frame_id,{frame_id:o.frame_id,timestamp:o.timestamp,hash:o.frame_hash,novelty:0,sharpness:1}])).values()];
 const canonical=buildWelfareLensReport(one,'complete',123),v=buildVisualReport(one,canonical,{video_id:id,created_at:123,expires_at:456,frames,model:'fixture'});
 const html=renderToStaticMarkup(React.createElement(Print,{report:one,analysisStatus:'complete',welfareReport:canonical,visualReport:v}));
 assert.match(html,/<img/);assert.match(html,/AI 估計範圍，位置可能有偏差/);assert.match(html,/stroke-dasharray="7 4"/);assert.doesNotMatch(html,/經驗證模型定位/);assert.equal(v.issues.length,one.issues.length);assert.deepEqual(v.observations,one.observations);
 assert.match(html,/data-testid="print-object-label"/);assert.match(html,/AI 估計位置/);
});
