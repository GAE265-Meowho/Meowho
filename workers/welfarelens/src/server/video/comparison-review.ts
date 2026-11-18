import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import type {RiskObjectReport} from '../../domain/risk-objects.ts';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
export const HumanReviewSchema=z.object({
 schema_version:z.literal('welfarelens.visual-review.v1'),
 job_id:z.string().uuid(),
 comparison_id:z.string().min(1),
 automated_status:z.literal('review_required'),
 model:z.string().min(1),
 input_sha256:sha,
 output_sha256:sha,
 decision:z.enum(['approved','rejected']),
 reviewed_at:z.string().datetime(),
 reason:z.string().trim().min(1).max(500),
}).strict();

export async function readHumanReview(dir:string,jobId:string,pair:{comparison_id:string;after_generation_status:Pick<Extract<RiskObjectReport['visual_comparisons'][number]['after_generation_status'],{status:'review_required'}>,'status'|'path'|'model'|'input_sha256'|'output_sha256'|'generated_at'>|{status:'not_requested'|'failed'}}){
 const generation=pair.after_generation_status;
 if(generation.status!=='review_required')return null;
 try{
  const review=HumanReviewSchema.parse(JSON.parse(await readFile(join(dir,generation.path+'.review.json'),'utf8')));
  return review.job_id===jobId&&review.comparison_id===pair.comparison_id&&review.model===generation.model
   &&review.input_sha256===generation.input_sha256&&review.output_sha256===generation.output_sha256
   &&Date.parse(review.reviewed_at)>=Date.parse(generation.generated_at)?review:null;
 }catch{return null;}
}
