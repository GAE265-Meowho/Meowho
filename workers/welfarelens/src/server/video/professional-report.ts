import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {TOPIC_CATALOG_VERSION,topicSources,WELFARE_TOPICS} from '../../data/welfare-topics.ts';
import {RiskObjectReportSchema,type RiskObjectReport} from '../../domain/risk-objects.ts';
import {VisualReportSchema,type VisualReport} from '../../domain/visual-report.ts';
import {buildAlignedDetails} from './comparison-detail.ts';
import {readHumanReview} from './comparison-review.ts';
import {planVisualCases} from './visual-cases.ts';

const sha=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
async function verifiedAsset(dir:string,path:string,digest:string,mime:string){
 try{
  const bytes=await readFile(join(dir,path));
  return sha(bytes)===digest?'data:'+mime+';base64,'+bytes.toString('base64'):null;
 }catch(error){
  if((error as NodeJS.ErrnoException).code==='ENOENT')return null;
  throw error;
 }
}

export async function prepareProfessionalReport(input:VisualReport,risk:RiskObjectReport,dir:string,signal?:AbortSignal,reviewDraft=false){
 const visual=VisualReportSchema.parse(input), report=RiskObjectReportSchema.parse(risk);
 if(visual.job_id!==report.analysis_id)throw Error('Cross-job print');
 const planned=planVisualCases(report,visual);
 const cases=[];
 // Work sequentially so a report with many cases does not start many decoders simultaneously.
 for(const entry of planned){
  signal?.throwIfAborted();
  const object=report.risk_objects.find(o=>o.object_id===entry.object_id);
  const pair=report.visual_comparisons.find(p=>p.comparison_id===entry.comparison_id);
  const generation=pair?.after_generation_status;
  const observation=report.provenance.observations.find(o=>o.observation_id===pair?.observation_id);
  const frame=report.provenance.frames.find(f=>f.path===pair?.before_image_ref);
  const topic=WELFARE_TOPICS.find(t=>t.topic_id===entry.topic_id);
  const review=pair&&generation?.status==='review_required'?await readHumanReview(dir,report.analysis_id,{comparison_id:pair.comparison_id,after_generation_status:generation}):null;
  const sources=[...new Set([...entry.source_refs,...(object?.sources??[])])];
  const candidateNames=observation?.plant?.candidates.map(c=>c.scientific_name.toLowerCase())??[];
  if(topic?.topic_id==='plants'){
   if(candidateNames.some(n=>['sansevieria trifasciata','dracaena trifasciata'].includes(n)))sources.push(topicSources.snake.url);
   if(candidateNames.includes('monstera deliciosa'))sources.push(topicSources.monstera.url);
  }
  let reason=entry.reason;
  if(reason==='selected')reason='editing_not_attempted';
  let before=null,after=null,alignment=null;
  if(entry.reason==='selected'&&generation?.status==='failed')reason='image_generation_failed';
  if(entry.reason==='selected'&&(generation?.status==='generated'||generation?.status==='review_required')&&frame&&object?.localization.bbox){
   if(review?.decision==='rejected')reason='human_review_rejected';
   else{
    before=await verifiedAsset(dir,frame.path,frame.sha256,'image/jpeg');
    after=await verifiedAsset(dir,generation.path,generation.output_sha256,'image/png');
    if(!before||!after)reason='missing_or_invalid_asset';
    else {
     alignment=await buildAlignedDetails(before,after,object.localization.bbox,signal);
     reason=!alignment?'alignment_unavailable':(generation.status==='generated'||review?.decision==='approved')?'illustrated':'quality_review_required';
    }
   }
  }
  const detail=alignment?.images??null;
  const prefix=pair?.after_image_ref?.replace(/\.png$/,'');
  const detailRefs=detail&&prefix?[prefix+'-before-detail.jpg',prefix+'-after-detail.jpg']:null;
  const display=reason==='illustrated'||(reviewDraft&&reason==='quality_review_required');
  cases.push({topic,observation,review,before:display?before:null,after:display?after:null,detail,dimensions:alignment?.dimensions,summary:{
   visualization_policy:entry.visualization_policy,topic_id:entry.topic_id,comparison_id:entry.comparison_id,object_ids:entry.object_id?[entry.object_id]:[],
   risk_or_welfare_finding_ids:[entry.issue_id],action_ids:pair?.action_ids??object?.improvement_action_ids??[],
   evidence_observation_id:pair?.observation_id??null,evidence_timestamp:frame?.timestamp??null,
   evidence_frame_id:frame?.frame_id??null,evidence_frame_sha256:frame?.sha256??null,
   before_region:frame&&object?.localization.bbox?object.localization:null,
   after_region:alignment?.afterTarget?{bbox:alignment.afterTarget,source:'aligned_original_region' as const}:null,
   detail_regions:alignment?.regions??null,
   before_image_ref:pair?.before_image_ref??null,after_image_ref:pair?.after_image_ref??null,
   before_detail_ref:detailRefs?.[0]??null,after_detail_ref:detailRefs?.[1]??null,
   detail_sha256:detail?.map(image=>sha(Buffer.from(image.split(',')[1],'base64')))??null,
   source_refs:[...new Set(sources)],generation_status:generation?.status??'not_requested',
   generation_error:generation?.status==='failed'?generation.error:null,
   generation_metadata:generation?.status==='generated'?generation:null,
   review_status:review?.decision??'not_reviewed',human_review:review,disposition:reason,
  }});
 }
 const groups=new Map<string,{frame:typeof report.provenance.frames[number];markers:Array<{labels:string[];bbox:readonly [number,number,number,number]}>}>();
 for(const entry of planned){
  if(entry.reason!=='selected')continue;
  const issue=visual.issues.find(i=>i.key===entry.issue_id);
  const rep=issue?.representative;
  if(!issue||!rep?.region.bbox||issue.category==='ENRICHMENT_ADVICE')continue;
  const frame=report.provenance.frames.find(f=>f.frame_id===rep.frame_id&&f.sha256===rep.frame_hash);
  if(!frame)continue;
  const group=groups.get(frame.frame_id)??{frame,markers:[]};
  const sameRegion=group.markers.find(marker=>marker.bbox.every((value,i)=>value===rep.region.bbox![i]));
  if(sameRegion){if(!sameRegion.labels.includes(issue.label))sameRegion.labels.push(issue.label);}
  else group.markers.push({labels:[issue.label],bbox:rep.region.bbox});
  groups.set(frame.frame_id,group);
 }
 let overview=null;
 for(const {frame,markers} of [...groups.values()].sort((a,b)=>b.markers.length-a.markers.length||a.frame.timestamp-b.frame.timestamp)){
  const image=await verifiedAsset(dir,frame.path,frame.sha256,'image/jpeg');
  if(image){overview={image,markers,timestamp:frame.timestamp,frame_id:frame.frame_id,frame_ref:frame.path};break;}
 }
 return {visual,report,cases,overview,reviewDraft};
}

export type ProfessionalReport=Awaited<ReturnType<typeof prepareProfessionalReport>>;
export async function writeProfessionalAssets(dir:string,prepared:ProfessionalReport){
 const files=[];
 for(const entry of prepared.cases){
  if(!entry.detail)continue;
  for(const [i,path] of [entry.summary.before_detail_ref,entry.summary.after_detail_ref].entries()){
   if(!path)continue;
   const bytes=Buffer.from(entry.detail[i].split(',')[1],'base64');
   await writeFile(join(dir,path),bytes,{flag:'wx',mode:0o600});
   files.push(path);
  }
 }
 const name='welfarelens-illustrations.v1.json';
 await writeFile(join(dir,name),JSON.stringify({
  schema_version:'welfarelens.illustrations.v1',catalog_version:TOPIC_CATALOG_VERSION,job_id:prepared.report.analysis_id,
  full_scene_refs_relative_to:'job_directory',detail_refs_relative_to:'export_directory',
  report_mode:prepared.reviewDraft?'private_review':'publication',
  overview:prepared.overview?{frame_id:prepared.overview.frame_id,frame_ref:prepared.overview.frame_ref,timestamp:prepared.overview.timestamp,markers:prepared.overview.markers}:null,
  overview_after_status:'no_reviewed_multi_target_edit',
  cases:prepared.cases.map(c=>c.summary),
 },null,2),{flag:'wx',mode:0o600});
 return [...files,name];
}
