import {test,expect} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {roomFixture,id} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues,RawObservationSchema,MatchEvidenceSchema} from '../src/domain/video-issues';
import {buildWelfareLensReport,toMeowhoEnvReport} from '../src/domain/welfare-report';
import {buildVisualReport} from '../src/domain/visual-report';
for(const width of [1280,375])test(`illustrated PDF, JSON and real-frame download ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const fixture=roomFixture();
 const frames=await Promise.all([0,4,8,12].map(async t=>({frame_id:`f${String(t).padStart(3,'0')}`,timestamp:t,hash:createHash('sha256').update(await readFile(`private-eval/video-p0/at-${t}.jpg`)).digest('hex'),novelty:0,sharpness:1})));
 const obs=fixture.observations.map(o=>({...o,frame_hash:frames.find(f=>f.frame_id===o.frame_id)!.hash,...(o.observation_id.startsWith('lamp')?{observation:'落地燈旁可見垂向地面的線材',recommendation:'將燈具線材收入保護套並沿牆固定'}:o.object_kind==='plant'?{object_label:'直立葉盆栽',observation:'落地燈旁可見直立葉盆栽；品種不能由此確認',recommendation:'辨識前先避免貓咪啃咬植物',unknown:['植物品種與可接觸性未確認']}:{} )}));
 const report={version:1 as const,video_id:id,source:'snapshot' as const,...aggregateVideoIssues(obs.map(o=>RawObservationSchema.parse(o)),fixture.matches.map(m=>MatchEvidenceSchema.parse(m)),k=>'issue-'+k.join('-'),{allowTestEvidence:true})};
 const job={video_id:id,created_at:1793764800000,expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,metadata:{duration:14.015,width:3840,height:2160,codec:'h264',rotation:0},frames,events:[],warning:['真實影片影格＋17筆重建觀察，非原始 Azure JSON'],error:null,model:'reconstructed-fixture',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 const canonical=buildWelfareLensReport(report,'complete',job.created_at),visual=buildVisualReport(report,canonical,job);
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 await page.route('**/api/video-scans**',async route=>{const path=new URL(route.request().url()).pathname;if(route.request().method()!=='GET')throw Error('Unexpected mutation');if(path.endsWith('/issues'))return route.fulfill({json:report});if(path.endsWith('/crops'))return route.fulfill({json:[]});if(path.includes('/frames/')){const f=frames.find(f=>path.endsWith(f.frame_id))!;return route.fulfill({contentType:'image/jpeg',body:await readFile(`private-eval/video-p0/at-${f.timestamp}.jpg`)});}if(path.endsWith('/report'))return route.fulfill({json:toMeowhoEnvReport(canonical)});return route.fulfill({json:job});});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/video');await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();
 const jsonDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下載完整證據 JSON'}).click();const d=await jsonDownload;const exported=JSON.parse(await readFile((await d.path())!,'utf8'));expect(exported.issues.map((i:any)=>i.key)).toEqual(visual.issues.map(i=>i.key));
 await page.getByText('下載重要風險圖片（3 個閱讀群組）',{exact:true}).click();const imgDownload=page.waitForEvent('download');await page.getByRole('button',{name:'下載關鍵圖片',exact:true}).first().click();const image=await imgDownload;expect((await readFile((await image.path())!)).subarray(0,2).toString('hex')).toBe('ffd8');
 await page.evaluate(()=>{window.print=()=>{document.body.dataset.printRequested='true';};});await page.getByRole('button',{name:'儲存圖文改善報告／PDF'}).click();await expect(page.locator('body')).toHaveAttribute('data-print-requested','true');
 await page.screenshot({path:`test-results/visual-report-${width}.png`,fullPage:true});
 await page.emulateMedia({media:'print'});const print=page.locator('.video-print-report');await expect(print).toBeVisible();await expect(print.locator('img')).toHaveCount(3);await expect.poll(()=>print.locator('img').evaluateAll((imgs:HTMLImageElement[])=>imgs.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);await expect(print.locator('.video-print-issue')).toHaveCount(6);
 if(width===1280){await mkdir('private-eval/visual-report',{recursive:true});await page.pdf({path:'private-eval/visual-report/WelfareLens-illustrated-example.pdf',format:'A4',printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true});await writeFile('private-eval/visual-report/example-report.json',JSON.stringify(visual,null,2));await writeFile('private-eval/visual-report/example-meowho.json',JSON.stringify(toMeowhoEnvReport(canonical),null,2));await image.saveAs('private-eval/visual-report/example-key-image.jpg');}
 expect(errors).toEqual([]);
});

test('expired frame retains text PDF and unavailable-region fallback',async({page})=>{
 const f=roomFixture(),report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(f.observations.map(o=>RawObservationSchema.parse(o)),[],k=>k.join('-'))};
 const frames=[0,4,8,12].map(t=>({frame_id:`f${String(t).padStart(3,'0')}`,timestamp:t,hash:'image-'+`f${String(t).padStart(3,'0')}`,novelty:0,sharpness:1}));
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 await page.route('**/api/video-scans**',route=>{const u=route.request().url();if(u.includes('/frames/'))return route.fulfill({status:404});if(u.endsWith('/issues'))return route.fulfill({json:report});if(u.endsWith('/crops'))return route.fulfill({json:[]});return route.fulfill({json:{video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'partial',stage:'部分完成',original_deleted:true,frames,events:[],warning:[],error:null,model:'fixture',analysis_provider:'azure',analysis_status:'incomplete',review_status:'not_human_reviewed'}});});
 await page.goto('/video');await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();await page.emulateMedia({media:'print'});await expect(page.locator('.video-print-report .visual-image-fallback').first()).toBeVisible();await expect(page.locator('.video-print-report')).toContainText('不能據此判定安全');
});
