"use client";
// 動作清單（規格書 04 §2.4）：列出動作庫全部動作；已完成的可點播放，規劃中的灰色不可點。
import { buildClipItems } from "@/lib/hq/cat-models/clips";

export function ClipList({ available, current, onPick }: { available: readonly string[]; current: string | null; onPick: (code: string) => void }) {
  const items = buildClipItems(available);
  return (
    <ul className="hq-cliplist" aria-label="動作清單">
      {items.map(c => (
        <li key={c.code}>
          <button
            type="button"
            className={`hq-clip${current === c.code ? " on" : ""}`}
            aria-pressed={current === c.code}
            disabled={!c.available}
            onClick={() => onPick(c.code)}
          >
            <span>{c.label}</span>
            {!c.available && <small>規劃中</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}
