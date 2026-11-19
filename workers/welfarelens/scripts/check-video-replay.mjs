// UI-only replay of recorded real Azure evidence; never a new AI accuracy test.
import {chromium,expect} from '@playwright/test';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {PublicVideoJobSchema} from '../src/domain/video.ts';
const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};const report=arg('--report'),video=arg('--video'),out=arg('--output');if(!report||!video||!out)throw Error('report/video/output required');
const source=JSON.parse(await readFile(report,'utf8')),job=PublicVideoJobSchema.parse(source.job);if(!job.events.length)throw Error('No recorded events');await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'msedge'}),context=await browser.newContext({baseURL:'http://127.0.0.1:3100',viewport:{width:375,height:850},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.route('**/api/video-scans**',async route=>{const request=route.request();if(request.method()==='POST')return route.fulfill({status:201,json:{video_id:job.video_id}});if(request.method()==='PUT')return route.fulfill({status:202,json:{status:'queued'}});if(request.url().includes('/frames/')){const id=new URL(request.url()).pathname.split('/').at(-1);if(!job.frames.some(f=>f.frame_id===id))return route.fulfill({status:404});return route.fulfill({contentType:'image/jpeg',body:await readFile(join(dirname(report),id+'.jpg'))});}return route.fulfill({json:job});});
 await page.goto('/video');await page.getByLabel('上傳影片',{exact:true}).setInputFiles(video);await page.getByRole('heading',{name:'影片中的改善重點'}).waitFor();
 const lastTime=Math.max(...job.events.map(e=>e.representative_timestamp));await page.locator('.timeline-rail button').last().tap();await expect(page.locator('video')).toHaveJSProperty('currentTime',lastTime);
 const mobileOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 await page.reload();await page.getByText('原片已清除，以下保留事件截圖與改善建議。',{exact:true}).waitFor();await expect(page.locator('video')).toHaveCount(0);await page.locator('.video-event-card .text-button').last().tap();await expect(page.locator('.video-event-image')).toBeVisible();
 await page.getByRole('heading',{name:'影片中的改善重點'}).evaluate(el=>el.scrollIntoView({block:'start'}));await page.screenshot({path:join(out,'video-touch-replay.png'),fullPage:false});
 await writeFile(join(out,'touch-replay.json'),JSON.stringify({actualAzure:false,replayOfActualAzure:source.actualAzure,hasTouch:true,isMobile:true,viewport:375,seekTimestamp:lastTime,originalDeletedFallback:true,mobileOverflow,errors},null,2));
 console.log(JSON.stringify({mobileOverflow,seekTimestamp:lastTime,errors}));
}finally{await browser.close();}
