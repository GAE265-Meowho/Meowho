"use client";
// 原因欄：快選標籤（點選填入）＋補充文字（規格書 §4.7）
import { useId } from "react";

export function ReasonField({ quick, value, onChange }: { quick: readonly string[]; value: { quick: string; extra: string }; onChange: (v: { quick: string; extra: string }) => void }) {
  const id = useId();
  return (
    <div className="hq-reason">
      {quick.length > 0 && (
        <div className="hq-chips" role="group" aria-label="快選原因">
          {quick.map(q => (
            <button key={q} type="button" className={value.quick === q ? "on" : ""} aria-pressed={value.quick === q}
              onClick={() => onChange({ ...value, quick: value.quick === q ? "" : q })}>{q}</button>
          ))}
        </div>
      )}
      <label htmlFor={id} className="hq-label">原因</label>
      <textarea id={id} className="hq-input" rows={2} value={value.extra} placeholder={quick.length ? "可補充說明" : "請填寫原因"}
        onChange={e => onChange({ ...value, extra: e.target.value })} />
    </div>
  );
}
