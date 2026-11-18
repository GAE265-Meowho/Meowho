import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {editAzureImage,imageEditConfig} from '../src/server/image-edit-client.ts';
import {RoomViewsSchema} from '../src/server/video/room-views.ts';
import {buildSpatialEdit,makeRegionMask} from '../src/server/video/spatial-edit.ts';

const [dir,arm,flag]=process.argv.slice(2);
if(!dir||!['A','B'].includes(arm)||flag!=='--authorized-bedroom-edit'||process.argv.length!==5)throw Error('只接受已授權的臥室單次編輯：<preflight 目錄> A|B --authorized-bedroom-edit');
const read=name=>readFile(join(resolve(dir),name));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const config=imageEditConfig(process.env);
if(config.deployment!=='gpt-image-2.5-sunburst')throw Error('部署與實驗設定不符');
const view=RoomViewsSchema.parse(JSON.parse(await read('room-views.json'))).views.find(item=>item.view_id==='bedroom');
if(!view)throw Error('找不到臥室計畫');
const settings=JSON.parse(await read('bedroom-settings.json'));
const source=await read(view.source_image_ref);
if(digest(source)!==view.input_sha256||settings.input_sha256!==view.input_sha256)throw Error('原圖雜湊不符');
const prompt=buildSpatialEdit(view,arm==='A'?'text':'mask');
if(prompt!==(await read('bedroom-'+arm+'.txt')).toString('utf8'))throw Error('提示詞與計畫不符');
const mask=arm==='B'?makeRegionMask(settings.width,settings.height,view.actions.map(action=>action.region)):undefined;
if(mask&&digest(mask)!==settings.mask_sha256)throw Error('遮罩雜湊不符');
const output=join(resolve(dir),'bedroom-'+arm+'-attempt');
await mkdir(output);
const start=Date.now();
try{
 const result=await editAzureImage(config,source,prompt,'1536x864',AbortSignal.timeout(180000),fetch,'high',mask);
 const metadata={arm,model:config.deployment,frame_id:view.source_frame_id,input_sha256:view.input_sha256,prompt_sha256:digest(prompt),mask_sha256:mask?digest(mask):null,elapsed_ms:Date.now()-start,generated_at:new Date().toISOString()};
 if(!result.ok){
  await writeFile(join(output,'generation.json'),JSON.stringify({...metadata,status:'http_error',http_status:result.status},null,2));
  process.exitCode=1;
 }else{
  await writeFile(join(output,'after.png'),result.png);
  await writeFile(join(output,'generation.json'),JSON.stringify({...metadata,status:'review_required',output_sha256:digest(result.png),width:result.width,height:result.height,usage:result.usage},null,2));
 }
}catch(error){
 await writeFile(join(output,'failure.json'),JSON.stringify({status:'request_or_processing_error',error_type:error?.name??'unknown',elapsed_ms:Date.now()-start}));
 throw error;
}
