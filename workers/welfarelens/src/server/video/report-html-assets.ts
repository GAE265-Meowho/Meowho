import { createHash } from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {REPORT_VIEW_MAX_BYTES,reportViewAssetNames} from '../../domain/report-view.ts';
import {reportViewFromPrepared,type ReportViewIdentity} from './report-view-model.ts';
import { renderProfessionalHtml } from './comparison-report.ts';
import type { ProfessionalReport } from './professional-report.ts';

export async function writeReportHtml(directory:string, prepared:ProfessionalReport,identity?:ReportViewIdentity) {
 const assets=new Map<string,Buffer>();
 const html=renderProfessionalHtml(prepared,undefined,[],true,true).replace(
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
 for(const [name,bytes] of assets)await writeFile(join(folder,name),bytes,{flag:'wx',mode:0o600});
 await writeFile(join(directory,'report.html'),html,{flag:'wx',mode:0o600});
 if(identity){
  const view=reportViewFromPrepared(prepared,identity);
  const json=JSON.stringify(view);
  if(Buffer.byteLength(json)>REPORT_VIEW_MAX_BYTES||[...reportViewAssetNames(view)].some(name=>!assets.has(name)))throw Error('Invalid report view assets');
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
  if(!/^[a-f0-9]{64}\.(jpg|png)$/.test(name))throw Error('Invalid report image');
  const path='html-assets/'+name;
  await upload(prefix+path,join(directory,path),name.endsWith('.jpg')?'image/jpeg':'image/png');
 }
 await upload(prefix+'report.html',html,'text/html; charset=utf-8');
 if(hasView)await upload(prefix+'report-view.json',view,'application/json');
}
