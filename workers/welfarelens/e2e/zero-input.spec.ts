import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {mkdir} from 'node:fs/promises';import {join} from 'node:path';
const pot={kind:'plant',label:'植物',bbox:[.1,.2,.35,.7],notes:'可見葉片'};
const identity=(name='Epipremnum aureum',index=0)=>({object_index:index,candidates:[{common_name:'植物',scientific_name:name,confidence:'high'}],features:'心形斑葉及莖',identification_quality:'adequate'});
const candidate=(plants=[identity()],objects=[pot],extra={})=>({objects,questions:[],limitations:[],assessments:[],image_quality:'adequate',plants,...extra});
async function file(page:Page,colour='white'){
 const encoded=await page.evaluate(colour=>{const c=document.createElement('canvas');c.width=800;c.height=600;const x=c.getContext('2d')!;x.fillStyle=colour;x.fillRect(0,0,800,600);return c.toDataURL('image/jpeg').split(',')[1]},colour);
 return {name:'room.jpg',mimeType:'image/jpeg',buffer:Buffer.from(encoded,'base64')};
}
async function upload(page:Page,colour='white',camera=false){await (camera?page.getByLabel('拍照',{exact:true}):page.locator('input[type=file]:not([capture])')).setInputFiles(await file(page,colour));}
async function capture(page:Page,name:string){if(process.env.WELFARELENS_QA_DIR){await mkdir(process.env.WELFARELENS_QA_DIR,{recursive:true});await page.screenshot({path:join(process.env.WELFARELENS_QA_DIR,name+'.png'),fullPage:true});}}
for(const width of [320,360,390,430,768,1024,1280,1440])test(`one-photo action flow responsive ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});let calls=0;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/analyze',async r=>{calls++;expect(r.request().postDataJSON().consent).toBe(true);await r.fulfill({json:{candidate:candidate()}})});
 await page.goto('/');await expect(page).toHaveTitle(/貓咪居家環境健檢/);await expect(page.getByRole('heading',{level:1})).toBeVisible();await capture(page,`upload-${width}`);
 await upload(page);await expect(page.getByRole('heading',{name:'發現 1 項需要改善'})).toBeVisible();expect(calls).toBe(1);
 await expect(page.locator('.priority-actions')).toContainText('黃金葛｜對貓有毒');await expect(page.getByRole('checkbox')).toHaveCount(0);await expect(page.getByRole('textbox')).toHaveCount(0);
 await expect(page.getByText(/證據待補充|人工標記與完整條件|專業依據與判斷限制|修正 AI|關鍵證據/)).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(errors).toEqual([]);await capture(page,`results-${width}`);
});
for(const [name,data,text] of [
 ['non-toxic',candidate([identity('Chamaedorea elegans')]),'未發現已知貓咪毒性'],
 ['mixed',candidate([identity(),identity('Chamaedorea elegans',1)],[pot,{...pot,bbox:[.6,.2,.9,.7]}]),'發現 1 項需要改善'],
 ['unlisted',candidate([identity('Unknownus unknown')]),'暫時無法確認植物安全性'],
 ['uncertain',candidate([{...identity(),candidates:[]}]),'暫時無法確認植物安全性'],
 ['no plant',candidate([],[]),'這張照片未發現需要立即處理的明確風險。'],
 ['blurred',candidate([identity('Chamaedorea elegans')],[pot],{image_quality:'unusable'}),'照片不夠清楚，請重新拍攝。'],
 ['conflicting',candidate([{...identity(),candidates:[...identity().candidates,...identity('Chamaedorea elegans').candidates]}]),'暫時無法確認植物安全性'],
] as const)test(`plant policy renders: ${name}`,async({page})=>{
 await page.route('**/api/analyze',r=>r.fulfill({json:{candidate:data}}));await page.goto('/');await upload(page);await expect(page.locator('.scan-results')).toContainText(text);await expect(page.getByRole('checkbox')).toHaveCount(0);
 if(name==='non-toxic')await expect(page.getByRole('button',{name:'一鍵產生改善圖片'})).toHaveCount(0);
 if(['blurred','uncertain','unlisted','conflicting'].includes(name))await expect(page.locator('.retained-plants')).toHaveCount(0);
});
for(const code of ['quota','timeout','invalid_output','credentials'])test(`failed scan never says safe: ${code}`,async({page})=>{
 let calls=0;await page.route('**/api/analyze',r=>{calls++;return r.fulfill(calls===1?{status:code==='quota'?429:502,json:{code,error:'分析未完成，請重試。'}}:{json:{candidate:candidate()}})});await page.goto('/');await upload(page);await expect(page.locator('.scan-failure')).toContainText('這次還沒完成分析');await expect(page.locator('.scan-results')).toHaveCount(0);expect(calls).toBe(1);await expect(page.getByAltText('本次房間照片')).toBeVisible();await page.getByRole('button',{name:'重試分析'}).click();await expect(page.locator('.scan-results')).toBeVisible();expect(calls).toBe(2);
});
test('malformed response is not converted into a safe result',async({page})=>{await page.route('**/api/analyze',r=>r.fulfill({json:{candidate:{objects:'broken'}}}));await page.goto('/');await upload(page);await expect(page.locator('.scan-failure').getByRole('alert').or(page.locator('.scan-failure'))).toContainText('未取得有效分析結果');await expect(page.locator('.scan-results')).toHaveCount(0)});
test('camera capture, exact-photo cache and replacement discard stale responses',async({page})=>{
 let calls=0;await page.route('**/api/analyze',async r=>{calls++;const current=calls;await new Promise(resolve=>setTimeout(resolve,current===2?600:10));await r.fulfill({json:{candidate:current===2?candidate():candidate([],[])}}).catch(()=>{})});await page.goto('/');await expect(page.getByLabel('拍照',{exact:true})).toHaveAttribute('capture','environment');await upload(page,'white',true);await expect(page.locator('.scan-results')).toBeVisible();await upload(page,'white');await expect(page.locator('.scan-results')).toBeVisible();expect(calls).toBe(1);
 const pending=page.waitForRequest('**/api/analyze');await upload(page,'red');await pending;await upload(page,'blue');await expect(page.locator('.scan-results')).toContainText('這張照片未發現');await page.waitForTimeout(650);await expect(page.locator('.scan-results')).not.toContainText('黃金葛');expect(calls).toBe(3);
});
test('invalid file has no request, three-item summary preserves the complete visible list, print works',async({page})=>{
 let calls=0;const fact=(key:string)=>({key,value:true,status:'OBSERVATION',evidence:'可見條件',confidence:'high'});
 const objects=[pot,{...pot,kind:'window',label:'開放窗戶'},pot,pot];const data=candidate([identity(),identity('Unknownus x',2),identity('Unknownus y',3)],objects,{assessments:[{rule_id:'H01',object_indices:[1],facts:[fact('opening_visible'),fact('access_route')],proposal:null}]});
 await page.route('**/api/analyze',r=>{calls++;return r.fulfill({json:{candidate:data}})});await page.goto('/');await page.getByLabel('上傳照片',{exact:true}).setInputFiles({name:'bad.jpg',mimeType:'image/jpeg',buffer:Buffer.from('bad')});await expect(page.locator('.scan-failure').getByRole('alert').or(page.locator('.scan-failure'))).toContainText('照片讀取失敗');expect(calls).toBe(0);await upload(page);await expect(page.locator('.priority-actions > div')).toHaveCount(3);await expect(page.locator('.complete-findings article')).toHaveCount(4);await expect(page.locator('.complete-findings article').last()).toBeVisible();await expect(page.locator('.scan-results')).toContainText('開放窗戶');await page.evaluate(()=>{window.print=()=>{document.body.dataset.printed='true'}});await page.getByRole('button',{name:'儲存改善計畫／PDF'}).click();await expect(page.locator('body')).toHaveAttribute('data-printed','true');
});
test('image editing is one-click, failures keep plan and late edit cannot replace new scan',async({page})=>{
 await page.setViewportSize({width:390,height:900});await page.route('**/api/analyze',r=>r.fulfill({json:{candidate:candidate()}}));await page.goto('/');await upload(page);await expect(page.locator('.scan-results')).toBeVisible();
 const imageDataUrl=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;return c.toDataURL('image/png')});let calls=0;
 await page.route('**/api/improve',async r=>{calls++;expect(r.request().postDataJSON().candidate.plants).toHaveLength(1);if(calls===1){await r.fulfill({status:503,json:{error:'圖片服務暫時無法使用'}});return;}if(calls===3)await new Promise(resolve=>setTimeout(resolve,600));await r.fulfill({json:{imageDataUrl,mode:'SIMULATED',provider:'azure',latencyMs:100,width:640,height:480,requestedSize:'1536x1152',quality:'low',changes:[{rule_id:'H02',title:'黃金葛',action:'移至無法接觸的位置'}],disclaimer:'test fixture'}}).catch(()=>{});});
 expect(calls).toBe(0);await page.getByRole('button',{name:'一鍵產生改善圖片'}).click();await expect(page.locator('.image-edit-controls').getByRole('alert')).toContainText('圖片服務');await expect(page.getByRole('heading',{name:'房間改善計畫'})).toBeVisible();await page.getByRole('button',{name:'一鍵產生改善圖片'}).click();await expect(page.getByAltText('AI 生成的改善構想圖')).toBeVisible();await expect(page.locator('.simulation-watermark')).toBeVisible();await capture(page,'comparison-390');expect(calls).toBe(2);
 await page.getByRole('button',{name:'重新產生改善圖片'}).click();await upload(page,'blue');await expect(page.locator('.scan-results')).toBeVisible();await page.waitForTimeout(700);await expect(page.getByAltText('AI 生成的改善構想圖')).toHaveCount(0);expect(calls).toBe(3);
});
