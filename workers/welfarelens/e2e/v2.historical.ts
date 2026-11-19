import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
const widths=[320,360,390,430,768,1024,1280,1440];
for(const width of widths) test(`V2 photo lab ${width}`,async({page})=>{
 await page.setViewportSize({width,height:960});
 const errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/');
 await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await expect(page).toHaveTitle(/WelfareLens/);
 const capture=async(name:string)=>{
  if(!process.env.WELFARELENS_QA_DIR)return;
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(()=>new Promise(requestAnimationFrame));
  await mkdir(process.env.WELFARELENS_QA_DIR,{recursive:true});
  await page.screenshot({path:join(process.env.WELFARELENS_QA_DIR,`v2-${name}-${width}.png`),fullPage:true});
  await page.screenshot({path:join(process.env.WELFARELENS_QA_DIR,`v2-${name}-viewport-${width}.png`)});
 };
 await capture('upload');
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();
 await page.getByRole('button',{name:/查看示範建議/}).click();
 await expect(page.locator('.intro')).toHaveCount(0);
 const lab=page.getByRole('region',{name:'照片的初步環境評估'});
 await expect(lab.getByRole('button',{name:'查看植物品種與接觸'})).toBeVisible();
 await lab.getByRole('button',{name:'查看植物品種與接觸'}).click();
 const detail=width<=700 ? page.getByRole('dialog') : page.getByRole('region',{name:'所選項目詳情'});
 await expect(detail).toBeVisible();
 await expect(detail.getByRole('heading',{name:'植物品種與接觸',exact:true})).toBeVisible();
 await expect(lab.getByRole('button',{name:'標記 2：品種待確認的盆栽'})).toHaveAttribute('aria-pressed','true');
 if(width<=700){
  await expect(detail.getByRole('button',{name:'關閉詳情'})).toBeFocused();
  for(let i=0;i<10;i++){
   await page.keyboard.press('Tab');
   expect(await detail.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(lab.getByRole('button',{name:'查看植物品種與接觸'})).toBeFocused();
 }
 await capture('inspection');
 await page.getByRole('button',{name:/產生改善對照/}).click();
 const report=page.getByRole('region',{name:'領養前準備計畫'});
 await expect(report.getByRole('heading',{name:'建議改善'})).toBeVisible();
 await expect(report).toContainText('植物');
 await expect(page.getByRole('button',{name:'列印／儲存 PDF'})).toBeVisible();
 await expect(page.getByRole('button',{name:'使用 AI 產生改善圖片'})).toBeDisabled();
 if(width<=700){
  await page.getByRole('button',{name:'改善構想',exact:true}).click();
  await expect(page.getByRole('heading',{name:'After · AI 改善構想圖'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Before · 原始照片'})).not.toBeVisible();
 }
 await expect(page.getByText('尚未產生改善圖片',{exact:true})).toBeVisible();
 await capture('comparison');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:/返回改善建議/}).click();
 await expect(lab).toBeVisible();
 expect(errors).toEqual([]);
});

test('photo marker labels retain readable contrast when another object is selected',async({page})=>{
 await page.goto('/');await expect(page.locator('main')).toHaveAttribute('aria-busy','false');
 await page.getByRole('button',{name:/先用虛構示範試試看/}).click();
 await page.getByRole('button',{name:/查看示範建議/}).click();
 const marker=page.getByRole('button',{name:'標記 2：品種待確認的盆栽'});
 await expect(marker).toHaveCSS('opacity','1');
 const ratio=await marker.locator('span').evaluate(el=>{
  const luminance=(rgb:string)=>{
   const channels=rgb.match(/\d+/g)!.slice(0,3).map(Number).map(c=>{const n=c/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
   return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
  };
  const s=getComputedStyle(el),a=luminance(s.color),b=luminance(s.backgroundColor);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 });
 expect(ratio).toBeGreaterThanOrEqual(4.5);
});
