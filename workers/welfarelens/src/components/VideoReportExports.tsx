"use client";
import {useState} from 'react';
import type {VisualReport} from '../domain/visual-report';
import {regionLabels} from './VisualReportFigure';
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export default function VideoReportExports({report}:{report:VisualReport}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const images=report.reading_groups.map(g=>report.issues.find(i=>i.key===g.issue_keys[0])!).filter(i=>i.category!=='ENRICHMENT_ADVICE');
 async function print(){setBusy(true);setMessage('正在準備圖文報告');try{
  await document.fonts.ready;
  const imgs=[...document.querySelectorAll<HTMLImageElement>('.video-print-report img')];
  await Promise.all(imgs.map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);img.removeEventListener('load',done);img.removeEventListener('error',done);resolve();};const timer=setTimeout(done,12000);img.addEventListener('load',done);img.addEventListener('error',done);})));
  // Failed/expired assets are text fallbacks; do not block report saving.
  imgs.filter(i=>!i.complete||!i.naturalWidth).forEach(i=>{const figure=i.closest('figure');if(figure)figure.dataset.unavailable='true';});
  setMessage('圖文報告已就緒；列印視窗可選擇儲存 PDF，並關閉頁首頁尾。');window.print();
 }finally{setBusy(false);}}
 async function image(item:VisualReport['issues'][number]){const e=item.representative;if(!e.frame_path)return;setBusy(true);setMessage('正在準備關鍵圖片');try{
  const response=await fetch(e.frame_path,{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();const bitmap=await createImageBitmap(await response.blob());
  try{const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height+120;const c=canvas.getContext('2d');if(!c)throw Error();c.drawImage(bitmap,0,0);const b=e.region.bbox;
   if(b){c.lineWidth=5;c.strokeStyle='white';c.strokeRect(b[0]*bitmap.width,b[1]*bitmap.height,(b[2]-b[0])*bitmap.width,(b[3]-b[1])*bitmap.height);c.lineWidth=3;c.strokeStyle='#b36914';if(e.region.source==='ai_estimated')c.setLineDash([12,8]);c.strokeRect(b[0]*bitmap.width,b[1]*bitmap.height,(b[2]-b[0])*bitmap.width,(b[3]-b[1])*bitmap.height);}
   c.setLineDash([]);c.fillStyle='#f4f6f1';c.fillRect(0,bitmap.height,canvas.width,120);c.fillStyle='#173e35';c.font='24px "Microsoft JhengHei",sans-serif';c.fillText(item.label,20,bitmap.height+36,canvas.width-40);c.font='20px "Microsoft JhengHei",sans-serif';c.fillText(`${e.timestamp.toFixed(2)} 秒 · ${regionLabels[e.region.source]}`,20,bitmap.height+72,canvas.width-40);c.fillText('貓咪居家環境健檢 · 非安全認證',20,bitmap.height+104,canvas.width-40);
   const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error()),'image/jpeg',.9));download(blob,`貓咪居家環境健檢-${e.frame_id}-${item.key.slice(-12)}.jpg`);setMessage('圖片已下載至您的裝置，未另存至伺服器。');
  }finally{bitmap.close();}
 }catch{setMessage('證據圖片無法取得，可能已超過保存期限；仍可儲存文字報告。');}finally{setBusy(false);}}
 return <div className="video-report-exports"><div className="report-export-actions"><button className="primary" disabled={busy} onClick={print}>儲存圖文改善報告／PDF</button><button className="secondary" onClick={()=>download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),`貓咪居家環境健檢-${report.job_id}.json`)}>下載完整證據 JSON</button><a className="secondary" href={`/api/video-scans/${report.job_id}/report?format=meowho`} download={`Meowho-${report.job_id}.json`}>下載 Meowho JSON</a></div>
  {message&&<p role="status">{message}</p>}
  <details><summary>下載重要風險圖片（{images.length} 個閱讀群組）</summary><p className="small">每組保留一張原始環境影格；AI 估計框不是已確認的定位。圖片只下載至您的裝置。</p>{images.map(i=><div key={i.key} className="report-image-download"><span>{i.label}</span><button className="secondary" disabled={busy||!i.representative.frame_path} onClick={()=>image(i)}>{i.representative.frame_path?'下載關鍵圖片':'無可用圖片'}</button></div>)}</details>
 </div>;
}
