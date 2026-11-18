import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {command} from './media.ts';

const width=96,height=64;
type Box=readonly [number,number,number,number];

// Match textured landmarks outside the edit. Ambiguous or inconsistent landmarks
// do not authorize a crop, even if the two pictures have identical dimensions.
export function detailRegions(before:Buffer,after:Buffer,box:Box){
 const [x1,y1,x2,y2]=box;
 if(before.length!==width*height||after.length!==width*height||x2-x1>.72||y2-y1>.82)return null;
 const votes=new Map<string,{dx:number;dy:number;rows:Set<number>;columns:Set<number>;count:number;offsetError:number}>();
 let anchors=0;
 for(const y of [12,22,32,42,52])for(const x of [12,24,36,48,60,72,84]){
  if(x/width>x1-.09&&x/width<x2+.09&&y/height>y1-.13&&y/height<y2+.13)continue;
  const source:number[]=[];
  for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++)source.push(before[(y+j)*width+x+i]);
  if(Math.max(...source)-Math.min(...source)<35)continue;
  const scores=[];
  for(let dy=-5;dy<=5;dy++)for(let dx=-5;dx<=5;dx++){
   let error=0,k=0;
   for(let j=-4;j<=4;j++)for(let i=-4;i<=4;i++)error+=Math.abs(source[k++]-after[(y+j+dy)*width+x+i+dx]);
   scores.push({dx,dy,error:error/source.length});
  }
  scores.sort((a,b)=>a.error-b.error);
  const best=scores[0],alternative=scores.find(s=>Math.abs(s.dx-best.dx)>1||Math.abs(s.dy-best.dy)>1)!;
  if(best.error>18||alternative.error-best.error<2.5)continue;
  anchors++;
  for(let dy=best.dy-1;dy<=best.dy+1;dy++)for(let dx=best.dx-1;dx<=best.dx+1;dx++){
   const key=dx+','+dy,vote=votes.get(key)??{dx,dy,rows:new Set<number>(),columns:new Set<number>(),count:0,offsetError:0};
   vote.rows.add(y);vote.columns.add(x);vote.count++;
   vote.offsetError+=Math.abs(dx-best.dx)+Math.abs(dy-best.dy);
   votes.set(key,vote);
  }
 }
 const best=[...votes.values()].sort((a,b)=>b.count-a.count||a.offsetError-b.offsetError)[0];
 if(!best||best.count<Math.max(4,anchors*.75)||best.rows.size<2||best.columns.size<2)return null;
 const dx=best.dx/width,dy=best.dy/height;
 const padX=Math.max(.07,(x2-x1)*.2),padY=Math.max(.06,(y2-y1)*.15);
 const region:Box=[Math.max(0,-dx,x1-padX),Math.max(0,-dy,y1-padY),Math.min(1,1-dx,x2+padX),Math.min(1,1-dy,y2+padY)];
 if(region[0]>x1||region[1]>y1||region[2]<x2||region[3]<y2)return null;
 return [region,[region[0]+dx,region[1]+dy,region[2]+dx,region[3]+dy] as Box];
}

export async function buildDetailImages(before:string,after:string,box:Box,signal?:AbortSignal){
 return (await buildAlignedDetails(before,after,box,signal))?.images??null;
}

export async function buildAlignedDetails(before:string,after:string,box:Box,signal?:AbortSignal){
 const dir=await mkdtemp(join(tmpdir(),'wl-detail-'));
 try{
  const paths=[join(dir,'before.jpg'),join(dir,'after.png')];
  await Promise.all([before,after].map((url,i)=>writeFile(paths[i],Buffer.from(url.split(',')[1],'base64'),{mode:0o600})));
  const dimensions=[],previews=[];
  const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
  for(const path of paths){
   const probe=await command(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',path],signal,10000);
   const size=JSON.parse(probe.stdout).streams[0] as {width:number;height:number};
   if(!size?.width||!size.height)return null;
   dimensions.push(size);
   const preview=path+'.gray';
   await command(ffmpeg,['-v','error','-i',path,'-vf',`scale=${width}:${height},format=gray`,'-frames:v','1','-threads','1','-f','rawvideo',preview],signal,10000);
   previews.push(await readFile(preview));
  }
  const [a,b]=dimensions;
  if(Math.abs((a.width/a.height)/(b.width/b.height)-1)>.025)return null;
  const regions=detailRegions(previews[0],previews[1],box);
  if(!regions)return null;
  const images=[],detailDimensions=[];
  for(const [i,region] of regions.entries()){
   const {width:w,height:h}=dimensions[i];
   const [x,y,right,bottom]=region.map((n,j)=>Math.floor(n*(j%2?h:w)/2)*2);
   if(right-x<2||bottom-y<2)return null;
   const destination=paths[i]+'.jpg';
   await command(ffmpeg,['-v','error','-i',paths[i],'-vf',`crop=${right-x}:${bottom-y}:${x}:${y}`,'-frames:v','1','-q:v','2','-threads','1',destination],signal,10000);
   detailDimensions.push({width:right-x,height:bottom-y});
   images.push('data:image/jpeg;base64,'+(await readFile(destination)).toString('base64'));
  }
  const dx=regions[1][0]-regions[0][0],dy=regions[1][1]-regions[0][1];
  const target:Box=[box[0]+dx,box[1]+dy,box[2]+dx,box[3]+dy];
  return {images,regions,dimensions:[...dimensions,...detailDimensions],afterTarget:target.every(n=>n>=0&&n<=1)?target:null};
 }catch{
  signal?.throwIfAborted();
  return null;
 }finally{await rm(dir,{recursive:true,force:true});}
}
