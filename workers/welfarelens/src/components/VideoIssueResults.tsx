"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import type {IssueReport,AggregatedIssue} from '../domain/video-issues';
import type {VideoJob} from '../domain/video';
import {buildVideoResultView} from '../domain/video-issue-view';
import type {ReadingGroup} from '../domain/video-issue-view';
import VideoEvidenceViewer,{videoStamp} from './VideoEvidenceViewer';
import {z} from 'zod';
import {ConfirmedCropSchema,buildWelfareLensReport,type ConfirmedCrop} from '../domain/welfare-report';
import {approximateObjectHint} from '../domain/approximate-location';
import VideoPrintReport from './VideoPrintReport';
import VideoReportExports from './VideoReportExports';
import {buildVisualReport} from '../domain/visual-report';
const labels={PRIORITY_ACTION:'優先改善',NEEDS_CONFIRMATION:'需要留意，尚未確定',ENRICHMENT_ADVICE:'可考慮的照護機會'};
export default function VideoIssueResults({report,job,preview,onMediaError}:{report:IssueReport;job:Omit<VideoJob,'owner_hash'>;preview:string;onMediaError:()=>void}){
 const [crops,setCrops]=useState<ConfirmedCrop[]>([]);
 useEffect(()=>{let alive=true;fetch(`/api/video-scans/${job.video_id}/crops`).then(r=>r.ok?r.json():[]).then(v=>{const p=z.array(ConfirmedCropSchema).safeParse(v);if(alive&&p.success)setCrops(p.data);}).catch(()=>{});return()=>{alive=false;};},[job.video_id]);
 const canonical=useMemo(()=>buildWelfareLensReport(report,job.analysis_status==='complete'?'complete':'incomplete',job.created_at,crops),[report,job.analysis_status,job.created_at,crops]);
 const visual=useMemo(()=>buildVisualReport(report,canonical,job),[report,canonical,job]);
 const view=useMemo(()=>buildVideoResultView(report,job.analysis_status),[report,job.analysis_status]),[selectedId,setSelectedId]=useState(report.issues[0]?.issue_id),[evidenceId,setEvidenceId]=useState<string>(),heading=useRef<HTMLHeadingElement>(null),workspace=useRef<HTMLDivElement>(null);
 const issue=report.issues.find(i=>i.issue_id===selectedId)??report.issues[0];
 const evidence=issue?.evidence.find(e=>e.observation_id===evidenceId)??issue?.evidence[0];
 const group=[...view.priorityGroups,...view.needsGroups,...view.preventionGroups].find(g=>g.issues.some(i=>i.issue_id===issue?.issue_id));
 const related=group?.issues??(issue?[issue]:[]),groupEvidence=related.flatMap(i=>i.evidence).sort((a,b)=>a.timestamp-b.timestamp);
 const observations=report.observations.filter(o=>related.some(i=>i.observation_ids.includes(o.observation_id)));
 const selectedObservations=observations.filter(o=>issue?.observation_ids.includes(o.observation_id));
 const label=(i:AggregatedIssue)=>view.prevention.some(p=>p.issue_id===i.issue_id)?'一般預防準備':labels[i.category];
 function choose(i:AggregatedIssue){setSelectedId(i.issue_id);setEvidenceId(i.evidence[0].observation_id);requestAnimationFrame(()=>{heading.current?.focus({preventScroll:true});workspace.current?.scrollIntoView({block:'start',behavior:'instant'});});}
 function rows(items:AggregatedIssue[]){return items.map(i=><article key={i.issue_id} className={`video-issue-row ${issue?.issue_id===i.issue_id?'selected':''}`}><button onClick={()=>choose(i)} aria-label={`選取 ${i.title}`} aria-pressed={issue?.issue_id===i.issue_id}><strong>{i.title}</strong><span>{labels[i.category]} · {videoStamp(i.evidence[0].timestamp)}</span></button></article>);}
 function groupRows(items:ReadingGroup[]){return items.map(g=><article key={g.id} className={`video-issue-row ${g.issues.some(i=>i.issue_id===issue?.issue_id)?'selected':''}`}><button onClick={()=>choose(g.issues[0])} aria-label={`選取 ${g.title}`} aria-pressed={g.issues.some(i=>i.issue_id===issue?.issue_id)}><strong>{g.title}</strong><span>{label(g.issues[0])} · {g.issues.length>1?`${g.issues.length} 筆可能相關發現 · `:''}{[...new Set(g.issues.flatMap(i=>i.evidence.map(e=>videoStamp(e.timestamp))))].join('、')}</span></button></article>);}
 return <section className="video-results video-issue-results" aria-label="影片掃描結果">
  {report.match_evidence.some(m=>m.kind==='test_ground_truth')&&<p className="video-warning">本機重建資料預覽；同物配對採測試標註，非本次 AI 辨識結果。</p>}
  <header className="issue-summary"><span className="eyebrow">先處理這幾件事</span><h2>影片改善摘要</h2><p>{view.priority.length} 項優先改善 · {view.needs.length} 項需要留意 · {view.prevention.length>0?`${view.prevention.length} 項一般預防 · `:''}{view.care.length} 個照護主題</p>{job.analysis_status!=='complete'&&<p className="video-partial">報告包含尚未釐清的項目；未判讀的畫面不代表安全。</p>}
   {view.summary.length>0&&<div className="issue-summary-actions" aria-label="最值得注意的問題">{view.summary.map((i,n)=><button key={i.issue_id} onClick={()=>choose(i)} aria-pressed={issue?.issue_id===i.issue_id}><span>{n+1}</span><strong>{i.title}</strong><small>{labels[i.category]} · {videoStamp(i.evidence[0].timestamp)}</small><p>{i.recommendation}</p></button>)}</div>}
   {view.extraImportant>0&&<a href="#video-all-issues" className="text-button">查看其餘 {view.extraImportant} 項發現與預防建議</a>}
  </header>
  {report.source==='legacy_limited'&&<p className="video-warning">這是舊版事件的相容報告，缺少物件身分及規則欄位；保留原文，不推測跨影格同一性。</p>}
  {view.identityLimited&&<p className="small">相似提醒整理成閱讀群組；不代表已確認為同一物件，每筆發現與證據均保留。</p>}
  {!preview&&<p className="small">{job.original_deleted?'原片已清除，以下保留事件截圖與改善建議。':'此頁沒有本機影片預覽，仍可查看證據截圖；伺服器保存狀態以工作紀錄為準。'}</p>}
  {issue?<div className="video-result-grid" ref={workspace}>
   <VideoEvidenceViewer approximateHint={issue?approximateObjectHint(issue,evidence,report.observations.find(o=>o.observation_id===evidence?.observation_id),job.frames.find(f=>f.frame_id===evidence?.frame_id)):null} confirmedCrop={crops.filter(c=>c.region.issue_id===issue.issue_id&&c.region.observation_id===evidence?.observation_id).sort((a,b)=>b.created_at-a.created_at)[0]} issueId={issue.issue_id} videoId={job.video_id} preview={preview} evidence={evidence} locationText={observations.find(o=>o.observation_id===evidence?.observation_id)?.observation??issue.observation} onEvidence={e=>setEvidenceId(e.observation_id)} onMediaError={onMediaError}/>
   <article className="video-event-card selected video-selected-issue" aria-label="目前選取的問題">
    <span className="finding-kind">{label(issue)}</span><h3 ref={heading} tabIndex={-1}>{issue.title}</h3>
    <p><strong>看見：</strong>{issue.observation}</p><div className="issue-action"><span>主要改善行動</span><p>{issue.recommendation}</p></div>
    {issue.identity_status==='care_theme'&&<p className="small">依照護主題整理各位置的機會，不代表已確認缺少資源，也不表示是同一件家具。</p>}
    {related.length>1&&<p className="small">{related.length} 筆可能相關的發現，未確認同物{group?.relation==='candidate_topic'?'或相同植物品種':''}。選時間查看各筆原始判斷。</p>}
    <div className="issue-time-chips" aria-label="選取問題的證據時間">{[...new Map(groupEvidence.map(e=>[e.observation_id,e])).values()].map(e=><button key={e.observation_id} className={evidence?.observation_id===e.observation_id?'active':''} aria-pressed={evidence?.observation_id===e.observation_id} aria-label={`查看證據 ${videoStamp(e.timestamp)}`} onClick={()=>{const owner=related.find(i=>i.observation_ids.includes(e.observation_id));if(owner)setSelectedId(owner.issue_id);setEvidenceId(e.observation_id);}}>{videoStamp(e.timestamp)}</button>)}</div>
    {selectedObservations.some(o=>o.facts?.some(f=>f.status==='INFERENCE'))&&<p className="small"><strong>推論：</strong>{selectedObservations.flatMap(o=>o.facts??[]).find(f=>f.status==='INFERENCE')?.evidence}</p>}
    {issue.unknown.length>0&&<p className="small"><strong>尚未確認：</strong>{selectedObservations.flatMap(o=>o.facts??[]).find(f=>f.status==='UNKNOWN')?.evidence??(selectedObservations.some(o=>o.plant)?'植物候選未經定種，毒性不能由外觀單獨確認。':'實際接觸、使用狀態及設施可靠性未經現場查核。')}</p>}
    <details key={issue.issue_id}><summary>詳細證據、不同建議與來源</summary>
     <p>{issue.priority_reason}</p>{issue.identity_status==='supported'&&<p>依可靠影像身分證據整合；原始觀察完整保留。</p>}
     {[...new Set(observations.map(o=>o.recommendation))].map(action=><p key={action}>{action}</p>)}
     {issue.unknown.map(u=><p key={u} className="small">尚未確定：{u}</p>)}
     {observations.map(o=><section key={o.observation_id} className="issue-original"><h4>{videoStamp(o.timestamp)} · {o.object_label??o.title}</h4><p>{o.observation}</p><p>{o.potential_risk}</p><p>{o.recommendation}</p>{o.plant&&<p className="small">植物候選（未經人工定種）：{o.plant.candidates.map(p=>`${p.common_name}（${p.scientific_name}）`).join('、')||'影像尚不支持具體候選'}</p>}{o.facts&&<details><summary>影像事實與推論記錄</summary>{o.facts.map(f=><p key={f.key}>{f.status==='OBSERVATION'?'影像觀察':f.status==='INFERENCE'?'推論':'未確定條件'}：{f.evidence}</p>)}</details>}</section>)}
     {issue.sources.map((s,n)=><a key={s} href={s} target="_blank" rel="noreferrer">照護資料來源 {n+1}</a>)}
     {report.match_evidence.filter(m=>issue.match_ids.includes(m.id)).map(m=><p key={m.id} className="small">同一性依據：{m.provenance}</p>)}
    </details>
    <a className="text-button issue-back-link" href="#video-evidence">回到證據畫面</a>
   </article>
  </div>:<p role="status">{view.emptyMessage}</p>}
  <div className="issue-groups" id="video-all-issues">
   {view.priority.length>0&&<section><h3>優先改善（{view.priority.length}）</h3>{view.priorityGroups.length<view.priority.length&&<p className="small">按 {view.priorityGroups.length} 個閱讀群組查看，保留 {view.priority.length} 項獨立判斷。</p>}{groupRows(view.priorityGroups.slice(0,3))}{view.priorityGroups.length>3&&<details><summary>另有 {view.priorityGroups.length-3} 項優先改善</summary>{groupRows(view.priorityGroups.slice(3))}</details>}</section>}
   {view.needs.length>0&&<section><h3>需要留意，尚未確定（{view.needs.length}）</h3>{view.needsGroups.length<view.needs.length&&<p className="small">按 {view.needsGroups.length} 個閱讀群組查看；植物候選不代表定種。</p>}{groupRows(view.needsGroups.slice(0,3))}{view.needsGroups.length>3&&<details><summary>另有 {view.needsGroups.length-3} 項需要留意</summary>{groupRows(view.needsGroups.slice(3))}</details>}</section>}
   {view.prevention.length>0&&<details className="issue-care"><summary>一般預防準備（{view.prevention.length} 項）</summary><p>日常固定與收納建議，不代表照片已證實家具不穩。</p>{groupRows(view.preventionGroups)}</details>}
   {view.care.length>0&&<details className="issue-care"><summary>其他照護建議（{view.care.length} 個主題）</summary><p>可選的照護機會，不當作已確認的環境缺失。</p>{rows(view.care)}</details>}
  </div>
  <details className="issue-scope"><summary>分析範圍、原始觀察與限制</summary>{job.warning.map(w=><p key={w}>{w}</p>)}<p>保留 {report.observations.length} 筆原始觀察，整理為 {report.issues.length} 項問題或照護主題。此數量不代表不同危險物件的數量。</p><p>本次 AI 觀察及推論未經人工查核，抽樣間隔及未看到的區域仍可能有問題；不提供居家安全認證。</p><details><summary>全部原始觀察（可追溯）</summary>{report.observations.map(o=><p key={o.observation_id}>{videoStamp(o.timestamp)} · {o.title}：{o.observation}；{o.recommendation}</p>)}</details></details>
  <VideoReportExports report={visual}/>
  <VideoPrintReport visualReport={visual} welfareReport={canonical} report={report} analysisStatus={job.analysis_status}/>
 </section>;
}
