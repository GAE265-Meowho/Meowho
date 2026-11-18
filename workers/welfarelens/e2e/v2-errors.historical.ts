import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {Page} from '@playwright/test';

async function upload(page:Page,width=800,height=500){
 const bytes=await page.evaluate(async({width,height})=>{
  const c=document.createElement('canvas');c.width=width;c.height=height;
  c.getContext('2d')!.fillRect(0,0,width,height);
  return [...new Uint8Array(await (await new Promise<Blob>(resolve=>c.toBlob(b=>resolve(b!),'image/jpeg'))).arrayBuffer())];
 },{width,height});
 await page.getByLabel(/上傳照片|更換照片/).setInputFiles({name:'authorized-synthetic.jpg',mimeType:'image/jpeg',buffer:Buffer.from(bytes)});
}
const candidate={objects:[{kind:'window',label:'窗戶',bbox:[.1,.2,.5,.6],notes:'synthetic fixture'},{kind:'plant',label:'未定位盆栽',bbox:null,notes:'位置未知'}],questions:[],limitations:['合成測試'],assessments:[{rule_id:'H01',object_indices:[0],facts:[{key:'opening_visible',value:true,status:'OBSERVATION',evidence:'測試開口',confidence:'medium'},{key:'access_route',value:true,status:'INFERENCE',evidence:'測試路線',confidence:'medium'}]}]};

test('consent, service retry, unknown list, correction persistence, empty comparison and print',async({page})=>{
 await page.setViewportSize({width:1280,height:900});
 let calls=0;
 await page.route('**/api/analyze',r=>{calls++;return calls===1?r.fulfill({status:503,json:{error:'服務暫時無法使用，請重試或人工確認。'}}):r.fulfill({json:{candidate}});});
 await page.addInitScript(()=>{window.print=()=>{document.documentElement.dataset.printRequested='true';};});
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await upload(page);
 await expect(page.getByRole('button',{name:'使用 AI 理解場景'})).toBeDisabled();expect(calls).toBe(0);
 await page.getByRole('checkbox').check();await page.getByRole('button',{name:'使用 AI 理解場景'}).click();
 await expect(page.getByText(/服務暫時無法使用/)).toBeVisible();
 await expect(page.getByAltText('本次上傳的居家照片')).toBeVisible();
 await expect(page.getByRole('button',{name:/選用：手動補充/})).toBeEnabled();
 await page.getByRole('button',{name:/選用：手動補充/}).click();
 await expect(page.getByRole('region',{name:'照片的初步環境評估'})).toContainText('這張照片還沒有足夠資訊');
 await page.getByRole('button',{name:/返回照片/}).click();
 await page.getByRole('button',{name:'使用 AI 理解場景'}).click();
 const lab=page.getByRole('region',{name:'照片的初步環境評估'});
 await lab.getByRole('button',{name:'查看植物品種與接觸'}).click();
 const detail=page.getByRole('region',{name:'所選項目詳情'});
 await expect(detail).toContainText('定位不足');
 await expect(lab.locator('.assessment-marker[aria-pressed=true]')).toHaveCount(0);
 await lab.getByRole('button',{name:'查看窗戶與陽台'}).click();
 await detail.getByText('修正 AI 的觀察與推測',{exact:true}).click();
 await detail.getByLabel('窗戶或陽台目前是否有開口？').selectOption('false');
 await page.getByRole('button',{name:/產生改善對照/}).click();
 await page.getByRole('button',{name:/返回改善建議/}).click();
 await page.getByRole('region',{name:'所選項目詳情'}).getByText('修正 AI 的觀察與推測',{exact:true}).click();
 await expect(page.getByRole('region',{name:'所選項目詳情'}).getByLabel('窗戶或陽台目前是否有開口？')).toHaveValue('false');
 await page.getByRole('button',{name:/產生改善對照/}).click();
 await expect(page.getByText('尚未產生改善圖片',{exact:true})).toBeVisible();
 await expect(page.locator('.photo-comparison > article').last().locator('.assessment-marker')).toHaveCount(0);
 await page.getByRole('button',{name:'列印／儲存 PDF'}).click();
 await expect(page.locator('html')).toHaveAttribute('data-print-requested','true');
 await page.emulateMedia({media:'print'});
 await expect(page.locator('.preparation-report')).toBeVisible();
 await expect(page.locator('.photo-comparison')).not.toBeVisible();
 await expect(page.locator('.report-sources article').first()).toBeVisible();
 await expect(page.locator('.preparation-report img')).toHaveCount(0);
 await page.emulateMedia({media:'screen'});
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'下載準備計畫 JSON'}).click();
 const exported=JSON.parse(await readFile((await (await downloading).path())!,'utf8'));
 expect(exported.baseline.cases[0].facts.find((f:{key:string})=>f.key==='opening_visible').value).toBe(false);
 expect(JSON.stringify(exported)).not.toContain('data:image');
 expect(calls).toBe(2);
});

test('photo replacement/removal and invalid files retain correct consent boundaries',async({page})=>{
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await upload(page);await page.getByRole('checkbox').check();
 await page.getByLabel('更換照片').setInputFiles({name:'unsupported.gif',mimeType:'image/gif',buffer:Buffer.from('invalid')});
 await expect(page.getByText(/15 MB 以下/).last()).toBeVisible();
 await expect(page.getByAltText('本次上傳的居家照片')).toBeVisible();
 await page.getByLabel('更換照片').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});
 await expect(page.getByRole('status').filter({has:page.locator('.notice')})).not.toBeEmpty();
 await page.getByLabel('更換照片').setInputFiles({name:'too-large.png',mimeType:'image/png',buffer:Buffer.alloc(15_000_001)});
 await expect(page.getByText(/15 MB 以下/).last()).toBeVisible();
 await upload(page,400,900);await expect(page.getByRole('checkbox')).not.toBeChecked();
 await page.getByRole('button',{name:'移除照片'}).click();
 await expect(page.getByAltText('本次上傳的居家照片')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'使用 AI 理解場景'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'2 改善建議'})).toBeDisabled();
});

test('manual object correction updates main workspace and comparison without clearing evidence',async({page})=>{
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();
 await page.getByRole('button',{name:/查看示範建議/}).click();
 await page.getByText('人工標記與完整條件工具（選用）',{exact:true}).click();
 await page.getByLabel('物件名稱',{exact:true}).fill('已修正窗戶');
 await expect(page.getByRole('region',{name:'照片的初步環境評估'}).getByRole('button',{name:'標記 1：已修正窗戶'})).toBeVisible();
 await page.getByText('調整物件框的位置與大小',{exact:true}).click();
 await page.getByLabel('框左',{exact:true}).fill('0.2');
 const marker=page.getByRole('region',{name:'照片的初步環境評估'}).locator('.assessment-marker').first();
 await expect(marker).toHaveAttribute('style',/left: 20%/);
 await page.getByRole('button',{name:/產生改善對照/}).click();
 await expect(page.locator('.photo-comparison > article').first().getByAltText('改善前的原始照片')).toBeVisible();
 await page.getByRole('button',{name:/返回改善建議/}).click();
 await expect(page.getByRole('region',{name:'照片的初步環境評估'}).getByRole('button',{name:'標記 1：已修正窗戶'})).toBeVisible();
});

for(const [width,height] of [[900,300],[300,900]]) test(`normalized boxes track image and zoom ${width}x${height}`,async({page})=>{
 await page.route('**/api/analyze',r=>r.fulfill({json:{candidate}}));
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await upload(page,width,height);await page.getByRole('checkbox').check();await page.getByRole('button',{name:'使用 AI 理解場景'}).click();
 const photo=page.getByRole('region',{name:'照片的初步環境評估'});
 const image=photo.locator('.assessment-photo img'), marker=photo.getByRole('button',{name:'標記 1：窗戶'});
 for(const zoom of ['1','1.5']){
  await photo.getByLabel('照片縮放').selectOption(zoom);
  const img=await image.boundingBox(),box=await marker.boundingBox();
  expect(Math.abs(box!.x-(img!.x+.1*img!.width))).toBeLessThan(2);
  expect(Math.abs(box!.y-(img!.y+.2*img!.height))).toBeLessThan(2);
  expect(Math.abs(box!.width-.4*img!.width)).toBeLessThan(2);
 }
 await photo.getByRole('button',{name:'重設檢視'}).click();
 await expect(photo.getByLabel('照片縮放')).toHaveValue('1');
});
