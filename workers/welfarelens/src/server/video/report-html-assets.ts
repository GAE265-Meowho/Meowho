import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {REPORT_VIEW_MAX_BYTES,reportViewAssetNames} from '../../domain/report-view.ts';
import {reportViewFromPrepared,type ReportViewIdentity} from './report-view-model.ts';
import { command } from './media.ts';
import { renderProfessionalHtml } from './comparison-report.ts';
import type { ProfessionalReport } from './professional-report.ts';

export async function writeReportHtml(directory:string, prepared:ProfessionalReport,identity?:ReportViewIdentity, signal?:AbortSignal) {
 const assets=new Map<string,Buffer>();
 let html=renderProfessionalHtml(prepared,undefined,[],true,true).replace(
  /src="data:image\/(jpeg|png);base64,([A-Za-z0-9+/=]+)"/g,
  (_,format:string,data:string)=>{
   const bytes=Buffer.from(data,'base64');
   if(bytes.length>4*1024*1024)throw Error('Report image exceeds delivery limit');
   const hash=createHash('sha256').update(bytes).digest('hex');
   const name=hash+(format==='jpeg'?'.jpg':'.png');
   assets.set(name,bytes);
   return 'src="html-assets/'+name+'"';
  },
 );
 if(prepared.reviewDraft||!assets.size||/<img[^>]+src="(?!html-assets\/)/.test(html))throw Error('Invalid private HTML');
 const folder=join(directory,'html-assets');
 await mkdir(folder,{mode:0o700});
 const webpNames=new Map<string,string>();
 const derivatives=new Set<string>();
 for(const [name,bytes] of assets){
  signal?.throwIfAborted();
  const original=join(folder,name);
  await writeFile(original,bytes,{flag:'wx',mode:0o600});
  const temporary=join(folder,name+'.tmp.webp');
  try {
   await command(process.env.FFMPEG_PATH||'ffmpeg',[
    '-v','error','-xerror','-nostdin','-n','-protocol_whitelist','file,pipe',
    '-format_whitelist','image2,jpeg_pipe,png_pipe','-i',original,'-frames:v','1',
    '-c:v','libwebp','-quality','88','-compression_level','4','-threads','1',temporary,
   ],signal,15000);
   const size=(await stat(temporary)).size;
   if(!size||size>=bytes.length)continue;
   const webp=await readFile(temporary);
   const derivative=createHash('sha256').update(webp).digest('hex')+'.webp';
   if(!derivatives.has(derivative)){
    await writeFile(join(folder,derivative),webp,{flag:'wx',mode:0o600});
    derivatives.add(derivative);
   }
   webpNames.set(name,derivative);
  }catch{
   signal?.throwIfAborted();
   console.warn('welfarelens: WebP derivative unavailable; using original evidence');
  }finally{
   await rm(temporary,{force:true});
  }
 }
 html=html.replace(/src="html-assets\/([a-f0-9]{64}\.(?:jpg|png))"/g,(src,name:string)=>{
  const derivative=webpNames.get(name);
  return derivative?src+' data-webp="html-assets/'+derivative+'"':src;
 });
 await writeFile(join(directory,'report.html'),html,{flag:'wx',mode:0o600});
 if(identity){
  const view=reportViewFromPrepared(prepared,identity,webpNames);
  const json=JSON.stringify(view);
  if(Buffer.byteLength(json)>REPORT_VIEW_MAX_BYTES||[...reportViewAssetNames(view)].some(name=>!assets.has(name)&&!derivatives.has(name)))throw Error('Invalid report view assets');
  await writeFile(join(directory,'report-view.json'),json,{flag:'wx',mode:0o600});
 }
}

export async function uploadReportHtml(directory:string,prefix:string,upload:(path:string,file:string,mime:string)=>Promise<void>,publishView=false,required=false) {
 const html=join(directory,'report.html');
 const names=await readdir(join(directory,'html-assets')).catch((e:NodeJS.ErrnoException)=>{
  if(e.code==='ENOENT')return [];
  throw e;
 });
 if(!names.length){
  if(required)throw Error('Required report assets missing');
  return;
 }
 // A failed local export must never trigger a partial upload.
 if(!await stat(html).then(s=>s.isFile(),()=>false)){
  if(required)throw Error('Required report HTML missing');
  return;
 }
 const view=join(directory,'report-view.json');
 const hasView=publishView&&await stat(view).then(s=>s.isFile(),()=>false);
 if(required&&!hasView)throw Error('Required report view missing');
 for(const name of names.sort()){
  if(!/^[a-f0-9]{64}\.(jpg|png|webp)$/.test(name))throw Error('Invalid report image');
  const path='html-assets/'+name;
  await upload(prefix+path,join(directory,path),name.endsWith('.webp')?'image/webp':name.endsWith('.jpg')?'image/jpeg':'image/png');
 }
 await upload(prefix+'report.html',html,'text/html; charset=utf-8');
 if(hasView)await upload(prefix+'report-view.json',view,'application/json');
}
