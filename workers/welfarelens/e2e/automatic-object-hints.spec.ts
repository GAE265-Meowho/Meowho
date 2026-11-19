import {test,expect} from '@playwright/test';
import {observation,id} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues,RawObservationSchema} from '../src/domain/video-issues';
for(const width of [375,850,1280])test(`automatic approximate key objects and exact frame switching ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===850?375:900});const errors:string[]=[],writes:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const raw=[observation('wire',{title:'外露線材',object_label:'電線',candidate_bbox:[.1,.2,.4,.8],frame_hash:'a'.repeat(64)}),observation('plant',{title:'盆栽接觸風險',object_kind:'plant',object_label:'盆栽',rule_id:'H02',frame_id:'f001',timestamp:4,candidate_bbox:[.5,.1,.9,.7],frame_hash:'b'.repeat(64)})].map(o=>RawObservationSchema.parse(o));
 const report={version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(raw,[],key=>'issue-'+key.at(-1))};
 const job={video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,frames:[{frame_id:'f000',timestamp:0,hash:'a'.repeat(64),novelty:0,sharpness:1},{frame_id:'f001',timestamp:4,hash:'b'.repeat(64),novelty:0,sharpness:1}],events:[],warning:[],error:null,model:'fixture',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 await page.addInitScript(value=>sessionStorage.setItem('welfarelens.video.id',value),id);
 await page.route('**/api/video-scans**',async route=>{const u=route.request().url();if(route.request().method()!=='GET')writes.push(u);if(u.endsWith('/issues'))return route.fulfill({json:report});if(u.endsWith('/crops'))return route.fulfill({json:[]});if(u.includes('/frames/')){const portrait=u.endsWith('f001');return route.fulfill({contentType:'image/svg+xml',body:`<svg xmlns="http://www.w3.org/2000/svg" width="${portrait?360:640}" height="${portrait?640:360}"><rect width="100%" height="100%" fill="#dae9e1"/><text x="20" y="100">SYNTHETIC ${portrait?'PLANT':'WIRE'}</text></svg>`});}return route.fulfill({json:job});});
 await page.goto('/video');const figure=page.locator('.video-evidence > figure');
 for(const [title,label,frame,expectedLeft] of [['外露線材','電線','f000',.1],['盆栽接觸風險','盆栽','f001',.5]] as const){
  await page.getByRole('button',{name:`選取 ${title}`,exact:true}).click();const overlay=figure.getByTestId('approximate-object-overlay');await expect(overlay).toBeVisible();await expect(overlay).toHaveAttribute('aria-label',`${label}：AI 估計範圍`);await expect(figure.locator('img')).toHaveAttribute('src',new RegExp(frame+'$'));
  const image=await figure.locator('img').boundingBox(),box=await overlay.locator('rect').last().boundingBox();expect(image&&box).toBeTruthy();expect(Math.abs((box!.x-image!.x)/image!.width-expectedLeft)).toBeLessThan(.01);
  await expect(figure.getByText('AI 估計範圍 · 協助找到物件，位置可能有偏差。',{exact:true})).toBeVisible();
 }
 await page.getByRole('button',{name:'放大證據影格',exact:true}).click();const dialog=page.getByRole('dialog',{name:'放大證據影格'});await expect(dialog.getByTestId('approximate-object-overlay')).toBeVisible();await expect(dialog.getByRole('button',{name:/手動|框選|裁切|確認位置/})).toHaveCount(0);await dialog.getByRole('button',{name:'關閉放大影格'}).click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(writes).toEqual([]);expect(errors).toEqual([]);await page.screenshot({path:`test-results/automatic-object-hints-${width}.png`});
});
