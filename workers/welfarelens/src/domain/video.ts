import {z} from 'zod';
import type {ScanAction} from './scan-result.ts';

export const VIDEO_MAX_BYTES=120*1024*1024;
export const VIDEO_TTL_MS=30*60*1000;
export const VideoFrameSchema=z.object({frame_id:z.string().regex(/^f\d{3}$/),timestamp:z.number().finite().nonnegative(),hash:z.string(),novelty:z.number().finite().nonnegative(),sharpness:z.number().finite().nonnegative()}).strict();
export type VideoFrame=z.infer<typeof VideoFrameSchema>;
const evidenceSchema=z.object({frame_id:z.string().regex(/^f\d{3}$/),timestamp:z.number().finite().nonnegative()}).strict();
export const VideoEventSchema=z.object({
 video_id:z.string(),event_id:z.string(),risk_type:z.string(),risk_title:z.string(),severity:z.enum(['high','moderate']),kind:z.enum(['risk','precaution','prevention','enrichment']),
 observation:z.string(),potential_risk:z.string(),recommendation:z.string(),unknown:z.array(z.string()),start_time:z.number().finite().nonnegative(),end_time:z.null(),representative_timestamp:z.number().finite().nonnegative(),frame_id:z.string().regex(/^f\d{3}$/),bounding_box:z.null(),object_track_id:z.null(),
 identification_status:z.enum(['model_candidate','unknown']),verification_status:z.literal('inferred_not_verified'),source_reference:z.array(z.string().url()),model_version:z.string(),evidence_frames:z.array(evidenceSchema),
}).strict();
export type VideoEvent=z.infer<typeof VideoEventSchema>;
const VideoJobObjectSchema=z.object({
 input_kind:z.enum(['video','photo']).optional(),video_id:z.string().uuid(),owner_hash:z.string(),submission_key:z.string().optional(),worker_pid:z.number().int().positive().optional(),created_at:z.number(),expires_at:z.number(),status:z.enum(['uploading','queued','processing','completed','partial','failed','cancelled']),stage:z.string(),original_deleted:z.boolean(),
 metadata:z.object({duration:z.number(),width:z.number(),height:z.number(),codec:z.string(),rotation:z.number()}).optional(),frames:z.array(VideoFrameSchema),events:z.array(VideoEventSchema),
 warning:z.array(z.string()),error:z.string().nullable(),model:z.string(),analysis_provider:z.literal('azure'),analysis_status:z.enum(['pending','complete','incomplete','failed']),review_status:z.literal('not_human_reviewed'),
 worker_error:z.string().max(60).optional(),
 diagnostics:z.array(z.object({frame_id:z.string().regex(/^f\d{3}$/),processing_stage:z.enum(['scene','plant_recheck']),inference_latency:z.number().nonnegative(),queue_wait_ms:z.number().nonnegative().optional(),error_type:z.enum(['credentials','configuration','disabled','quota','timeout','invalid_output','provider_unavailable','analysis_failed']).nullable(),token_usage:z.object({prompt_tokens:z.number(),completion_tokens:z.number()}).nullable()}).strict()).optional(),
 metrics:z.object({extractionMs:z.number(),inferenceMs:z.number(),totalMs:z.number(),calls:z.number(),request_attempts:z.number().int().nonnegative().optional(),sampledFrames:z.number().optional(),analyzedFrames:z.number().optional(),prompt_tokens:z.number(),completion_tokens:z.number(),failedFrames:z.number(),refinementFailures:z.number(),retry_count:z.number().int().nonnegative(),estimated_api_cost:z.null(),sceneMs:z.number().nonnegative().optional(),plantMs:z.number().nonnegative().optional(),cropWorkMs:z.number().nonnegative().optional(),aggregationMs:z.number().nonnegative().optional(),finalizationMs:z.number().nonnegative().optional(),maxActiveCalls:z.number().int().nonnegative().optional(),concurrency:z.number().int().min(1).max(2).optional(),cpuUserMs:z.number().nonnegative().optional(),cpuSystemMs:z.number().nonnegative().optional(),sampledPeakRssMb:z.number().nonnegative().optional()}).optional(),
}).strict();
function validateVideoEvidence(job:{video_id:string;frames:VideoFrame[];events:VideoEvent[]},ctx:z.RefinementCtx){
 const known=new Map(job.frames.map(f=>[f.frame_id,f.timestamp]));
 if(known.size!==job.frames.length)ctx.addIssue({code:'custom',path:['frames'],message:'Duplicate frame'});
 for(const [i,event] of job.events.entries()){
  if(event.video_id!==job.video_id||known.get(event.frame_id)!==event.representative_timestamp||event.start_time!==event.representative_timestamp||!event.evidence_frames.some(f=>f.frame_id===event.frame_id)||event.evidence_frames.some(f=>known.get(f.frame_id)!==f.timestamp))ctx.addIssue({code:'custom',path:['events',i],message:'Invalid source evidence'});
 }
}
export const VideoJobSchema=VideoJobObjectSchema.superRefine(validateVideoEvidence);
export const PublicVideoJobSchema=VideoJobObjectSchema.omit({owner_hash:true}).superRefine(validateVideoEvidence);
export type VideoJob=z.infer<typeof VideoJobSchema>;

/** Adapted from spike choose_frames: temporal anchors plus visual novelty, never a risk score. */
export function selectFrames<T extends {timestamp:number;novelty:number;sharpness:number}>(frames:T[],limit=8):T[]{
 if(!Number.isInteger(limit)||limit<2||frames.some(f=>!Number.isFinite(f.timestamp)||f.timestamp<0))throw Error('Invalid sampling input');
 if(frames.length<=limit)return [...frames];
 const selected=new Set([0,frames.length-1]);
 const anchors=Math.max(2,Math.ceil(limit/2));
 for(let i=1;i<anchors-1;i++)selected.add(Math.round(i*(frames.length-1)/(anchors-1)));
 const rest=frames.map((f,i)=>({i,score:f.novelty+Math.min(f.sharpness/10000,.1)})).filter(f=>!selected.has(f.i)).sort((a,b)=>b.score-a.score||a.i-b.i);
 for(const f of rest){if(selected.size>=limit)break;selected.add(f.i);}
 return [...selected].sort((a,b)=>a-b).map(i=>frames[i]);
}

/** Same risk type is NOT identity. Only byte-identical sampled evidence can share an event. */
export function eventsFromFrames(videoId:string,frames:{frame_id:string;timestamp:number;hash:string;actions:ScanAction[]}[],model:string):VideoEvent[]{
 const out:VideoEvent[]=[],seen=new Map<string,VideoEvent>();
 for(const f of [...frames].sort((a,b)=>a.timestamp-b.timestamp)){
  evidenceSchema.parse({frame_id:f.frame_id,timestamp:f.timestamp});
  for(const a of f.actions){
   if(!a.observation.trim()||!a.action.trim())continue;
   const key=JSON.stringify([f.hash,a.id,a.object_index,a.title,a.observation,a.action,a.kind]);
   const previous=seen.get(key);if(previous){if(!previous.evidence_frames.some(e=>e.frame_id===f.frame_id))previous.evidence_frames.push({frame_id:f.frame_id,timestamp:f.timestamp});continue;}
   const event=VideoEventSchema.parse({video_id:videoId,event_id:`ev-${out.length+1}`,risk_type:a.id.startsWith('plant-')?'plant':'environment',risk_title:a.title,severity:a.priority,kind:a.kind,observation:a.observation,potential_risk:[a.inference,a.reason,a.impact].filter(Boolean).join('；'),recommendation:a.action,unknown:a.unknown,start_time:f.timestamp,end_time:null,representative_timestamp:f.timestamp,frame_id:f.frame_id,bounding_box:null,object_track_id:null,identification_status:a.kind==='precaution'?'unknown':'model_candidate',verification_status:'inferred_not_verified',source_reference:a.source_url?[a.source_url]:[],model_version:model,evidence_frames:[{frame_id:f.frame_id,timestamp:f.timestamp}]});
   out.push(event);seen.set(key,event);
  }
 }
 return out;
}
