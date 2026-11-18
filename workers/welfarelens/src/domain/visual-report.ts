import {z} from 'zod';
import {WelfareLensReportV1Schema,type WelfareLensReportV1} from './welfare-report.ts';
import {IssueReportSchema,type IssueReport} from './video-issues.ts';
import type {VideoJob} from './video.ts';
import {buildVideoResultView} from './video-issue-view.ts';
import {approximateObjectHint} from './approximate-location.ts';
import {BboxSchema} from './schema.ts';
const Region=z.discriminatedUnion('source',[
 z.object({source:z.literal('unavailable'),bbox:z.null()}).strict(),
 z.object({source:z.literal('ai_estimated'),bbox:BboxSchema,provenance:z.literal('model_candidate_not_verified')}).strict(),
 z.object({source:z.literal('user_confirmed'),bbox:BboxSchema,provenance:z.literal('human_visual_review')}).strict(),
 // Reserved for a future validated provider; deliberately cannot be constructed by this pipeline.
 z.object({source:z.literal('verified_model'),bbox:BboxSchema,provenance:z.literal('validated_provider'),validation_reference:z.string().min(1)}).strict(),
]);
const Representative=z.object({observation_id:z.string(),frame_id:z.string(),timestamp:z.number().nonnegative(),frame_hash:z.string(),frame_path:z.string().nullable(),crop_path:z.string().nullable(),region:Region}).strict();
export const VisualReportSchema=z.object({
 product_name:z.literal('貓咪居家環境健檢').optional(),
 schema_version:z.literal('welfarelens.visual-report.v1'),report_id:z.string().uuid(),job_id:z.string().uuid(),status:z.enum(['complete','incomplete']),generated_at:z.number(),source:z.enum(['snapshot','legacy_limited']),media_type:z.enum(['video','photo']),
 summary:z.object({priority:z.number(),attention:z.number(),care:z.number(),top_issue_keys:z.array(z.string()).max(3)}).strict(),
 issues:z.array(WelfareLensReportV1Schema.shape.issues.element.extend({representative:Representative})),
 care_topics:z.array(z.object({issue_key:z.string(),label:z.string(),action:z.string()}).strict()),
 reading_groups:z.array(z.object({key:z.string(),title:z.string(),relation:z.enum(['single','possible_related','candidate_topic']),issue_keys:z.array(z.string()).min(1)}).strict()),
 observations:WelfareLensReportV1Schema.shape.observations,
 match_evidence:IssueReportSchema.shape.match_evidence,
 limitations:z.array(z.string()),
 analysis_metadata:z.object({duration_seconds:z.number().nullable(),sampled_times:z.array(z.number()),model:z.string(),expires_at:z.number(),metrics:z.record(z.string(),z.unknown()).nullable()}).strict(),
}).strict().superRefine((r,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});
 const canonical={version:1,report_id:r.report_id,media_type:r.media_type,generated_at:r.generated_at,analysis_status:r.status,source:r.source,observations:r.observations,issues:r.issues.map(({representative,...i})=>{void representative;return i;})};
 if(!WelfareLensReportV1Schema.safeParse(canonical).success||r.job_id!==r.report_id)bad('Broken canonical report');
 const keys=r.issues.map(i=>i.key),grouped=r.reading_groups.flatMap(g=>g.issue_keys);
 if(keys.length!==grouped.length||new Set(grouped).size!==keys.length||keys.some(k=>!grouped.includes(k)))bad('Broken reading group coverage');
 if(r.summary.priority!==r.issues.filter(i=>i.category==='PRIORITY_ACTION').length||r.summary.attention!==r.issues.filter(i=>i.category==='NEEDS_CONFIRMATION').length||r.summary.care!==r.issues.filter(i=>i.category==='ENRICHMENT_ADVICE').length||new Set(r.summary.top_issue_keys).size!==r.summary.top_issue_keys.length||r.summary.top_issue_keys.some(k=>!keys.includes(k)))bad('Broken summary');
 if(r.care_topics.length!==r.summary.care||new Set(r.care_topics.map(t=>t.issue_key)).size!==r.summary.care||r.care_topics.some(t=>!r.issues.some(i=>i.key===t.issue_key&&i.category==='ENRICHMENT_ADVICE'&&i.action===t.action&&i.label===t.label)))bad('Broken care projection');
 for(const i of r.issues){const e=i.representative,o=r.observations.find(o=>o.observation_id===e.observation_id),linked=i.evidence.find(a=>a.observation_id===e.observation_id);if(!o||!linked||linked.frame_id!==e.frame_id||linked.timestamp!==e.timestamp||o.frame_hash!==e.frame_hash)bad('Broken representative');
  if(e.frame_path!==null&&e.frame_path!==`/api/video-scans/${r.job_id}/frames/${e.frame_id}`)bad('Invalid frame path');
  if(e.region.source==='ai_estimated'&&(!e.frame_path||JSON.stringify(e.region.bbox)!==JSON.stringify(o?.candidate_bbox)))bad('Not a source candidate');
  if(e.region.source==='verified_model')bad('No verified automatic provider enabled');
  if(e.region.source==='user_confirmed'&&(!linked?.crop||JSON.stringify(e.region.bbox)!==JSON.stringify(linked.crop.region.bbox)))bad('Unconfirmed region');
  if(e.crop_path!==null&&(!linked?.crop||e.crop_path!==`/api/video-scans/${r.job_id}/crops/${linked.crop.crop_id}`))bad('Invalid private crop');
 }
});
export type VisualReport=z.infer<typeof VisualReportSchema>;
type Job=Pick<VideoJob,'video_id'|'created_at'|'expires_at'|'metadata'|'frames'|'model'|'metrics'>&Partial<Pick<VideoJob,'warning'>>;
export function buildVisualReport(input:IssueReport,canonical:WelfareLensReportV1,job:Job):VisualReport{
 const raw=IssueReportSchema.parse(input),r=WelfareLensReportV1Schema.parse(canonical);if(job.video_id!==raw.video_id||r.report_id!==raw.video_id)throw Error('Cross-job report');
 // Canonical content must be the same issues, not a separately evaluated risk list.
 if(JSON.stringify(raw.issues.map(i=>[i.issue_id,i.title,i.recommendation]))!==JSON.stringify(r.issues.map(i=>[i.key,i.label,i.action])))throw Error('Mismatched canonical issues');
 const view=buildVideoResultView(raw,r.analysis_status),groups=[...view.priorityGroups,...view.needsGroups,...view.preventionGroups,...view.care.map(i=>({id:i.issue_id,title:i.title,relation:'single' as const,issues:[i]}))];
 const issues=r.issues.map(i=>{
  const original=raw.issues.find(a=>a.issue_id===i.key)!;
  const ranked=[...i.evidence].sort((a,b)=>{
   const score=(id:string)=>{const o=raw.observations.find(o=>o.observation_id===id);return o?.quality==='adequate'?2:o?.quality==='limited'?1:0;};
   return score(b.observation_id)-score(a.observation_id)||a.timestamp-b.timestamp;
  });
  const e=ranked[0],o=raw.observations.find(o=>o.observation_id===e.observation_id)!,f=job.frames.find(f=>f.frame_id===e.frame_id&&f.timestamp===e.timestamp&&f.hash===o.frame_hash),hint=approximateObjectHint(original,e,o,f);
  const crop=e.crop&&f&&e.crop.region.frame.sha256===f.hash?e.crop:null;
  return {...i,representative:{observation_id:e.observation_id,frame_id:e.frame_id,timestamp:e.timestamp,frame_hash:o.frame_hash,frame_path:f?`/api/video-scans/${job.video_id}/frames/${e.frame_id}`:null,crop_path:crop?`/api/video-scans/${job.video_id}/crops/${crop.crop_id}`:null,region:crop?{source:'user_confirmed',bbox:crop.region.bbox,provenance:'human_visual_review'}:hint?{source:'ai_estimated',bbox:hint.bbox,provenance:'model_candidate_not_verified'}:{source:'unavailable',bbox:null}}};
 });
 return VisualReportSchema.parse({product_name:'貓咪居家環境健檢',schema_version:'welfarelens.visual-report.v1',report_id:r.report_id,job_id:job.video_id,status:r.analysis_status,generated_at:r.generated_at,source:r.source,media_type:r.media_type,summary:{priority:view.priority.length,attention:view.needs.length+view.prevention.length,care:view.care.length,top_issue_keys:view.summary.map(i=>i.issue_id)},issues,care_topics:view.care.map(i=>({issue_key:i.issue_id,label:i.title,action:i.recommendation})),reading_groups:groups.map(g=>({key:g.id,title:g.title,relation:g.relation,issue_keys:g.issues.map(i=>i.issue_id)})),observations:r.observations,match_evidence:raw.match_evidence,limitations:['AI 抽樣觀察及推論未經現場查核；未見不代表安全。','AI 估計框協助找到物件，位置可能有偏差；並非已驗證定位。',...(job.warning??[]),...(r.analysis_status!=='complete'?['部分畫面未能完成分析，不能據此判定安全。']:[]),...(raw.match_evidence.some(m=>m.kind==='test_ground_truth')?['本機重建測試資料，非原始 Azure 回覆。']:[])],analysis_metadata:{duration_seconds:job.metadata?.duration??null,sampled_times:job.frames.map(f=>f.timestamp),model:job.model,expires_at:job.expires_at,metrics:job.metrics??null}});
}
