/** Local-only, numeric summary. Never exports images, descriptions, raw responses or credentials. */
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {VideoStore} from '../src/server/video/store.ts';
import {IssueReportSchema} from '../src/domain/video-issues.ts';
const store=new VideoStore(),id=process.argv[2];
const job=await store.read(id),dir=await store.directory(id);
const files=(await readdir(dir)).filter(n=>/^audit-\d{2}(?:-attempt-\d+)?\.json$/.test(n));
let prompt=0,completion=0,missing=0,cached=0,cacheWrite=0;
const calls=[];
for(const file of files.sort()){
 const record=JSON.parse(await readFile(join(dir,file),'utf8'));let provider;
 try{provider=JSON.parse(record.raw_response);}catch{}
 const usage=provider?.usage;
 if(typeof usage?.prompt_tokens==='number'&&typeof usage?.completion_tokens==='number'){
  prompt+=usage.prompt_tokens;completion+=usage.completion_tokens;
  cached+=usage.prompt_tokens_details?.cached_tokens??0;cacheWrite+=usage.prompt_tokens_details?.cache_write_tokens??0;
 }else missing++;
 calls.push({call:record.call,attempt:record.attempt??1,billing_uncertain:record.billing_uncertain??null,stage:record.stage,timestamp:record.timestamp,status:record.status,elapsed_ms:record.elapsed_ms,error:record.error,model:provider?.model??null,usage:usage??null});
}
let report;
try{report=IssueReportSchema.parse(JSON.parse(await readFile(join(dir,'issues.json'),'utf8')).report);}catch{}
await store.read(id);if(await store.isCancelled(id))throw Error('Deleted');
console.log(JSON.stringify({
 status:job.status,remaining_seconds:Math.max(0,Math.floor((job.expires_at-Date.now())/1000)),
 observations:report?.observations.length??null,issues:report?.issues.length??null,legacy_events:job.events.length,
 metrics:job.metrics,calls,
 usage:{prompt_tokens:prompt,completion_tokens:completion,cached_tokens:cached,cache_write_tokens:cacheWrite,requests_without_usage:missing},
 cost_note:'實際帳單尚未核對；缺少 usage 的請求不可視為免費。費率、快取、長上下文與合約差異仍需逐項核對。',
 quality_note:'HTTP 成功與數量減少都不是 AI 品質通過證據；需人工核對影格、植物、漏判與錯合併。'
},null,2));
