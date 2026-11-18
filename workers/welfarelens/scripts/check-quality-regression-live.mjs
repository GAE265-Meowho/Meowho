// Explicitly authorized public-photo comparison; no private photos or raw credentials logged.
import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
if(!process.argv.includes('--consent'))throw Error('Explicit consent required');
const option=name=>process.argv[process.argv.indexOf(name)+1];
const dir=option('--output'),before=option('--before');
if(!dir||!before)throw Error('--output and --before required');
await mkdir(dir,{recursive:true});
// Snapshot has no dependencies; resolve ONLY its existing zod import to the installed app version.
const zod=pathToFileURL(resolve('node_modules/zod/index.js')).href;
registerHooks({resolve(specifier,context,next){return next(specifier==='zod'?zod:specifier,context);}});
const {createAnalyzeHandler:baseline}=await import(pathToFileURL(resolve(before,'src/server/azure.ts')).href);
const browser=await chromium.launch({channel:'msedge'}),page=await browser.newPage({viewport:{width:390,height:900}});
page.setDefaultTimeout(300000);
const fixtures=[
 {id:'pothos',url:'https://www.aspca.org/sites/default/files/field/image/plants/devils-ivy-2-r.jpg',expected:'TOXIC'},
 {id:'parlor-palm',url:'https://www.aspca.org/sites/default/files/field/image/plants/good-luck-palm-r.jpg',expected:'NON_TOXIC'},
 {id:'room-photo',path:join(dir,'room-photo.jpg'),source:'https://www.pexels.com/photo/living-room-with-couch-and-plants-against-table-near-window-7340487/',expected:null}
];
const results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
const previous=process.argv.includes('--reuse-baseline')?JSON.parse(await readFile(join(dir,'quality-live.initial.json'),'utf8')):null;
const projection=(data)=>({code:data.code,error:data.error,candidate:data.candidate,scan:data.scan,timings:data.timings,usage:data.usage,deployment:data.deployment});
try{for(const fixture of fixtures){
 const bytes=fixture.path?await readFile(fixture.path):Buffer.from(await(await fetch(fixture.url)).arrayBuffer());
 await page.goto('http://127.0.0.1:3100/');
 const input=await page.evaluate(async b64=>{const image=new Image();image.src='data:image/jpeg;base64,'+b64;await image.decode();const canvas=document.createElement('canvas'),scale=Math.min(1,1440/Math.max(image.naturalWidth,image.naturalHeight));canvas.width=Math.round(image.naturalWidth*scale);canvas.height=Math.round(image.naturalHeight*scale);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);let src=canvas.toDataURL('image/jpeg',.82);if(src.length>1600000)src=canvas.toDataURL('image/jpeg',.65);return src;},bytes.toString('base64'));
 let B;const prior=previous?.results.find(r=>r.id===fixture.id);
 if(prior){if(prior.sha256!==createHash('sha256').update(bytes).digest('hex'))throw Error('Baseline fixture bytes changed');B=prior.B;}
 else{const t=performance.now();const bResponse=await baseline(process.env)(new Request('http://localhost:3100/api/analyze',{method:'POST',headers:{origin:'http://localhost:3100','content-type':'application/json'},body:JSON.stringify({consent:true,imageDataUrl:input})}));const bData=await bResponse.json();B={http:bResponse.status,totalMs:performance.now()-t,...projection(bData)};}
 const calls=[],pending=[];
 const listener=response=>{if(!response.url().endsWith('/api/analyze'))return;const refinement=!!response.request().postDataJSON().refinement;pending.push(response.json().then(data=>calls.push({refinement,http:response.status(),...projection(data)})));};page.on('response',listener);
 const start=performance.now();await page.getByLabel('上傳照片',{exact:true}).setInputFiles({name:'public-reference.jpg',mimeType:'image/jpeg',buffer:bytes});
 await page.locator('.scan-results[data-analysis-calls],.scan-failure').first().waitFor();await Promise.all(pending);page.off('response',listener);
 const totalMs=performance.now()-start;
 const rendered=await page.locator('.scan-results').count()?await page.locator('.scan-results').innerText():await page.locator('.scan-failure').innerText();
 const actions=await page.locator('.complete-findings article').allInnerTexts();
 const measures=await page.evaluate(()=>performance.getEntriesByType('measure').filter(e=>e.name.startsWith('welfarelens.')).map(e=>({name:e.name,duration:e.duration})));
 await page.screenshot({path:join(dir,fixture.id+'-C-mobile.png'),fullPage:true});
 if(fixture.id==='room-photo'){await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:join(dir,'room-photo-C-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:900});}
 const C={totalMs,calls,measures,actions,rendered,markers:await page.locator('.scan-object-marker').count(),leader:await page.locator('.photo-leader path').count(),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1)};
 results.push({id:fixture.id,source:fixture.url??fixture.source,expected:fixture.expected,sha256:createHash('sha256').update(bytes).digest('hex'),B,C});
 await writeFile(join(dir,'quality-live.json'),JSON.stringify({note:'Same public sources; B uses captured before snapshot with same JPEG. C actual browser -> existing Azure, including adaptive crops. n=3 exploratory, no calibrated accuracy or billing claim. Plant labels from ASPCA only; room species unknown.',results,errors},null,2));
 console.log(JSON.stringify({id:fixture.id,B:{http:B.http,totalMs:B.totalMs,actions:B.scan?.actions?.length,plants:B.scan?.plants?.map(p=>p.status)},C:{totalMs,calls:calls.length,actions:actions.length,markers:C.markers,plants:rendered.slice(0,300)}}));
}}finally{await browser.close();}
