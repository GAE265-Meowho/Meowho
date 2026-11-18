import {measure,type JobProfile} from './job-profile.ts';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {MeowhoEnvReportSchema, WelfareLensReportV1Schema} from '../../domain/welfare-report.ts';
import {RiskObjectReportSchema} from '../../domain/risk-objects.ts';
import {VisualReportSchema} from '../../domain/visual-report.ts';
import {planVisualCases} from './visual-cases.ts';
import {standaloneSucceeded, type StandaloneBundle} from './standalone.ts';

export type Claim = {id:string; source:string; attempt:number; requireImages?:boolean; requireApprovedImages?:boolean};
type Stage = 'source'|'analysis'|'artifacts'|'storage';
const illustrationAudit='welfarelens-illustrations.v1.json';
const required = ['report.json','meowho-report.json','before-after.pdf'] as const;
type Artifacts = Record<typeof required[number],string>;
const IllustrationIndex = z.object({
 schema_version:z.literal('welfarelens.illustrations.v1'),job_id:z.string().uuid(),report_mode:z.literal('publication'),
 cases:z.array(z.object({comparison_id:z.string().nullable(),disposition:z.string(),
  before_image_ref:z.string().nullable(),after_image_ref:z.string().nullable(),
  before_detail_ref:z.string().nullable(),after_detail_ref:z.string().nullable(),detail_sha256:z.tuple([z.string(),z.string()]).nullable()})),
});

function validPdf(pdf:Buffer){
 const trailer=/startxref\s+(\d+)\s+%%EOF\s*$/.exec(pdf.subarray(-1024).toString('latin1'));
 if(!pdf.subarray(0,8).toString().match(/^%PDF-\d\.\d$/)||!trailer)return false;
 const offset=Number(trailer[1]);
 return offset>0&&offset<pdf.length&&/^(?:xref\b|\d+\s+\d+\s+obj\b)/.test(pdf.subarray(offset,offset+40).toString('latin1'));
}

export type IntegrationPorts = {
 claim():Promise<Claim|undefined>;
 readSource(job:Claim,destination:string):Promise<void>;
 analyze(input:string,root:string):Promise<StandaloneBundle>;
 // Save to immutable, attempt-scoped private keys. Only complete() publishes references.
 save(job:Claim,name:keyof Artifacts|typeof illustrationAudit,file:string):Promise<string>;
 // Both writes must atomically check current attempt, running status and unexpired lease.
 complete(job:Claim,artifacts:Artifacts):Promise<boolean>;
 fail(job:Claim,stage:Stage,error?:unknown):Promise<boolean>;
 preparePublication?(job:Claim,dir:string,bundle:StandaloneBundle,canonical:z.infer<typeof WelfareLensReportV1Schema>,summary:string):Promise<()=>Promise<boolean>>;
};

/** Process a single claim. Queue, storage and retry policy belong to the host adapter. */
export async function processIntegrationJob(root:string,ports:IntegrationPorts,profile?:JobProfile){
 const job=await ports.claim();
 if(!job)return 'idle';
 let directory:string|undefined;
 let stage:Stage='source';
 try{
  let publish:()=>Promise<boolean>;
  try{
   directory=await mkdtemp(join(root,'attempt-'));
   const input=join(directory,/\.mov$/i.test(job.source)?'input.mov':'input.mp4');
   const jobs=join(directory,'analysis');
   await ports.readSource(job,input);
   stage='analysis';
   const bundle=await ports.analyze(input,jobs);
   if(bundle.outcome!=='completed'||bundle.stages.analysis!=='completed')throw Object.assign(Error('Analysis unsuccessful'),{diagnostics:bundle.diagnostics});
   stage='artifacts';
   if(!standaloneSucceeded(bundle,true)||bundle.stages.aggregation!=='completed'||!required.every(name=>bundle.artifacts.includes(name))){
    const failures=bundle.imageFailures??[];
    const code=failures.find(f=>['permission_denied','result_invalid'].includes(f))??failures[0];
    throw Object.assign(Error('Required artifacts missing'),{code});
   }
   const dir=join(jobs,bundle.job_id);
   const {canonical,meowho,needsImages}=await measure(profile,'validation',async()=>{
   const [report,adapter,pdf]=await Promise.all(required.map(name=>readFile(join(dir,name))));
   const canonical=WelfareLensReportV1Schema.parse(JSON.parse(report.toString('utf8')));
   const meowho=MeowhoEnvReportSchema.parse(JSON.parse(adapter.toString('utf8')));
   if(canonical.report_id!==bundle.job_id||canonical.analysis_status!=='complete'||canonical.source!=='snapshot'||meowho.report_id!==canonical.report_id||!validPdf(pdf))throw Error('Invalid artifact');
   // The legacy flag still requests images, with the same automatic checks.
   const needsImages=job.requireImages||job.requireApprovedImages||bundle.stages.editing!=='not_requested';
   if(needsImages){
    const index=IllustrationIndex.parse(JSON.parse(await readFile(join(dir,illustrationAudit),'utf8')));
    const risk=RiskObjectReportSchema.parse(JSON.parse(await readFile(join(dir,'welfarelens-risk-objects.v1.json'),'utf8')));
    const visual=VisualReportSchema.parse(JSON.parse(await readFile(join(dir,'visual-report.json'),'utf8')));
    const selected=planVisualCases(risk,visual).filter(c=>c.reason==='selected');
    if(index.job_id!==bundle.job_id||risk.analysis_id!==bundle.job_id||visual.job_id!==bundle.job_id||!selected.length)throw Error('Required illustrations missing');
    for(const plan of selected){
     const pair=risk.visual_comparisons.find(p=>p.comparison_id===plan.comparison_id);
     const entry=index.cases.find(c=>c.comparison_id===plan.comparison_id);
     const generation=pair?.after_generation_status;
     if(!pair||generation?.status!=='generated'||entry?.disposition!=='illustrated'
      ||entry.before_image_ref!==pair.before_image_ref||entry.after_image_ref!==generation.path
      ||!entry.detail_sha256)throw Error('Required illustrations failed validation');
     const prefix=generation.path.slice(0,-4);
     const assets=[[pair.before_image_ref,generation.input_sha256],[generation.path,generation.output_sha256],
      [prefix+'-before-detail.jpg',entry.detail_sha256[0]],[prefix+'-after-detail.jpg',entry.detail_sha256[1]]];
     if(entry.before_detail_ref!==assets[2][0]||entry.after_detail_ref!==assets[3][0])throw Error('Mismatched illustration detail');
     for(const [path,digest] of assets)if(createHash('sha256').update(await readFile(join(dir,path))).digest('hex')!==digest)throw Error('Invalid illustration asset');
    }
   }
   return {canonical,meowho,needsImages};
   });
   stage='storage';
   if(ports.preparePublication)publish=await ports.preparePublication(job,dir,bundle,canonical,meowho.summary);
   else {
   if(needsImages&&!await ports.save(job,illustrationAudit,join(dir,illustrationAudit)))throw Error('Illustration audit save failed');
   const refs=await Promise.allSettled(required.map(async name=>ports.save(job,name,join(dir,name))));
   const [reportRef,meowhoRef,pdfRef]=refs;
   if(reportRef.status!=='fulfilled'||meowhoRef.status!=='fulfilled'||pdfRef.status!=='fulfilled'
    ||!reportRef.value||!meowhoRef.value||!pdfRef.value)throw Error('Artifact save failed');
   publish=()=>ports.complete(job,{'report.json':reportRef.value,'meowho-report.json':meowhoRef.value,'before-after.pdf':pdfRef.value});
   }
  }catch(error){
   return await ports.fail(job,stage,error)?'failed':'lease_lost';
  }
  // A lost acknowledgement may hide a committed result. Never mark it failed here.
  return await publish()?'ready':'lease_lost';
 }finally{
  if(directory)await rm(directory,{recursive:true,force:true});
 }
}
