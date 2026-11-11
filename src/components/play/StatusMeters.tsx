// 虛擬飼養：畫面最上面的信任（愛心）與壓力（火焰），各五顆。0～100 分成五格：有一點就先亮一顆，
// 例如壓力只有 1 顆，就是一顆實心火、四顆空心火。
import s from "./play.module.css";

/** 0～100 → 0～5 顆（有值就至少亮一顆，滿格 5 顆） */
export const iconCount = (v: number) => Math.max(0, Math.min(5, Math.ceil(Math.max(0, Math.min(100, v)) / 20)));

const HEART = "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.6 5 5.9 5c2 0 3.4 1 4.2 2.4h.0C10.9 6 12.3 5 14.3 5c3.3 0 5 3.4 3.5 6.8C19.5 16.4 12 21 12 21z";
const FLAME = "M12 2.5C11.6 6 6 9.4 6 14.6A6 6 0 0 0 18 14.6c0-2.2-1-3.9-2.2-5.2-.3 1.5-1 2.5-2 3C14.4 9.2 13.4 5 12 2.5z";

function Icons({ n, d, tone }: { n: number; d: string; tone: "heart" | "flame" }) {
  return (
    <span className={s.icons} aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => (
        <svg key={i} viewBox="0 0 24 24" className={`${s.icon} ${tone === "heart" ? s.heart : s.flame}`} data-on={i < n ? "true" : "false"}>
          <path d={d} fillRule="evenodd" />
        </svg>
      ))}
    </span>
  );
}

export function StatusMeters({ trust, stress }: { trust: number; stress: number }) {
  const t = iconCount(trust), x = iconCount(stress);
  return (
    <div className={s.meters} role="group" aria-label="貓咪的狀態">
      <span className={s.meter5} role="img" aria-label={`信任 ${t}／5`}><b>信任</b><Icons n={t} d={HEART} tone="heart" /></span>
      <span className={s.meter5} role="img" aria-label={`壓力 ${x}／5`}><b>壓力</b><Icons n={x} d={FLAME} tone="flame" /></span>
    </div>
  );
}
