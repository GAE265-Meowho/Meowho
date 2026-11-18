import {createHash} from 'node:crypto';
import {lstat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {RiskObjectReport} from '../../domain/risk-objects.ts';
import {WELFARE_TOPICS} from '../../data/welfare-topics.ts';
import {readHumanReview} from './comparison-review.ts';
import {buildDetailImages} from './comparison-detail.ts';
import type {RoomReview} from './comparison-report.ts';

const hash=z.string().regex(/^[a-f0-9]{64}$/);
const coordinate=z.number().min(0).max(1);
const region=z.tuple([coordinate,coordinate,coordinate,coordinate]).refine(([l,t,r,b])=>l<r&&t<b);
const id=z.string().regex(/^[a-zA-Z0-9_-]+$/).max(160);
const text=z.string().trim().min(1).max(600);
const action=z.object({
 action_id:id,title:text,observation:text,instruction:text,expected_visible_change:text,region,
 kind:z.enum(['observed_hazard_prevention','conditional_prevention','optional_welfare_enrichment']),
 source:z.url({protocol:/^https$/}),topic_id:z.string().refine(key=>WELFARE_TOPICS.some(topic=>topic.topic_id===key)),
 target_object_ids:z.array(id), placement_conditions:z.array(text).min(1).optional(), manual_confirmation:z.literal(true).optional(),
}).strict();
export const RoomViewsSchema=z.object({
 schema_version:z.literal('welfarelens.room-views.v1'),
 job_id:z.uuid(),scene_id:z.uuid(),
 views:z.array(z.object({
  view_id:id,improvement_plan_id:id,title:text,source_frame_id:z.string().regex(/^f\d{3}$/),
  source_timestamp:z.number().nonnegative(),source_image_ref:z.string().regex(/^f\d{3}\.jpg$/),input_sha256:hash,
  actions:z.array(action).min(2),elements_to_preserve:z.array(text).min(1),unverified_conditions:z.array(text).min(1),
  generation:z.object({status:z.literal('review_required'),model:text,input_sha256:hash,output_sha256:hash,
   path:z.string().regex(/^room-[a-z0-9-]+-after\.png$/),generated_at:z.iso.datetime()}).strict().optional(),
  detail_action_id:id.optional(),
 }).strict()).min(1),
}).strict().superRefine(({views},ctx)=>{
 for(const key of ['view_id','improvement_plan_id','source_frame_id'] as const){
  if(new Set(views.map(view=>view[key])).size!==views.length)ctx.addIssue({code:'custom',message:'Duplicate '+key});
 }
});

async function loadAsset(dir:string,path:string,expected:string,mime:string){
 const asset=join(dir,path);
 const stat=await lstat(asset);
 if(!stat.isFile()||stat.size>12_000_000)throw Error('Invalid room asset');
 const bytes=await readFile(asset);
 if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('Room asset hash mismatch');
 return 'data:'+mime+';base64,'+bytes.toString('base64');
}

export async function loadRoomViews(dir:string,risk:RiskObjectReport,signal?:AbortSignal):Promise<RoomReview[]>{
 const file=join(dir,'room-views.json');
 let content;
 try{const stat=await lstat(file);if(!stat.isFile()||stat.size>128_000)throw Error('Invalid room plan');content=await readFile(file,'utf8');}
 catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return [];throw error;}
 const manifest=RoomViewsSchema.parse(JSON.parse(content));
 if(manifest.job_id!==risk.analysis_id||manifest.scene_id!==risk.scene_id)throw Error('Cross-job room plan');
 const rooms:RoomReview[]=[];
 for(const view of manifest.views){
  signal?.throwIfAborted();
  const frame=risk.provenance.frames.find(frame=>frame.frame_id===view.source_frame_id);
  if(!frame||frame.path!==view.source_image_ref||frame.timestamp!==view.source_timestamp||frame.sha256!==view.input_sha256)throw Error('Room evidence mismatch');
  for(const entry of view.actions)for(const objectId of entry.target_object_ids){
   if(!risk.risk_objects.some(object=>object.object_id===objectId&&object.evidence_refs.some(evidence=>evidence.frame_id===frame.frame_id)))throw Error('Room object evidence mismatch');
  }
  const before=await loadAsset(dir,frame.path,frame.sha256,'image/jpeg');
  const generation=view.generation;
  if(generation&&generation.input_sha256!==frame.sha256)throw Error('Room generation source mismatch');
  const review=generation?await readHumanReview(dir,risk.analysis_id,{comparison_id:view.improvement_plan_id,after_generation_status:generation}):null;
  const after=generation&&review?.decision!=='rejected'?await loadAsset(dir,generation.path,generation.output_sha256,'image/png'):undefined;
  const detailAction=view.actions.find(item=>item.action_id===view.detail_action_id);
  const detail=after&&detailAction?await buildDetailImages(before,after,detailAction.region,signal):null;
  rooms.push({title:view.title,timestamp:frame.timestamp,before,after,approved:review?.decision==='approved',actions:view.actions,unverified:view.unverified_conditions,detail:detail?[detail[0],detail[1]]:undefined});
 }
 return rooms;
}
