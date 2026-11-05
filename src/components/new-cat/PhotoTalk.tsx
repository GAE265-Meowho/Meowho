"use client";
/* eslint-disable @next/next/no-img-element */
// 新增送養貓的第 1、2 步（#206）：上傳照片（正面、側面、背面三張必填＋最多 6 張更多照片、選封面）、說說牠的故事（口述或貼上 → 填進表格，中途再補）
import { useEffect, useRef, useState } from "react";
import { HEALTH_TAGS } from "@/lib/cat-profile/tags";
import { ANGLE_KEYS, ANGLE_NAME, MAX_LIFE_PHOTOS, coverPath, type AngleKey, type Cover } from "@/lib/cat-profile/new-cat";
import { ORIGIN_LABEL, touched, withAge, type NewCatForm, type Origin } from "@/lib/onboarding/new-cat-form";
import { MIC_UNSUPPORTED, micErrorMessage } from "@/lib/onboarding/speech";
import Required from "../ui/Required";
import { AngleGuide, Field, MicIcon, PlusIcon, Said, Seg, Toggles } from "./parts";
import s from "./newcat.module.css";

type Set = (fn: (f: NewCatForm) => NewCatForm) => void;
const HINT: Record<AngleKey, string> = { front: "看得到臉", left: "拍到四隻腳", back: "看得到尾巴" };

export function PhotoStep({ form, previews, pendingAngles, pendingOthers, onAngle, onOthers, onRemoveOther, onCover }: {
  form: NewCatForm; previews: Record<string, string>; pendingAngles: readonly AngleKey[]; pendingOthers: number;
  onAngle: (k: AngleKey, file: File) => void; onOthers: (files: File[]) => void; onRemoveOther: (i: number) => void; onCover: (c: Cover) => void;
}) {
  const cover = coverPath(form.cover, form.angles, form.others);
  const coverBtn = (key: Cover, path: string) => (
    <button type="button" className={s.setCover} aria-pressed={cover === path} onClick={e => { e.preventDefault(); onCover(key); }}>
      {cover === path ? "封面" : "設為封面"}
    </button>
  );
  return (
    <>
      <h2 className={s.h1}>上傳貓咪的可愛照片</h2>
      <p className={s.lead}>我們會用這三張做出牠的 3D 模樣；正面和背面沒拍的話，AI 會補。</p>
      <div className={s.angles}>
        {ANGLE_KEYS.map(k => {
          const path = form.angles[k];
          const pending = pendingAngles.includes(k);
          return (
            <label key={k} className={`${s.slot} ${path ? s.has : ""}`} aria-busy={pending}>
              {path ? <img src={previews[path] ?? ""} alt={`${ANGLE_NAME[k]}照片`} /> : <AngleGuide kind={k} />}
              <b>{ANGLE_NAME[k]}<Required /></b>
              <span>{pending ? "處理中…" : path ? "點一下重拍" : HINT[k]}</span>
              {path && !pending && coverBtn(`a:${k}`, path)}
              <input type="file" accept="image/*" capture="environment" aria-label={`拍${ANGLE_NAME[k]}照片`} disabled={pending}
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onAngle(k, file); }} />
            </label>
          );
        })}
      </div>
      <div className={s.gap} />
      <section className={`${s.card} ${s.stack}`} aria-labelledby="more" style={{ gap: 10 }}>
        <div className={s.rowBetween}><h2 id="more" className={s.h2} style={{ fontSize: 16 }}>更多照片</h2><span className={s.muted}>{form.others.length} / {MAX_LIFE_PHOTOS}</span></div>
        <p className={s.note}>生活照、睡覺、玩耍都好，用更多的照片讓大家知道貓咪的可愛。點照片上的「設為封面」，選一張當名片封面。</p>
        <div className={s.thumbs}>
          {form.others.map((p, i) => (
            <div key={p} className={s.thumb}>
              <img src={previews[p] ?? ""} alt={`其他照片 ${i + 1}`} />
              {coverBtn(`o:${i}`, p)}
              <button type="button" className={s.rm} aria-label={`移除第 ${i + 1} 張`} onClick={() => onRemoveOther(i)}>×</button>
            </div>
          ))}
          {/* 一次選很多張，各自在背景處理 */}
          {Array.from({ length: pendingOthers }, (_, i) => <div key={`p${i}`} className={`${s.add} ${s.pendingThumb}`} role="status">處理中…</div>)}
          {form.others.length + pendingOthers < MAX_LIFE_PHOTOS && (
            <label className={s.add} aria-label="新增更多照片"><PlusIcon />
              <input type="file" accept="image/*" multiple
                onChange={e => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onOthers(files); }} />
            </label>
          )}
        </div>
      </section>
    </>
  );
}

/** 按住說話（瀏覽器內建語音，zh-TW）；不支援時提示直接打字 */
function useMic(onText: (t: string) => void, onStatus: (m: string) => void) {
  const rec = useRef<{ stop: () => void } | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => () => rec.current?.stop(), []);
  type SR = new () => { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void;
    onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: (e: { error?: string }) => void; onend: () => void };
  const start = () => {
    if (rec.current) return;
    const w = window as unknown as { SpeechRecognition?: SR; webkitSpeechRecognition?: SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) { onStatus(MIC_UNSUPPORTED); return; }
    const r = new Ctor();
    r.lang = "zh-TW"; r.interimResults = true; r.continuous = true;
    r.onresult = e => { let t = ""; for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; onText(t); };
    r.onerror = e => onStatus(micErrorMessage(e.error));
    r.onend = () => { rec.current = null; setOn(false); };
    rec.current = r; r.start(); setOn(true);
  };
  const stop = () => rec.current?.stop();
  return { on, start, stop };
}

export function TalkStep({ form, set, status, setStatus, sending, onSend }: {
  form: NewCatForm; set: Set; status: string; setStatus: (m: string) => void; sending: boolean; onSend: () => void;
}) {
  const base = useRef("");
  const mic = useMic(t => set(f => ({ ...f, story: base.current + t })), setStatus);
  const tag = (k: string) => <Said k={k} said={form.said} guessed={form.guessed} />;
  const m = form.medical;
  const setMed = (patch: Partial<NewCatForm["medical"]>) => set(f => ({ ...f, medical: { ...f.medical, ...patch } }));
  const deworm = [m.dewormInternal === "done" && "體內", m.dewormExternal === "done" && "體外"].filter(Boolean) as string[];
  return (
    <>
      <h2 className={s.h1}>說說牠的故事</h2>
      <p className={s.lead}>把遇到牠的故事和我們分享，順便一起完成屬於牠的資料。</p>
      <section className={`${s.card} ${s.stack} ${s.center}`} aria-label="用說的" style={{ gap: 12 }}>
        <button type="button" className={`${s.mic} ${mic.on ? s.on : ""}`} aria-label="按住說話"
          onPointerDown={e => { e.preventDefault(); base.current = form.story ? form.story.replace(/\s*$/, "") + (/[。，！？]$/.test(form.story.trim()) ? "" : "，") : ""; mic.start(); }}
          onPointerUp={mic.stop} onPointerLeave={mic.stop} onPointerCancel={mic.stop}><MicIcon /></button>
        <b>{mic.on ? "放開就停止" : "按住說說牠"}</b>
        <div className={s.field} style={{ alignSelf: "stretch", textAlign: "left" }}>
          <label className={s.label} htmlFor="story">聽到的內容，有錯可以直接改</label>
          <textarea id="story" className={s.story} maxLength={2000} value={form.story} placeholder="例如：小米，8/01 在公園撿到，大概三個月大，母的…"
            onChange={e => set(f => ({ ...f, story: e.target.value }))} />
          <span className={s.muted}>也可以直接打字，或貼上你寫過的送養文</span>
          <div className={s.two}>
            <button type="button" className={s.ghostBtn} style={{ borderColor: "var(--line)" }} onClick={() => { set(f => ({ ...f, story: "" })); setStatus(""); }}>清空重講</button>
            <button type="button" className={s.darkBtn} disabled={sending} onClick={onSend}>{sending ? "整理中…" : "送出，填進表格"}</button>
          </div>
        </div>
        <p className={s.status} role="status">{status}</p>
      </section>
      <p className={s.notice} role="note">
        <span className={s.badge}>你說的</span><span className={`${s.badge} ${s.badgeGuess}`}>照片預測</span>
        AI會將你說的跟照片預測的自動入表格，記得再檢查是否正確
      </p>

      <section className={`${s.card} ${s.stack}`} aria-labelledby="basic">
        <h2 id="basic" className={s.h2}>基本資料</h2>
        <Field label={<>名字<Required /></>} htmlFor="f-name" tag={tag("name")}>
          <input id="f-name" className={s.input} maxLength={30} value={form.name} onChange={e => set(f => touched({ ...f, name: e.target.value }, "name"))} />
        </Field>
        <Field label="性別" tag={tag("sex")}>
          <Seg label="性別" options={[["male", "公"], ["female", "母"], ["unknown", "不確定"]] as const} value={form.sex} onChange={v => set(f => ({ ...f, sex: v }))} />
        </Field>
        <Field label={<>大概幾歲<Required /></>} htmlFor="f-age" tag={tag("age")}>
          <div className={s.two}>
            <input id="f-age" className={s.input} inputMode="decimal" placeholder="例如 3" value={form.ageNum} aria-describedby="age-hint"
              onChange={e => set(f => withAge(f, e.target.value))} />
            <Seg label="單位" options={[["month", "個月"], ["year", "歲"]] as const} value={form.ageUnit} onChange={v => set(f => withAge(f, f.ageNum, v ?? f.ageUnit))} />
          </div>
          {/* 年齡層（幼貓／成貓／老貓）不讓使用者選，由大概幾歲算出來存進資料表，給 3D 體型與任務用 */}
          <span className={s.muted} id="age-hint">不確定的話，填一個大概的數字就好</span>
        </Field>
        <Field label="體重（公斤）" htmlFor="f-kg">
          <input id="f-kg" className={s.input} inputMode="decimal" placeholder="例如 1.8" value={form.care.weightKg ?? ""}
            onChange={e => { const n = Number(e.target.value); set(f => ({ ...f, care: { ...f.care, weightKg: e.target.value && Number.isFinite(n) && n >= 0 && n <= 20 ? n : null } })); }} />
        </Field>
        <div className={s.two}>
          <Field label="毛色" htmlFor="f-coat" tag={tag("coat")}>
            <input id="f-coat" className={`${s.input} ${form.guessed.includes("coat") ? s.guess : ""}`} maxLength={40} value={form.coat} onChange={e => set(f => touched({ ...f, coat: e.target.value }, "coat"))} />
          </Field>
          <Field label="品種" htmlFor="f-breed" tag={tag("breed")}>
            <input id="f-breed" className={`${s.input} ${form.guessed.includes("breed") ? s.guess : ""}`} maxLength={40} value={form.breed} onChange={e => set(f => touched({ ...f, breed: e.target.value }, "breed"))} />
          </Field>
        </div>
        <Field label="哪裡相遇的" tag={tag("origin")}>
          <Seg label="哪裡相遇的" cols={2} options={Object.entries(ORIGIN_LABEL) as [Origin, string][]} value={form.care.origin ?? null}
            onChange={v => set(f => ({ ...f, care: { ...f.care, origin: v } }))} />
        </Field>
        <Field label="來你這裡的時間" htmlFor="f-since" tag={tag("since")}>
          <input id="f-since" className={s.input} maxLength={10} placeholder="2026-08-01" value={form.care.since ?? ""} onChange={e => set(f => ({ ...f, care: { ...f.care, since: e.target.value || null } }))} />
        </Field>
      </section>

      <div className={s.gap} />
      <section className={`${s.card} ${s.stack}`} aria-labelledby="health" style={{ gap: 14 }}>
        <h2 id="health" className={s.h2}>健康</h2>
        <div>
          <div className={s.hrow}><span className={s.label}>結紮{tag("neutered")}</span>
            <Seg label="結紮" options={[["done", "已結紮"], ["not_done", "還沒"], ["unknown", "不確定"]] as const} value={m.neutered === "unknown" ? null : m.neutered} onChange={v => setMed({ neutered: v ?? "unknown" })} /></div>
          <div className={s.hrow}><span className={s.label}>疫苗{tag("vaccine")}</span>
            <Seg label="疫苗" options={[[0, "沒打"], [1, "1 劑"], [2, "2 劑"], [3, "3 劑以上"]] as const} value={m.vaccineDoses === null ? null : Math.min(3, m.vaccineDoses)} onChange={v => setMed({ vaccineDoses: v })} /></div>
          <div className={s.hrow}><span className={s.label}>驅蟲{tag("deworm")}</span>
            <Toggles label="驅蟲" options={["體內", "體外"]} value={deworm} onChange={v => setMed({ dewormInternal: v.includes("體內") ? "done" : "unknown", dewormExternal: v.includes("體外") ? "done" : "unknown" })} /></div>
          <div className={s.hrow}><span className={s.label}>FIV／FeLV{tag("fiv")}</span>
            {/* 沒選＝還沒篩 */}
            <Seg label="FIV／FeLV" options={[["negative", "陰性"], ["fiv_positive", "FIV 陽性"], ["felv_positive", "FeLV 陽性"]] as const}
              value={m.fivFelv === "untested" ? null : m.fivFelv === "both_positive" ? "fiv_positive" : m.fivFelv} onChange={v => setMed({ fivFelv: v ?? "untested" })} /></div>
          <div className={s.hrow}><span className={s.label}>晶片{tag("chip")}</span>
            <Seg label="晶片" options={[["yes", "有"], ["no", "還沒"]] as const} value={m.microchip === "unknown" ? null : m.microchip} onChange={v => setMed({ microchip: v ?? "unknown" })} /></div>
        </div>
        <Field label="身體狀況" tag={tag("healthTags")}>
          <Toggles label="身體狀況" options={HEALTH_TAGS} value={form.healthTags} onChange={v => set(f => ({ ...f, healthTags: v as NewCatForm["healthTags"] }))} />
        </Field>
        <Field label="其他身體狀況（自己填）" htmlFor="f-body">
          <input id="f-body" className={s.input} maxLength={120} placeholder="例如：右後腳以前受過傷，跳不高" value={m.history} onChange={e => setMed({ history: e.target.value })} />
          <span className={s.muted}>上面沒有的寫在這裡。試養時會請 AI 照這段安排照顧的劇情，不會寫成診斷。</span>
        </Field>
        <Field label="慢性病、正在吃的藥" htmlFor="f-med" tag={tag("medication")}>
          <input id="f-med" className={s.input} maxLength={200} placeholder="例如：腎病，每天吃一次藥" value={m.medication} onChange={e => setMed({ medication: e.target.value })} />
        </Field>
        {/* AGENTS.md §6：醫療相關內容要附聲明，一般字級、放在旁邊 */}
        <p className={s.note}>健康資訊僅供參考，非醫療建議。</p>
      </section>
    </>
  );
}
