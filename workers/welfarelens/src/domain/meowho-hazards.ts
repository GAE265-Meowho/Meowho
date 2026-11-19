import {z} from 'zod';
import type {WelfareLensReportV1} from './welfare-report.ts';

/** Exact shared hazard keys currently listed by Meowho. Unknown topics remain in the full report. */
export const MeowhoHazardKeySchema=z.enum(['cable','string','cup','scratch','door','window','plant']);
export type MeowhoHazardKey=z.infer<typeof MeowhoHazardKeySchema>;

export const MEOWHO_HAZARD_LABELS:Record<MeowhoHazardKey,string>={
 cable:'電線與插座',string:'細繩與繩帶',cup:'桌上水杯',scratch:'布料家具',door:'大門與玄關',window:'窗戶與紗窗',plant:'植物安全待確認',
};

export type MeowhoItemProposal={
 key:MeowhoHazardKey;
 label:string;
 level:'high'|'medium'|'low';
 note:string;
 frame_index:number;
 t_s:number;
 crop_observation_id:string|null;
 crop_observation_ids:string[];
 source_issue_keys:string[];
};

const cableWords=/電線|線材|電纜|充電線|延長線|插座|電源線|\b(?:cable|wire|charger)\b/i;
const stringWords=/細繩|拉繩|繩帶|橡皮筋|髮圈|塑膠繩|\b(?:string|elastic|hair ?tie)\b/i;
const cupWords=/水杯|杯子|玻璃杯|\bcup\b|\bglass\b/i;

function mapKey(ruleId:string|null,labels:string):MeowhoHazardKey|null{
 if(ruleId==='H01')return 'window';
 if(ruleId==='H02')return 'plant';
 if(ruleId==='H04'){
  if(stringWords.test(labels))return 'string';
  if(cableWords.test(labels))return 'cable';
  return null;
 }
 if(ruleId==='H06'&&cupWords.test(labels))return 'cup';
 // No key is assigned to chemicals, furniture stability, doors, or general care topics unless
 // Meowho's published rule-to-key mapping provides direct evidence for that category.
 return null;
}

function clip(s:string,n:number){
 const clean=s.replace(/\s+/g,' ').trim();
 if(clean.length<=n)return clean;
 const limit=Math.max(1,n-1),boundary=Math.max(clean.lastIndexOf('。',limit),clean.lastIndexOf('；',limit),clean.lastIndexOf('，',limit));
 return `${clean.slice(0,boundary>Math.floor(limit*.55)?boundary:limit).replace(/[，；、：\s]+$/,'')}…`;
}

function conciseNote(observation:string,action:string,unknown:string[]){
 // Keep the shared card useful and readable; the complete facts, actions and unknowns
 // remain in the canonical WelfareLens report and PDF.
 const o=clip(observation,48),a=clip(action,72),u=unknown.length?clip(unknown[0],34):'';
 return [`觀察：${o}`,`建議：${a}`,...(u?[`未確認：${u}`]:[])].join('；');
}

export function buildMeowhoItemProposals(report:WelfareLensReportV1,frameIndexById:ReadonlyMap<string,number>=new Map()):{items:MeowhoItemProposal[];unmappedIssueKeys:string[]}{
 const observations=new Map(report.observations.map(o=>[o.observation_id,o]));
 const groups=new Map<MeowhoHazardKey,Array<{issue:WelfareLensReportV1['issues'][number];observations:NonNullable<ReturnType<typeof observations.get>>[]}>>();
 const unmappedIssueKeys:string[]=[];
 for(const issue of report.issues){
  if(issue.category==='ENRICHMENT_ADVICE'){unmappedIssueKeys.push(issue.key);continue;}
  const linked=issue.evidence.map(e=>observations.get(e.observation_id)).filter((o):o is NonNullable<typeof o>=>!!o);
  const labels=[issue.label,...issue.facts,...issue.inferences,...linked.flatMap(o=>[o.object_label??'',o.object_kind??'',o.title,o.observation])].join(' ');
  const key=mapKey(linked[0]?.rule_id??null,labels);
  // A standardized hazard key is emitted only when the corresponding object is actually observed.
  if(!key||!linked.some(o=>o.object_label||o.object_ref!==null||o.candidate_bbox)){unmappedIssueKeys.push(issue.key);continue;}
  const list=groups.get(key)??[];list.push({issue,observations:linked});groups.set(key,list);
 }

 const items:MeowhoItemProposal[]=[];
 for(const [key,entries] of groups){
  const candidates=entries.flatMap(({observations:linked})=>linked.map(observation=>({observation,quality:observation.quality==='adequate'?0:observation.quality==='limited'?1:2})))
   .sort((a,b)=>a.quality-b.quality||a.observation.timestamp-b.observation.timestamp||a.observation.observation_id.localeCompare(b.observation.observation_id));
  const selected=candidates.find(x=>x.observation.candidate_bbox!==null&&x.observation.fidelity==='validated_candidate'&&x.observation.quality!=='unusable')??candidates[0];
  const cropCandidates=candidates.filter(x=>x.observation.candidate_bbox!==null&&x.observation.fidelity==='validated_candidate'&&x.observation.quality!=='unusable')
   .map(x=>x.observation.observation_id);
  const parts:string[]=[];
  const unknowns:string[]=[];
  let action='';
  for(const {issue} of entries){
   parts.push(issue.facts[0]??issue.label);
   unknowns.push(...issue.uncertainty);
   if(!action)action=issue.action;
  }
  const note=conciseNote([...new Set(parts)].join('；'),action,[...new Set(unknowns)]);
  const frameId=report.issues.flatMap(issue=>issue.evidence.map(e=>e)).find(e=>e.observation_id===selected.observation.observation_id)?.frame_id;
  const index=frameId?frameIndexById.get(frameId)??Number(frameId.slice(1)):0;
  items.push({key,label:MEOWHO_HAZARD_LABELS[key],level:entries.some(e=>e.issue.severity==='high')?'high':'medium',note,
   frame_index:Number.isInteger(index)&&index>=0&&index<8?index:0,t_s:selected.observation.timestamp,
   crop_observation_id:selected.observation.candidate_bbox&&selected.observation.fidelity==='validated_candidate'&&selected.observation.quality!=='unusable'?selected.observation.observation_id:null,
   crop_observation_ids:cropCandidates,
   source_issue_keys:entries.map(e=>e.issue.key)});
 }
 return {items,unmappedIssueKeys};
}
