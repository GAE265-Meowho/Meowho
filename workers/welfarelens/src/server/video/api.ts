import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {open} from 'node:fs/promises';
import {join} from 'node:path';
import {VideoStore} from './store.ts';
import {VIDEO_MAX_BYTES} from '../../domain/video.ts';
import {readIssueReport} from './issues-store.ts';
const json=(data:unknown,status=200,extra:Record<string,string>={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store',...extra}});
const owner=(r:Request)=>r.headers.get('cookie')?.match(/(?:^|;\s*)wl_video=([a-f0-9]{64})(?:;|$)/)?.[1];
function allowed(r:Request,mutation=false){const url=new URL(r.url);url.host=r.headers.get('host')||url.host;return ['127.0.0.1','localhost'].includes(url.hostname)&&(!mutation||r.headers.get('origin')===url.origin);}
export async function launchWorker(id:string){
 const file=await open(join(await new VideoStore().directory(id),'worker.log'),'wx');
 try{await new Promise<void>((resolveLaunch,reject)=>{const child=spawn(process.execPath,['--env-file-if-exists=.env.local','--experimental-strip-types','scripts/video-worker.ts',id],{cwd:process.cwd(),detached:true,stdio:['ignore',file.fd,file.fd],windowsHide:true});child.once('error',reject);child.once('spawn',()=>{child.unref();resolveLaunch();});});}finally{await file.close();}
}
export function createVideoApi(root=resolve(process.cwd(),'.video-scans'),launch=launchWorker){
 const store=new VideoStore(root);
 const missing=()=>json({error:'找不到此掃描，或已超過保存期限。'},404);
 return {
  async issues(r:Request,id:string){if(!allowed(r))return missing();try{const j=await store.get(id,owner(r)||'');if(['uploading','queued','processing'].includes(j.status))return json({version:1,status:'pending'},202);if(j.status==='failed')return json({error:'分析未完成，沒有可用的整合報告。'},409);try{return json(await readIssueReport(store,id,owner(r)||''));}catch{return json({error:'問題整合資料無法驗證，可保留原始事件繼續查看。'},503);}}catch{return missing();}},
  async create(r:Request){if(!allowed(r,true))return json({error:'影片 Demo 僅限本機同來源使用'},403);const key=r.headers.get('idempotency-key');if(key&&!/^[a-f0-9]{64}$/.test(key))return json({error:'提交識別碼無效，請重新開始。'},400);try{const token=owner(r)||key||randomBytes(32).toString('hex'),job=await store.create(token,key??undefined);return json({video_id:job.video_id,status:job.status,expires_at:job.expires_at},201,{'Set-Cookie':`wl_video=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`});}catch{return json({error:'目前仍有影片正在處理，請等待完成或取消進行中的分析後再試。'},429);}},
  async upload(r:Request,id:string){if(!allowed(r,true))return json({error:'不允許跨站或公開上傳'},403);const token=owner(r);if(!token)return missing();try{await store.get(id,token);}catch{return missing();}
   if(r.headers.get('x-video-consent')!=='true'||!['video/mp4','video/quicktime'].includes(r.headers.get('content-type')||'')||!r.body)return json({error:'請選擇 MP4／MOV，並確認旁邊的 Azure 傳送說明。'},400);
   const size=Number(r.headers.get('content-length'));if(size>VIDEO_MAX_BYTES)return json({error:'影片超過 120 MiB'},413);
   try{await store.upload(id,token,r.body);await launch(id);return json({video_id:id,status:'queued'},202);}catch(error){if(error instanceof Error&&['State','Duplicate'].includes(error.message))return json({error:'這個工作已收到影片，請等待分析結果。'},409);await store.finish(id,{status:'failed',stage:'無法啟動',error:'上傳或背景處理未完成，請重新上傳。',analysis_status:'failed'}).catch(()=>{});return json({error:error instanceof Error&&error.message==='Size'?'影片超過 120 MiB':'上傳或背景處理未完成，請重新上傳。'},error instanceof Error&&error.message==='Size'?413:409);}
  },
  async status(r:Request,id:string){if(!allowed(r))return missing();try{await store.cleanup();const j=await store.get(id,owner(r)||'');const {owner_hash,...publicJob}=j;void owner_hash;return json(publicJob);}catch{return missing();}},
  async cancel(r:Request,id:string){if(!allowed(r,true))return json({error:'不允許跨站取消'},403);try{const j=await store.cancel(id,owner(r)||'');return json({cancelled:j.status==='cancelled',status:j.status});}catch{return missing();}},
  async remove(r:Request,id:string){if(!allowed(r,true))return json({error:'不允許跨站刪除'},403);try{await store.delete(id,owner(r)||'');return json({deleted:true});}catch(e){const code=e&&typeof e==='object'&&'code'in e?String(e.code):'';return ['EPERM','EBUSY','EACCES','ENOTEMPTY'].includes(code)?json({error:'工作正在停止，刪除尚未完成；請稍後重試。'},503):missing();}},
  async frame(r:Request,id:string,fid:string){if(!allowed(r))return missing();try{const bytes=await store.media(id,owner(r)||'',fid);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});}catch{return missing();}},
 };
}
export const videoApi=createVideoApi();
