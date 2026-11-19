import {BboxSchema} from './schema.ts';
import type {RawObservation,AggregatedIssue} from './video-issues.ts';
import type {VideoFrame} from './video.ts';
export type ApproximateObjectHint={source:'ai_estimate';label:string;bbox:[number,number,number,number];observation_id:string;frame_id:string;timestamp:number;frame_hash:string};
/** Presentation-only candidate, never an accepted Region or confirmed crop. */
export function approximateObjectHint(issue:Pick<AggregatedIssue,'issue_id'|'category'|'observation_ids'>,e:AggregatedIssue['evidence'][number]|undefined,o:RawObservation|undefined,f:Pick<VideoFrame,'frame_id'|'timestamp'|'hash'>|undefined):ApproximateObjectHint|null{
 if(!e||!o||!f||issue.category==='ENRICHMENT_ADVICE'||o.kind==='enrichment'||o.quality==='unusable'||o.fidelity!=='validated_candidate'||o.object_ref===null)return null;
 if(!issue.observation_ids.includes(o.observation_id)||e.observation_id!==o.observation_id||e.frame_id!==o.frame_id||e.timestamp!==o.timestamp||f.frame_id!==o.frame_id||f.timestamp!==o.timestamp||!o.frame_hash||f.hash!==o.frame_hash)return null;
 const box=BboxSchema.safeParse(o.candidate_bbox);if(!box.success)return null;
 return {source:'ai_estimate',label:(o.object_label||o.object_kind||o.title).slice(0,80),bbox:box.data,observation_id:o.observation_id,frame_id:o.frame_id,timestamp:o.timestamp,frame_hash:o.frame_hash};
}
