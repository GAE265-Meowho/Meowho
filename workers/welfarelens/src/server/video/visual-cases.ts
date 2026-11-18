import {topicSources,welfareTopicForRule} from '../../data/welfare-topics.ts';
import type {RiskObjectReport} from '../../domain/risk-objects.ts';
import type {VisualReport} from '../../domain/visual-report.ts';

export function planVisualCases(report:RiskObjectReport,visual:VisualReport){
 const seen=new Set<string>();
 const objects=new Map(report.risk_objects.map(o=>[o.risk_id,o]));
 const pairs=new Map(report.visual_comparisons.map(p=>[p.object_id,p]));
 const observations=new Map(report.provenance.observations.map(o=>[o.observation_id,o]));
 return visual.issues.map(issue=>{
  const object=objects.get(issue.key);
  const pair=object&&pairs.get(object.object_id);
  const observation=observations.get(pair?.observation_id??issue.representative.observation_id);
  const topic=welfareTopicForRule(observation?.rule_id??null);
  const pattern=topic?.visual_improvement_patterns.find(p=>p.mode==='placement'
   ?observation?.kind==='enrichment'
   :object?.category===p.kind);
  const bbox=object?.localization.bbox;
  const evidenceBox=pattern?.mode==='placement'?observation?.placement?.bbox
   :issue.representative.observation_id===observation?.observation_id?issue.representative.region.bbox:null;
  const evidence=!!pair&&!!bbox&&!!observation?.observation.trim()
   &&JSON.stringify(bbox)===JSON.stringify(evidenceBox)
   &&observation.fidelity==='validated_candidate'&&observation.quality==='adequate'
   &&issue.evidence.some(e=>e.observation_id===observation.observation_id&&e.frame_id===observation.frame_id)
   &&(pattern?.mode!=='placement'||!!observation.placement)
   &&(!pattern?.requirePlantConcern||['risk','precaution'].includes(observation.kind))
   &&(pattern?.facts??[]).every(key=>observation.facts?.some(f=>f.key===key&&f.value===true&&f.status==='OBSERVATION'&&f.confidence!=='low'));
  // Only identical source pixels and an identical target/action can suppress a
  // distinct issue. Cross-view identity remains the canonical aggregator's job.
  const identity=evidence&&observation?JSON.stringify([topic?.topic_id,observation.frame_hash,observation.object_ref,bbox,pattern?.change]):'';
  const reason=!topic?'unmapped_topic':!pattern?'not_visually_verifiable':!evidence?'insufficient_evidence'
   :seen.has(identity)?'duplicate_evidence':'selected';
  if(reason==='selected')seen.add(identity);
  return {issue_id:issue.key,object_id:object?.object_id??null,comparison_id:pair?.comparison_id??null,
   topic_id:topic?.topic_id??null,source_refs:topic?.authoritative_source_refs.map(ref=>topicSources[ref.id].url)??[],
   visualization_policy:!pattern?'text_first':object?.category==='cord'?'strong_candidate':'conditional_candidate',
   expected_change:pattern?.change??null,reason};
 });
}
