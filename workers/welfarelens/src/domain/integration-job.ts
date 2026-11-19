import {z} from 'zod';
// Proposed transport contract, not an active Supabase table or authorization substitute.
const Path=z.string().min(1).max(500).regex(/^[A-Za-z0-9_./-]+$/).refine(p=>!p.startsWith('/')&&p.split('/').every(s=>s!==''&&s!=='.'&&s!=='..'),'Relative private storage path required');
const Asset=z.object({provider:z.enum(['azure_blob','supabase']),container:z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),path:Path,sha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export const SharedSourceSchema=Asset.extend({asset_id:z.string().uuid(),household_id:z.string().uuid(),bytes:z.number().int().positive(),mime:z.enum(['video/mp4','video/quicktime','image/jpeg','image/png']),delete_after:z.number().finite().nonnegative()}).strict().refine(s=>s.path.startsWith(s.household_id+'/'),'Source path must be household-scoped');
export const WorkerJobV1Schema=z.object({
 schema_version:z.literal('welfarelens.integration-job.v1'),job_id:z.string().uuid(),household_id:z.string().uuid(),source:SharedSourceSchema,job_type:z.enum(['welfarelens','room_3d']),status:z.enum(['queued','running','ready','failed','cancelled','timed_out']),
 attempt:z.number().int().min(1),max_attempts:z.number().int().min(1).max(3),retry_until:z.number().finite().nonnegative(),timeout_ms:z.number().int().min(1000).max(1080000),
 lease:z.object({worker_id:z.string().min(1).max(100),token:z.string().uuid(),expires_at:z.number().finite().nonnegative()}).strict().nullable(),results:z.array(Asset).max(100),completed_at:z.number().finite().nonnegative().nullable(),
}).strict().superRefine((j,c)=>{
 const bad=(message:string)=>c.addIssue({code:'custom',message});
 if(j.household_id!==j.source.household_id)bad('Household mismatch');
 if(j.attempt>j.max_attempts||j.retry_until>j.source.delete_after)bad('Invalid retry budget');
 if(j.status==='running'&&!j.lease)bad('Running job requires lease');
 if(j.lease&&(j.status!=='running'||j.lease.expires_at>j.source.delete_after))bad('Invalid lease');
 if(['queued','running'].includes(j.status)?j.completed_at!==null:j.completed_at===null)bad('Invalid completion time');
 if(j.status==='ready'&&!j.results.length)bad('Ready requires durable results');
});
export type WorkerJobV1=z.infer<typeof WorkerJobV1Schema>;
/** Pure coordinator decision only. Workers never directly delete the shared original. */
export function sharedSourceDisposition(input:z.input<typeof SharedSourceSchema>,values:unknown[],now:number):'retain'|'delete'|'cancel_then_delete'{
 if(!Number.isFinite(now)||now<0)throw Error('Invalid cleanup time');
 const source=SharedSourceSchema.parse(input),jobs=values.map(v=>WorkerJobV1Schema.parse(v));
 if(new Set(jobs.map(j=>j.job_id)).size!==jobs.length||new Set(jobs.map(j=>j.job_type)).size!==jobs.length)throw Error('Duplicate workflow');
 for(const j of jobs)if(JSON.stringify(j.source)!==JSON.stringify(source))throw Error('Different shared source');
 const active=jobs.some(j=>['queued','running'].includes(j.status));
 if(now>=source.delete_after)return active?'cancel_then_delete':'delete';
 if(jobs.length!==2||active)return 'retain';
 if(jobs.some(j=>['failed','timed_out'].includes(j.status)&&j.attempt<j.max_attempts&&now<j.retry_until))return 'retain';
 return 'delete';
}
