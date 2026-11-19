import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {roomFixture,id} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues,RawObservationSchema,MatchEvidenceSchema} from '../src/domain/video-issues';
import {IssueReportSchema} from '../src/domain/video-issues';
import {PublicVideoJobSchema} from '../src/domain/video';
import {fromLegacyEvents} from '../src/domain/video-observations';

const output='test-results/video-real-ux';
const original=process.env.WELFARELENS_PRIVATE_REPLAY_VIDEO ?? '';
const baseline=process.env.VIDEO_UX_BASELINE==='true';
// Media is real. ALL analysis, plant candidates and correspondence are reconstructed test data.
// Never claim this report is an Azure response or a botanically verified identification.
function replay(){
 const fixture=roomFixture();
 const observations=fixture.observations.map(o=>{
  if(o.observation_id.startsWith('lamp'))return {...o,observation:'落地燈旁有垂落線材',potential_risk:'貓咪可能接觸線材；是否通電未知',recommendation:'沿燈腳固定線材並加裝保護套'};
  if(o.object_kind==='plant')return {...o,object_label:'直立葉盆栽',observation:'落地燈旁可見直立葉盆栽',potential_risk:'植物品種與可接觸性未確認',recommendation:'先避免貓咪接觸這盆植物',unknown:['候選品種不是已確認定種'],plant:{object_index:1,candidates:[{common_name:'疑似虎尾蘭',scientific_name:'Dracaena trifasciata',confidence:'low'}],features:'測試重建候選，並非本次模型輸出',identification_quality:'limited'}};
  if(o.kind==='enrichment')return {...o,observation:'影片拍到沙發與周邊活動區',potential_risk:'可依照護原則安排資源，不代表家中缺少資源',unknown:['影片未涵蓋整個住家']};
  return o;
 });
 const report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(observations.map(o=>RawObservationSchema.parse(o)),fixture.matches.map(m=>MatchEvidenceSchema.parse(m)),key=>'issue-'+key.join('-'),{allowTestEvidence:true})};
 const frames=[0,4,8,12].map(t=>({frame_id:`f${String(t).padStart(3,'0')}`,timestamp:t,hash:'fixture-'+t,novelty:0,sharpness:1}));
 const job={video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,metadata:{duration:14.015,width:3840,height:2160,codec:'h264',rotation:0},frames,events:[],warning:['真實影片＋17筆重建觀察；不是原50筆 Azure Job。'],error:null,model:'fixture',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 return {job,report};
}
for(const width of [1280,375,850])test(`real media reconstructed-report UX ${width}`,async({page})=>{
 test.skip(!original,'Private replay video not configured');
 await mkdir(output,{recursive:true});
 expect(createHash('sha256').update(await readFile(original)).digest('hex')).toBe('35f8540382a84b1452c50da6120c4a2a9d6b877202d0ea3673ca22c0925cd1d3');
 await page.setViewportSize({width,height:width===850?375:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const {job,report}=replay();let stage='uploading',uploads=0;
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!['127.0.0.1','localhost'].includes(url.hostname))throw Error('External request blocked: '+url.hostname);
  if(url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/video-scans'))throw Error('Unexpected API request blocked: '+url.pathname);
  if(!url.pathname.startsWith('/api/video-scans'))return route.continue();
  if(request.method()==='POST'){stage='uploading';return route.fulfill({status:201,json:{video_id:id}});}
  if(request.method()==='PUT'){uploads++;stage='processing';return route.fulfill({status:202,json:{status:'queued'}});}
  if(request.method()==='DELETE'){stage='deleted';return route.fulfill({json:{deleted:true}});}
  if(url.pathname.endsWith('/issues'))return route.fulfill({json:report});
  if(url.pathname.includes('/frames/')){
   const timestamp=job.frames.find(f=>f.frame_id===url.pathname.split('/').pop())?.timestamp;
   if(timestamp===undefined)throw Error('Unexpected frame');
   return route.fulfill({contentType:'image/jpeg',body:await readFile(`private-eval/video-p0/at-${timestamp}.jpg`)});
  }
  return route.fulfill({json:stage==='processing'?{...job,status:'processing',stage:'正在分析抽樣畫面',analysis_status:'pending',original_deleted:false}:job});
 });
 await page.goto('/video');await expect(page.getByRole('heading',{name:/用一段影片/})).toBeVisible();
 await page.getByLabel('上傳影片',{exact:true}).setInputFiles(original);await page.getByRole('button',{name:'開始真實 Azure 分析'}).click();
 await expect(page.getByRole('status').filter({hasText:'正在分析抽樣畫面'})).toBeVisible();stage='completed';
 await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();
 await expect(page.getByText('2 項優先改善 · 1 項需要留意 · 3 個照護主題',{exact:true})).toBeVisible();
 await expect.poll(()=>page.locator('video').evaluate((v:HTMLVideoElement)=>v.readyState>=1&&!v.seeking)).toBe(true);
 await page.screenshot({path:`${output}/video-ux-${baseline?'before':'after'}-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:/選取.*落地燈線材/}).click();
 await expect(page.locator('.video-selected-issue h3')).toHaveText('落地燈線材');
 await expect(page.locator('video')).toHaveJSProperty('currentTime',8);
 if(!baseline){
  await expect(page.locator('.video-evidence')).toBeInViewport();
  await expect(page.locator('.video-evidence')).toContainText('落地燈旁有垂落線材');
  await expect(page.getByRole('heading',{name:'落地燈線材',exact:true})).toBeFocused();
  await page.screenshot({path:`${output}/video-ux-selected-${width}.png`});
  await page.getByText('播放原影片，查看前後情境',{exact:true}).click();await expect(page.locator('video')).toBeVisible();
  await page.getByText('播放原影片，查看前後情境',{exact:true}).click();
 }
 await page.getByRole('button',{name:/選取.*疑似直立葉盆栽/}).click();
 await page.getByText('詳細證據、不同建議與來源',{exact:true}).click();
 await expect(page.locator('.video-selected-issue')).toContainText('Dracaena trifasciata');
 await expect(page.locator('.video-selected-issue')).toContainText('未經人工定種');
 await page.getByRole('button',{name:'查看證據 00:12',exact:true}).click();
 await expect(page.locator('video')).toHaveJSProperty('currentTime',12);
 await page.getByRole('button',{name:/選取.*壁架下線材/}).focus();await page.keyboard.press('Enter');
 await expect(page.locator('.video-event-image')).toHaveAttribute('src',/f000$/);
 await page.getByText('其他照護建議（3 個主題）',{exact:true}).click();
 await page.getByRole('button',{name:/選取.*磨爪位置/}).click();
 await expect(page.locator('.video-selected-issue')).toContainText('不代表已確認缺少資源');
 await page.emulateMedia({media:'print'});
 if(!baseline){
  await expect(page.locator('.video-print-report')).toBeVisible();
  await expect(page.locator('.video-print-issue')).toHaveCount(6);
  const visibleButtons=await page.getByRole('button').all();for(const b of visibleButtons)await expect(b).toBeHidden();
  await expect(page.locator('.issue-scope')).toBeHidden();
 }
 await page.pdf({path:`${output}/video-ux-${baseline?'before':'after'}-${width}.pdf`,format:'A4',printBackground:true});
 await page.emulateMedia({media:'screen'});
 await page.reload();await expect(page.locator('video')).toHaveCount(0);await expect(page.locator('.video-event-image')).toBeVisible();
 await expect(page.getByText('原片已清除，以下保留事件截圖與改善建議。',{exact:true})).toBeVisible();
 await page.getByText('重新拍攝／上傳影片',{exact:true}).click();await page.getByLabel('上傳影片',{exact:true}).setInputFiles(original);await page.getByRole('button',{name:'開始真實 Azure 分析'}).click();
 await expect(page.getByRole('status').filter({hasText:'正在分析抽樣畫面'})).toBeVisible();stage='completed';await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();expect(uploads).toBe(2);
 await page.getByRole('button',{name:'刪除此掃描',exact:true}).click();await expect(page.getByRole('heading',{name:'影片改善摘要'})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await writeFile(`${output}/video-ux-${baseline?'before':'after'}-${width}.json`,JSON.stringify({provenance:'real local MP4 + reconstructed 17 observations; not Azure',issues:report.issues.length,observations:report.observations.length,uploads,errors}));
});

test('saved real Azure report replay preserves legacy limitations without paid calls',async({page})=>{
 const dir=process.env.WELFARELENS_PRIVATE_REPLAY_DIR ?? '';
 test.skip(!dir,'Private replay artifacts not configured');
 await mkdir(output,{recursive:true});
 const saved=JSON.parse(await readFile(dir+'/live-result.json','utf8'));
 const job=PublicVideoJobSchema.parse(saved.job);
 expect(saved.actualAzure).toBe(true);expect(job.metadata?.duration).toBe(9.36);
 const report=IssueReportSchema.parse({version:1,video_id:job.video_id,source:'legacy_limited',...aggregateVideoIssues(fromLegacyEvents(job),[],k=>'legacy-'+createHash('sha256').update(JSON.stringify(k)).digest('hex'))});
 await page.setViewportSize({width:1280,height:900});
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),job.video_id);
 await page.route('**/api/**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname;
  if(r.method()!=='GET'||!path.startsWith('/api/video-scans/'))throw Error('Unexpected paid or write request');
  if(path.endsWith('/issues'))return route.fulfill({json:report});
  if(path.includes('/frames/'))return route.fulfill({contentType:'image/jpeg',body:await readFile(dir+'/'+path.split('/').pop()+'.jpg')});
  return route.fulfill({json:job});
 });
 await page.goto('/video');await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();
 await expect(page.getByText(/這是舊版事件的相容報告/)).toBeVisible();
 await expect(page.locator('.video-partial')).toBeVisible();await expect(page.locator('.video-partial')).toContainText('未判讀的畫面不代表安全');
 await expect(page.locator('.video-event-image')).toBeVisible();
 await page.screenshot({path:output+'/video-ux-saved-real-legacy.png',fullPage:true});
 await page.emulateMedia({media:'print'});await page.pdf({path:output+'/video-ux-saved-real-legacy.pdf',format:'A4'});
 await writeFile(output+'/video-ux-saved-real-legacy.json',JSON.stringify({source:'read-only replay of saved 9.36s real Azure response; not this 14s clip and not a fresh AI run',events:job.events.length,observations:report.observations.length,issues:report.issues.length,priority:report.issues.filter(i=>i.category==='PRIORITY_ACTION').length,needs:report.issues.filter(i=>i.category==='NEEDS_CONFIRMATION').length,care:report.issues.filter(i=>i.category==='ENRICHMENT_ADVICE').length}));
});

for(const state of ['partial','failed','empty','expired'] as const)test(`video UX handles ${state} without false safety`,async({page})=>{
 const {job}=replay();await page.setViewportSize({width:375,height:900});
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 const status=state==='failed'?'failed':state==='partial'?'partial':'completed';
 const report=IssueReportSchema.parse({version:1,video_id:id,source:'snapshot',observations:[],match_evidence:[],issues:[]});
 await page.route('**/api/**',route=>{
  if(route.request().method()!=='GET')throw Error('Unexpected write');
  if(state==='expired')return route.fulfill({status:404,json:{error:'expired'}});
  if(route.request().url().endsWith('/issues'))return route.fulfill({json:report});
  return route.fulfill({json:{...job,status,analysis_status:state==='failed'?'failed':state==='partial'?'incomplete':'complete',error:state==='failed'?'分析服務逾時':null}});
 });
 await page.goto('/video');
 if(state==='expired')await expect(page.getByRole('alert').filter({hasText:'掃描已刪除、逾期'})).toBeVisible();
 else if(state==='failed')await expect(page.getByRole('heading',{name:'這次影片未完成分析'})).toBeVisible();
 else if(state==='partial')await expect(page.getByText('部分畫面未能完成判讀，目前沒有可用問題；不能據此判定安全。',{exact:true})).toBeVisible();
 else await expect(page.getByText('抽樣畫面未發現需要立即處理的明確風險；不代表整段影片或住家安全。',{exact:true})).toBeVisible();
 await expect(page.locator('.video-evidence svg')).toHaveCount(0);
});

test('P0 evidence viewer contains a clearly synthetic portrait frame after rotation',async({page})=>{
 const {job,report}=replay();await page.setViewportSize({width:375,height:900});
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 await page.route('**/api/**',route=>{
  const path=new URL(route.request().url()).pathname;
  if(route.request().method()!=='GET')throw Error('Unexpected write');
  if(path.endsWith('/issues'))return route.fulfill({json:report});
  if(path.includes('/frames/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="810" height="1440"><rect width="810" height="1440" fill="#dce3dd"/><text x="20" y="120" font-size="40">SYNTHETIC PORTRAIT UI ONLY</text></svg>'});
  return route.fulfill({json:{...job,metadata:{...job.metadata,width:810,height:1440}}});
 });
 await page.goto('/video');await expect(page.locator('.video-event-image')).toBeVisible();
 for(const size of [{width:375,height:900},{width:850,height:375}]){
  await page.setViewportSize(size);
  await expect.poll(()=>page.locator('.video-event-image').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(810);
  expect(await page.locator('.video-event-image').evaluate(img=>getComputedStyle(img).objectFit)).toBe('contain');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('.video-evidence svg')).toHaveCount(0);
 }
});
