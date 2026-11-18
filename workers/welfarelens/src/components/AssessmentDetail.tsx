import type { Evidence } from '../domain/assessment';
import type { inspectionItems } from '../domain/lab-view-model';
import { PLANTS, RULES } from '../data/knowledge';
type Item = ReturnType<typeof inspectionItems>[number];
export type ConfirmFact = (index: number, key: string, value: boolean | string | null) => void;
export default function AssessmentDetail({ item, evidence, onConfirm }: { item: Item; evidence: Evidence; onConfirm?: ConfirmFact }) {
  const c = evidence.cases[item.index], f = item.finding;
  const rule = RULES.find(r => r.rule_id === c.rule_id)!;
  const control = (key: string, text: string) => {
    const fact = c.facts.find(x => x.key === key);
    return <label className="field" key={key}>{text}<select value={fact?.status === 'CONFIRMATION' ? String(fact.value) : ''}
      onChange={e => onConfirm?.(item.index, key, e.target.value === '' ? null : key === 'species' ? e.target.value : e.target.value === 'true')}>
      <option value="">{fact?.value != null ? `尚未人工確認（AI 候選：${typeof fact.value === 'boolean' ? fact.value ? '是' : '否' : fact.value}）` : '未知／尚未確認'}</option>
      {key === 'species' ? <>{PLANTS.map(p => <option key={p.scientific_name} value={p.scientific_name}>{p.label} · {p.scientific_name}</option>)}<option value="unlisted">未收錄／仍無法確認</option></> : <><option value="true">是</option><option value="false">否</option></>}
    </select></label>;
  };
  return <article className="selected-detail">
    <div className="detail-heading"><p className="muted">{item.objectName}</p><h3>{item.title}</h3></div>
    <div className="badge-row"><span className={`badge ${item.group}`}>{item.priority}</span><span className={`badge evidence-${f.status}`}>{item.evidenceLabel}</span></div>
    <p className="detail-action">{item.action}</p>
    {!c.proposal && !c.facts.some(x => x.value !== null) && <p className="notice"><strong>尚未判讀具體問題：</strong>請補拍相關物品，或手動補充可確認的條件。</p>}
    {!item.located && <p className="small">定位不足：可由清單確認，不會在照片任意框選。</p>}
    {c.rule_id === 'H02' && <p className="small">植物品種待確認時，不能直接宣告有毒或無毒；學名候選與你的確認分開保留。</p>}
    {onConfirm && f.questions.length > 0 && <details className="targeted-questions"><summary>補充會影響判斷的條件 <span className="count">{f.questions.length}</span></summary>{f.questions.map(q => control(q.key, q.text))}</details>}
    <details><summary>觀察、改善原因與位置</summary><p>{f.explanation}</p>{c.proposal && <p><strong>改善原因：</strong>{c.proposal.rationale}</p>}
      {c.proposal?.placement && <p><strong>建議位置：</strong>{c.proposal.placement.description}。入口：{c.proposal.placement.entrance}。先做：{c.proposal.placement.preparation}。現場檢查：{c.proposal.placement.checks}。</p>}
      {c.facts.filter(x => x.value !== null).map(fact => <p key={fact.key}><span className="fact-label">{fact.status === 'CONFIRMATION' ? '你的確認' : fact.status === 'INFERENCE' ? 'AI 推測' : 'AI 觀察'}</span>{fact.evidence}</p>)}
      <p><strong>可能後果：</strong>{rule.potential_consequence}</p>
    </details>
    {onConfirm && <details><summary>修正 AI 的觀察與推測</summary>{rule.required_conditions.map(r => control(r.key, r.question))}</details>}
    <details><summary>專業依據與判斷限制</summary><a href={f.source_url} target="_blank" rel="noreferrer">查看專業資料 ↗</a><p>{f.source_section}</p><p className="small">依單貓基準延伸的配置評估，非官方認證。嚴重程度：{f.severity === 'high' ? '高' : '中'}；證據充分程度：{f.evidence_sufficiency}；判斷信心：{f.judgment_confidence}（非危險機率）。</p>{f.limitations.map(l => <p className="small" key={l}>{l}</p>)}</details>
  </article>;
}
