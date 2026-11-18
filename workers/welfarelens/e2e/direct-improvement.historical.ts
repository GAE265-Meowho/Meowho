import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';

async function resultFixture(page:Page){
 const imageDataUrl=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=640;c.height=448;const ctx=c.getContext('2d')!;
  const source=new Image();source.src='/demo-room.svg';await source.decode();ctx.drawImage(source,0,0,640,448);
  ctx.fillStyle='#caa26a';ctx.fillRect(360,300,65,65);ctx.fillStyle='#473a31';ctx.fillRect(378,328,28,37);
  return c.toDataURL('image/png');
 });
 return {imageDataUrl,mode:'SIMULATED',provider:'azure',latencyMs:1234,width:640,height:448,requestedSize:'1536x1024',quality:'low',changes:[{rule_id:'H11',title:'躲藏空間',action:'在沙發旁新增躲藏處。'}],disclaimer:'Synthetic response fixture, not a live image edit.'};
}
async function demoComparison(page:Page){
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();await page.getByRole('button',{name:'查看示範建議 →'}).click();await page.getByRole('button',{name:'產生改善對照 →'}).click();
}

test('direct flow has no personality or simulation task and never fakes an After',async({page})=>{
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await expect(page.getByRole('button',{name:'2 改善建議',exact:true})).toBeVisible();
 await expect(page.getByText('小麥',{exact:false})).toHaveCount(0);
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();
 await page.getByRole('button',{name:'查看示範建議 →'}).click();
 await expect(page.getByRole('heading',{name:'這個房間，可以這樣改善'})).toBeVisible();
 await expect(page.getByRole('checkbox',{name:/加入/})).toHaveCount(0);
 await page.getByRole('button',{name:'產生改善對照 →'}).click();
 await expect(page.getByText('尚未產生改善圖片',{exact:true})).toBeVisible();
 await expect(page.getByAltText('AI 生成的改善構想圖')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'使用 AI 產生改善圖片'})).toBeDisabled();
 await expect(page.getByRole('button',{name:'下載準備計畫 JSON'})).toBeEnabled();
});

for(const width of [390,1440])test(`edited image consent, failure, retry, export and correction invalidation ${width}`,async({page})=>{
 await page.setViewportSize({width,height:960});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await demoComparison(page);const fixture=await resultFixture(page);let calls=0;
 await page.route('**/api/improve',async r=>{calls++;const body=r.request().postDataJSON();expect(body.consent).toBe(true);expect(body.imageDataUrl).toMatch(/^data:image\/jpeg/);expect(body.evidence.mode).toBe('OBSERVED');expect(body.cat).toBeUndefined();await r.fulfill(calls===1?{status:503,json:{error:'影像服務暫時無法使用，原照片保留。'}}:{json:fixture});});
 expect(calls).toBe(0);await expect(page.getByRole('button',{name:'使用 AI 產生改善圖片'})).toBeDisabled();
 await page.getByRole('checkbox',{name:/我同意將此照片與改善清單/}).check();expect(calls).toBe(0);
 await page.getByRole('button',{name:'使用 AI 產生改善圖片'}).click();await expect(page.locator('.image-edit-controls').getByRole('alert')).toContainText('影像服務暫時');expect(calls).toBe(1);
 await expect(page.getByAltText('AI 生成的改善構想圖')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'房間改善計畫'})).toBeVisible();
 await page.getByRole('button',{name:'使用 AI 產生改善圖片'}).click();
 if(width<=700)await page.getByRole('button',{name:'改善構想',exact:true}).click();
 const after=page.getByAltText('AI 生成的改善構想圖');await expect(after).toBeVisible();await expect(page.locator('.simulation-watermark')).toBeVisible();
 expect(await after.getAttribute('src')).not.toBe(await page.getByAltText('改善前的原始照片').getAttribute('src'));expect(calls).toBe(2);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'下載準備計畫 JSON'}).click();
 const exported=JSON.parse(await readFile((await (await download).path())!,'utf8'));expect(exported.generatedImage.mode).toBe('SIMULATED');expect(exported.cat).toBeUndefined();expect(JSON.stringify(exported)).not.toContain('data:image');
 if(process.env.WELFARELENS_QA_DIR){await mkdir(process.env.WELFARELENS_QA_DIR,{recursive:true});await page.screenshot({path:join(process.env.WELFARELENS_QA_DIR,`direct-generated-${width}.png`),fullPage:true});await page.locator('.actual-comparison').screenshot({path:join(process.env.WELFARELENS_QA_DIR,`direct-pair-${width}.png`)});}
 await page.getByRole('button',{name:/返回改善建議/}).click();await page.getByRole('button',{name:/產生改善對照/}).click();
 await expect(page.getByRole('button',{name:'重新產生改善圖片'})).toBeVisible();
 await page.getByRole('button',{name:/返回改善建議/}).click();
 await page.getByText('人工標記與完整條件工具（選用）',{exact:true}).click();await page.getByLabel('物件名稱',{exact:true}).fill('修正後窗戶');
 await page.getByRole('button',{name:/產生改善對照/}).click();await expect(page.getByAltText('AI 生成的改善構想圖')).toHaveCount(0);await expect(page.getByRole('checkbox',{name:/我同意將此照片與改善清單/})).not.toBeChecked();
 expect(errors).toEqual([]);
});

test('cancel and photo replacement discard late edits without auto-retry',async({page})=>{
 await demoComparison(page);const fixture=await resultFixture(page);let calls=0;
 await page.route('**/api/improve',async r=>{calls++;await new Promise(resolve=>setTimeout(resolve,900));await r.fulfill({json:fixture}).catch(()=>{});});
 await page.getByRole('checkbox',{name:/我同意將此照片與改善清單/}).check();
 const pending=page.waitForRequest('**/api/improve');await page.getByRole('button',{name:'使用 AI 產生改善圖片'}).click();await pending;
 await page.getByRole('button',{name:'取消等待'}).click();await expect(page.locator('.image-edit-controls').getByRole('alert')).toContainText('已取消等待');
 await page.waitForTimeout(1000);expect(calls).toBe(1);await expect(page.getByAltText('AI 生成的改善構想圖')).toHaveCount(0);
 const next=page.waitForRequest('**/api/improve');await page.getByRole('button',{name:'使用 AI 產生改善圖片'}).click();await next;
 await page.getByRole('button',{name:'1 上傳照片',exact:true}).click();await page.getByRole('button',{name:'移除照片'}).click();
 await page.waitForTimeout(1000);await expect(page.getByRole('button',{name:'3 對照與計畫',exact:true})).toBeDisabled();expect(calls).toBe(2);
});
