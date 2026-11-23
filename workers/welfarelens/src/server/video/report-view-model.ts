import {createHash} from 'node:crypto';
import {ReportViewSchema,summarizeReportView} from '../../domain/report-view.ts';
import type {ProfessionalReport} from './professional-report.ts';

export function professionalStatistics({visual,cases}:ProfessionalReport,placementChecks:readonly string[]=[]){
 const improvements=visual.issues.filter(issue=>issue.category==='PRIORITY_ACTION'&&issue.action.trim());
 const observations=new Map(visual.observations.map(o=>[o.observation_id,o]));
 const needsInspection=visual.issues.filter(issue=>issue.category==='NEEDS_CONFIRMATION'&&
  !issue.evidence.every(reference=>{
   const observation=observations.get(reference.observation_id);
   return observation?.fidelity==='validated_candidate'&&observation.kind==='prevention'&&
    !!observation.facts?.length&&observation.facts.every(fact=>fact.status!=='UNKNOWN');
  }));
 const confirmations=[
  ...needsInspection.map(i=>({id:i.key,label:i.label,conditions:i.uncertainty.length?i.uncertainty:[i.action]})),
  ...[...new Set(placementChecks)].map((check,index)=>({id:'placement:'+index,label:'配置確認',conditions:[check]})),
 ];
 const hazardCategory=(key:string)=>{
  const topic=cases.find(c=>c.summary.risk_or_welfare_finding_ids[0]===key)?.topic;
  return topic?.topic_kind==='hazard_prevention'?topic.title_zh:null;
 };
 return {improvements,confirmations,hazardCategory,statistics:summarizeReportView(
  improvements.map(i=>({hazard_category:hazardCategory(i.key),evidence:i.evidence})),confirmations.length)};
}
export type ReportViewIdentity={report_id:string;attempt:number};
export function reportViewFromPrepared(prepared:ProfessionalReport,identity:ReportViewIdentity,webpNames?:ReadonlyMap<string,string>){
 if(prepared.reviewDraft)throw Error('Draft cannot publish');
 const {improvements,confirmations,statistics,hazardCategory}=professionalStatistics(prepared);
 const observations=new Map(prepared.visual.observations.map(o=>[o.observation_id,o]));
 const document=ReportViewSchema.parse({
  schema:'meow_report_view/1',...identity,statistics,confirmations,
  improvements:improvements.map(issue=>({
   id:issue.key,label:issue.label.split('｜')[0],action:issue.action,hazard_category:hazardCategory(issue.key),
   facts:issue.facts,inferences:issue.inferences,unverified:issue.uncertainty,
   evidence:issue.evidence.map(e=>({observation_id:e.observation_id,frame_id:e.frame_id,timestamp:e.timestamp,
    frame_sha256:observations.get(e.observation_id)!.frame_hash})),
   comparisons:prepared.cases.flatMap(c=>{
    const s=c.summary;
    if(s.disposition!=='illustrated'||s.risk_or_welfare_finding_ids[0]!==issue.key||
     !c.before||!c.after||!c.detail||!c.dimensions||!s.comparison_id||!s.evidence_observation_id)return [];
    const metadata=(url:string,index:number)=>{
     const sha256=createHash('sha256').update(Buffer.from(url.split(',')[1],'base64')).digest('hex');
     const mime=index===1?'image/png':'image/jpeg';
     const name=sha256+(index===1?'.png':'.jpg');
     const webp_name=webpNames?.get(name);
     return {name,sha256,mime,...c.dimensions![index],...(webp_name?{webp_name}:{})};
    };
    const before=s.before_region;
    return [{id:s.comparison_id,observation_id:s.evidence_observation_id,
     before:metadata(c.before,0),after:metadata(c.after,1),
     before_detail:metadata(c.detail[0],2),after_detail:metadata(c.detail[1],3),
     before_region:before?.bbox&&(before.source==='ai_estimated'||before.source==='user_confirmed')
      ?{bbox:before.bbox,source:before.source}:null,after_region:s.after_region,
     status:'ai_simulated_not_verified'}];
   }),
  })),
 });
 return document;
}
