"use client";
// 房間掃描教練（從 3Dtest/capture_coach.html 搬來的「拍攝前」「拍攝中」兩步；「拍完檢查」先不搬）。
// 拍前看路線和出發前檢查 → 拍時記住五條規則 → 最後一頁放隱私說明和「開始製作／上傳影片」（由 page.tsx 傳進來）。
import { useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import f from "@/components/onboarding/intake.module.css";
import r from "./scene.module.css";

const CHECK = [
  ["打開所有燈，拉上窗簾", "光線固定，畫面才不會一下亮一下暗"],
  ["請其他人和寵物離開畫面", "會動的東西會變成模糊的鬼影"],
  ["相機切到 0.5x 超廣角、橫拿手機", "一次拍到更多，畫面比較容易接起來"],
  ["長按畫面鎖定對焦和曝光", "iPhone：長按到畫面出現黃色的「AE/AF 鎖定」"],
  ["畫質設成 1080p 30fps", "iPhone：設定 › 相機 › 錄影。檔案要在 50 MB 以內"],
  ["擦一下鏡頭", "指紋會讓整段影片霧霧的"],
  ["床、桌子整個拍進去", "貓要跳上去，家具的四邊都要入鏡"],
  ["收好證件和信件", "影片處理完就會刪除，但入鏡的個人資料先收起來比較安心"],
] as const;

const RULES = [
  ["慢慢走，像在找東西", "每 2 秒一步。走太快每張都會糊。"],
  ["靠走動拍，不要原地轉", "要換方向時，邊走邊轉。轉 90° 至少花 3 秒。"],
  ["前後畫面重疊一半以上", "每個東西都要從 3 個不同位置拍到。"],
  ["每走幾步就往下拍地板", "鏡頭往下約 30° 掃過地面，貓才有地方走。"],
  ["最後走回起點", "頭尾畫面重疊，整個房間才接得起來。"],
] as const;

const AVOID = [
  ["近距離對著白牆", "白牆沒有花紋，電腦對不上；退遠一點，讓牆角或家具一起入鏡"],
  ["鏡子、玻璃、窗外風景", "反光和透明的東西會讓 3D 出現假的深度"],
  ["快速甩鏡頭", "甩一下就有好幾秒的畫面全糊"],
  ["中途變焦或換鏡頭", "焦距一變，畫面就接不起來"],
] as const;

// 相機視野的小扇形：位置 (x, y)、朝向 ang（弧度）
function fan(x: number, y: number, ang: number, len = 22, spread = 0.42) {
  const a1 = ang - spread, a2 = ang + spread;
  return `M${x},${y} L${x + len * Math.cos(a1)},${y + len * Math.sin(a1)} A${len},${len} 0 0 1 ${x + len * Math.cos(a2)},${y + len * Math.sin(a2)} Z`;
}
const LOOP = { x0: 58, y0: 74, x1: 262, y1: 174 };
const STOPS = [
  ...[0, 1, 2, 3].map(i => [LOOP.x0 + (i + 0.5) * (LOOP.x1 - LOOP.x0) / 4, LOOP.y0]),
  ...[3, 2, 1].map(i => [LOOP.x0 + (i + 0.5) * (LOOP.x1 - LOOP.x0) / 4, LOOP.y1]),
  [LOOP.x1, (LOOP.y0 + LOOP.y1) / 2], [LOOP.x0, (LOOP.y0 + LOOP.y1) / 2],
];

function RouteMap() {
  return (
    <svg className={r.map} viewBox="0 0 320 230" role="img" aria-label="拍攝路線：沿牆內側走一圈，鏡頭朝房間中間；再從中間走一趟，鏡頭朝牆；最後回到起點">
      <path d="M20,20 H300 V210 H190 M150,210 H20 Z" className={r.wall} />
      <text x={170} y={224} textAnchor="middle" className={r.lbl}>門</text>
      <rect x={28} y={28} width={64} height={26} rx={3} className={r.furn} />
      <rect x={236} y={140} width={56} height={62} rx={3} className={r.furn} />
      <rect x={135} y={92} width={50} height={36} rx={4} className={r.furn} />
      <rect x={LOOP.x0} y={LOOP.y0} width={LOOP.x1 - LOOP.x0} height={LOOP.y1 - LOOP.y0} rx={18} className={r.route} />
      {STOPS.map(([x, y]) => <path key={`${x},${y}`} d={fan(x, y, Math.atan2(110 - y, 160 - x))} className={r.fan} />)}
      <path d="M70,110 H125 M195,110 H250" className={r.route2} />
      {([[80, -1], [105, 1], [210, -1], [240, 1]] as const).map(([x, s]) => <path key={x} d={fan(x, 110, s * Math.PI / 2, 20)} className={r.fan2} />)}
      <circle cx={LOOP.x0 + 18} cy={LOOP.y1} r={5} className={r.start} />
      <text x={LOOP.x0 + 4} y={LOOP.y1 + 20} className={r.lbl}>起點＝終點</text>
    </svg>
  );
}

function SpinMap() {
  return (
    <svg className={r.map} viewBox="0 0 120 110" role="img" aria-label="錯誤示範：站在原地轉圈拍">
      {Array.from({ length: 8 }, (_, i) => <path key={i} d={fan(60, 55, i / 8 * Math.PI * 2, 34, 0.32)} className={r.fan} />)}
      <circle cx={60} cy={55} r={6} className={r.start} />
      <line x1={22} y1={17} x2={98} y2={93} className={r.bad} />
      <line x1={98} y1={17} x2={22} y2={93} className={r.bad} />
    </svg>
  );
}

/** actions：最後一頁的隱私說明、錯誤訊息和「開始製作／上傳影片」；onPick：已經拍好的人直接選檔 */
export default function ScanCoach({ actions, onPick }: { actions: React.ReactNode; onPick: () => void }) {
  const [page, setPage] = useState<1 | 2>(1);
  const [done, setDone] = useState<number[]>([]);
  const go = (p: 1 | 2) => { setPage(p); window.scrollTo({ top: 0 }); };

  const tabs = (
    <div className={r.steps} role="tablist" aria-label="拍攝步驟">
      {(["拍攝前", "拍攝中"] as const).map((t, i) => (
        <button key={t} type="button" role="tab" aria-selected={page === i + 1} onClick={() => go((i + 1) as 1 | 2)}>
          <span>第 {i + 1} 步</span>{t}
        </button>
      ))}
    </div>
  );

  if (page === 1) return (
    <>
      {tabs}
      <section className={f.card} aria-labelledby="route-title">
        <h2 id="route-title">路線：沿牆走一圈，再從中間走一趟</h2>
        <RouteMap />
        <p className={r.legend}><span><i />第一圈：沿牆走，鏡頭朝房間中間</span><span><i className={r.dot} />第二趟：從中間走，鏡頭朝牆</span></p>
        <p className={f.lead}>第一圈離牆大約 1 公尺。第二趟從房間中間走，拍牆面和角落。最後回到起點再停。</p>
      </section>

      <section className={f.card} aria-labelledby="spin-title">
        <h2 id="spin-title">最常失敗的拍法：原地轉圈</h2>
        <div className={r.dont}>
          <SpinMap />
          <p className={f.lead}>站在原地轉身拍，相機位置沒變，電腦算不出距離，3D 房間一定做不出來。<b>要一邊走一邊拍</b>，就像用兩隻眼睛才看得出遠近。</p>
        </div>
      </section>

      <section className={f.card} aria-labelledby="check-title">
        <div className={r.row}>
          <h2 id="check-title">出發前檢查</h2>
          <span className={r.count}>{done.length} / {CHECK.length}</span>
        </div>
        <ul className={r.check}>
          {CHECK.map(([t, sub], i) => (
            <li key={t}>
              <label>
                <input type="checkbox" checked={done.includes(i)}
                  onChange={e => setDone(d => e.target.checked ? [...d, i] : d.filter(x => x !== i))} />
                <span>{t}<small>{sub}</small></span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <div className={f.actions}>
        <CatButton onClick={() => go(2)}>下一步：拍攝時的規則</CatButton>
        <CatButton variant="ghost" onClick={onPick}><Icon name="plus" size={18} />已經拍好了，直接上傳</CatButton>
      </div>
    </>
  );

  return (
    <>
      {tabs}
      <p className={r.mantra}>慢慢走、別轉圈、多重疊、拍地板、回起點</p>
      <section className={f.card} aria-labelledby="rules-title">
        <h2 id="rules-title">拍攝時的五條規則</h2>
        <ol className={r.tips}>
          {RULES.map(([t, sub], i) => (
            <li key={t}>
              <span className={r.num} aria-hidden="true">{i + 1}</span>
              <div><b>{t}</b><p>{sub}</p></div>
            </li>
          ))}
        </ol>
        <div className={r.spec}>
          <div><b>約 1 分鐘</b><span>影片長度</span></div>
          <div><b>50 MB</b><span>檔案上限</span></div>
          <div><b>1080p</b><span>30fps</span></div>
        </div>
      </section>

      <section className={f.card} aria-labelledby="avoid-title">
        <h2 id="avoid-title">避開這些</h2>
        <ul className={r.check}>
          {AVOID.map(([t, sub]) => <li key={t}><p><b>✕ {t}</b><small>{sub}</small></p></li>)}
        </ul>
      </section>

      {actions}
    </>
  );
}
