import React,{type CSSProperties,type ReactEventHandler} from 'react';
import {visibleRegions,type GroundingContext} from '../domain/video-grounding.ts';

type ImageState={status:'loading'|'error'}|{status:'ready';sha256:string;width:number;height:number};
type Props={imageClassName?:string;src:string;context:GroundingContext;regions:readonly unknown[];imageState:ImageState;onLoad?:ReactEventHandler<HTMLImageElement>;onError?:ReactEventHandler<HTMLImageElement>};

/** Static reviewed evidence only. The viewer supplies accepted manual provenance; AI candidates remain hidden.
 * Host owns image lifecycle; ready must refer to the decoded selected frame, not the last image.
 * Hash/review provenance must come from a trusted server, never model confidence or user input.
 */
export default function StaticEvidenceOverlay({src,context,regions,imageState,onLoad,onError,imageClassName}:Props){
 const {frame}=context;
 const ready=imageState.status==='ready'&&imageState.sha256===frame.sha256&&imageState.width===frame.width&&imageState.height===frame.height;
 const selected=ready?visibleRegions(regions,context):[];
 const imageStyle:CSSProperties={display:'block',width:'100%',height:'auto'};
 return <figure style={{margin:0,maxWidth:'100%'}} aria-label="靜態證據定位實驗">
  {context.fixtureMode&&<p role="note" style={{color:'#61491e',background:'#faf2df',padding:12}}>代理草標 · 非人類 Ground Truth · 非模型定位結果</p>}
  {imageState.status==='error'?<p role="status">影格無法載入，保留問題文字，不顯示框線。</p>:<div data-testid="grounding-stage" style={{position:'relative',width:'100%',lineHeight:0}}>
   <img className={imageClassName} src={src} alt={`選取問題於 ${frame.pts_seconds.toFixed(3)} 秒的靜態證據影格`} width={frame.width} height={frame.height} style={imageStyle} onLoad={onLoad} onError={onError}/>
   {selected.length>0&&<svg data-testid="grounding-overlay" aria-label="選取問題的位置" role="img" viewBox={`0 0 ${frame.width} ${frame.height}`} preserveAspectRatio="xMidYMid meet" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
    {selected.map(r=><g key={r.id}><title>{r.label}</title><rect x={r.bbox[0]*frame.width} y={r.bbox[1]*frame.height} width={(r.bbox[2]-r.bbox[0])*frame.width} height={(r.bbox[3]-r.bbox[1])*frame.height} fill="none" stroke="#faf9f0" strokeWidth="5" vectorEffect="non-scaling-stroke"/><rect data-region-id={r.id} x={r.bbox[0]*frame.width} y={r.bbox[1]*frame.height} width={(r.bbox[2]-r.bbox[0])*frame.width} height={(r.bbox[3]-r.bbox[1])*frame.height} fill="none" stroke="#245e60" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/></g>)}
   </svg>}
   {selected.map((r,i)=><span key={r.id} style={{position:'absolute',left:`clamp(0px, ${r.bbox[0]*100}%, max(0px, calc(100% - 9rem)))`,top:`min(${r.bbox[1]*100}%, max(0px, calc(100% - 2rem)))`,transform:`translateY(${i*28}px)`,maxWidth:'9rem',fontSize:13,lineHeight:1.4,padding:'4px 7px',borderRadius:4,color:'#fff',background:'#245e60',pointerEvents:'none',overflowWrap:'anywhere'}}>{r.label}</span>)}
  </div>}
  <figcaption style={{fontSize:14,lineHeight:1.6,color:'#536665',marginTop:8}}>{selected.length?'僅標示選取問題的靜態位置；不代表危害或植物品種已證實。':'位置暫無可用的已覆核標註；保留原始證據畫面。'}</figcaption>
 </figure>;
}
