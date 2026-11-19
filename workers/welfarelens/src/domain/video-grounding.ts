import {z} from 'zod';
import {BboxSchema} from './schema.ts';

/** Separate sidecar contract. This does not extend or change IssueReport v1. */
export const GroundingFrameSchema=z.object({
 frame_id:z.string().min(1).max(100),sha256:z.string().regex(/^[a-f0-9]{64}$/),
 width:z.number().int().positive().max(8192),height:z.number().int().positive().max(8192),pts_seconds:z.number().finite().nonnegative(),
}).strict();
export const RegionSchema=z.object({
 version:z.literal(1),id:z.string().min(1).max(100),frame:GroundingFrameSchema,
 issue_id:z.string().min(1).max(100),observation_id:z.string().min(1).max(100),label:z.string().min(1).max(60),
 bbox:BboxSchema,coordinate_space:z.literal('autorotated_jpeg_xyxy01'),
 provider:z.object({name:z.string().min(1).max(100),revision:z.string().min(1).max(100)}).strict(),
 review:z.object({status:z.enum(['candidate','accepted','rejected']),method:z.enum(['none','human_visual_review','agent_fixture_visual_check']),reviewer:z.string().min(1).max(100).nullable(),reference:z.string().min(1).max(200).nullable()}).strict(),
}).strict().superRefine((r,c)=>{
 if(r.review.status==='accepted'&&(r.review.method==='none'||!r.review.reviewer||!r.review.reference))c.addIssue({code:'custom',message:'Accepted regions require explicit review provenance'});
});
export type GroundingFrame=z.infer<typeof GroundingFrameSchema>;
export type ReviewedRegion=z.infer<typeof RegionSchema>;
export type GroundingContext={frame:GroundingFrame;issue_id:string;observation_id:string;enabled:boolean;fixtureMode?:boolean};

/** Consumes trusted review records, not a confidence gate or authentication mechanism. */
export function visibleRegions(input:readonly unknown[],context:GroundingContext):ReviewedRegion[]{
 if(!context.enabled||!GroundingFrameSchema.safeParse(context.frame).success)return [];
 const parsed=input.slice(0,100).flatMap(value=>{const p=RegionSchema.safeParse(value);return p.success?[p.data]:[];});
 return parsed.filter(r=>{
  if(parsed.filter(other=>other.id===r.id).length!==1)return false;
  const a=r.frame,b=context.frame;
  return a.frame_id===b.frame_id&&a.sha256===b.sha256&&a.width===b.width&&a.height===b.height&&a.pts_seconds===b.pts_seconds&&
   r.issue_id===context.issue_id&&r.observation_id===context.observation_id&&r.review.status==='accepted'&&
   (r.review.method==='human_visual_review'||(context.fixtureMode===true&&r.review.method==='agent_fixture_visual_check'));
 });
}
type Box=[number,number,number,number];
export function boxIoU(first:Box,second:Box):number{
 const a=BboxSchema.parse(first),b=BboxSchema.parse(second);
 const intersection=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 return intersection/((a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-intersection);
}
const DetectionSchema=z.object({frame_id:z.string().min(1),label:z.string().min(1),bbox:BboxSchema}).strict();
type Detection=z.infer<typeof DetectionSchema>;
/** Class/frame-aware, one-to-one greedy IoU evaluation; NOT COCO AP or thin-line mask accuracy. */
export function evaluateBoxes(truth:Detection[],predictions:Detection[]|null,threshold=.5){
 if(!Number.isFinite(threshold)||threshold<=0||threshold>1)throw Error('IoU threshold must be in (0,1]');
 const gt=z.array(DetectionSchema).max(10000).parse(truth);
 if(predictions===null)return {status:'not_run' as const,tp:null,fp:null,fn:null,precision:null,recall:null,meanMatchedIoU:null,matches:[]};
 const pred=z.array(DetectionSchema).max(10000).parse(predictions);
 const edges:{g:number;p:number;iou:number}[]=[];
 for(let g=0;g<gt.length;g++)for(let p=0;p<pred.length;p++)if(gt[g].frame_id===pred[p].frame_id&&gt[g].label===pred[p].label){const iou=boxIoU(gt[g].bbox,pred[p].bbox);if(iou>=threshold)edges.push({g,p,iou});}
 edges.sort((a,b)=>b.iou-a.iou||a.g-b.g||a.p-b.p);
 const usedG=new Set<number>(),usedP=new Set<number>(),matches:typeof edges=[];
 for(const edge of edges)if(!usedG.has(edge.g)&&!usedP.has(edge.p)){usedG.add(edge.g);usedP.add(edge.p);matches.push(edge);}
 const tp=matches.length;
 return {status:'measured' as const,tp,fp:pred.length-tp,fn:gt.length-tp,precision:pred.length?tp/pred.length:null,recall:gt.length?tp/gt.length:null,meanMatchedIoU:tp?matches.reduce((s,m)=>s+m.iou,0)/tp:null,matches};
}
