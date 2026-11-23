import {z} from 'zod';

const text=z.string().max(4000);
const id=z.string().min(1).max(256);
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const box=z.tuple([z.number(),z.number(),z.number(),z.number()]).refine(([x,y,r,b])=>x>=0&&y>=0&&r<=1&&b<=1&&r>x&&b>y);
const asset=z.object({
 name:z.string().regex(/^[a-f0-9]{64}\.(jpg|png)$/),
 webp_name:z.string().regex(/^[a-f0-9]{64}\.webp$/).optional(),
 sha256:digest,
 mime:z.enum(['image/jpeg','image/png']),
 width:z.number().int().min(1).max(16000),
 height:z.number().int().min(1).max(16000),
}).strict().refine(a=>a.name===a.sha256+(a.mime==='image/jpeg'?'.jpg':'.png'));
const evidence=z.object({observation_id:id,frame_id:id,timestamp:z.number().nonnegative(),frame_sha256:digest}).strict();
const beforeRegion=z.object({bbox:box,source:z.enum(['ai_estimated','user_confirmed'])}).strict();
const afterRegion=z.object({bbox:box,source:z.literal('aligned_original_region')}).strict();
const comparison=z.object({
 id,observation_id:id,before:asset,after:asset,before_detail:asset,after_detail:asset,
 before_region:beforeRegion.nullable(),after_region:afterRegion.nullable(),
 status:z.literal('ai_simulated_not_verified'),
}).strict().refine(c=>c.before.sha256!==c.after.sha256);
const improvement=z.object({
 id,label:text,action:text,hazard_category:text.nullable(),facts:z.array(text),inferences:z.array(text),
 unverified:z.array(text),evidence:z.array(evidence).min(1),comparisons:z.array(comparison),
}).strict().superRefine((item,ctx)=>{
 const observations=new Map(item.evidence.map(entry=>[entry.observation_id,entry]));
 if(new Set(item.comparisons.map(c=>c.id)).size!==item.comparisons.length||
  item.comparisons.some(c=>observations.get(c.observation_id)?.frame_sha256!==c.before.sha256))ctx.addIssue({code:'custom',message:'Invalid comparison evidence'});
});
const confirmation=z.object({id,label:text,conditions:z.array(text).min(1)}).strict();
const hazard=z.object({label:text,count:z.number().int().positive()}).strict();
const stats=z.object({
 improvements:z.number().int().nonnegative(),confirmations:z.number().int().nonnegative(),
 evidence_frames:z.number().int().nonnegative(),hazards:z.array(hazard),
}).strict();

export function summarizeReportView(improvements:readonly {hazard_category:string|null;evidence:readonly {frame_id:string}[]}[],confirmations:number) {
 const counts=new Map<string,number>();
 for(const item of improvements)if(item.hazard_category)counts.set(item.hazard_category,(counts.get(item.hazard_category)??0)+1);
 return {improvements:improvements.length,confirmations,
  evidence_frames:new Set(improvements.flatMap(i=>i.evidence.map(e=>e.frame_id))).size,
  hazards:[...counts].map(([label,count])=>({label,count}))};
}

export const ReportViewSchema=z.object({
 schema:z.literal('meow_report_view/1'),report_id:z.uuid(),attempt:z.number().int().min(1).max(3),
 improvements:z.array(improvement),confirmations:z.array(confirmation),statistics:stats,
}).strict().superRefine((report,ctx)=>{
 const expected=summarizeReportView(report.improvements,report.confirmations.length);
 if(new Set(report.improvements.map(i=>i.id)).size!==report.improvements.length||
  new Set(report.confirmations.map(i=>i.id)).size!==report.confirmations.length||
  expected.improvements!==report.statistics.improvements||expected.confirmations!==report.statistics.confirmations||
  expected.evidence_frames!==report.statistics.evidence_frames||
  JSON.stringify(expected.hazards)!==JSON.stringify(report.statistics.hazards)){
  ctx.addIssue({code:'custom',message:'Invalid report statistics'});
 }
});
export type ReportView=z.infer<typeof ReportViewSchema>;
export const REPORT_VIEW_MAX_BYTES=1024*1024;
export function reportViewAssetNames(report:ReportView){
 return new Set(report.improvements.flatMap(i=>i.comparisons.flatMap(c=>[c.before,c.after,c.before_detail,c.after_detail].flatMap(a=>a.webp_name?[a.name,a.webp_name]:[a.name]))));
}
