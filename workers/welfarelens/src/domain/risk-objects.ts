import {z} from 'zod';
import {VisualReportSchema,type VisualReport} from './visual-report.ts';
import {IssueReportSchema,type IssueReport} from './video-issues.ts';

const id=z.string().min(1), sha=z.string().regex(/^[a-f0-9]{64}$/);
const framePath=z.string().regex(/^f\d{3}\.jpg$/);
const afterPath=z.string().regex(/^after(?:-[1-9][0-9]{0,3})?\.png$/);

const representative=VisualReportSchema.shape.issues.element.shape.representative;
const asset=z.object({frame_id:z.string().regex(/^f\d{3}$/),timestamp:z.number().nonnegative(),sha256:sha,path:framePath}).strict().refine(a=>a.path===a.frame_id+'.jpg');
const generated=z.object({status:z.literal('generated'),model:id,input_sha256:sha,output_sha256:sha,path:afterPath,quality:z.enum(['low','high']),size:id,prompt:id,generated_at:z.string().datetime(),usage:z.object({input_tokens:z.number().optional(),output_tokens:z.number().optional(),total_tokens:z.number().optional()}).nullable()}).strict();
const generation=z.discriminatedUnion('status',[
 z.object({status:z.literal('not_requested')}).strict(),
 z.object({status:z.literal('failed'),model:id,error:z.enum(['provider','invalid_output','cancelled']),input_sha256:sha}).strict(),
 generated,
 generated.extend({status:z.literal('review_required')}),
]);
export type Generation=z.infer<typeof generation>;
export const RiskObjectReportSchema=z.object({
 schema_version:z.literal('welfarelens.risk-objects.v1'),analysis_id:z.string().uuid(),scene_id:z.string().uuid(),generated_at:z.string().datetime(),
 source:z.enum(['azure','synthetic_model_fixture_not_azure']),
 risk_objects:z.array(z.object({object_id:id,risk_id:id,display_name_zh:id,category:id,identity_status:z.enum(['supported','unresolved']),hazard_type:id,hazard_description_zh:z.string(),observed_facts:z.array(z.string()),unknown_conditions:z.array(z.string()),evidence_refs:VisualReportSchema.shape.issues.element.shape.evidence,localization:representative.shape.region,localization_source:z.enum(['unavailable','ai_estimated','user_confirmed','verified_model']),sources:z.array(z.string().url()),improvement_action_ids:z.array(id).length(1)}).strict()),
 improvement_actions:z.array(z.object({action_id:id,target_object_ids:z.array(id).length(1),title_zh:id,instruction_zh:id,expected_visual_change:z.string().nullable(),game_task_tags:z.array(id)}).strict()),
 game_task_candidates:z.array(z.object({task_id:id,target_object_ids:z.array(id).length(1),action_id:id,title_zh:id,learning_objective_zh:id,interaction_type:z.literal('illustrate_action'),completion_condition:id}).strict()),
 visual_comparisons:z.array(z.object({comparison_id:id,object_id:id,action_ids:z.array(id).length(1),observation_id:id,before_image_ref:framePath,after_image_ref:afterPath.nullable(),after_generation_status:generation,after_is_ai_generated:z.boolean(),image_edit_model:id.nullable()}).strict()),
 provenance:z.object({frames:z.array(asset),observations:IssueReportSchema.shape.observations,match_evidence:IssueReportSchema.shape.match_evidence}).strict(),
}).strict().superRefine((r,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});
 const objects=new Map(r.risk_objects.map(o=>[o.object_id,o])),actions=new Map(r.improvement_actions.map(a=>[a.action_id,a])),frames=new Map(r.provenance.frames.map(f=>[f.path,f])),obs=new Map(r.provenance.observations.map(o=>[o.observation_id,o]));
 for(const list of [r.risk_objects.map(o=>o.object_id),r.risk_objects.map(o=>o.risk_id),r.improvement_actions.map(a=>a.action_id),r.game_task_candidates.map(t=>t.task_id),r.visual_comparisons.map(v=>v.comparison_id),r.visual_comparisons.map(v=>v.object_id),r.provenance.frames.map(f=>f.path),r.provenance.observations.map(o=>o.observation_id)])if(new Set(list).size!==list.length)bad('Duplicate identifier');
 for(const o of objects.values()){
  if(o.localization.source!==o.localization_source||o.localization_source==='verified_model'||actions.get(o.improvement_action_ids[0])?.target_object_ids[0]!==o.object_id)bad('Invalid localization or action');
  for(const e of o.evidence_refs){const raw=obs.get(e.observation_id);if(!raw||raw.frame_id!==e.frame_id||raw.timestamp!==e.timestamp)bad('Invalid evidence link');}
 }
 for(const a of actions.values())if(objects.get(a.target_object_ids[0])?.improvement_action_ids[0]!==a.action_id)bad('Invalid action target');
 for(const t of r.game_task_candidates)if(actions.get(t.action_id)?.target_object_ids[0]!==t.target_object_ids[0])bad('Invalid task target');

 const outputs=new Set<string>();
 for(const v of r.visual_comparisons){
  const o=objects.get(v.object_id),f=frames.get(v.before_image_ref),e=o?.evidence_refs.find(e=>e.observation_id===v.observation_id),g=v.after_generation_status;
  if(!o||!f||!e||o.improvement_action_ids[0]!==v.action_ids[0]||e.frame_id!==f.frame_id||e.timestamp!==f.timestamp||obs.get(e.observation_id)?.frame_hash!==f.sha256)bad('Invalid comparison evidence');
  if(g.status!=='not_requested'){if(r.source!=='azure'||g.input_sha256!==f?.sha256||g.model!==v.image_edit_model)bad('Invalid generation provenance');}
  else if(v.image_edit_model!==null)bad('Unexpected edit model');
  if(('path' in g)?(!v.after_is_ai_generated||v.after_image_ref!==g.path||g.input_sha256===g.output_sha256):(v.after_is_ai_generated||v.after_image_ref!==null))bad('Invalid image status');
  if('path' in g){
   if(outputs.has(g.path))bad('Duplicate edited asset');
   outputs.add(g.path);
  }
 }

});
export type RiskObjectReport=z.infer<typeof RiskObjectReportSchema>;
export type FrameAsset=z.infer<typeof asset>;
export function buildRiskObjects(report:IssueReport,visual:VisualReport,frames:FrameAsset[],source:RiskObjectReport['source']){
 const risk_objects:RiskObjectReport['risk_objects']=[],improvement_actions:RiskObjectReport['improvement_actions']=[],game_task_candidates:RiskObjectReport['game_task_candidates']=[],visual_comparisons:RiskObjectReport['visual_comparisons']=[];
 for(const i of visual.issues){
  const issue=report.issues.find(a=>a.issue_id===i.key)!;
  const r=i.representative, enrichment=issue.advice_kind==='enrichment';
  const observation=enrichment
   ?issue.evidence.map(e=>report.observations.find(o=>o.observation_id===e.observation_id)!).find(o=>o.placement&&o.quality==='adequate'&&frames.some(f=>f.frame_id===o.frame_id&&f.timestamp===o.timestamp&&f.sha256===o.frame_hash))
   :report.observations.find(o=>o.observation_id===r.observation_id);
  if(!observation||(!enrichment&&(!observation.object_label||observation.object_ref===null)))continue;
  const object_id='object-'+i.key,action_id='action-'+i.key;
  const tags=observation.rule_id?[observation.rule_id]:[];
  const region=source==='azure'?enrichment&&observation.placement
   ?{source:'ai_estimated' as const,bbox:observation.placement.bbox,provenance:'model_candidate_not_verified' as const}:r.region
   :{source:'unavailable' as const,bbox:null};
  risk_objects.push({object_id,risk_id:i.key,display_name_zh:enrichment?i.label:observation.object_label!,category:enrichment?'placement':observation.object_kind??'unknown',identity_status:issue.identity_status==='supported'?'supported':'unresolved',hazard_type:observation.rule_id??'unknown',hazard_description_zh:i.inferences.join('；'),observed_facts:i.facts,unknown_conditions:i.uncertainty,evidence_refs:i.evidence,localization:region,localization_source:region.source,sources:i.sources,improvement_action_ids:[action_id]});
  improvement_actions.push({action_id,target_object_ids:[object_id],title_zh:i.label,instruction_zh:enrichment?observation.recommendation:i.action,expected_visual_change:null,game_task_tags:tags});
  if(!enrichment)game_task_candidates.push({task_id:'task-'+i.key,target_object_ids:[object_id],action_id,title_zh:i.label,learning_objective_zh:i.action,interaction_type:'illustrate_action',completion_condition:'在遊戲中完成指定改善；不作為現實安全驗證。'});
  const f=frames.find(f=>f.frame_id===observation.frame_id&&f.timestamp===observation.timestamp&&f.sha256===observation.frame_hash);
  if(f)visual_comparisons.push({comparison_id:'comparison-'+i.key,object_id,action_ids:[action_id],observation_id:observation.observation_id,before_image_ref:f.path,after_image_ref:null,after_generation_status:{status:'not_requested'},after_is_ai_generated:false,image_edit_model:null});
 }
 return RiskObjectReportSchema.parse({schema_version:'welfarelens.risk-objects.v1',analysis_id:report.video_id,scene_id:report.video_id,generated_at:new Date(visual.generated_at).toISOString(),source,risk_objects,improvement_actions,game_task_candidates,visual_comparisons,provenance:{frames,observations:report.observations,match_evidence:report.match_evidence}});
}
