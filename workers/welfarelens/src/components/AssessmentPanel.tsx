import { useState } from 'react';
import type { Evidence } from '../domain/assessment';
import type { Candidate } from '../domain/schema';
import { inspectionItems } from '../domain/lab-view-model';
import RoomPhoto from './RoomPhoto';
import DetailSheet from './DetailSheet';
import AssessmentDetail from './AssessmentDetail';
import type { ConfirmFact } from './AssessmentDetail';
export default function AssessmentPanel({ evidence, photo, objects = [], onConfirm }: {
  evidence: Evidence; photo: string; objects?: Candidate['objects']; onConfirm?: ConfirmFact;
}) {
  const items = inspectionItems(evidence, objects);
  const [active, setActive] = useState(0), [sheet, setSheet] = useState(false);
  const [filter, setFilter] = useState('all');
  const current = items[active] ?? items[0];
  const select = (index: number) => { setActive(index); if (window.matchMedia('(max-width:700px)').matches) setSheet(true); };
  const counts = items.filter(i => evidence.cases[i.index].proposal || i.finding.status !== 'NO_RISK_IDENTIFIED').length;
  return <section className="assessment-panel" aria-label="照片的初步環境評估">
    {!items.length && <p className="notice">這張照片還沒有足夠資訊。可以換一個角度補拍，或直接手動補充。</p>}
    <div className="assessment-layout">
      <div className="assessment-photo-column"><RoomPhoto photo={photo} evidence={evidence} objects={objects} active={current?.index} onActivate={select}/>
        <p className="small photo-help">點選物品看建議。AI 框為候選位置，可在人工工具校正；未拍到不代表不存在。</p>
      </div>
      <div className="inspection-sidebar">
        <div className="inspection-list"><div className="list-heading"><h3>本次改善建議</h3><span role="status">{counts} 項建議與查證事項</span></div>
          <div className="filter-bar" aria-label="評估分類">{[['all','全部'],['safety','安全優先'],['resources','生活改善']].map(([value,label]) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>
          <div className="assessment-items">{items.filter(i => filter === 'all' || i.group === filter).map(item => <button type="button" className="inspection-item" key={item.index} aria-label={`查看${item.title}`} aria-pressed={current?.index === item.index} onClick={() => select(item.index)}>
            <span className="item-symbol" aria-hidden="true">{item.group === 'safety' ? '◇' : '⌂'}</span><span className="item-copy"><strong>{item.title}</strong><small>{item.objectName}</small><small>{item.summary}。</small></span><span className={`badge evidence-${item.finding.status}`}>{item.evidenceLabel}</span><span aria-hidden="true">›</span>
          </button>)}</div>
          {items.length > 0 && !items.some(i => filter === 'all' || i.group === filter) && <p className="small">此類別尚無評估；不代表全屋已符合需求。</p>}
        </div>
        {current && <div className="desktop-detail" role="region" aria-label="所選項目詳情"><AssessmentDetail item={current} evidence={evidence} onConfirm={onConfirm}/></div>}
      </div>
    </div>
    <DetailSheet open={sheet} onClose={() => setSheet(false)}>{current && <AssessmentDetail item={current} evidence={evidence} onConfirm={onConfirm}/>}</DetailSheet>
  </section>;
}
