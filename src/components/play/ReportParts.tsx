// 試養報告共用的圖像零件（#354）：領養人的結算畫面（ReportStep）與中途在對話串看到的摘要（TaskProof）用同一套。
// 只負責畫，數字全部由呼叫的人從既有資料／公式傳進來，這裡不算新的數字（長條只是把各項金額照比例畫出來）。
import Icon from "@/components/ui/Icon";
import { money } from "@/lib/play/costs";
import { trustWord } from "@/lib/play/report";
import { iconCount } from "./StatusMeters";
import r from "./report.module.css";

const HEART = "M12 20.6C6.4 16.6 2.8 13.3 2.8 9.2 2.8 6.4 5 4.2 7.7 4.2c1.8 0 3.3 1 4.3 2.4 1-1.4 2.5-2.4 4.3-2.4 2.7 0 4.9 2.2 4.9 5 0 4.1-3.6 7.4-9.2 11.4Z";
const FLAME = "M12 2.5C11.6 6 6 9.4 6 14.6A6 6 0 0 0 18 14.6c0-2.2-1-3.9-2.2-5.2-.3 1.5-1 2.5-2 3C14.4 9.2 13.4 5 12 2.5z";

function Scale({ label, n, d, tone, word }: { label: string; n: number; d: string; tone: "heart" | "flame"; word?: string }) {
  return (
    <div className={r.scale} role="img" aria-label={`${label}：5 格裡有 ${n} 格${word ? `，${word}` : ""}`}>
      <span className={r.scaleLabel}>{label}</span>
      <span className={r.scaleIcons} data-tone={tone}>
        {[0, 1, 2, 3, 4].map(i => <svg key={i} viewBox="0 0 24 24" data-on={i < n}><path d={d} /></svg>)}
      </span>
      {word && <strong className={r.scaleWord}>{word}</strong>}
    </div>
  );
}

/** 信任（愛心）與壓力（火焰）量表：五格，和遊戲畫面上方的狀態同一個算法（iconCount） */
export function MoodScales({ trust, stress }: { trust: number; stress: number }) {
  return (
    <div className={r.scales}>
      <Scale label="信任" n={iconCount(trust)} d={HEART} tone="heart" word={trustWord(trust)} />
      <Scale label="壓力" n={iconCount(stress)} d={FLAME} tone="flame" />
    </div>
  );
}

export interface CostParts { once: number; month: number; med: number; acc: number; other: number }
const COST_KEYS = ["once", "month", "med", "acc", "other"] as const;

/** 花費摘要卡：總額＋各項比例長條＋各項金額 */
export function CostCard({ title, total, cost, labels, children }: {
  title: string; total: number; cost: CostParts; labels: Record<(typeof COST_KEYS)[number], string>; children?: React.ReactNode;
}) {
  return (
    <div className={r.cost}>
      <p className={r.costTotal}><span>{title}</span><strong>{money(total)} 元</strong></p>
      {total > 0 && (
        <div className={r.costBar} aria-hidden="true">
          {COST_KEYS.filter(k => cost[k] > 0).map(k => <span key={k} data-k={k} style={{ flexGrow: cost[k] }} />)}
        </div>
      )}
      <dl className={r.costRows}>
        {COST_KEYS.map(k => <div key={k}><dt><i data-k={k} aria-hidden="true" />{labels[k]}</dt><dd>{money(cost[k])} 元</dd></div>)}
        {children}
      </dl>
    </div>
  );
}

/** 做得好／可以再想想／其他選擇：分區呈現 */
export function PickZone({ tone, title, items, headingId }: { tone: "good" | "think" | "plain"; title: string; items: string[]; headingId?: string }) {
  if (!items.length) return null;
  return (
    <div className={r.zone} data-tone={tone}>
      <h3 id={headingId} className={r.zoneTitle}>
        <span className={r.zoneIcon} aria-hidden="true">
          {tone === "good" ? <Icon name="check" size={18} /> : tone === "think"
            ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M9 9.2a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.3-1.6 2.6M12 18h.01" /></svg>
            : <Icon name="paw" size={18} />}
        </span>
        {title}<span className={r.zoneCount}>{items.length} 項</span>
      </h3>
      <ul className={r.zoneList}>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
