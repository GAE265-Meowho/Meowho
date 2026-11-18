type Stage='claim'|'renew'|'source_download'|'source_probe'|'validation'|'json_generate'|'upload'|'complete'|'fail'|'image_case'|'image_edit_request'|'report_prepare'|'pdf_render'|'html_generate';
export class JobProfile {
 private started=performance.now();
 private claimedAt:number|null=null;
 private queueWait:number|null=null;
 private cpu=process.cpuUsage();
 private peakRss=process.memoryUsage().rss;
 private spans:{stage:Stage;start_ms:number;duration_ms:number;ok:boolean;case_index?:number}[]=[];
 private editUsage:{usage:{input_tokens?:number;output_tokens?:number;total_tokens?:number}|null;http_status:number|null;case_index:number}[]=[];
 private processing:unknown=null;
 claimed(){this.claimedAt=performance.now();}
 queuedFor(ms:number|null){this.queueWait=ms;}
 analysis(metrics:unknown,calls:unknown,timings:unknown){this.processing={metrics,calls,timings};}
 imageUsage(usage:{input_tokens?:number;output_tokens?:number;total_tokens?:number}|null,http_status:number|null,case_index:number){this.editUsage.push({usage,http_status,case_index});}
 async measure<T>(stage:Stage,run:()=>Promise<T>,case_index?:number):Promise<T>{
  const start=performance.now();
  let ok=false;
  this.peakRss=Math.max(this.peakRss,process.memoryUsage().rss);
  try{const result=await run();ok=true;return result;}
  finally{
   this.peakRss=Math.max(this.peakRss,process.memoryUsage().rss);
   this.spans.push({stage,start_ms:Math.round(start-this.started),duration_ms:Math.round(performance.now()-start),ok,case_index});
  }
 }
 snapshot(outcome:string){
  const end=performance.now(),cpu=process.cpuUsage(this.cpu);
  return {event:'welfarelens_job_profile',outcome,wall_ms:Math.round(end-this.started),
   processing_wall_ms:this.claimedAt===null?null:Math.round(end-this.claimedAt),
   queue_wait_ms:this.queueWait,estimated_api_cost:null,cpu_user_ms:cpu.user/1000,cpu_system_ms:cpu.system/1000,
   sampled_peak_worker_rss_bytes:this.peakRss,spans:this.spans,analysis:this.processing,image_responses:this.editUsage};
 }
}
export function measure<T>(profile:JobProfile|undefined,stage:Stage,run:()=>Promise<T>,caseIndex?:number){
 return profile?profile.measure(stage,run,caseIndex):run();
}
