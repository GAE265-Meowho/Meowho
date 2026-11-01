"use client";
// 送養文常見欄位的輸入元件（#82）：送養條件、醫療細項、相處、多選清單。喵戶表單與貓咪名片共用。
import { ADOPTION_TERMS, type AdoptionTerms, type Compat, type Medical } from "@/lib/cat-profile/adoption";
import s from "./intake.module.css";

export function MultiPick<T extends string>({ label, options, value, onChange }: {
  label: string; options: readonly T[]; value: readonly T[]; onChange: (next: T[]) => void;
}) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      {options.map(o => {
        const on = value.includes(o);
        return <button key={o} type="button" className={s.chip} aria-pressed={on} onClick={() => onChange(on ? value.filter(v => v !== o) : [...value, o])}>{o}</button>;
      })}
    </div>
  );
}

export function OnePick<T extends string>({ label, options, value, onChange }: {
  label: string; options: Record<T, string>; value: T | null; onChange: (next: T) => void;
}) {
  return (
    <div className={s.chips} role="radiogroup" aria-label={label}>
      {(Object.entries(options) as [T, string][]).map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={s.chip} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export function TermsFields({ id, value, onChange }: { id: string; value: AdoptionTerms; onChange: (next: AdoptionTerms) => void }) {
  return (
    <>
      <MultiPick label="送養條件" options={ADOPTION_TERMS} value={value.items} onChange={items => onChange({ ...value, items })} />
      <label className={s.label} htmlFor={`${id}-note`}>其他條件</label>
      <input id={`${id}-note`} value={value.note} maxLength={300} placeholder="例如：限雙北、需單養" onChange={e => onChange({ ...value, note: e.target.value })} />
    </>
  );
}

const DONE = { done: "已完成", not_done: "還沒", unknown: "不確定" } as const;
const OK = { yes: "可以", no: "不行", unknown: "不確定" } as const;
const FIV = { negative: "陰性", fiv_positive: "FIV 陽性", felv_positive: "FeLV 陽性", both_positive: "兩者皆陽性", untested: "未檢測" } as const;
const CHIP = { yes: "已植入", no: "沒有", unknown: "不確定" } as const;

export function MedicalFields({ value, onChange }: { value: Medical; onChange: (next: Medical) => void }) {
  const set = (patch: Partial<Medical>) => onChange({ ...value, ...patch });
  return (
    <>
      <span className={s.label}>結紮</span>
      <OnePick label="結紮" options={DONE} value={value.neutered} onChange={v => set({ neutered: v })} />
      <input aria-label="結紮日期或預計安排" value={value.neuterNote} maxLength={100} placeholder="結紮日期，或還沒結紮時的預計安排" onChange={e => set({ neuterNote: e.target.value })} />
      <div className={s.pair}>
        <div className={s.field}>
          <label className={s.label} htmlFor="m-vac">疫苗打了幾劑</label>
          <input id="m-vac" type="number" min={0} max={5} value={value.vaccineDoses ?? ""} onChange={e => set({ vaccineDoses: e.target.value === "" ? null : Math.min(5, Math.max(0, Number(e.target.value))) })} />
        </div>
        <div className={s.field}>
          <label className={s.label} htmlFor="m-vac-date">最後一次施打</label>
          <input id="m-vac-date" type="date" value={value.lastVaccineDate ?? ""} onChange={e => set({ lastVaccineDate: e.target.value || null })} />
        </div>
      </div>
      <span className={s.label}>體內驅蟲</span>
      <OnePick label="體內驅蟲" options={DONE} value={value.dewormInternal} onChange={v => set({ dewormInternal: v })} />
      <span className={s.label}>體外驅蟲</span>
      <OnePick label="體外驅蟲" options={DONE} value={value.dewormExternal} onChange={v => set({ dewormExternal: v })} />
      <span className={s.label}>FIV／FeLV 快篩</span>
      <OnePick label="FIV／FeLV 快篩" options={FIV} value={value.fivFelv} onChange={v => set({ fivFelv: v })} />
      <span className={s.label}>晶片</span>
      <OnePick label="晶片" options={CHIP} value={value.microchip} onChange={v => set({ microchip: v })} />
      <label className={s.label} htmlFor="m-history">病史</label>
      <input id="m-history" value={value.history} maxLength={300} onChange={e => set({ history: e.target.value })} />
      <label className={s.label} htmlFor="m-med">目前用藥</label>
      <input id="m-med" value={value.medication} maxLength={200} onChange={e => set({ medication: e.target.value })} />
    </>
  );
}

export function CompatFields({ value, onChange }: { value: Compat; onChange: (next: Compat) => void }) {
  const rows: [keyof Compat, string][] = [["cats", "其他貓"], ["dogs", "狗"], ["kids", "小孩"]];
  return (
    <>
      {rows.map(([k, l]) => (
        <div key={k} className={s.field}>
          <span className={s.label}>能和{l}相處嗎</span>
          <OnePick label={`能和${l}相處嗎`} options={OK} value={value[k]} onChange={v => onChange({ ...value, [k]: v })} />
        </div>
      ))}
    </>
  );
}
