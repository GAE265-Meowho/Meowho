import React from 'react';
import {buildWelfareLensReport,type WelfareLensReportV1} from '../domain/welfare-report.ts';
import {buildVisualReport,type VisualReport} from '../domain/visual-report.ts';
import type {IssueReport} from '../domain/video-issues';
import VisualReportFigure from './VisualReportFigure';
const stamp=(t:number)=>`${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')}`;
/** Dedicated print projection; raw evidence is exported as JSON, not repeated on paper. */
export default function VideoPrintReport({report,analysisStatus,welfareReport,visualReport}:{report:IssueReport;analysisStatus:string;welfareReport?:WelfareLensReportV1;visualReport?:VisualReport}){
 const canonical=welfareReport??buildWelfareLensReport(report,analysisStatus==='complete'?'complete':'incomplete',0);
 const v=visualReport??buildVisualReport(report,canonical,{video_id:report.video_id,created_at:canonical.generated_at,expires_at:0,frames:[],model:'',metadata:undefined,metrics:undefined});
 const groups=v.reading_groups.filter(g=>g.issue_keys.some(k=>v.issues.find(i=>i.key===k)?.category!=='ENRICHMENT_ADVICE'));
 const pages=Array.from({length:Math.ceil(groups.length/2)},(_,n)=>groups.slice(n*2,n*2+2));
 return <section className="video-print-report" aria-label="影片改善計畫列印版">
  <section className="visual-report-overview"><span className="visual-report-brand">居家照護改善報告</span><h1>貓咪居家環境健檢</h1>
   <p>分析日期：{canonical.generated_at?new Date(canonical.generated_at).toLocaleDateString('zh-TW',{timeZone:'Asia/Taipei'}):'未提供'} · 影片長度：{v.analysis_metadata.duration_seconds===null?'未提供':`${v.analysis_metadata.duration_seconds.toFixed(1)} 秒`}</p>
   <p>分析範圍：{v.analysis_metadata.sampled_times.length} 個抽樣時間點，非連續監測。</p>
   <div className="visual-report-counts"><strong>{v.summary.priority} 項優先改善</strong><span>{v.summary.attention} 項留意與預防</span><span>{v.summary.care} 個照護主題</span></div>
   <h2>先做這三件事</h2>{v.summary.top_issue_keys.map((key,n)=>{const i=v.issues.find(i=>i.key===key)!;return <article className="visual-report-top" key={key}><span>{n+1}</span><div><h3>{i.label}</h3><p>{i.action}</p><small>證據 {stamp(i.representative.timestamp)}</small></div></article>;})}
   {!v.issues.length&&<p>目前沒有可用改善項目；不代表未拍到的區域安全。</p>}
   {v.summary.attention>0&&<p>需要留意：{[...new Set(v.issues.filter(i=>i.category==='NEEDS_CONFIRMATION').map(i=>i.label))].join('、')}。請依後續圖文卡片採取適當預防。</p>}
   <aside>{v.limitations.map(t=><p key={t}>{t}</p>)}{report.source==='legacy_limited'&&<p>舊版相容報告，缺少物件身分；未推測跨影格同物。</p>}</aside>
  </section>
  {pages.map((page,n)=><section className="visual-report-sheet" key={n}><h2>重要風險與改善 · {n+1}</h2>{page.map(g=>{const items=g.issue_keys.map(k=>v.issues.find(i=>i.key===k)!);return <article className="visual-report-card" key={g.key} data-issue-keys={g.issue_keys.join(',')}><h3>{g.title}</h3>{g.relation!=='single'&&<p className="visual-related">可能相關的發現；未確認同一物件，各項判斷完整保留於 JSON。</p>}<div className="visual-report-card-body"><VisualReportFigure item={items[0]}/><div>{items.map(i=><section className="video-print-issue" key={i.key}><h4>{items.length>1?i.label:'看見的情況'}</h4><p><strong>觀察：</strong>{i.facts[0]}</p><p className="visual-report-action"><strong>改善：</strong>{i.action}</p>{[...new Set(v.observations.filter(o=>i.evidence.some(e=>e.observation_id===o.observation_id)).map(o=>o.recommendation))].filter(a=>a!==i.action).map(a=><p key={a} className="visual-report-alternative">補充行動：{a}</p>)}{i.uncertainty.length>0&&<p className="visual-report-unknown">尚未確認：{i.uncertainty[0]}</p>}<small>證據時間：{i.evidence.map(e=>stamp(e.timestamp)).join('、')}</small></section>)}</div></div></article>;})}</section>)}
  {v.care_topics.length>0&&<section className={pages.at(-1)?.length===1?"visual-report-care":"visual-report-sheet visual-report-care"}><h2>讓貓咪住得更自在</h2><p>以下是可考慮的照護機會，不代表已確認缺少資源；未拍到不等於全屋沒有。</p>{v.care_topics.map(t=><article className="video-print-issue" key={t.issue_key}><h3>{t.label}</h3><p>{t.action}</p></article>)}<h2>專業照護資料</h2>{[...new Set(v.issues.flatMap(i=>i.sources))].map(s=><p className="video-print-source" key={s}>{s}</p>)}<p>完整觀察、風險推論、植物候選與證據時間，請另存「完整證據 JSON」。</p></section>}
 </section>;
}
