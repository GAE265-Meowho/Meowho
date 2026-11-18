import {test,expect} from '@playwright/test';
import {observation,id} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues,RawObservationSchema} from '../src/domain/video-issues';
for(const width of [375,1280])test(`evidence viewing requires no manual location input ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues([RawObservationSchema.parse(observation('wire',{title:'合成線材測試',frame_hash:'a'.repeat(64)}))],[],()=> 'issue-wire')};
 const job={video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,frames:[{frame_id:'f000',timestamp:0,hash:'a'.repeat(64),novelty:0,sharpness:1}],events:[],warning:[],error:null,model:'fixture',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 await page.route('**/api/video-scans**',async route=>{const u=route.request().url();if(route.request().method()!=='GET')writes.push(u);if(u.endsWith('/issues'))return route.fulfill({json:report});if(u.endsWith('/crops'))return route.fulfill({json:[]});if(u.includes('/frames/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#dae9e1"/><text x="80" y="150">SYNTHETIC FIXTURE</text></svg>'});return route.fulfill({json:job});});
 await page.goto('/video');await page.getByRole('button',{name:'放大證據影格',exact:true}).click();const dialog=page.getByRole('dialog',{name:'放大證據影格'});await expect(dialog).toBeVisible();await expect(dialog.getByAltText('完整證據影格，可捲動查看細節')).toBeVisible();
 await expect(dialog.getByRole('button',{name:/手動|框選|裁切|確認位置/})).toHaveCount(0);
 await expect(page.getByTestId('grounding-overlay')).toHaveCount(0);expect(writes).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
 await page.screenshot({path:`test-results/automatic-evidence-no-manual-${width}.png`});await dialog.getByRole('button',{name:'關閉放大影格'}).click();await expect(dialog).not.toBeVisible();
});
