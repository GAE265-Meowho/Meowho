"use client";
// 原因欄位（規格書 §4.7）：快選標籤＋補充文字，組成「快選：補充」
import { useId } from "react";

export function ReasonField({ quick, value, onChange }: {
  quick: readonly string[]; value: { quick: string; extra: string }; onChange: (v: { quick: string; extra: string }) => void;
}) {
  const id = useId();
  return (
    <div className="hq-box">
      <div className="hq-chips" role="group" aria-label="快選原因">
        {quick.map(q => (
          <button key={q} type="button" className={value.quick === q ? "on" : ""} aria-pressed={value.quick === q}
            onClick={() => onChange({ ...value, quick: value.quick === q ? "" : q })}>{q}</button>
        ))}
      </div>
      <label htmlFor={id} className="hq-hint">原因（必填，會寫入稽核日誌）</label>
      <input id={id} className="hq-input" value={value.extra} placeholder="補充說明" aria-label="原因"
        onChange={e => onChange({ ...value, extra: e.target.value })} />
    </div>
  );
}
