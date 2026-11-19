import {z} from 'zod';
import {IssueReportSchema,RawObservationSchema,type IssueReport} from './video-issues.ts';
import {RegionSchema} from './video-grounding.ts';
import {buildMeowhoItemProposals,MeowhoHazardKeySchema,type MeowhoHazardKey} from './meowho-hazards.ts';
const text=z.string().max(6000),ref=z.string().min(1).max(200);
export const ConfirmedCropSchema=z.object({region:RegionSchema,crop_id:z.string().uuid(),source:z.literal('user_confirmed'),created_at:z.number().finite().nonnegative()}).strict().superRefine((c,x)=>{if(c.region.provider.name!=='user_manual'||c.region.review.status!=='accepted'||c.region.review.method!=='human_visual_review')x.addIssue({code:'custom',message:'Only user-confirmed manual crops are supported'});});
export type ConfirmedCrop=z.infer<typeof ConfirmedCropSchema>;
const Evidence=z.object({observation_id:ref,frame_id:z.string().regex(/^f\d{3}$/),timestamp:z.number().nonnegative(),location:text,source:z.literal('sampled_frame'),crop:ConfirmedCropSchema.nullable()}).strict();
export const WelfareLensReportV1Schema=z.object({version:z.literal(1),report_id:z.string().uuid(),media_type:z.enum(['video','photo']),generated_at:z.number().finite().nonnegative(),analysis_status:z.enum(['complete','incomplete']),source:z.enum(['snapshot','legacy_limited']),observations:z.array(RawObservationSchema),issues:z.array(z.object({key:ref,label:text,category:z.enum(['PRIORITY_ACTION','NEEDS_CONFIRMATION','ENRICHMENT_ADVICE']),severity:z.enum(['high','moderate']),facts:z.array(text),inferences:z.array(text),action:text,uncertainty:z.array(text),evidence:z.array(Evidence).min(1),sources:z.array(z.string().url())}).strict())}).strict().superRefine((r,c)=>{
 const obs=new Map(r.observations.map(o=>[o.observation_id,o]));const used=r.issues.flatMap(i=>i.evidence.map(e=>e.observation_id));
 if(obs.size!==r.observations.length||new Set(r.issues.map(i=>i.key)).size!==r.issues.length||used.length!==obs.size||new Set(used).size!==obs.size)c.addIssue({code:'custom',message:'Invalid observation coverage'});
 for(const i of r.issues)for(const e of i.evidence){const o=obs.get(e.observation_id);if(!o||o.frame_id!==e.frame_id||o.timestamp!==e.timestamp)c.addIssue({code:'custom',message:'Broken evidence link'});if(e.crop&&(e.crop.region.issue_id!==i.key||e.crop.region.observation_id!==e.observation_id||e.crop.region.frame.frame_id!==e.frame_id||e.crop.region.frame.pts_seconds!==e.timestamp))c.addIssue({code:'custom',message:'Crop belongs to other evidence'});}
});
export type WelfareLensReportV1=z.infer<typeof WelfareLensReportV1Schema>;
export function buildWelfareLensReport(input:IssueReport,status:'complete'|'incomplete',generatedAt:number,crops:ConfirmedCrop[]=[],mediaType:'video'|'photo'='video'):WelfareLensReportV1{
 const r=IssueReportSchema.parse(input),confirmed=crops.map(c=>ConfirmedCropSchema.parse(c));
 return WelfareLensReportV1Schema.parse({version:1,report_id:r.video_id,media_type:mediaType,generated_at:generatedAt,analysis_status:status,source:r.source,observations:r.observations,issues:r.issues.map(i=>({key:i.issue_id,label:i.title,category:i.category,severity:i.severity,facts:[i.observation],inferences:[...new Set(r.observations.filter(o=>i.observation_ids.includes(o.observation_id)).map(o=>o.potential_risk).filter(Boolean))],action:i.recommendation,uncertainty:i.unknown,sources:i.sources,evidence:i.evidence.map(e=>({...e,location:r.observations.find(o=>o.observation_id===e.observation_id)!.observation,source:'sampled_frame',crop:confirmed.filter(c=>c.region.issue_id===i.issue_id&&c.region.observation_id===e.observation_id).sort((a,b)=>b.created_at-a.created_at)[0]??null}))}))});
}
/** Verified against Meowho v0.5: shared hazard keys only; full welfare evidence remains in report.json/PDF. */
export const MeowhoEnvReportSchema=z.object({version:z.literal(1),report_id:z.string().uuid(),status:z.literal('ready'),analysis_status:z.literal('complete'),summary:z.string().max(2000),items:z.array(z.object({key:MeowhoHazardKeySchema,label:z.string().min(1).max(20),level:z.enum(['high','medium','low']),note:z.string().max(200),crop_path:z.string().nullable()}).strict()),crop_exports:z.array(z.object({key:ref,crop_id:z.string().uuid(),observation_id:ref,download_path:z.string().startsWith('/api/integration/jobs/')}).strict())}).strict();
export function toMeowhoEnvReport(input:WelfareLensReportV1,options:{crop_paths?:Partial<Record<MeowhoHazardKey,string>>;output_prefix?:string}={}){
 const r=WelfareLensReportV1Schema.parse(input),paths=options.crop_paths??{};
 if(r.analysis_status!=='complete')throw Error('Incomplete analysis cannot be exported as ready');
 for(const [key,path] of Object.entries(paths)){
  MeowhoHazardKeySchema.parse(key);
  if(!options.output_prefix||path!==`${options.output_prefix}crops/${key}.jpg`)throw Error('Expected crop under this attempt output_prefix');
 }
 const {items,unmappedIssueKeys}=buildMeowhoItemProposals(r);
 const result=MeowhoEnvReportSchema.parse({version:1,report_id:r.report_id,status:'ready',analysis_status:r.analysis_status,
  summary:`抽樣分析完成，整理 ${items.length} 類可對照共用危險代碼的項目。另有 ${unmappedIssueKeys.length} 項未映射的觀察或照護主題保留在完整報告；未列入不代表環境安全。`,
  items:items.map(i=>({key:i.key,label:i.label,level:i.level,note:i.note,crop_path:paths[i.key]??null})),
  crop_exports:r.issues.flatMap(i=>i.evidence.flatMap(e=>e.crop?[{key:i.key,crop_id:e.crop.crop_id,observation_id:e.observation_id,download_path:`/api/integration/jobs/${r.report_id}/crops/${e.crop.crop_id}`}]:[]))});
 // Conservative transport guard; exact PostgreSQL jsonb size is still enforced by the host database.
 if(new TextEncoder().encode(JSON.stringify(result.items)).length>80000)throw Error('Meowho items exceed conservative transport limit; retain full WelfareLens report');
 return result;
}
