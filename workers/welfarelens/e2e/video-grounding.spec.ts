import {test,expect} from '@playwright/test';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import Component from '../src/components/StaticEvidenceOverlay';
import {GroundingFrameSchema,type GroundingFrame} from '../src/domain/video-grounding';
const root='test-results/video-grounding';

/** Isolated SSR fixture harness. Does not add a route or wire the product pipeline. */
for(const width of [1280,375])test(`P1 isolated real-frame overlay aligns, selects and fails closed ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/api/**',route=>route.abort());
 // Real local files required: unlike P0 tests, no synthetic fallback hides missing evidence.
 const draft=JSON.parse(await readFile('private-eval/video-p1/annotation-draft.json','utf8'));
 const entries=new Map<string,{src:string;frame:GroundingFrame;bbox:number[];label:string}>();
 for(const [key,frameId,localId,label] of [['wire','p1-03','shelf-black','沙發上方線材'],['plant','p1-07','upright-pot','直立葉盆栽（品種未定）'],['negative','negative-wall','','無目標負例']]){
  const item=draft.items.find((i:{frame:{frame_id:string}})=>i.frame.frame_id===frameId),bytes=await readFile(`private-eval/video-p1/${item.frame.file}`);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(item.frame.sha256);
  const {frame_id,sha256,width,height,pts_seconds}=item.frame;
  entries.set(key,{src:`data:image/jpeg;base64,${bytes.toString('base64')}`,frame:GroundingFrameSchema.parse({frame_id,sha256,width,height,pts_seconds}),bbox:item.objects.find((o:{local_id:string})=>o.local_id===localId)?.bbox??[.1,.1,.3,.3],label});
 }
 const portraitSvg='<svg xmlns="http://www.w3.org/2000/svg" width="810" height="1440"><rect width="810" height="1440" fill="#e5e9e5"/><rect x="162" y="144" width="243" height="432" fill="#9bb8b1"/><text x="20" y="100" font-size="30">SYNTHETIC PORTRAIT</text></svg>';
 entries.set('portrait',{src:`data:image/svg+xml;base64,${Buffer.from(portraitSvg).toString('base64')}`,frame:{frame_id:'portrait-synthetic',sha256:createHash('sha256').update(portraitSvg).digest('hex'),width:810,height:1440,pts_seconds:0},bbox:[.2,.1,.5,.4],label:'合成直式測試'});
 await page.exposeFunction('fixtureMarkup',({key,status}:{key:string;status:'loading'|'ready'|'error'})=>{
  const entry=entries.get(key==='wrong'?'plant':key==='disabled'?'wire':key)!;
  const region={version:1,id:'r-'+key,frame:entry.frame,issue_id:key,observation_id:'o-'+key,label:entry.label,bbox:entry.bbox,coordinate_space:'autorotated_jpeg_xyxy01',provider:{name:'agent-draft',revision:'2026-11-03'},review:{status:'accepted',method:'agent_fixture_visual_check',reviewer:'AI-agent',reference:'annotation-draft.json'}};
  if(key==='wrong')region.frame=entries.get('wire')!.frame;
  return renderToStaticMarkup(React.createElement(Component,{src:entry.src,context:{frame:entry.frame,issue_id:key,observation_id:'o-'+key,enabled:key!=='disabled',fixtureMode:true},regions:key==='negative'?[]:[region],imageState:status==='ready'?{status,sha256:entry.frame.sha256,width:entry.frame.width,height:entry.frame.height}:{status}}));
 });
 await page.setContent(`<!doctype html><html lang="zh-Hant"><title>P1 離線定位元件實驗</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fcfaf5;color:#244849;font-family:system-ui}main{max-width:1000px;margin:auto;padding:16px}button{min-height:44px;margin:4px;padding:8px;border:1px solid #638080;border-radius:8px;background:#fff;color:#244849}#shell{background:#132e30;padding:12px;display:flex;align-items:center;justify-content:center;min-height:400px}#mount{width:100%;max-width:1000px;background:#fcfaf5}#shell:fullscreen{height:100vh;overflow:auto;box-sizing:border-box}#mount.portrait{max-width:280px}</style><main><h1>P1 靜態證據定位實驗</h1><p>真實影片影格＋代理視覺草標；非自動辨識結果。此頁不改變正式分析。</p><nav>${['wire','plant','wrong','disabled','negative','portrait'].map(key=>`<button data-select="${key}">${key}</button>`).join('')}<button id="fullscreen">Fullscreen</button></nav><div id="shell"><div id="mount"></div></div></main><script>let token=0;async function choose(key){const mine=++token;mount.className=key==='portrait'?'portrait':'';mount.innerHTML=await window.fixtureMarkup({key,status:'loading'});const img=mount.querySelector('img');try{await img.decode();if(mine===token)mount.innerHTML=await window.fixtureMarkup({key,status:'ready'});}catch{if(mine===token)mount.innerHTML=await window.fixtureMarkup({key,status:'error'});}}document.querySelectorAll('[data-select]').forEach(b=>b.onclick=()=>choose(b.dataset.select));document.querySelector('#fullscreen').onclick=()=>document.querySelector('#shell').requestFullscreen();</script>`);
 await expect(page).toHaveTitle('P1 離線定位元件實驗');
 const select=async(key:string)=>{await page.locator(`[data-select="${key}"]`).click();await expect(page.locator('figure')).toBeVisible();};
 const checkAlignment=async()=>{
  const geometry=await page.locator('[data-region-id]').evaluate(el=>{
   const box=el.getBoundingClientRect(),img=el.closest('[data-testid="grounding-stage"]')!.querySelector('img')!.getBoundingClientRect();
   return {x:(box.x-img.x)/img.width,y:(box.y-img.y)/img.height,w:box.width/img.width,h:box.height/img.height};
  });return geometry;
 };
 await select('wire');await expect(page.locator('[data-region-id]')).toHaveCount(1);
 let g=await checkAlignment();const wire=entries.get('wire')!.bbox;expect(g.x).toBeCloseTo(wire[0],3);expect(g.y).toBeCloseTo(wire[1],3);
 expect(g.w).toBeCloseTo(wire[2]-wire[0],3);expect(g.h).toBeCloseTo(wire[3]-wire[1],3);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await mkdir(root,{recursive:true});await page.screenshot({path:`${root}/video-p1-${width}.png`,fullPage:true});
 await select('plant');await expect(page.locator('[data-region-id]')).toHaveCount(1);await expect(page.locator('figure')).toContainText('直立葉盆栽');
 await select('wrong');await expect(page.locator('[data-region-id]')).toHaveCount(0);
 await select('disabled');await expect(page.locator('[data-region-id]')).toHaveCount(0);
 await select('negative');await expect(page.locator('[data-region-id]')).toHaveCount(0);
 await select('portrait');await expect(page.locator('[data-region-id]')).toHaveCount(1);g=await checkAlignment();expect(g.x).toBeCloseTo(.2,3);expect(g.y).toBeCloseTo(.1,3);
 await page.setViewportSize({width:850,height:375});g=await checkAlignment();expect(g.w).toBeCloseTo(.3,3);expect(g.h).toBeCloseTo(.3,3);
 await page.locator('#fullscreen').click();await expect.poll(()=>page.evaluate(()=>Boolean(document.fullscreenElement))).toBe(true);
 g=await checkAlignment();expect(g.x).toBeCloseTo(.2,3);expect(g.y).toBeCloseTo(.1,3);
 await page.evaluate(()=>document.exitFullscreen());expect(errors).toEqual([]);await expect(page.locator('video')).toHaveCount(0);
});
