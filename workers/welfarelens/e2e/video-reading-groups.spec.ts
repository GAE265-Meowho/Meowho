import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {observation,id} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues,RawObservationSchema} from '../src/domain/video-issues';
const output='test-results/video-reading-groups';
// Optional owner-authorized local replay, never submits to AI or renews source TTL.
const realId=process.env.VIDEO_READING_JOB;
const dir=realId&&/^[a-f0-9-]{36}$/.test(realId)?join(process.cwd(),'.video-scans',realId):null;
const snapshot=dir?JSON.parse(await readFile(join(dir,'issues.json'),'utf8')):null;
const realJob=dir?JSON.parse(await readFile(join(dir,'job.json'),'utf8')):null;
if(realJob&&realJob.expires_at<=Date.now())throw Error('Private replay expired; no retention extension allowed');
const realFrames=new Map<string,Buffer>();
if(dir)for(const f of realJob.frames)realFrames.set(f.frame_id,await readFile(join(dir,`${f.frame_id}.jpg`)));

for(const width of [1280,375,850])test(`reading groups retain every issue and enlarge evidence ${width}`,async({page})=>{
 const synthetic=aggregateVideoIssues([
  observation('a',{object_label:'沙發背後線材',title:'沙發背後線材'}),
  observation('b',{object_label:'沙發後方線材',title:'沙發後方線材',frame_id:'f004',timestamp:4}),
  observation('c',{object_label:'落地燈旁線材',title:'落地燈旁線材',frame_id:'f008',timestamp:8}),
 ].map(o=>RawObservationSchema.parse(o)),[],k=>k.join('-'));
 const report=snapshot?.report??{version:1,video_id:id,source:'snapshot',...synthetic};
 const job=realJob??{video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,frames:[0,4,8].map(t=>({frame_id:`f${String(t).padStart(3,'0')}`,timestamp:t,hash:`f${t}`,novelty:0,sharpness:1})),events:[],warning:[],error:null,model:'synthetic',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 const {owner_hash:_,...publicJob}=job;
 await page.setViewportSize({width,height:width===850?375:900});
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),job.video_id);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1')throw Error('External traffic prohibited');
  if(!url.pathname.startsWith('/api/'))return route.continue();
  if(route.request().method()!=='GET')throw Error('Paid/write request prohibited');
  if(url.pathname.endsWith('/issues'))return route.fulfill({json:report});
  if(url.pathname.includes('/frames/'))return route.fulfill({contentType:'image/jpeg',body:realFrames.get(url.pathname.split('/').pop()!)??await readFile('private-eval/video-p0/at-0.jpg')});
  return route.fulfill({json:publicJob});
 });
 await page.goto('/video');await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();
 expect(await page.locator('.issue-summary-actions button').count()).toBeLessThanOrEqual(3);
 const sofa=page.locator('.issue-groups .video-issue-row button').filter({hasText:/沙發.*線材/}).first();await sofa.click();
 await expect(page.locator('.video-selected-issue')).toContainText('2 筆可能相關');
 await page.getByRole('button',{name:'查看證據 00:04',exact:true}).click();await expect(page.locator('.video-event-image')).toHaveAttribute('src',/f004$/);
 await page.getByRole('button',{name:'放大證據影格',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'放大證據影格',exact:true})).toBeFocused();
 await expect(page.locator('.video-evidence svg')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(realJob){await expect(page.getByText(/53 筆原始觀察/)).toBeAttached();expect(report.issues.length).toBe(29);}
 await mkdir(output,{recursive:true});
 await page.getByRole('heading',{name:'影片改善摘要'}).scrollIntoViewIfNeeded();
 await page.screenshot({path:join(output,`video-reading-${realJob?'azure-replay':'synthetic'}-${width}.png`),fullPage:true});
 expect(errors).toEqual([]);
});
