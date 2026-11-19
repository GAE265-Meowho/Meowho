import {IssueReportSchema} from './video-issues.ts';
import type {IssueReport,AggregatedIssue,RawObservation} from './video-issues.ts';
export type ReadingGroup={id:string;title:string;issues:AggregatedIssue[];relation:'single'|'possible_related'|'candidate_topic'};
// A reading index only. Never feeds aggregation or asserts physical identity.
function readingGroups(items:AggregatedIssue[],observations:RawObservation[]):ReadingGroup[]{
 const byId=new Map(observations.map(o=>[o.observation_id,o]));
 const raw=(i:AggregatedIssue)=>i.observation_ids.map(id=>byId.get(id)!);
 const key=(i:AggregatedIssue)=>{
  const obs=raw(i),first=obs[0];
  if(!first.rule_id||obs.some(o=>o.rule_id!==first.rule_id||o.object_kind!==first.object_kind))return i.issue_id;
  if(first.plant){
   // Strip explanatory parenthetical text only; do not infer taxonomic synonyms or toxicity.
   const taxa=[...new Set(obs.flatMap(o=>o.plant?.candidates.map(p=>p.scientific_name.replace(/[（(].*$/,'').trim().toLowerCase())??[]))].sort();
   return taxa.length?JSON.stringify([first.rule_id,i.category,first.kind,'candidate',taxa]):i.issue_id;
  }
  const labels=obs.map(o=>o.object_label??'').join(' ');
  const anchors=[['sofa',/沙發|sofa|couch/i],['floor_lamp',/落地燈|立燈|floor lamp/i],['desk',/書桌|desk/i],['bed',/床邊|床頭|bedside/i]].filter(([,pattern])=>(pattern as RegExp).test(labels));
  return anchors.length===1?JSON.stringify([first.rule_id,i.category,first.kind,first.object_kind,anchors[0][0]]):i.issue_id;
 };
 const groups:ReadingGroup[]=[],keys=new Map<ReadingGroup,string>();
 for(const i of items){
  const k=key(i),obs=raw(i);
  const group=groups.find(g=>keys.get(g)===k&&g.issues.every(other=>raw(other).every(a=>obs.every(b=>a.frame_id!==b.frame_id||a.object_ref!==null&&a.object_ref===b.object_ref))));
  if(group){group.issues.push(i);group.relation=obs.some(o=>o.plant)?'candidate_topic':'possible_related';}
  else{const g:ReadingGroup={id:i.issue_id,title:i.title,issues:[i],relation:'single'};groups.push(g);keys.set(g,k);}
 }
 return groups;
}
export function buildVideoResultView(input:IssueReport,status:'pending'|'complete'|'incomplete'|'failed'){
 const report=IssueReportSchema.parse(input),priority=report.issues.filter(i=>i.category==='PRIORITY_ACTION'),care=report.issues.filter(i=>i.category==='ENRICHMENT_ADVICE');
 const byId=new Map(report.observations.map(o=>[o.observation_id,o]));
 const prevention=report.issues.filter(i=>i.category==='NEEDS_CONFIRMATION'&&i.observation_ids.every(id=>{const o=byId.get(id)!;return o.fidelity==='validated_candidate'&&o.kind==='prevention'&&!!o.facts?.length&&o.facts.every(f=>f.status!=='UNKNOWN');}));
 const preventiveIds=new Set(prevention.map(i=>i.issue_id)),needs=report.issues.filter(i=>i.category==='NEEDS_CONFIRMATION'&&!preventiveIds.has(i.issue_id));
 const priorityGroups=readingGroups(priority,report.observations),needsGroups=readingGroups(needs,report.observations),preventionGroups=readingGroups(prevention,report.observations);
 const summaryGroups=[...priorityGroups,...needsGroups].slice(0,3);
 const important=report.issues.filter(i=>i.category!=='ENRICHMENT_ADVICE');
 return {priority,needs,care,prevention,priorityGroups,needsGroups,preventionGroups,summaryGroups,summary:summaryGroups.map(g=>g.issues[0]),extraImportant:Math.max(0,important.length-summaryGroups.reduce((n,g)=>n+g.issues.length,0)),identityLimited:important.some(i=>i.identity_status==='unresolved'),emptyMessage:status!=='complete'?'部分畫面未能完成判讀，目前沒有可用問題；不能據此判定安全。':'抽樣畫面未發現需要立即處理的明確風險；不代表整段影片或住家安全。'};
}
