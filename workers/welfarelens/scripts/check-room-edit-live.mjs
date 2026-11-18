// One explicitly authorized UI → local API → Azure edit, using only our fictional room.
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
if(!process.argv.includes('--consent'))throw Error('Explicit --consent required for one potentially billable Azure image edit.');
const at=process.argv.indexOf('--output');if(at<0||!process.argv[at+1])throw Error('--output DIRECTORY required.');
const output=resolve(process.argv[at+1]);await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0;page.on('request',r=>{if(new URL(r.url()).pathname==='/api/improve')calls++;});
 await page.goto('http://127.0.0.1:3100/');await page.locator('main[aria-busy=false]').waitFor();
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();await page.getByRole('button',{name:'查看示範建議 →'}).click();await page.getByRole('button',{name:'產生改善對照 →'}).click();
 await page.getByRole('checkbox',{name:/我同意將此照片與改善清單/}).check();
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/improve',{timeout:190000});
 await page.getByRole('button',{name:'使用 AI 產生改善圖片'}).click();const r=await response;const data=await r.json();
 const report={fixture:'project-owned fictional demo-room.svg; no private photo; not real analysis accuracy',requests:calls,status:r.status(),success:false,mode:data.mode??null,latencyMs:data.latencyMs??null,width:data.width??null,height:data.height??null,quality:data.quality??null,requestedSize:data.requestedSize??null,changes:data.changes??null,errors,cost:'Actual Azure account price/charge not verified; one explicit request, no automatic retry.'};
 if(r.ok()){
  const image=page.getByAltText('AI 生成的改善構想圖');await image.waitFor({timeout:15000});await image.evaluate(img=>img.decode());
  await page.locator('.actual-comparison').screenshot({path:join(output,'live-pair-SIMULATED.png')});
  await page.locator('.generated-concept').screenshot({path:join(output,'live-after-SIMULATED.png')});
  report.success=true;
 }else{report.error_code=data.code??'unknown';report.error=data.error??'No valid image';process.exitCode=1;}
 if(calls!==1||errors.length)process.exitCode=1;
 await writeFile(join(output,'live-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
