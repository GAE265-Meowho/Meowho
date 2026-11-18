import {z} from 'zod';
import {BboxSchema,PlantIdentificationSchema} from './schema.ts';
import {FactSchema,ProposalSchema,RuleIdSchema} from './assessment.ts';
const bounded=z.string().max(6000),ref=z.string().min(1).max(200),frame=z.string().regex(/^f\d{3}$/);
export const RawObservationSchema=z.object({
 observation_id:ref,event_ids:z.array(ref).max(200),frame_id:frame,timestamp:z.number().finite().nonnegative(),frame_hash:z.string().max(128),
 rule_id:RuleIdSchema.nullable(),object_ref:z.number().int().min(0).max(19).nullable(),object_kind:z.string().max(40).nullable(),object_label:z.string().max(100).nullable(),candidate_bbox:BboxSchema.nullable(),
 placement:ProposalSchema.shape.placement.unwrap().extend({bbox:BboxSchema}).optional(),
 facts:z.array(FactSchema).max(8).nullable(),plant:PlantIdentificationSchema.nullable(),quality:z.enum(['adequate','limited','unusable','unknown']),fidelity:z.enum(['validated_candidate','legacy_limited']),
 kind:z.enum(['risk','precaution','prevention','enrichment']),severity:z.enum(['high','moderate']),title:bounded,observation:bounded,potential_risk:bounded,recommendation:bounded,unknown:z.array(bounded).max(50),sources:z.array(z.string().url()).max(50),model:z.string().max(200)
}).strict();
export type RawObservation=z.infer<typeof RawObservationSchema>;
export const MatchEvidenceSchema=z.object({id:ref,observation_ids:z.tuple([ref,ref]),kind:z.enum(['pixel_equivalent','visual_correspondence','test_ground_truth','uncertain']),supports_same_object:z.boolean(),provenance:z.string().min(1).max(1000)}).strict();
export type MatchEvidence=z.infer<typeof MatchEvidenceSchema>;
const IssueSchema=z.object({issue_id:ref,category:z.enum(['PRIORITY_ACTION','NEEDS_CONFIRMATION','ENRICHMENT_ADVICE']),advice_kind:z.enum(['prevention','enrichment']).nullable(),title:bounded,observation:bounded,recommendation:bounded,
 severity:z.enum(['high','moderate']),exposure:z.enum(['observed','inferred','unknown']),evidence_quality:z.enum(['adequate','limited','unusable','unknown']),verification_status:z.literal('inferred_not_verified'),
 identity_status:z.enum(['supported','unresolved','care_theme']),observation_ids:z.array(ref).min(1).max(1000),match_ids:z.array(ref).max(4000),unknown:z.array(bounded).max(1000),sources:z.array(z.string().url()).max(1000),priority_reason:bounded,
 evidence:z.array(z.object({observation_id:ref,frame_id:frame,timestamp:z.number().finite().nonnegative()}).strict()).min(1).max(1000),region:z.null()
}).strict();
export type AggregatedIssue=z.infer<typeof IssueSchema>;
export const IssueReportSchema=z.object({version:z.literal(1),video_id:z.string().uuid(),source:z.enum(['snapshot','legacy_limited']),observations:z.array(RawObservationSchema).max(1000),match_evidence:z.array(MatchEvidenceSchema).max(4000),issues:z.array(IssueSchema).max(1000)}).strict().superRefine((r,c)=>{
 const obs=new Map(r.observations.map(o=>[o.observation_id,o])),matches=new Map(r.match_evidence.map(m=>[m.id,m]));
 const used=r.issues.flatMap(i=>i.observation_ids);
 if(obs.size!==r.observations.length||matches.size!==r.match_evidence.length||new Set(r.issues.map(i=>i.issue_id)).size!==r.issues.length||used.length!==obs.size||new Set(used).size!==obs.size||used.some(id=>!obs.has(id)))c.addIssue({code:'custom',message:'Invalid issue traceability'});
 for(const m of r.match_evidence)if(m.observation_ids.some(id=>!obs.has(id)))c.addIssue({code:'custom',message:'Unknown match observation'});
 for(const i of r.issues){if(i.match_ids.some(id=>{const m=matches.get(id);return !m||!m.supports_same_object||m.observation_ids.some(o=>!i.observation_ids.includes(o));}))c.addIssue({code:'custom',message:'Unknown or unrelated match evidence'});if(i.evidence.length!==i.observation_ids.length||new Set(i.evidence.map(e=>e.observation_id)).size!==i.evidence.length||i.evidence.some(e=>{const o=obs.get(e.observation_id);return !o||!i.observation_ids.includes(e.observation_id)||o.frame_id!==e.frame_id||o.timestamp!==e.timestamp;}))c.addIssue({code:'custom',message:'Invalid issue evidence'});}
});
export type IssueReport=z.infer<typeof IssueReportSchema>;
const unique=(s:string[])=>[...new Set(s)].sort();
export function rankIssues(issues:readonly AggregatedIssue[]):AggregatedIssue[]{
 const score=(i:AggregatedIssue)=>[i.category==='ENRICHMENT_ADVICE'?1:0,i.severity==='high'?0:1,i.category==='PRIORITY_ACTION'?0:1,i.evidence_quality==='adequate'?0:1];
 return [...issues].sort((a,b)=>{const x=score(a),y=score(b);for(let k=0;k<x.length;k++)if(x[k]!==y[k])return x[k]-y[k];return a.issue_id.localeCompare(b.issue_id);});
}
/** Complete-link: every pair needs support. Text, taxonomy and proximity are never identity. */
export function aggregateVideoIssues(raw:readonly RawObservation[],evidence:readonly MatchEvidence[],idForGroup:(key:string[])=>string,options:{allowTestEvidence?:boolean}={}){
 const byId=new Map<string,RawObservation>();for(const value of raw){const o=RawObservationSchema.parse(value),old=byId.get(o.observation_id);if(old&&JSON.stringify(old)!==JSON.stringify(o))throw Error('Observation ID conflict');byId.set(o.observation_id,o);}
 const observations=[...byId.values()].sort((a,b)=>a.observation_id.localeCompare(b.observation_id));
 const match_evidence=evidence.map(m=>MatchEvidenceSchema.parse(m)).sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(match_evidence.map(m=>m.id)).size!==match_evidence.length)throw Error('Duplicate match ID');
 for(const m of match_evidence){if(m.kind==='test_ground_truth'&&!options.allowTestEvidence)throw Error('Test evidence prohibited');if(m.observation_ids[0]===m.observation_ids[1]||m.observation_ids.some(id=>!byId.has(id)))throw Error('Unknown/self match');}
 const care=(o:RawObservation)=>o.kind==='enrichment'&&o.rule_id!==null;
 function canJoin(a:RawObservation,b:RawObservation){
  if(!a.rule_id||a.rule_id!==b.rule_id||a.kind!==b.kind)return false;
  if(care(a)&&care(b))return true; // Theme only, never physical identity.
  if(a.frame_id===b.frame_id&&a.object_ref!==b.object_ref)return false;
  const matches=match_evidence.filter(m=>m.observation_ids.includes(a.observation_id)&&m.observation_ids.includes(b.observation_id));
  if(matches.some(m=>!m.supports_same_object))return false;
  const exact=a.fidelity==='validated_candidate'&&b.fidelity==='validated_candidate'&&a.frame_hash!==''&&a.frame_hash===b.frame_hash&&a.object_ref!==null&&a.object_ref===b.object_ref&&a.object_kind===b.object_kind;
  return exact||matches.some(m=>m.supports_same_object&&m.kind!=='uncertain'&&m.kind!=='pixel_equivalent');
 }
 const groups:RawObservation[][]=[];
 for(const o of observations){const g=groups.find(group=>group.every(p=>canJoin(o,p)));if(g)g.push(o);else groups.push([o]);}
 const seen=new Set<string>();
 const issues=groups.map(group=>{
  const theme=group.every(care),representative=[...group].sort((a,b)=>(a.quality==='adequate'?0:1)-(b.quality==='adequate'?0:1)||a.timestamp-b.timestamp||a.observation_id.localeCompare(b.observation_id))[0];
  const ids=group.map(o=>o.observation_id).sort(),issue_id=idForGroup(['v1',theme?'theme':'physical',representative.rule_id??'unknown',...ids]);if(seen.has(issue_id))throw Error('Issue ID collision');seen.add(issue_id);
  const category=theme?'ENRICHMENT_ADVICE' as const:group.some(o=>o.kind==='risk'&&o.quality==='adequate'&&o.fidelity==='validated_candidate')?'PRIORITY_ACTION' as const:'NEEDS_CONFIRMATION' as const;
  const facts=group.flatMap(o=>o.facts??[]).filter(f=>['reachable','access_route'].includes(f.key)&&f.value===true&&f.confidence!=='low');
  const exposure=facts.some(f=>f.status==='OBSERVATION')?'observed' as const:facts.some(f=>f.status==='INFERENCE')?'inferred' as const:'unknown' as const;
  return IssueSchema.parse({issue_id,category,advice_kind:theme?'enrichment':representative.kind==='prevention'?'prevention':null,title:representative.title,observation:representative.observation,recommendation:representative.recommendation,severity:group.some(o=>o.severity==='high')?'high':'moderate',exposure,evidence_quality:representative.quality,verification_status:'inferred_not_verified',identity_status:theme?'care_theme':group.length>1?'supported':'unresolved',observation_ids:ids,match_ids:theme?[]:match_evidence.filter(m=>m.observation_ids.every(id=>ids.includes(id))).map(m=>m.id),unknown:unique(group.flatMap(o=>o.unknown)),sources:unique(group.flatMap(o=>o.sources)),priority_reason:theme?'照護機會，不代表已確認缺少資源。':category==='PRIORITY_ACTION'?'有具體可處理的影像候選；暴露程度及人工查核仍分開記錄。':'關鍵條件或影像辨識仍有限；先採預防行動，不當作已確認危害。',evidence:group.map(o=>({observation_id:o.observation_id,frame_id:o.frame_id,timestamp:o.timestamp})).sort((a,b)=>a.timestamp-b.timestamp||a.observation_id.localeCompare(b.observation_id)),region:null});
 });
 return {observations,match_evidence,issues:rankIssues(issues)};
}
