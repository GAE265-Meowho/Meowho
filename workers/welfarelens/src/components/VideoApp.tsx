"use client";
import {useEffect,useRef,useState} from 'react';
import {PublicVideoJobSchema,VIDEO_MAX_BYTES} from '../domain/video';
import type {VideoEvent,VideoJob} from '../domain/video';
import {IssueReportSchema} from '../domain/video-issues';
import type {IssueReport} from '../domain/video-issues';
import VideoIssueResults from './VideoIssueResults';
const PublicJob=PublicVideoJobSchema;
type Job=Omit<VideoJob,'owner_hash'>;
const stamp=(t:number)=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
const busy=(j:Job|null)=>!!j&&['uploading','queued','processing'].includes(j.status);
export default function VideoApp(){
 const [job,setJob]=useState<Job|null>(null),[error,setError]=useState(''),[upload,setUpload]=useState<number|null>(null),[preview,setPreview]=useState(''),[selected,setSelected]=useState<string|null>(null),[current,setCurrent]=useState(0),[localBusy,setLocalBusy]=useState(false);
 const [pendingFile,setPendingFile]=useState<File|null>(null);
 const player=useRef<HTMLVideoElement>(null),generation=useRef(0),xhrRef=useRef<XMLHttpRequest|null>(null),urlRef=useRef('');
 const idRef=useRef<string|null>(null);
 const fileRef=useRef<File|null>(null),submitting=useRef(false),cancelling=useRef(false);
 const [report,setReport]=useState<IssueReport|null>(null),[issueState,setIssueState]=useState('');
 useEffect(()=>{
  setReport(null);setIssueState('');
  if(!job||!['completed','partial'].includes(job.status))return;
  const controller=new AbortController(),activeJob=job;
  setIssueState('正在整理影片改善重點…');
  void (async()=>{try{
   const r=await fetch(`/api/video-scans/${activeJob.video_id}/issues`,{cache:'no-store',signal:controller.signal});if(!r.ok||r.status===202)throw Error('Unavailable');
   const parsed=IssueReportSchema.parse(await r.json());
   if(parsed.video_id!==activeJob.video_id||parsed.observations.some(o=>!activeJob.frames.some(f=>f.frame_id===o.frame_id&&f.timestamp===o.timestamp)))throw Error('Invalid evidence');
   if(!controller.signal.aborted){setReport(parsed);setIssueState('');}
  }catch{if(!controller.signal.aborted)setIssueState('整合報告暫時無法取得；以下保留逐筆事件與原始證據。');}})();
  return ()=>controller.abort();
 },[job]);
 useEffect(()=>{
  const saved=sessionStorage.getItem('welfarelens.video.id');if(saved){idRef.current=saved;void refresh(saved);}
  return ()=>{generation.current++;xhrRef.current?.abort();if(urlRef.current)URL.revokeObjectURL(urlRef.current);};
  // All media stays memory-only; only the opaque job ID is retained for a short-lived report.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function refresh(id:string){
  const token=generation.current;
  try{
   const r=await fetch(`/api/video-scans/${id}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(r.status===404){
    if(token===generation.current&&idRef.current===id){
     generation.current++;idRef.current=null;submitting.current=false;sessionStorage.removeItem('welfarelens.video.id');
     setJob(null);setUpload(null);setLocalBusy(false);setError('掃描已刪除、逾期，或這個瀏覽器沒有存取權限。可以重新選片開始分析。');
    }
    return;
   }
   if(!r.ok)throw Error('目前無法取得工作狀態，請稍後重試。');
   const next=PublicJob.parse(await r.json());if(token!==generation.current||idRef.current!==id)return;
   setJob(next);setError('');setSelected(old=>next.events.some(e=>e.event_id===old)?old:next.events[0]?.event_id??null);return next;
  }
  catch(e){if(token===generation.current&&idRef.current===id)setError(e instanceof Error&&e.name!=='ZodError'?e.message:'工作資料無法驗證，請稍後重試。');}
 }
 useEffect(()=>{if(!busy(job))return;const timer=setInterval(()=>{if(idRef.current)void refresh(idRef.current);},2000);return ()=>clearInterval(timer);},[job?.status]);
 function choose(file?:File){
  if(!file||localBusy||busy(job))return;
  if(file.size>VIDEO_MAX_BYTES||!(/\.(mp4|mov)$/i.test(file.name))){setError('請選擇 120 MiB 以下的 MP4 或 MOV，長度最多 90 秒。');setPendingFile(null);return;}
  setError('');setPendingFile(file);
 }
 async function start(file?:File){
  if(!file||submitting.current||cancelling.current||localBusy||busy(job))return;setError('');
  if(file.size>VIDEO_MAX_BYTES||!(/\.(mp4|mov)$/i.test(file.name))){setError('請選擇 120 MiB 以下的 MP4 或 MOV，長度最多 90 秒。');return;}
  submitting.current=true;fileRef.current=file;
  const submissionKey=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
  const token=++generation.current;idRef.current=null;sessionStorage.removeItem('welfarelens.video.id');setPendingFile(null);setLocalBusy(true);setJob(null);setSelected(null);setUpload(null);setCurrent(0);
  if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current=URL.createObjectURL(file);setPreview(urlRef.current);
  try{
   const r=await fetch('/api/video-scans',{method:'POST',headers:{'Idempotency-Key':submissionKey},signal:AbortSignal.timeout(20000)}),data=await r.json();if(!r.ok)throw Error(data.error||'無法建立掃描');
   const id=String(data.video_id);
   if(token!==generation.current){await fetch(`/api/video-scans/${id}/cancel`,{method:'POST'});return;}
   idRef.current=id;sessionStorage.setItem('welfarelens.video.id',id);setUpload(0);
   await new Promise<void>((resolve,reject)=>{const xhr=new XMLHttpRequest();xhrRef.current=xhr;xhr.open('PUT',`/api/video-scans/${id}`);xhr.setRequestHeader('Content-Type',/\.mov$/i.test(file.name)?'video/quicktime':'video/mp4');xhr.setRequestHeader('X-Video-Consent','true');xhr.timeout=180000;xhr.upload.onprogress=e=>{if(token===generation.current&&e.lengthComputable)setUpload(Math.round(e.loaded/e.total*100));};xhr.onload=()=>{if(xhr.status===202)resolve();else reject(Error('影片上傳未完成，請檢查大小或稍後重試。'));};xhr.onerror=()=>reject(Error('網路中斷，影片未完成上傳。'));xhr.ontimeout=()=>reject(Error('上傳逾時，請重試。'));xhr.onabort=()=>reject(Error('上傳已取消。'));xhr.send(file);});
   if(token===generation.current){setUpload(null);await refresh(id);}
  }catch(e){if(token===generation.current){setUpload(null);const id=idRef.current,next=id?await refresh(id):null;
   if(token!==generation.current)return;
   if(id&&next?.status==='uploading'){try{await fetch(`/api/video-scans/${id}/cancel`,{method:'POST',signal:AbortSignal.timeout(15000)});await refresh(id);}catch{/* Status remains available for explicit cancellation. */}}
   if(token===generation.current)setError(e instanceof Error?e.message:'上傳未完成');}}
  finally{if(token===generation.current){submitting.current=false;setLocalBusy(false);}}
 }
 async function cancel(){
  if(cancelling.current)return;cancelling.current=true;
  const token=++generation.current,id=idRef.current;submitting.current=false;xhrRef.current?.abort();setUpload(null);setLocalBusy(true);
  try{if(id){const r=await fetch(`/api/video-scans/${id}/cancel`,{method:'POST',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('尚未確認取消，請再試一次。');if(token===generation.current)await refresh(id);}
   if(token===generation.current){setError('');if(!id)setJob(null);}
  }catch(e){if(token===generation.current)setError(e instanceof Error?e.message:'取消未完成，請重試。');}
  finally{cancelling.current=false;if(token===generation.current)setLocalBusy(false);}
 }
 async function remove(){
  if(!idRef.current)return;const id=idRef.current;generation.current++;submitting.current=false;xhrRef.current?.abort();setLocalBusy(true);
  try{const r=await fetch(`/api/video-scans/${id}`,{method:'DELETE'});if(!r.ok&&r.status!==404)throw Error('刪除未完成，請重試');sessionStorage.removeItem('welfarelens.video.id');idRef.current=null;fileRef.current=null;setPendingFile(null);setJob(null);setSelected(null);setUpload(null);setPreview('');if(urlRef.current)URL.revokeObjectURL(urlRef.current);urlRef.current='';setError('');}catch(e){setError(e instanceof Error?e.message:'刪除未完成');}finally{setLocalBusy(false);}
 }
 const events=job?.events??[],event=events.find(e=>e.event_id===selected)??events[0];
 function seek(e:VideoEvent){setSelected(e.event_id);setCurrent(e.representative_timestamp);if(player.current){player.current.pause();player.current.currentTime=e.representative_timestamp;}}
 const riskCount=events.filter(e=>e.kind==='risk').length,otherCount=events.length-riskCount;
 const complete=job&&['completed','partial'].includes(job.status);
 const duration=job?.metadata?.duration??0;
 const timeline=[...new Map(events.map(e=>[e.frame_id,{event:e,count:events.filter(x=>x.frame_id===e.frame_id).length}])).values()].sort((a,b)=>a.event.representative_timestamp-b.event.representative_timestamp);
 return <main className={`shell video-scan ${complete?'has-results':''}`}>
  <header className="topbar"><a className="brand" href="/photo"><span className="brand-mark" aria-hidden="true">家</span>貓咪居家環境健檢</a><span className="brand-sub">單貓照護</span></header>
  <section className="quick-intro"><span className="eyebrow">影片健檢</span><h1>用一段影片，<br/>走看整個房間。</h1><p>讓 AI 協助發現居家環境中可能忽略的貓咪安全風險，並提供具體改善建議。</p></section>
  <details className={`video-rescan ${complete?'':'initial'}`} open={!complete}><summary>重新拍攝／上傳影片</summary><section className="video-guide"><h2>慢慢走看，不必固定順序</h2><p>使用一般 1× 鏡頭，盡可能橫拍、保持明亮，緩慢掃過窗戶、家具、植物及電線。建議 30–60 秒，最多 90 秒。</p><div className="scan-buttons">
   <label className={`primary file-button ${localBusy||busy(job)?'disabled':''}`}>拍攝影片<input disabled={localBusy||busy(job)} type="file" capture="environment" accept="video/mp4,video/quicktime,.mp4,.mov" aria-label="拍攝影片" onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/></label>
   <label className={`secondary file-button ${localBusy||busy(job)?'disabled':''}`}>上傳影片<input disabled={localBusy||busy(job)} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" aria-label="上傳影片" onChange={e=>{choose(e.target.files?.[0]);e.target.value='';}}/></label>
  </div>{pendingFile&&<div role="region" aria-label="真實分析費用提醒"><p>影片已選取。按下開始才會傳送影格至 Azure 並可能產生費用。</p><p><strong>預算目標 US$2 以內，不是保證硬上限。</strong>最多 8 次場景分析＋6 次植物精查，每次最多 8,000 輸出 token；暫時性錯誤預設最多額外重試 2 次，可能增加費用。重新分析會建立新的付費任務。</p><button className="primary" disabled={localBusy||busy(job)} onClick={()=>void start(pendingFile)}>開始真實 Azure 分析</button></div>}<p className="small">選取影片不會開始分析：完整影片暫存本機，抽選畫面與必要植物局部會傳至既有 Azure 分析，可能計費。原片在報告完成或失敗後刪除，事件截圖、原始 AI 回應與診斷報告自建立工作起最多保留 30 分鐘。僅限本機 Demo；不將音軌送至模型分析。</p></section></details>
  {upload!==null&&<div role="status" className="scan-progress">上傳影片 {upload}%<progress max={100} value={upload} aria-label="影片上傳進度"/></div>}
  {busy(job)&&<div role="status" className="scan-progress"><span className="scan-spinner" aria-hidden="true"/>{job?.stage}<p>分析完成前，不代表已排除風險。可切換照片模式，工作會繼續。</p></div>}
  {localBusy&&upload===null&&!job&&<p role="status">正在建立分析工作…</p>}
  {(localBusy||busy(job))&&<div className="video-controls"><button className="secondary" disabled={cancelling.current} onClick={()=>void cancel()}>取消分析</button><p className="small">停止後續分析；已送至 Azure 的請求仍可能產生費用。</p></div>}
  {error&&<div role="alert" className="scan-failure"><p>{error}</p>{idRef.current&&<button className="secondary" onClick={()=>void refresh(idRef.current!)}>重新取得結果</button>}</div>}
  {job?.status==='failed'&&<div role="alert" className="scan-failure"><h2>這次影片未完成分析</h2><p>{job.error}</p><p>不能由本次失敗判定環境安全。</p></div>}
  {job?.status==='cancelled'&&<p role="status">分析已取消。可以重新開始；已送出的 Azure 請求仍可能計費。</p>}
  {!busy(job)&&!localBusy&&(job||error)&&<div className="video-controls">{fileRef.current?<><button className="primary" onClick={()=>void start(fileRef.current!)}>{complete?'重新分析':'重新嘗試'}</button><p className="small">使用目前影片建立新工作，可能產生 Azure 費用。先前結果保留至原保存期限。</p></>:<p>請重新選取影片開始新分析。重新整理後不保留瀏覽器中的原始影片。</p>}</div>}
  {complete&&issueState&&<p className="small" role="status">{issueState}</p>}
  {complete&&report&&job&&<VideoIssueResults key={job.video_id} report={report} job={job} preview={preview} onMediaError={()=>setPreview('')}/>}
  {complete&&!report&&<section className="video-results" aria-label="影片掃描結果"><span className="eyebrow">沿著時間，看見改善機會</span><h2>影片中的改善重點</h2><p>{riskCount} 項可能風險 · {otherCount} 項預防、植物提醒及照護建議</p>
   {job.warning.length>0&&<aside className="video-warning">{job.warning.map(w=><p key={w}>{w}</p>)}</aside>}
   {!preview&&<p className="small">原片已清除，以下保留事件截圖與改善建議。</p>}
   <div className="video-result-grid"><div className="video-evidence">
    {preview&&<><video ref={player} src={preview} controls playsInline preload="metadata" onTimeUpdate={e=>setCurrent(e.currentTarget.currentTime)} onError={()=>setPreview('')} aria-label="本次房間影片"/><p className="small">播放的是本次選取的瀏覽器本機影片；伺服器原片不永久保留。</p></>}
    <div className="video-timeline" aria-label="影片事件時間軸">{duration>0&&<><progress value={current} max={duration} aria-label="影片播放位置"/><div className="timeline-rail">{timeline.map(({event:e,count})=><button key={e.frame_id} onClick={()=>seek(e)} aria-label={`${stamp(e.representative_timestamp)} ${count} 項發現`}><strong>{stamp(e.representative_timestamp)}</strong><span>{count} 項發現</span></button>)}</div></>}<p className="small">{stamp(current)} ／ {stamp(duration)} · 點選時間查看對應畫面；標記表示採樣證據，非連續追蹤。</p></div>
    {event&&<figure><img className="video-event-image" src={`/api/video-scans/${job.video_id}/frames/${event.frame_id}`} alt={`${stamp(event.representative_timestamp)} 事件畫面`}/><figcaption>{stamp(event.representative_timestamp)} · {event.risk_title}。目前沒有經驗證的物件座標，因此不畫框線。</figcaption></figure>}
    {!events.length&&<p>{job.status==='partial'?'部分畫面無法完成判讀，暫無可用事件；不代表安全。':'抽樣畫面未發現需要立即處理的明確風險；不代表整段影片或住家安全。'}</p>}
   </div><div className="video-event-list"><h3>事件與改善建議</h3>{events.map(e=><article key={e.event_id} className={`video-event-card ${selected===e.event_id?'selected':''}`}><button className="text-button" onClick={()=>seek(e)} aria-pressed={selected===e.event_id}>{stamp(e.representative_timestamp)} · {e.risk_title}</button><span className="finding-kind">{{risk:'可能風險',precaution:'植物辨識提醒',prevention:'預防準備',enrichment:'照護環境改善'}[e.kind]}</span><p><strong>看見：</strong>{e.observation}</p><p><strong>建議：</strong>{e.recommendation}</p><details open={selected===e.event_id}><summary>原因與畫面限制</summary><p>{e.potential_risk}</p>{e.unknown.map(u=><p className="small" key={u}>{u}</p>)}{e.source_reference.map((s,i)=><a key={s} href={s} target="_blank" rel="noreferrer">照護資料來源 {i+1}</a>)}</details>{e.evidence_frames.length>1&&<p className="small">相同畫面也出現在 {e.evidence_frames.slice(1).map(f=>stamp(f.timestamp)).join('、')}；不推定風險持續時間。</p>}</article>)}</div></div>
   <p className="small">AI 觀察與風險推論尚未經人工查核；沒有看到的區域及抽樣間隔仍可能有未辨識問題。不提供居家安全認證。</p><button className="secondary" onClick={()=>window.print()}>儲存影片改善計畫／PDF</button>
  </section>}
  {idRef.current&&<div className="video-controls"><button className="secondary" disabled={localBusy&&upload===null} onClick={()=>void remove()}>刪除此掃描</button><p className="small">刪除原片、事件截圖與報告，進行中的工作也會取消。重新整理後可讀取同瀏覽器期限內的結果。</p></div>}
  <footer><strong>AI 協助發現可能風險，人類決定如何改善。</strong><p>照片保留 AI 改善構想；影片先以真實時間點、截圖與具體行動呈現。</p></footer>
 </main>;
}
