"use client";
// 規劃中的區塊（室內空間、生活用品、其他）：第一版只顯示空白狀態，不放上傳按鈕（規格書 04 §1.1）
export function PlannedTab({ label, examples }: { label: string; examples: string }) {
  return (
    <div className="hq-state" aria-label={`${label}（規劃中）`}>
      <span className="hq-tag warn">規劃中</span>
      <p>這個分類還在規劃，之後會在這裡管理。</p>
      <p className="hq-hint">預計放：{examples}</p>
    </div>
  );
}
