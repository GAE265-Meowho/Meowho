"use client";
import React,{useState} from 'react';
import type {VisualReport} from '../domain/visual-report';
export const regionLabels={verified_model:'經驗證模型定位',user_confirmed:'使用者確認位置',ai_estimated:'AI 估計範圍，位置可能有偏差',unavailable:'無定位資料'};
export default function VisualReportFigure({item}:{item:VisualReport['issues'][number]}){
 const [failed,setFailed]=useState(false),[ratio,setRatio]=useState(16/9);const e=item.representative,box=e.region.bbox;
 return <figure className="visual-report-figure">
  {e.frame_path&&!failed?<div className="visual-report-image" style={{width:`min(100%, ${Math.round(ratio*200)}px)`}}><img src={e.frame_path} alt={`${item.label}的原始證據影格`} onError={()=>setFailed(true)} onLoad={ev=>setRatio(ev.currentTarget.naturalWidth/ev.currentTarget.naturalHeight)}/>
   {box&&<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label={regionLabels[e.region.source]}><rect x={box[0]*1000} y={box[1]*1000} width={(box[2]-box[0])*1000} height={(box[3]-box[1])*1000} stroke="white" strokeWidth="5" fill="none" vectorEffect="non-scaling-stroke"/><rect x={box[0]*1000} y={box[1]*1000} width={(box[2]-box[0])*1000} height={(box[3]-box[1])*1000} stroke="#b36914" strokeWidth="2.5" strokeDasharray={e.region.source==='ai_estimated'?'7 4':undefined} fill="none" vectorEffect="non-scaling-stroke"/></svg>}
  </div>:<p className="visual-image-fallback">證據圖片目前無法取得；保留以下文字及時間。</p>}
  <figcaption>{box&&<strong data-testid="print-object-label">{item.label} · {e.region.source==='ai_estimated'?'AI 估計位置':regionLabels[e.region.source]}<br/></strong>}{`${Math.floor(e.timestamp/60).toString().padStart(2,'0')}:${Math.floor(e.timestamp%60).toString().padStart(2,'0')}`} · {regionLabels[e.region.source]}</figcaption>
 </figure>;
}
