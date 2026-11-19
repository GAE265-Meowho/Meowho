import {test,expect} from '@playwright/test';
const media='welfarelens-video-spike/samples/synthetic-room.mp4';
test('upload interruption releases operation and offers retry without quota reset',async({page})=>{
 const id='22222222-2222-4222-8222-222222222222';let status='uploading',cancels=0,creates=0;
 const job=()=>({video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status,stage:status,original_deleted:status==='cancelled',frames:[],events:[],warning:[],error:null,model:'mock',analysis_provider:'azure',analysis_status:'pending',review_status:'not_human_reviewed'});
 await page.route('**/api/video-scans**',async route=>{
  if(route.request().method()==='POST'&&route.request().url().endsWith('/video-scans')){creates++;return route.fulfill({status:201,json:{video_id:id}});}
  if(route.request().url().endsWith('/cancel')){status='cancelled';cancels++;return route.fulfill({json:{cancelled:true}});}
  if(route.request().method()==='PUT')return route.abort('connectionreset');
  return route.fulfill({json:job()});
 });
 await page.goto('/video');await page.getByLabel('上傳影片',{exact:true}).setInputFiles(media);await page.getByRole('button',{name:'開始真實 Azure 分析'}).click();
 await expect(page.getByRole('button',{name:'重新嘗試',exact:true})).toBeVisible();expect(cancels).toBe(1);expect(creates).toBe(1);
 await expect(page.getByRole('alert').filter({hasText:'網路中斷'})).toBeVisible();await expect(page.getByLabel('上傳影片',{exact:true})).toBeEnabled();
});
test('expired running job releases the UI for a new upload instead of polling forever',async({page})=>{
 const id='33333333-3333-4333-8333-333333333333';let reads=0;
 await page.addInitScript(id=>sessionStorage.setItem('welfarelens.video.id',id),id);
 await page.route(`**/api/video-scans/${id}`,async route=>{
  if(++reads>1)return route.fulfill({status:404,json:{error:'expired'}});
  return route.fulfill({json:{video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'processing',stage:'AI 分析中',original_deleted:false,frames:[],events:[],warning:[],error:null,model:'mock',analysis_provider:'azure',analysis_status:'pending',review_status:'not_human_reviewed'}});
 });
 await page.goto('/video');await expect(page.getByText('AI 分析中',{exact:false})).toBeVisible();
 await expect(page.getByText(/掃描已刪除、逾期/)).toBeVisible();await expect(page.getByLabel('上傳影片',{exact:true})).toBeEnabled();
 await expect(page.getByRole('button',{name:'取消分析',exact:true})).toHaveCount(0);
});
for(const width of [375,1280])test(`retry, repeat same file, cancel, late reply and reload ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});let creates=0,uploads=0,cancels=0;const jobs=new Map<string,Record<string,unknown>>();
 await page.route('**/api/video-scans**',async route=>{
  const r=route.request(),path=new URL(r.url()).pathname,id=path.split('/')[3];
  if(r.method()==='POST'&&path==='/api/video-scans'){
   creates++;const next=`11111111-1111-4111-8111-${String(creates).padStart(12,'0')}`;
   jobs.set(next,{video_id:next,created_at:Date.now(),expires_at:Date.now()+1800000,status:'uploading',stage:'等待上傳',original_deleted:false,frames:[],events:[],warning:[],error:null,model:'mock',analysis_provider:'azure',analysis_status:'pending',review_status:'not_human_reviewed'});
   return route.fulfill({status:201,json:{video_id:next}});
  }
  const j=jobs.get(id)!;
  if(path.endsWith('/issues'))return route.fulfill({status:503,json:{error:'mock no issues'}});
  if(path.endsWith('/cancel')){cancels++;j.status='cancelled';return route.fulfill({json:{cancelled:true}});}
  if(r.method()==='PUT'){uploads++;Object.assign(j,uploads===1?{status:'failed',error:'Azure 暫時無法使用',analysis_status:'failed'}:uploads===2?{status:'completed',stage:'分析完成',analysis_status:'complete'}:{status:'processing',stage:'AI 分析房間環境'});return route.fulfill({status:202,json:{status:'queued'}});}
  return route.fulfill({json:j});
 });
 await page.goto('/video');expect(creates).toBe(0);
 await page.getByLabel('上傳影片',{exact:true}).setInputFiles(media);
 await page.getByRole('button',{name:'開始真實 Azure 分析',exact:true}).dblclick();
 await expect(page.getByText('Azure 暫時無法使用',{exact:true})).toBeVisible();expect(creates).toBe(1);
 await page.getByRole('button',{name:'重新嘗試',exact:true}).click();await expect(page.getByRole('heading',{name:'影片中的改善重點'})).toBeVisible();expect(creates).toBe(2);
 await page.getByRole('button',{name:'重新分析',exact:true}).click();await expect(page.getByText('AI 分析房間環境',{exact:false})).toBeVisible();expect(creates).toBe(3);
 // Let an in-flight poll return old processing state after cancellation.
 let release:()=>void=()=>{};let received:()=>void=()=>{};const seen=new Promise<void>(r=>received=r);
 await page.route(`**/api/video-scans/11111111-1111-4111-8111-000000000003`,async route=>{if(route.request().method()!=='GET')return route.fallback();const snapshot={...jobs.get('11111111-1111-4111-8111-000000000003')};received();await new Promise<void>(r=>release=r);await route.fulfill({json:snapshot});},{times:1});
 await seen;await page.getByRole('button',{name:'取消分析',exact:true}).click();await expect(page.getByText(/分析已取消。可以重新開始/)).toBeVisible();release();
 await expect(page.getByRole('button',{name:'重新嘗試',exact:true})).toBeVisible();expect(cancels).toBe(1);
 await page.getByRole('button',{name:'重新嘗試',exact:true}).click();await expect(page.getByText('AI 分析房間環境',{exact:false})).toBeVisible();expect(creates).toBe(4);
 await page.reload();await expect(page.getByText('AI 分析房間環境',{exact:false})).toBeVisible();expect(creates).toBe(4);
 await page.getByRole('button',{name:'取消分析',exact:true}).click();await expect(page.getByText(/分析已取消。可以重新開始/)).toBeVisible();
 await expect(page.getByText(/請重新選取影片開始新分析/)).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`test-results/video-recovery-${width}.png`,fullPage:true});
});
