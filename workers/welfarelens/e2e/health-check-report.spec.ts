import {test,expect} from '@playwright/test';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {observation,id} from '../tests/fixtures/video-p0.mjs';import {aggregateVideoIssues,RawObservationSchema} from '../src/domain/video-issues';
import {VisualReportSchema} from '../src/domain/visual-report';
// Assistant image-reviewed approximate coordinates for RENDER QA, NOT recovered Azure output or human GT.
const variants=['estimated','unavailable','portrait-scaled','multiple-candidates'] as const;
for(const variant of variants)test(`real-frame PDF alignment ${variant}`,async({page})=>{
 const portrait=variant==='portrait-scaled',file=portrait?'private-eval/real-mov/at-0.000.jpg':'private-eval/video-p0/at-8.jpg';const bytes=await readFile(file),hash=createHash('sha256').update(bytes).digest('hex');
 const bbox: [number,number,number,number]=portrait?[.08,.1,.9,.9]:[.23,.1,.35,.82];
 const raw=[RawObservationSchema.parse(observation('render-wire',{frame_id:'f000',timestamp:portrait?0:8,frame_hash:hash,title:portrait?'真實旋轉影格的縮放座標測試':'落地燈旁可見線材',object_label:portrait?'渲染測試區域，非風險發現':'落地燈線材',candidate_bbox:variant==='unavailable'?null:bbox,observation:portrait?'本項只驗證旋轉後影格的座標輸出，不構成風險辨識。':'燈架附近可見垂直及接近地面的線材。',recommendation:portrait?'不依測試區域判定居家風險。':'可將線材沿牆收整並加保護套。',model:'assistant-visual-render-fixture-not-azure',unknown:['座標為本輪助理影像估計的渲染測試；非Azure輸出、非人工Ground Truth。']}))];
 if(variant==='multiple-candidates')raw.push(RawObservationSchema.parse(observation('render-plant',{frame_id:'f000',timestamp:8,frame_hash:hash,rule_id:'H02',object_ref:1,object_kind:'plant',object_label:'直立葉盆栽',title:'盆栽品種尚未確認',kind:'precaution',candidate_bbox:[0,0,.24,.99],observation:'影格左側有直立葉盆栽。',potential_risk:'品種及貓咪實際接觸情況未確認。',recommendation:'在可靠辨識前避免貓咪啃咬。',model:'assistant-visual-render-fixture-not-azure',unknown:['未據此確認物種或毒性。']})));
 const report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(raw,[],k=>'render-'+k.join('-'))};
 const job={video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,metadata:{duration:portrait?38.365:14.015,width:portrait?1920:3840,height:portrait?1080:2160,rotation:portrait?-90:0,codec:'h264'},frames:[{frame_id:'f000',timestamp:portrait?0:8,hash,novelty:0,sharpness:1}],events:[],warning:['真實影格＋渲染測試觀察，非Azure品質驗收'],error:null,model:'assistant-visual-render-fixture-not-azure',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 await page.addInitScript(v=>sessionStorage.setItem('welfarelens.video.id',v),id);await page.route('**/api/video-scans**',route=>{if(route.request().method()!=='GET')throw Error('No paid calls');const u=route.request().url();if(u.endsWith('/issues'))return route.fulfill({json:report});if(u.endsWith('/crops'))return route.fulfill({json:[]});if(u.includes('/frames/'))return route.fulfill({contentType:'image/jpeg',body:bytes});return route.fulfill({json:job});});
 await page.goto('/video');await expect(page.getByRole('heading',{name:'影片改善摘要'})).toBeVisible();
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下載完整證據 JSON'}).click();const downloaded=await downloading;const json=VisualReportSchema.parse(JSON.parse(await readFile((await downloaded.path())!,'utf8')));expect(json.issues.map(i=>i.key)).toEqual(report.issues.map(i=>i.issue_id));
 // Independently verify every original input field, identity, count and uniqueness; aggregation may reorder.
 expect(json.observations).toHaveLength(raw.length);expect(new Set(json.observations.map(o=>o.observation_id)).size).toBe(raw.length);
 for(const original of raw)expect(json.observations.find(o=>o.observation_id===original.observation_id)).toEqual(original);
 expect(json.product_name).toBe('貓咪居家環境健檢');
 await page.emulateMedia({media:'print'});await page.evaluate(()=>document.fonts.ready);
 const figures=page.locator('.visual-report-figure');await expect(figures).toHaveCount(raw.length);
 for(let n=0;n<raw.length;n++){
  const f=figures.nth(n),img=f.locator('img');await expect.poll(()=>img.evaluate((e:HTMLImageElement)=>e.complete&&e.naturalWidth>0)).toBe(true);
  if(variant==='unavailable'){await expect(f.locator('svg')).toHaveCount(0);continue;}
  await expect(f.locator('svg')).toHaveCount(1);await expect(f.getByTestId('print-object-label')).toContainText('AI 估計位置');
  const image=await img.boundingBox(),box=await f.locator('rect').last().boundingBox(),b=raw[n].candidate_bbox!;
  // Playwright includes the non-scaling stroke in SVG bounds; compare the centerline coordinates.
  const stroke=await f.locator('rect').last().evaluate(e=>parseFloat(getComputedStyle(e).strokeWidth));
  expect(Math.abs((box!.x+stroke/2-image!.x)/image!.width-b[0])).toBeLessThan(.005);expect(Math.abs((box!.y+stroke/2-image!.y)/image!.height-b[1])).toBeLessThan(.005);expect(Math.abs((box!.width-stroke)/image!.width-(b[2]-b[0]))).toBeLessThan(.005);expect(Math.abs((box!.height-stroke)/image!.height-(b[3]-b[1]))).toBeLessThan(.005);
  await expect(f.locator('svg')).not.toContainText('經驗證');
 }
 await mkdir('private-eval/health-check',{recursive:true});await page.pdf({path:`private-eval/health-check/report-${variant}.pdf`,format:'A4',printBackground:true,displayHeaderFooter:false,preferCSSPageSize:true});await writeFile(`private-eval/health-check/report-${variant}.json`,JSON.stringify(json,null,2));await writeFile(`private-eval/health-check/${variant}-render-source.json`,JSON.stringify({provenance:'real frames + assistant reviewed approximate render fixture, NOT original Azure / human GT',report,sourceFile:file,sha256:hash},null,2));
});
for(const width of [375,1280])test(`health-check brand, keyboard and theme ${width}`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/video');await expect(page).toHaveTitle('貓咪居家環境健檢');await expect(page.getByRole('navigation',{name:'環境健檢'})).toBeVisible();
 await expect(page.locator('.video-scan .brand')).toContainText('貓咪居家環境健檢');await expect(page.getByLabel('上傳影片',{exact:true})).toBeAttached();
 const link=page.getByRole('link',{name:'照片健檢',exact:true});await link.focus();await expect(link).toBeFocused();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/photo$/);await expect(page.getByLabel('上傳照片',{exact:true})).toBeAttached();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(251, 245, 234)');expect(errors).toEqual([]);
 const contrast=await page.evaluate(()=>{
  const rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number),l=(c:number[])=>c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((s,x,n)=>s+x*[.2126,.7152,.0722][n],0);
  const body=getComputedStyle(document.body),primary=getComputedStyle(document.querySelector('.quick-scan .primary')!);
  const ratio=(a:string,b:string)=>{const x=l(rgb(a)),y=l(rgb(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  return {body:ratio(body.color,body.backgroundColor),button:ratio(primary.color,primary.backgroundColor)};
 });expect(contrast.body).toBeGreaterThanOrEqual(4.5);expect(contrast.button).toBeGreaterThanOrEqual(4.5);
 for(const element of await page.locator('.mode-nav a,.quick-scan .scan-buttons label').all())expect((await element.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:`private-eval/health-check/brand-${width}.png`,fullPage:true});
});
