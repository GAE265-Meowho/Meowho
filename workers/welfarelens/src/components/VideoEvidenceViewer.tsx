"use client";
import {useEffect,useRef,useState} from 'react';
import ApproximateEvidenceImage from './ApproximateEvidenceImage';
import type {ApproximateObjectHint} from '../domain/approximate-location';
import StaticEvidenceOverlay from './StaticEvidenceOverlay';
import type {ConfirmedCrop} from '../domain/welfare-report';
import type {AggregatedIssue} from '../domain/video-issues';
export const videoStamp=(t:number)=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
type Evidence=AggregatedIssue['evidence'][number];
/** Selected evidence stays independent of playback position; static keyframes never imply tracking. */
export default function VideoEvidenceViewer({videoId,preview,evidence,locationText,onEvidence,onMediaError,issueId,confirmedCrop,approximateHint}:{approximateHint?:ApproximateObjectHint|null;confirmedCrop?:ConfirmedCrop;issueId?:string;videoId:string;preview:string;evidence:Evidence|undefined;locationText?:string;onEvidence:(e:Evidence)=>void;onMediaError:()=>void}){
 const player=useRef<HTMLVideoElement>(null),zoom=useRef<HTMLDialogElement>(null),pending=useRef<Evidence|undefined>(evidence),[position,setPosition]=useState(0),[seekStatus,setSeekStatus]=useState(''),[imageFailed,setImageFailed]=useState(false),[regionReady,setRegionReady]=useState(false);
 const requestKey=evidence?.observation_id;
 function applySeek(){const video=player.current,e=pending.current;if(!video||!e||video.readyState<1)return;
  if(!Number.isFinite(video.duration)||e.timestamp>video.duration+.05){setSeekStatus('影片時間無法對應，以下顯示證據影格。');return;}
  video.pause();try{video.currentTime=Math.min(e.timestamp,video.duration);setSeekStatus('正在對應影片時間…');}catch{setSeekStatus('無法跳轉影片，以下顯示證據影格。');}
 }
 useEffect(()=>{pending.current=evidence;setImageFailed(false);setRegionReady(false);if(preview)applySeek();else setSeekStatus('');},[requestKey,preview,evidence?.timestamp]);
 return <div className="video-evidence" id="video-evidence">
  {evidence&&<figure key={`${videoId}:${evidence.frame_id}`}>
   {!imageFailed?confirmedCrop&&issueId?<StaticEvidenceOverlay imageClassName="video-event-image" src={`/api/video-scans/${videoId}/frames/${evidence.frame_id}`} context={{frame:confirmedCrop.region.frame,issue_id:issueId,observation_id:evidence.observation_id,enabled:true}} regions={[confirmedCrop.region]} imageState={regionReady?{status:'ready',sha256:confirmedCrop.region.frame.sha256,width:confirmedCrop.region.frame.width,height:confirmedCrop.region.frame.height}:{status:'loading'}} onLoad={e=>setRegionReady(e.currentTarget.naturalWidth===confirmedCrop.region.frame.width&&e.currentTarget.naturalHeight===confirmedCrop.region.frame.height)} onError={()=>setImageFailed(true)}/>:approximateHint?<ApproximateEvidenceImage key={`${videoId}:${evidence.observation_id}`} src={`/api/video-scans/${videoId}/frames/${evidence.frame_id}`} alt={`${videoStamp(evidence.timestamp)} 選取問題的證據畫面`} className="video-event-image" hint={approximateHint} onError={()=>setImageFailed(true)}/>:<img className="video-event-image" src={`/api/video-scans/${videoId}/frames/${evidence.frame_id}`} alt={`${videoStamp(evidence.timestamp)} 選取問題的證據畫面`} onError={()=>setImageFailed(true)}/>:<p role="status">證據影格暫時無法載入，仍可查看原始觀察與來源。</p>}
   {!imageFailed&&<button className="text-button" onClick={()=>zoom.current?.showModal()}>放大證據影格</button>}
   <figcaption>{confirmedCrop&&<p>使用者確認的位置 · 非 AI 自動定位</p>}<strong>{videoStamp(evidence.timestamp)} · 請看這個位置</strong>{locationText&&<p>{locationText}</p>}</figcaption>
  </figure>}
  {evidence&&<dialog ref={zoom} className="evidence-zoom" aria-label="放大證據影格"><form method="dialog"><button className="secondary">關閉放大影格</button></form><p>{videoStamp(evidence.timestamp)} · {locationText}</p><div className="evidence-zoom-scroll">{approximateHint?<ApproximateEvidenceImage key={`${videoId}:${evidence.observation_id}:zoom`} src={`/api/video-scans/${videoId}/frames/${evidence.frame_id}`} alt="完整證據影格，可捲動查看細節" fullSize hint={approximateHint}/>:<img src={`/api/video-scans/${videoId}/frames/${evidence.frame_id}`} alt="完整證據影格，可捲動查看細節"/>}</div><p className="small">保留採樣影格原比例；放大不會增加原片細節，也不表示已驗證物件位置。</p></dialog>}
  {preview&&<details className="video-player-details"><summary>播放原影片，查看前後情境</summary><video ref={player} src={preview} controls playsInline preload="metadata" aria-label="本次房間影片" onLoadedMetadata={applySeek} onTimeUpdate={e=>setPosition(e.currentTarget.currentTime)} onSeeked={e=>{const wanted=pending.current;if(wanted&&Math.abs(e.currentTarget.currentTime-wanted.timestamp)<.2)setSeekStatus(`已對應 ${videoStamp(wanted.timestamp)} 證據時間`);}} onError={()=>{setSeekStatus('本機影片無法播放，以下保留證據影格。');onMediaError();}}/><p className="small">影片播放位置 {videoStamp(position)}；上方圖片是選取的採樣證據，不是即時追蹤。</p></details>}
  <p role="status" className="small">{seekStatus}</p>
  <button className="text-button" hidden={!evidence} onClick={()=>{if(evidence){onEvidence(evidence);pending.current=evidence;applySeek();}}}>重新對應選取時間</button>
 </div>;
}
