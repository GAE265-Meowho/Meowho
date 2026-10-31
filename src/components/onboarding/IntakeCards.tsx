"use client";
/* eslint-disable @next/next/no-img-element */
// 新增貓咪最後的確認名片：每一欄都能直接改；AI 猜的欄位標「請確認」。
import { LIFE_STAGES } from "@/lib/cat-profile/life-stage";
import { HEALTH_TAGS, PERSONALITY_TAGS } from "@/lib/cat-profile/tags";
import {
  canCreateCat, confirmField, removeMedia, setCatField, setCover,
  type IntakeState, type PendingField,
} from "@/lib/onboarding/conversation";
import CatButton from "../ui/CatButton";
import Icon from "../ui/Icon";
import s from "./intake.module.css";

type Update = (next: IntakeState) => void;

function Confirm({ state, field, onChange }: { state: IntakeState; field: PendingField; onChange: Update }) {
  if (!state.pending.includes(field)) return null;
  return (
    <span className={s.confirm}>
      請確認
      <button type="button" onClick={() => onChange(confirmField(state, field))}>沒問題</button>
    </span>
  );
}

export interface MediaPreview { url: string; kind: "photo" | "video" }

export function MediaTray({ state, previews, onChange, onRemoved }: {
  state: IntakeState; previews: Record<string, MediaPreview>; onChange: Update; onRemoved: (path: string) => void;
}) {
  const items = [...state.cat.photos, ...state.cat.videos];
  if (!items.length) return null;
  return (
    <div className={s.tray}>
      {items.map((path, i) => {
        const p = previews[path];
        const isPhoto = state.cat.photos.includes(path);
        return (
          <figure key={path} className={s.thumb} style={{ margin: 0 }}>
            {p?.kind === "video" ? <video src={p.url} muted playsInline preload="metadata" aria-label="貓咪影片" /> : p && <img src={p.url} alt="貓咪照片" />}
            {isPhoto && i === 0 && <span className={s.coverTag}>封面</span>}
            <div className={s.thumbActions}>
              {isPhoto ? (
                <button type="button" className={s.thumbBtn} aria-label="設為封面" aria-pressed={i === 0} onClick={() => onChange(setCover(state, path))}>
                  <Icon name="star" size={18} />
                </button>
              ) : <span aria-hidden="true" className={s.thumbBtn}><Icon name="video" size={18} /></span>}
              <button type="button" className={s.thumbBtn} aria-label="移除" onClick={() => { onChange(removeMedia(state, path)); onRemoved(path); }}>
                <Icon name="close" size={18} />
              </button>
            </div>
          </figure>
        );
      })}
    </div>
  );
}

function TagPicker({ legend, options, value, onPick }: { legend: string; options: readonly string[]; value: string[]; onPick: (next: string[]) => void }) {
  return (
    <div className={s.chips} role="group" aria-label={legend}>
      {options.map(t => {
        const on = value.includes(t);
        return (
          <button key={t} type="button" className={s.chip} aria-pressed={on} onClick={() => onPick(on ? value.filter(v => v !== t) : [...value, t])}>{t}</button>
        );
      })}
    </div>
  );
}

export function CatCard({ state, onChange, onCreate, saving, error, aiUsed }: {
  state: IntakeState; onChange: Update; onCreate: () => void; saving: boolean; error: string | null; aiUsed: boolean;
}) {
  const c = state.cat;
  return (
    <section className={s.card} aria-labelledby="cat-card">
      <h2 id="cat-card">{c.name.trim() ? `${c.name.trim()}的名片` : "貓咪名片"}</h2>
      {aiUsed && <p className={s.warn}>AI 判讀可能有誤，請以實際狀況為準。</p>}

      <div className={s.pair}>
        <div className={s.field}>
          <label className={s.label} htmlFor="c-name">名字</label>
          <input id="c-name" value={c.name} maxLength={30} onChange={e => onChange(setCatField(state, "name", e.target.value))} />
        </div>
        <div className={s.field}>
          <span className={s.label} id="c-sex">性別</span>
          <div className={s.chips} role="group" aria-labelledby="c-sex">
            {([["male", "男生"], ["female", "女生"], ["unknown", "不確定"]] as const).map(([v, l]) => (
              <button key={v} type="button" className={s.chip} aria-pressed={c.sex === v} onClick={() => onChange(setCatField(state, "sex", v))}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div className={s.field}>
        <span className={s.label} id="c-stage">年齡層 <Confirm state={state} field="lifeStage" onChange={onChange} /></span>
        <div className={s.chips} role="group" aria-labelledby="c-stage">
          {LIFE_STAGES.map(st => (
            <button key={st.id} type="button" className={s.chip} aria-pressed={c.lifeStage === st.id} onClick={() => onChange(setCatField(state, "lifeStage", st.id))}>{st.label}</button>
          ))}
        </div>
      </div>

      <div className={s.pair}>
        <div className={s.field}>
          <span className={s.label}><label htmlFor="c-coat">毛色花紋</label> <Confirm state={state} field="coat" onChange={onChange} /></span>
          <input id="c-coat" value={c.coat ?? ""} maxLength={40} onChange={e => onChange(setCatField(state, "coat", e.target.value || null))} />
        </div>
        <div className={s.field}>
          <span className={s.label}><label htmlFor="c-breed">品種</label> <Confirm state={state} field="breed" onChange={onChange} /></span>
          <input id="c-breed" value={c.breed ?? ""} maxLength={40} onChange={e => onChange(setCatField(state, "breed", e.target.value || null))} />
        </div>
      </div>

      <div className={s.field}>
        <span className={s.label}>個性 <Confirm state={state} field="personalityTags" onChange={onChange} /></span>
        <TagPicker legend="個性" options={PERSONALITY_TAGS} value={c.personalityTags} onPick={v => onChange(setCatField(state, "personalityTags", v))} />
      </div>

      <div className={s.field}>
        <span className={s.label}>健康狀況</span>
        <TagPicker legend="健康狀況" options={HEALTH_TAGS} value={c.healthTags} onPick={v => onChange(setCatField(state, "healthTags", v))} />
        {/* AGENTS.md §6：醫療相關內容要附聲明，一般字級、放在旁邊 */}
        <p className={s.lead}>僅供參考，非醫療建議。</p>
      </div>

      {c.timeline.length > 0 && (
        <div className={s.field}>
          <span className={s.label}>時間軸</span>
          <ol className={s.timeline}>
            {c.timeline.map((e, i) => (
              <li key={`${e.date}-${i}`}>
                <time dateTime={e.date}>{e.date.slice(5).replace("-", "/")}</time>
                <span>{e.event}</span>
                <button type="button" className={s.thumbBtn} aria-label={`移除 ${e.date} 這一筆`}
                  onClick={() => onChange({ ...state, cat: { ...c, timeline: c.timeline.filter((_, j) => j !== i) } })}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className={s.field}>
        <label className={s.label} htmlFor="c-desc">牠的故事</label>
        <textarea id="c-desc" rows={4} maxLength={2000} value={c.description ?? ""} onChange={e => onChange(setCatField(state, "description", e.target.value || null))} />
      </div>

      {error && <p className={s.error} role="alert">{error}</p>}
      <div className={s.actions}>
        <CatButton onClick={onCreate} disabled={saving || !canCreateCat(state)}>{saving ? "建立中…" : "建立貓咪"}</CatButton>
      </div>
    </section>
  );
}
