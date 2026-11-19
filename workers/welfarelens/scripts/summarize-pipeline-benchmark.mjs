import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory=process.argv[2];
if(!directory||process.argv.length!==3)throw Error('Usage: node scripts/summarize-pipeline-benchmark.mjs PRIVATE_BATCH');
const order=[1,2,2,1,1,2];
const journal=(await readFile(join(directory,'requests.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));
const dispatches=journal.filter(event=>event.event==='dispatch');
const byDispatch=new Map(journal.filter(event=>event.event==='response').map(event=>[event.dispatch,event]));
const billing=await readFile(join(directory,'verified-billing.json'),'utf8').then(JSON.parse,error=>{
 if(error.code==='ENOENT')return {};
 throw error;
});
const show=value=>Number.isFinite(value)?String(Math.round(value*1000)/1000):'待測';
const usd=value=>Number.isSafeInteger(value)&&value>=0?(value/1_000_000).toFixed(6):'待測';
const seconds=ms=>Number.isFinite(ms)?show(ms/1000):'待測';
const sum=(rows,key)=>rows.reduce((total,row)=>total+row[key],0);
const coverage=[];
const totals=[[],[]];
const usageRows=[];
const versions=new Set();
let missingVersion=false;
let cumulative=0,cumulativeKnown=true;
console.log('| 輪次 | 路數 | 結果 | 本機 Pipeline 秒 | FFmpeg 秒 | VLM 秒 | 改圖秒 | PDF 秒 | HTML 秒 | VLM／改圖請求 | 429 | Timeout | Retry | 預留 USD | 實際 USD | 累積實際 USD |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for(const [index,arm] of order.entries()){
 const run=index+1;
 const row=await readFile(join(directory,`run-${run}.json`),'utf8').then(JSON.parse,error=>{
  if(error.code==='ENOENT')return null;
  throw error;
 });
 const own=dispatches.flatMap((entry,i)=>entry.run===run?[{...entry,response:byDispatch.get(i+1)}]:[]);
 const spans=row?.profile?.spans??[];
 const elapsed=stage=>spans.find(span=>span.stage===stage)?.duration_ms;
 const metrics=row?.profile?.analysis?.metrics;
 const timings=row?.profile?.analysis?.timings;
 const status=row?.ok===true?'PASS':row?'FAIL':own.length?'中斷，待核對':'待測';
 if(row){
  const {commit,digest,imageId,ociRevision}=row;
  if(/^[a-f0-9]{40}$/.test(commit)&&commit===ociRevision&&
    /^sha256:[a-f0-9]{64}$/.test(digest)&&/^sha256:[a-f0-9]{64}$/.test(imageId)){
   versions.add(`Commit／OCI revision \`${commit}\`，RepoDigest \`${digest}\`，Image ID \`${imageId}\``);
  }else missingVersion=true;
 }
 const local=row?.profile?.wall_ms??elapsed('local_pipeline');
 if(row?.ok&&Number.isFinite(local))totals[arm-1].push(local);
 const actual=billing[run];
 if(Number.isSafeInteger(actual)&&actual>=0)cumulative+=actual;
 else cumulativeKnown=false;
 const timeouts=own.filter(e=>e.response?.failure==='timeout'||e.response?.status===408).length;
 console.log(`| ${run} | ${arm} | ${status} | ${seconds(local)} | ${seconds(metrics?.extractionMs)} | ${seconds(metrics?.inferenceMs)} | ${seconds(timings?.imageEditingMs)} | ${seconds(elapsed('pdf_render'))} | ${seconds(elapsed('html_generate'))} | ${own.length?own.filter(e=>e.kind==='vlm').length+'/'+own.filter(e=>e.kind==='image').length:row?'0/0':'待測'} | ${own.length?own.filter(e=>e.response?.status===429).length:'待測'} | ${own.length?timeouts:'待測'} | ${show(metrics?.retry_count)} | ${own.length?usd(sum(own,'reservedUsdMicros')):'待測'} | ${usd(actual)} | ${usd(cumulativeKnown?cumulative:undefined)} |`);
 if(row?.checks)coverage.push(row.checks);
 if(own.length){
  const images=own.filter(e=>e.kind==='image');
  const received=images.filter(e=>e.response);
  const usage=row?.checks?.imageUsage;
  const imageTokens=key=>Array.isArray(usage)&&usage.length===images.length&&usage.every(item=>Number.isFinite(item?.[key]))
   ?sum(usage,key):null;
  const imageFailures=images.filter(e=>!e.response||e.response.status===null||e.response.status>=400).length;
  usageRows.push(`| ${run} | ${show(metrics?.prompt_tokens)}／${show(metrics?.completion_tokens)} | ${show(imageTokens('input_tokens'))}／${show(imageTokens('output_tokens'))} | ${seconds(sum(images,'waitMs'))} | ${seconds(sum(received.map(e=>e.response),'elapsedMs'))} | ${imageFailures} | ${images.length-received.length} |`);
 }
}
if(versions.size===1&&!missingVersion)console.log(`\n實測映像 ${[...versions][0]}。`);
else if(versions.size>1||missingVersion)console.log('\n映像版本存在差異或缺少證據，效能數據僅供逐輪審查。');
if(usageRows.length){
 console.log('\n| 輪次 | VLM 輸入／輸出 Tokens | 改圖輸入／輸出 Tokens | 改圖節流等待合計秒 | 改圖至回應標頭合計秒 | 改圖傳輸失敗或未知 | 送出未記回應 |');
 console.log('| --- | --- | --- | --- | --- | --- | --- |');
 for(const row of usageRows)console.log(row);
}
for(const [index,values] of totals.entries()){
 const sorted=values.sort((a,b)=>a-b);
 console.log(`\n路數 ${index+1} 的成功樣本 ${sorted.length}/3。排序秒數 ${sorted.map(seconds).join('、')||'待測'}。中位數 ${sorted.length===3&&versions.size===1&&!missingVersion?seconds(sorted[1]):'待測'}，最慢值 ${sorted.length?seconds(sorted.at(-1)):'待測'}。`);
}
if(coverage.length>1){
 const fingerprints=coverage.map(({frameHashes,editInputs,coverage:items})=>
  JSON.stringify({frameHashes,editInputs,items}));
 console.log(`\n已驗證產物的來源影格、改圖輸入與風險證據 ${new Set(fingerprints).size===1?'相符':'存在差異，需複核'}。視覺品質仍需人工審查。`);
}
