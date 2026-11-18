import type { Evidence } from '../domain/assessment';
import { buildRoomPlan } from '../domain/room-improvement';
import type { Candidate } from '../domain/schema';
import { useEffect, useRef } from 'react';

export default function PreparationReport({ evidence, objects=[] }: { evidence: Evidence; objects?: Candidate['objects'] }) {
  const plan = buildRoomPlan(evidence, objects);
  const report = useRef<HTMLElement>(null);
  useEffect(() => {
    let saved: { element: HTMLDetailsElement; open: boolean }[] | null = null;
    const expand = () => {
      if (saved) return;
      saved = Array.from(report.current?.querySelectorAll('details') ?? []).map(element => ({element, open:element.open}));
      saved.forEach(({element}) => {element.open = true;});
    };
    const restore = () => {saved?.forEach(({element,open}) => {element.open = open;}); saved = null;};
    const media = window.matchMedia('print');
    const changed = () => media.matches ? expand() : restore();
    window.addEventListener('beforeprint', expand);
    window.addEventListener('afterprint', restore);
    media.addEventListener('change', changed);
    return () => {
      restore(); window.removeEventListener('beforeprint', expand); window.removeEventListener('afterprint', restore); media.removeEventListener('change', changed);
    };
  }, []);
  return <section ref={report} className="preparation-report" aria-label="領養前準備計畫">
    <div className="report-heading"><span className="report-mark">貓咪居家環境健檢</span><h2>房間改善計畫</h2><p>單貓版 · 依本次照片與 14 項照護指引整理</p></div>
    <div className="report-grid">
      <section><h3>建議改善</h3>{plan.actions.length ? <ol>{plan.actions.map(a => <li key={a.index}><strong>{a.title}</strong><p>{a.action}</p>{a.placement && <p className="small">候選位置：{a.placement.description}；入口：{a.placement.entrance}。先做：{a.placement.preparation}。現場檢查：{a.placement.checks}。</p>}<span className="badge">準備事項 · 尚未完成</span></li>)}</ol> : <p>尚無具體改善建議，請補拍相關位置或手動補充。</p>}</section>
      <section><h3>實施前查證</h3><p className="small">不阻擋查看建議；這些條件需在實際施工或採購前查證，AI 改圖不能替代。</p>{plan.confirmations.length ? <ul>{plan.confirmations.map(q => <li key={`${q.index}-${q.key}`}><strong>{q.title}</strong><p>{q.text}</p></li>)}</ul> : <p>本次規則未產生待補充問題；未拍到的部分仍未評估。</p>}</section>
    </div>
    <details className="report-unassessed"><summary>尚未評估 <span className="count">{plan.unassessed.length} 項基準未涵蓋</span></summary><p>單張照片與現有回報不涵蓋全屋或日常照護。以下項目尚無本次場景評估：</p><div className="topic-list">{plan.unassessed.map(r => <span key={r.rule_id}>{r.title}</span>)}</div></details>
    <details className="report-sources"><summary>詳細依據與原始觀察</summary>{plan.findings.map((f,i) => <article key={f.id}><h4>{f.rule_id === 'H02' ? '植物品種與接觸' : f.title}</h4><p>{f.explanation}</p>{evidence.cases[i].facts.map(fact => <p key={fact.key}>{fact.status === 'UNKNOWN' ? '未知' : fact.status === 'CONFIRMATION' ? '使用者確認' : fact.status === 'INFERENCE' ? 'AI 推測' : 'AI 觀察'}：{fact.evidence}</p>)}<a href={f.source_url} target="_blank" rel="noreferrer">{f.source_url}</a><p className="small">{f.source_section}</p></article>)}</details>
    <p className="report-disclaimer">改善示意僅供規劃，實際結果需要現場確認。AI 觀察不是事實保證；假設不代表現實已完成。未拍到不代表不存在，植物品種未確認不能直接判定毒性。本工具不提供獸醫診斷或居家安全認證。列印報告與 JSON 不包含原始照片。</p>
  </section>;
}
