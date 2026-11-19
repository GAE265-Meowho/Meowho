import {boundedText} from '../bounded-json.ts';
import {buildVisualReport} from '../../domain/visual-report.ts';
import {VideoStore} from './store.ts';import {readIssueReport} from './issues-store.ts';import {buildWelfareLensReport,toMeowhoEnvReport} from '../../domain/welfare-report.ts';import {readCrops,saveManualCrop,cropMedia,frameInfo} from './crops.ts';
const owner=(r:Request)=>r.headers.get('cookie')?.match(/(?:^|;\s*)wl_video=([a-f0-9]{64})(?:;|$)/)?.[1]??'';
const allowed=(r:Request,mutation=false)=>{const u=new URL(r.url);return ['localhost','127.0.0.1'].includes(u.hostname)&&(!mutation||r.headers.get('origin')===u.origin);};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
export function evidenceApi(store=new VideoStore()){return async(r:Request,id:string,action:string,asset?:string)=>{if(!allowed(r,r.method!=='GET'))return json({error:'不允許此請求'},403);const token=owner(r);try{const job=await store.get(id,token);
 if(action==='report'){if(['uploading','queued','processing'].includes(job.status))return json({status:'pending'},202);if(!['completed','partial'].includes(job.status))return json({error:'沒有已完成的報告'},409);const report=buildWelfareLensReport(await readIssueReport(store,id,token),job.analysis_status==='complete'?'complete':'incomplete',job.created_at,await readCrops(store,id,token),job.input_kind==='photo'?'photo':'video');const format=new URL(r.url).searchParams.get('format');if(format==='meowho'&&report.analysis_status!=='complete')return json({error:'部分分析結果無法發布'},409);return json(format==='visual'?buildVisualReport(await readIssueReport(store,id,token),report,job):format==='meowho'?toMeowhoEnvReport(report):report);}
 if(action==='frame-info'&&asset)return json(await frameInfo(await store.media(id,token,asset)));
 if(action==='crops'&&r.method==='GET'&&!asset)return json(await readCrops(store,id,token));
 if(action==='crops'&&r.method==='POST'){const size=Number(r.headers.get('content-length'));if(size>5000)return json({error:'框選資料過大'},413);const body=await boundedText(r,5000,AbortSignal.timeout(10000));if(body.length>5000)return json({error:'框選資料過大'},413);return json(await saveManualCrop(store,id,token,JSON.parse(body)),201);}
 if(action==='crops'&&asset){const bytes=await cropMedia(store,id,token,asset);return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/jpeg','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});}
 return json({error:'不支援此操作'},400);
 }catch{return json({error:'證據無法讀取或保存，請確認工作期限與框選位置。'},404);}};}
export const videoEvidenceApi=evidenceApi();
