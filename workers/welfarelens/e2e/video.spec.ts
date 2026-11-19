import {test,expect} from '@playwright/test';
test('separate photo and video routes navigate and keep photo UI intact',async({page})=>{
 await page.goto('/');await expect(page.getByRole('heading',{name:/從真實的家，\s*看見可以改善\s*的地方。/})).toBeVisible();
 await page.getByRole('link',{name:'影片健檢',exact:true}).click();await expect(page).toHaveURL(/\/video$/);await expect(page.getByRole('heading',{name:/用一段影片，\s*走看整個房間。/})).toBeVisible();
 await expect(page.getByLabel('上傳影片',{exact:true})).toBeAttached();await page.getByRole('link',{name:'照片健檢',exact:true}).click();await expect(page).toHaveURL(/\/photo$/);await expect(page.getByLabel('上傳照片',{exact:true})).toBeAttached();
 await page.goBack();await expect(page).toHaveURL(/\/video$/);
});
test('switching modes preserves completed photo evidence without another model call',async({page})=>{
 let calls=0;await page.route('**/api/analyze',async route=>{calls++;await route.fulfill({json:{candidate:{objects:[],plants:[],image_quality:'adequate',questions:[],limitations:[],assessments:[]}}});});
 await page.goto('/photo');const jpeg=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;return c.toDataURL('image/jpeg').split(',')[1];});
 await page.getByLabel('上傳照片',{exact:true}).setInputFiles({name:'fixture.jpg',mimeType:'image/jpeg',buffer:Buffer.from(jpeg,'base64')});await expect(page.locator('.scan-results')).toBeVisible();
 await page.getByRole('link',{name:'影片健檢',exact:true}).click();await expect(page.locator('.scan-results')).toBeHidden();await page.getByRole('link',{name:'照片健檢',exact:true}).click();await expect(page.locator('.scan-results')).toBeVisible();expect(calls).toBe(1);
});
for(const width of [375,1280])test(`video upload, seek, screenshot fallback, restore and deletion ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});let deleted=false;
 const id='11111111-1111-4111-8111-111111111111';
 const job={video_id:id,created_at:Date.now(),expires_at:Date.now()+1800000,status:'completed',stage:'分析完成',original_deleted:true,metadata:{duration:10,width:640,height:360,codec:'h264',rotation:0},frames:[{frame_id:'f002',timestamp:2,hash:'fixture',novelty:0,sharpness:0}],events:[{video_id:id,event_id:'ev-1',risk_type:'window',risk_title:'窗戶旁有可攀爬家具',severity:'moderate',kind:'prevention',observation:'窗邊有沙發',potential_risk:'開窗時可能接近開口',recommendation:'開窗前安裝牢固防護',unknown:['防護強度無法由影片確認'],start_time:2,end_time:null,representative_timestamp:2,frame_id:'f002',bounding_box:null,object_track_id:null,identification_status:'model_candidate',verification_status:'inferred_not_verified',source_reference:['https://www.cats.org.uk/'],model_version:'fixture',evidence_frames:[{frame_id:'f002',timestamp:2}]}],warning:[],error:null,model:'fixture',analysis_provider:'azure',analysis_status:'complete',review_status:'not_human_reviewed'};
 await page.route('**/api/video-scans**',async route=>{const req=route.request();if(req.method()==='DELETE'){deleted=true;await route.fulfill({json:{deleted:true}});}else if(req.method()==='POST')await route.fulfill({status:201,json:{video_id:id}});else if(req.method()==='PUT')await route.fulfill({status:202,json:{status:'queued'}});else if(req.url().includes('/frames/'))await route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#b9caba"/></svg>'});else await route.fulfill({json:job});});
 await page.goto('/video');await page.getByLabel('上傳影片',{exact:true}).setInputFiles('welfarelens-video-spike/samples/synthetic-room.mp4');await page.getByRole('button',{name:'開始真實 Azure 分析'}).click();
 await expect(page.getByRole('heading',{name:'影片中的改善重點'})).toBeVisible();await page.getByRole('button',{name:/00:02.*窗戶旁/}).first().click();
 await expect(page.locator('video')).toHaveJSProperty('currentTime',2);await expect(page.locator('.video-event-card')).toContainText('建議：開窗前安裝牢固防護');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(page.getByText('原片已清除，以下保留事件截圖與改善建議。',{exact:true})).toBeVisible();await expect(page.locator('video')).toHaveCount(0);await expect(page.locator('.video-event-image')).toBeVisible();
 await page.getByRole('button',{name:'刪除此掃描',exact:true}).click();expect(deleted).toBe(true);await expect(page.getByRole('heading',{name:'影片中的改善重點'})).toHaveCount(0);
});

test('paid video analysis requires explicit start after selection; page load and selection never submit',async({page})=>{
 let calls=0;await page.route('**/api/video-scans',route=>{calls++;return route.fulfill({status:503,json:{error:'offline consent test'}});});
 await page.goto('/video');expect(calls).toBe(0);
 await page.getByLabel('上傳影片',{exact:true}).setInputFiles('welfarelens-video-spike/samples/synthetic-room.mp4');
 await expect(page.getByText(/不是保證硬上限/)).toBeVisible();
 await expect(page.getByRole('button',{name:'開始真實 Azure 分析'})).toBeVisible();expect(calls).toBe(0);
 await page.getByRole('button',{name:'開始真實 Azure 分析'}).click();await expect.poll(()=>calls).toBe(1);
 await expect(page.getByRole('alert').filter({hasText:'offline consent test'})).toBeVisible();expect(calls).toBe(1);
});
