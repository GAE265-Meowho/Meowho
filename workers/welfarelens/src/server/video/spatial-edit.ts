import {crc32,deflateSync} from 'node:zlib';
import {z} from 'zod';

const coordinate=z.number().min(0).max(1);
const region=z.tuple([coordinate,coordinate,coordinate,coordinate]).refine(([l,t,r,b])=>l<r&&t<b);
type Region=z.infer<typeof region>;
type SpatialView={
 actions:readonly {action_id:string;instruction:string;expected_visible_change:string;region:Region}[];
 elements_to_preserve:readonly string[];
 unverified_conditions:readonly string[];
};

export function buildSpatialEdit(view:SpatialView,method:'text'|'mask'){
 const regions=view.actions.map(action=>region.parse(action.region));
 if(!regions.length)throw Error('沒有可編輯的改善項目');
 if(new Set(view.actions.map(action=>action.action_id)).size!==regions.length)throw Error('改善項目 ID 重複');
 for(const [i,[left,top,right,bottom]] of regions.entries()){
  if(regions.slice(0,i).some(([l,t,r,b])=>left<r&&l<right&&top<b&&t<bottom))throw Error('改善區域重疊，需先釐清擺放或編輯衝突');
 }
 const prompt=[
  '從原始照片製作同一鏡位的寫實改善示意。只執行下列動作。不要加文字、標籤或箭頭。',
  ...view.actions.map(action=>action.instruction+' 預期畫面：'+action.expected_visible_change),
  '保持房間幾何、鏡位、光線與無關物件。'+view.elements_to_preserve.join('、'),
  '不得呈現為已核實的實體條件：'+view.unverified_conditions.join('、'),
 ].join('\n');
 if(method==='text')return prompt;
 return [prompt,'將變更限於遮罩透明區域。每個區域依左上為原點的正規化座標表示。',...view.actions.map((action,i)=>action.action_id+' '+regions[i].join(', ')+' '+action.expected_visible_change)].join('\n');
}

function chunk(type:string,data:Buffer){
 const out=Buffer.alloc(data.length+12);
 out.writeUInt32BE(data.length);
 out.write(type,4,'ascii');
 data.copy(out,8);
 out.writeUInt32BE(crc32(out.subarray(4,-4)),out.length-4);
 return out;
}

export function makeRegionMask(width:number,height:number,input:readonly Region[]){
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>9_000_000||!input.length)throw Error('無效的遮罩尺寸或區域');
 const header=Buffer.alloc(13);
 header.writeUInt32BE(width);
 header.writeUInt32BE(height,4);
 header[8]=8;
 header[9]=6;
 const stride=1+width*4;
 const pixels=Buffer.alloc(stride*height,255);
 for(let y=0;y<height;y++)pixels[y*stride]=0;
 for(const box of input){
  const [left,top,right,bottom]=region.parse(box);
  for(let y=Math.floor(top*height);y<Math.ceil(bottom*height);y++){
   for(let x=Math.floor(left*width);x<Math.ceil(right*width);x++)pixels[y*stride+x*4+4]=0;
  }
 }
 return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
