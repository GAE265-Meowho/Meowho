// Explicitly authorized test video only. No mock routes or replacement model responses.
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
if(!process.argv.includes('--consent'))throw Error('--consent required; selected frames/crops go to configured Azure');
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];},file=arg('--file'),out=arg('--output');if(!file||!out)throw Error('--file and --output required');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
const started=performance.now();
try{
 await page.goto('http://127.0.0.1:3100/video');
 const created=page.waitForResponse(r=>r.url().endsWith('/api/video-scans')&&r.request().method()==='POST');
 await page.getByLabel('上傳影片',{exact:true}).setInputFiles(resolve(file));const response=await created;if(response.status()!==201)throw Error('Create failed');const {video_id:id}=await response.json();
 let job;while(performance.now()-started<19*60*1000){const r=await page.request.get(`http://127.0.0.1:3100/api/video-scans/${id}`);if(!r.ok())throw Error(`Status ${r.status()}`);job=await r.json();if(['completed','partial','failed'].includes(job.status))break;await new Promise(r=>setTimeout(r,3000));}
 if(!job||!['completed','partial','failed'].includes(job.status))throw Error('Job timeout');
 await page.waitForTimeout(2500);if(job.events.length)await page.getByRole('button',{name:new RegExp(job.events[0].risk_title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).first().click();
 if(job.status!=='failed')await page.getByRole('heading',{name:'影片中的改善重點'}).evaluate(el=>el.scrollIntoView({block:'start'}));
 await page.screenshot({path:join(out,'video-live-desktop.png'),fullPage:false});await page.setViewportSize({width:375,height:850});if(job.status!=='failed')await page.getByRole('heading',{name:'影片中的改善重點'}).evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:join(out,'video-live-mobile.png'),fullPage:false});
 const media=[];for(const f of job.frames){const r=await page.request.get(`http://127.0.0.1:3100/api/video-scans/${id}/frames/${f.frame_id}`);if(r.ok()){await writeFile(join(out,`${f.frame_id}.jpg`),await r.body());media.push(f.frame_id);}}
 await writeFile(join(out,'live-result.json'),JSON.stringify({source:arg('--source')||null,sourceSha256:createHash('sha256').update(await readFile(file)).digest('hex'),actualAzure:true,groundTruthReviewed:false,browserTotalMs:performance.now()-started,job,errors,consoleErrors,media,horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)},null,2));
 console.log(JSON.stringify({status:job.status,events:job.events.length,metrics:job.metrics,errors}));
 // Preserve temporary report for same-browser viewing until TTL; no raw private video in evidence.
}finally{await browser.close();}
