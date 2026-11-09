"use client";
// 動作清單（規格書 04 §2.4）：列出動作庫全部動作；母體 glb 有的可點播放，沒有的灰色不可點。
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
            {/* 動作庫還沒做的標「規劃中」；已做好、但這個體型的母體還沒有的（例如成貓的跳躍）標「此體型尚無」 */}
            {!c.available && <small>{c.status === "planned" ? "規劃中" : "此體型尚無"}</small>}
          </button>
        </li>
      ))}
    </ul>
  );
}
