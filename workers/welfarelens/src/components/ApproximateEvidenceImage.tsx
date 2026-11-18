"use client";
import {useState} from 'react';
import type {ApproximateObjectHint} from '../domain/approximate-location';
/** A visual navigation aid only, deliberately separate from reviewed evidence/crops. */
export default function ApproximateEvidenceImage({src,alt,hint,onError,className,fullSize=false}:{src:string;alt:string;hint:ApproximateObjectHint;onError?:()=>void;className?:string;fullSize?:boolean}){
 const [loaded,setLoaded]=useState(false),[failed,setFailed]=useState(false),[naturalWidth,setNaturalWidth]=useState<number>();
 const [l,t,r,b]=hint.bbox;
 return <div className="approximate-evidence-image">
  <div className="approximate-evidence-stage" style={{position:'relative',lineHeight:0,width:fullSize&&naturalWidth?naturalWidth:'100%'}}>
   <img src={src} alt={alt} className={className} style={{display:'block',width:'100%',height:'auto',maxWidth:'none',maxHeight:'none',objectFit:'fill'}} onLoad={e=>{setNaturalWidth(e.currentTarget.naturalWidth);setLoaded(true);}} onError={()=>{setFailed(true);setLoaded(false);onError?.();}}/>
   {loaded&&!failed&&<>
    <svg data-testid="approximate-object-overlay" role="img" aria-label={`${hint.label}：AI 估計範圍`} viewBox="0 0 1000 1000" preserveAspectRatio="none" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
     <title>{hint.label} · AI 估計範圍，位置可能有偏差</title>
     <rect x={l*1000} y={t*1000} width={(r-l)*1000} height={(b-t)*1000} fill="rgba(245,177,62,.08)" stroke="white" strokeWidth="5" vectorEffect="non-scaling-stroke"/>
     <rect x={l*1000} y={t*1000} width={(r-l)*1000} height={(b-t)*1000} fill="none" stroke="#9b590d" strokeWidth="2.5" strokeDasharray="7 4" vectorEffect="non-scaling-stroke"/>
    </svg>
    <span className="approximate-object-label" style={{position:'absolute',left:`clamp(0px, ${l*100}%, max(0px, calc(100% - 10rem)))`,top:`min(${t*100}%, max(0px, calc(100% - 2.5rem)))`,maxWidth:'10rem',fontSize:14,lineHeight:1.4,padding:'4px 7px',borderRadius:4,color:'white',background:'#795018',pointerEvents:'none',overflowWrap:'anywhere'}}>{hint.label}</span>
   </>}
  </div>
  {loaded&&!failed&&<p className="small" style={{lineHeight:1.5,marginTop:8}}>AI 估計範圍 · 協助找到物件，位置可能有偏差。</p>}
 </div>;
}
