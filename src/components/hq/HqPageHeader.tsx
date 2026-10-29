"use client";
// 模組頁首（規格書 §4.0）：「← 待辦總覽」、標題、目前篩選（例：「待審 × 清除篩選」）
import Link from "next/link";
import { HQ_HOME } from "./access";

export function HqPageHeader({ title, sub, filterLabel, onClearFilter }: { title: string; sub?: string; filterLabel?: string | null; onClearFilter?: () => void }) {
  return (
    <div className="hq-pagehead">
      <Link href={HQ_HOME} className="hq-back">← 待辦總覽</Link>
      <h1 className="hq-h1">{title}</h1>
      {sub && <p className="hq-sub" style={{ margin: 0 }}>{sub}</p>}
      {filterLabel && onClearFilter && (
        <span className="hq-filterpill">篩選：{filterLabel}<button onClick={onClearFilter} aria-label="清除篩選">× 清除篩選</button></span>
      )}
    </div>
  );
}

/** 尚未開發的模組（資料表與畫面在其他 Issue）：有權限的人看到說明，而不是找不到頁面 */
export function HqModulePending({ title, note }: { title: string; note: string }) {
  return (
    <>
      <HqPageHeader title={title} />
      <div className="hq-state"><p>{note}</p></div>
    </>
  );
}
