import {z} from 'zod';
import {CandidateSchema} from './schema.ts';
import {VideoFrameSchema} from './video.ts';
import type {VideoJob} from './video.ts';
import {buildScanResult} from './scan-result.ts';
import {RawObservationSchema} from './video-issues.ts';
import type {RawObservation} from './video-issues.ts';
export const FrameSnapshotSchema=z.object({frame:VideoFrameSchema,candidate:CandidateSchema,initial_candidate:CandidateSchema.optional()}).strict();
export type ValidatedFrameSnapshot=z.infer<typeof FrameSnapshotSchema>;
/** All IDs are supplied and persisted by server, never inferred from prose. */
export function captureObservations(frames:readonly ValidatedFrameSnapshot[],idForObservation:(key:string)=>string,events:VideoJob['events']=[],model=''):RawObservation[]{
 const out:RawObservation[]=[],eventKeys=new Map<string,string>();
 for(const value of [...frames].sort((a,b)=>a.frame.timestamp-b.frame.timestamp)){const {frame,candidate}=FrameSnapshotSchema.parse(value);for(const a of buildScanResult(candidate).actions){
  if(!a.observation.trim()||!a.action.trim())continue;
  const item=a.id.startsWith('case-')?candidate.assessments?.[Number(a.id.split('-')[1])]:undefined;
  const object=a.object_index===null?null:candidate.objects[a.object_index];
  // Same key/order as eventsFromFrames; prose alone cannot associate two pots.
  const eventKey=JSON.stringify([frame.hash,a.id,a.object_index,a.title,a.observation,a.action,a.kind]);
  if(!eventKeys.has(eventKey))eventKeys.set(eventKey,`ev-${eventKeys.size+1}`);
  const linked=events.find(e=>e.event_id===eventKeys.get(eventKey)&&e.evidence_frames.some(f=>f.frame_id===frame.frame_id&&f.timestamp===frame.timestamp));
  out.push(RawObservationSchema.parse({observation_id:idForObservation(`${frame.frame_id}:${a.id}`),event_ids:linked?[linked.event_id]:[],frame_id:frame.frame_id,timestamp:frame.timestamp,frame_hash:frame.hash,rule_id:item?.rule_id??(a.id.startsWith('plant-')?'H02':null),object_ref:a.object_index,object_kind:object?.kind??null,object_label:object?.label??null,candidate_bbox:object?.bbox??null,...(a.kind==='enrichment'&&item?.proposal?.placement?.bbox?{placement:item.proposal.placement}:{}),facts:item?.facts??[],plant:candidate.plants?.find(p=>p.object_index===a.object_index)??null,quality:candidate.image_quality??'limited',fidelity:'validated_candidate',kind:a.kind,severity:a.priority,title:a.title,observation:a.observation,potential_risk:[a.inference,a.reason,a.impact].filter(Boolean).join('；'),recommendation:a.action,unknown:[...a.unknown,...candidate.limitations],sources:a.source_url?[a.source_url]:[],model}));
 }}return out;
}
export function fromLegacyEvents(job:Pick<VideoJob,'video_id'|'events'|'frames'>):RawObservation[]{
 return job.events.flatMap(e=>e.evidence_frames.map(f=>RawObservationSchema.parse({observation_id:`legacy:${e.event_id}:${f.frame_id}`,event_ids:[e.event_id],frame_id:f.frame_id,timestamp:f.timestamp,frame_hash:job.frames.find(x=>x.frame_id===f.frame_id)?.hash??'',rule_id:null,object_ref:null,object_kind:null,object_label:null,candidate_bbox:null,facts:null,plant:null,quality:'unknown',fidelity:'legacy_limited',kind:e.kind,severity:e.severity,title:e.risk_title,observation:e.observation,potential_risk:e.potential_risk,recommendation:e.recommendation,unknown:e.unknown,sources:e.source_reference,model:e.model_version})));
}
