import type { Scene, SceneObject } from "../domain/schema";
import { LABELS } from "../domain/editor";
import { ObjectDetails } from "./Fields";
import PhotoEditor from "./PhotoEditor";
import AssessmentPanel from "./AssessmentPanel";
import { RULES } from "../data/knowledge";
import GuidanceReference from "./GuidanceReference";
import type { Evidence } from "../domain/assessment";
import type { Candidate } from "../domain/schema";
export type AnalysisInfo = {
  questions: string[];
  limitations: string[];
  latencyMs?: number;
  usage?: { prompt_tokens: number; completion_tokens: number } | null;
};
type Props = {
  scene: Scene;
  photo: string;
  selected: string;
  kind: SceneObject["kind"];
  info: AnalysisInfo | null;
  onKind: (k: SceneObject["kind"]) => void;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onPatch: (patch: Partial<SceneObject>) => void;
  onDelete: () => void;
  onBack: () => void;
  onNext: () => void;
  onAddAssessment?: (id:string)=>void;
  evidence?: Evidence | null;
  captureObjects?: Candidate["objects"];
  onConfirmEvidence?: (
    index: number,
    key: string,
    value: boolean | string | null,
  ) => void;
};
export default function ConfirmStep({
  scene,
  photo,
  selected,
  kind,
  info,
  onKind,
  onAdd,
  onSelect,
  onPatch,
  onDelete,
  onBack,
  onNext,
  evidence,
  captureObjects,
  onConfirmEvidence, onAddAssessment,
}: Props) {
  const object = scene.objects.find((o) => o.id === selected);
  return (
    <section className="panel">
      <div className="section-heading">
        <div>
          <h2>這個房間，可以這樣改善</h2>
        </div>
      </div>
      <p className="section-intro">點選照片中的物品，查看具體改善建議、原因與依據。可直接產生改善對照，不必逐項確認；看錯的地方可展開選用工具修正。</p>
      {(
        <AssessmentPanel
          photo={photo}
          evidence={evidence ?? {version:1,capture_id:'manual-photo',mode:'OBSERVED',cases:[]}}
          objects={captureObjects}
          onConfirm={onConfirmEvidence}
        />
      )}
      <div className="support-tools"><details><summary>補充照片未涵蓋的照護項目</summary><label className="field">人工新增單貓評估<select value="" onChange={e=>{if(e.target.value)onAddAssessment?.(e.target.value)}}><option value="">選擇照片中相關或想補充的項目</option>{RULES.map(r=><option key={r.rule_id} value={r.rule_id}>{r.title}</option>)}</select></label><GuidanceReference/></details>
      <details open={!evidence} className="manual-scene-tools">
        <summary>人工標記與完整條件工具（選用）</summary>
        <p className="small">
          點選物件框或下方清單；直接在照片拖動或重畫。躲藏處請自行指定，改善位置另以提案呈現，不當作已存在的物件。
        </p>
        <div className="editor-grid">
          <div>
            <PhotoEditor
              photo={photo}
              objects={scene.objects}
              selected={selected}
              onSelect={onSelect}
              onBox={(bbox) => onPatch({ bbox })}
            />
            <div className="add-row">
              <label className="field">
                新增物件
                <select
                  value={kind}
                  onChange={(e) =>
                    onKind(e.target.value as SceneObject["kind"])
                  }
                >
                  {Object.entries(LABELS).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" onClick={() => onAdd()}>
                ＋ 新增標記
              </button>
            </div>
            <div className="object-list" aria-label="物件清單">
              {scene.objects.map((o) => (
                <button
                  className={selected === o.id ? "selected" : ""}
                  key={o.id}
                  aria-pressed={selected === o.id}
                  onClick={() => onSelect(o.id)}
                >
                  {o.label}
                  <small>
                    {o.status === "Observation" ? "AI 候選" : "人工確認"}
                  </small>
                </button>
              ))}
            </div>
          </div>
          <aside>
            {object ? (
              <ObjectDetails
                object={object}
                onUpdate={onPatch}
                onDelete={onDelete}
              />
            ) : (
              <div className="empty-detail">
                <h3>從一個物件開始</h3>
                <p>選取或新增標記，再確認照片無法回答的條件。</p>
              </div>
            )}
          </aside>
        </div>
        {info && (
          <details>
            <summary>本次 AI 觀察的問題與限制</summary>
            <ul>
              {[...info.questions, ...info.limitations].map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            <p className="small">
              Azure・{info.latencyMs} ms；tokens：
              {info.usage
                ? `${info.usage.prompt_tokens} 輸入 / ${info.usage.completion_tokens} 輸出`
                : "未提供"}
              。非校準信心或危險機率。
            </p>
          </details>
        )}
      </details>
      </div>
      <div className="bottom-actions">
        <button className="secondary" onClick={() => onBack()}>
          ← 返回照片
        </button>
        <button className="primary" onClick={() => onNext()}>
          產生改善對照 →
        </button>
      </div>
    </section>
  );
}
