import {copyFile,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {RoomViewsSchema,loadRoomViews} from '../src/server/video/room-views.ts';
import {buildSpatialEdit,makeRegionMask} from '../src/server/video/spatial-edit.ts';
import {RiskObjectReportSchema} from '../src/domain/risk-objects.ts';
import {command} from '../src/server/video/media.ts';

const [sourceDir,riskFile]=process.argv.slice(2);
if(!sourceDir||!riskFile||process.argv.length!==4)throw Error('用法：spatial-edit-preflight <既有房間報告目錄> <風險物件 JSON>');
const source=resolve(sourceDir);
const read=async file=>JSON.parse(await readFile(file,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=RoomViewsSchema.parse(await read(join(source,'room-views.json')));
const risk=RiskObjectReportSchema.parse(await read(riskFile));
await loadRoomViews(source,risk,AbortSignal.timeout(30000));
const out=await mkdtemp(join(source,'spatial-'));
for(const view of manifest.views){
 const path=join(source,view.source_image_ref);
 const probe=await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],undefined,10000);
 const [{width,height}]=JSON.parse(probe.stdout).streams;
 const a=buildSpatialEdit(view,'text');
 const b=buildSpatialEdit(view,'mask');
 const mask=makeRegionMask(width,height,view.actions.map(action=>action.region));
 await Promise.all([
  copyFile(path,join(out,view.source_image_ref)),
  writeFile(join(out,view.view_id+'-A.txt'),a),
  writeFile(join(out,view.view_id+'-B.txt'),b),
  writeFile(join(out,view.view_id+'-mask.png'),mask),
  writeFile(join(out,view.view_id+'-settings.json'),JSON.stringify({source_frame_id:view.source_frame_id,input_sha256:view.input_sha256,mask_sha256:digest(mask),width,height,n:1,size:'1536x864',quality:'high',deployment:'gpt-image-2.5-sunburst',output_format:'png'},null,2)),
 ]);
}
await writeFile(join(out,'room-views.json'),JSON.stringify({...manifest,views:manifest.views.map(({generation,...view})=>view)},null,2));
console.log(out);
