import { useEffect, useState } from 'react';
import type { Evidence } from '../domain/assessment';
import type { Candidate } from '../domain/schema';
import type { ImageResult } from '../domain/image-result';
import { buildRoomPlan } from '../domain/room-improvement';
import PreparationReport from './PreparationReport';
export default function ImageComparison({ photo, evidence, objects, result, consent, busy, error, onConsent, onGenerate, onCancel, quick = false, targets }: {
    quick?: boolean;
    targets?: string[];
    photo: string;
    evidence: Evidence;
    objects: Candidate['objects'];
    result: ImageResult | null;
    consent: boolean;
    busy: boolean;
    error: string;
    onConsent: (value: boolean) => void;
    onGenerate: () => Promise<void>;
    onCancel: () => void;
}) {
    const [view, setView] = useState('before');
    useEffect(() => { if (result)
        setView('after'); }, [result]);
    const plan = buildRoomPlan(evidence, objects);
    const editTitles = targets ?? plan.visualEdits.map(a => a.title);
    const canEdit = editTitles.length > 0;
    return <div className="direct-comparison">
  <div className="image-edit-controls">
   <h3>把改善建議，變成看得見的空間</h3>
   <p>AI 將依本次建議編輯原照片：{editTitles.join('、') || '目前沒有可定位的具體修改'}。未可靠辨識的植物保留。</p>
   <p className="small">生成會另外將這張照片及具體修改清單傳送至你設定的 Azure 影像服務，點選產生即同意傳送，一次一張，可能產生費用。AI 圖片僅為改善構想，不代表現實完成。</p>
   {!quick && <label className="checkline"><input type="checkbox" checked={consent} disabled={busy} onChange={e => onConsent(e.target.checked)}/>我同意將此照片與改善清單傳送至 Azure 產生改善圖片</label>}
   <div className="row"><button className="primary" disabled={(!quick && !consent) || busy || !canEdit} onClick={() => void onGenerate()}>{busy ? '正在編輯照片…' : result ? '重新產生改善圖片' : quick ? '一鍵產生改善圖片' : '使用 AI 產生改善圖片'}</button>{busy && <button className="secondary" onClick={onCancel}>取消等待</button>}</div>
   {busy && <p role="status">正在編輯實際照片，可能需要數分鐘。取消等待不保證 Azure 停止計費；不會自動重試。</p>}
   {error && <p role="alert" className="notice">{error}</p>}
   {!canEdit && <p className="notice">本次建議仍需補拍或確認位置，暫不生成任意改裝；可以直接輸出改善計畫。</p>}
  </div>
  {(!quick || result) && <><div className="comparison-toggle" aria-label="改善前後照片"><button aria-pressed={view === 'before'} onClick={() => setView('before')}>原始照片</button><button aria-pressed={view === 'after'} onClick={() => setView('after')}>改善構想</button></div>
  <div className="photo-comparison actual-comparison">
   <article className={view === 'before' ? '' : 'hidden-on-mobile'}><h3>Before · 原始照片</h3><div className="comparison-image"><img src={photo} alt="改善前的原始照片"/></div></article>
   <article className={view === 'after' ? '' : 'hidden-on-mobile'}><h3>After · AI 改善構想圖</h3>{result ? <><div className="comparison-image generated-concept"><span className="simulation-watermark">AI 改善構想 · SIMULATED</span><img src={result.imageDataUrl} alt="AI 生成的改善構想圖"/></div><p className="small">依 {result.changes.length} 項具體修改生成 · {(result.latencyMs / 1000).toFixed(1)} 秒。圖片不代表現實已完成改善。</p></> : <div className="after-empty"><span aria-hidden="true">✧</span><h4>尚未產生改善圖片</h4><p>同意影像編輯後，按下產生圖片。此處會顯示 AI 編輯的結果。</p></div>}</article>
  </div>
  </>}
  {result && <aside className="generation-changes"><h3>這張構想圖的修改目標</h3><p className="small">以下是送給影像模型的目標，仍需對照圖片檢查是否正確呈現。</p><ul>{result.changes.map((c, i) => <li key={i}><strong>{c.title}</strong>：{c.action}</li>)}</ul></aside>}
  {!quick && <PreparationReport evidence={evidence} objects={objects}/>}
 </div>;
}
