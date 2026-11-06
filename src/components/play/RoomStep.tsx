"use client";
// 虛擬飼養 DEMO（#237）：上傳房間（模擬）。畫面像真的上傳：選檔或「用示範房間」→ 處理進度（沿用 ROOM_STAGES 的六個步驟，
// DEMO 加速成幾秒）→ 載入示範房間。選的檔案不會離開瀏覽器（只讀檔名，不上傳、不保存），之後接真的流程時改走 spec 09 §7.2。
// 兩種房間可以切換：A 掃描房間要有 NEXT_PUBLIC_ROOM_DEMO_BASE，沒設定或讀不到 scene.json 時顯示提示並自動改用 B 娃娃屋。
import { useEffect, useRef, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { ROOM_STAGES } from "@/lib/hq/rooms/types";
import { DEMO_DOLLHOUSE, inventoryFromPlan, inventoryFromScan, type RoomInventory, type RoomKind } from "@/lib/play/room";
import s from "./play.module.css";

/** 每個步驟幾毫秒（DEMO 加速） */
const STAGE_MS = 550;

export function RoomStep({ scanBase, onReady }: {
  scanBase: string | null;
  onReady: (r: { kind: RoomKind; inventory: RoomInventory; notice: string | null }) => void;
}) {
  const [kind, setKind] = useState<RoomKind>(scanBase ? "scan" : "dollhouse");
  const [source, setSource] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [notice, setNotice] = useState<string | null>(scanBase ? null : "示範掃描房間尚未設定，先用平面圖 3D 娃娃屋。");
  const sent = useRef(false);

  useEffect(() => {
    if (!source) return;
    if (stage < ROOM_STAGES.length) {
      const t = setTimeout(() => setStage(v => v + 1), STAGE_MS);
      return () => clearTimeout(t);
    }
    if (sent.current) return;
    sent.current = true;
    const dollhouse = (msg: string | null) => onReady({ kind: "dollhouse", inventory: inventoryFromPlan(DEMO_DOLLHOUSE), notice: msg });
    if (kind === "scan" && scanBase) {
      fetch(`${scanBase.replace(/\/$/, "")}/scene.json`)
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((scene: { objects?: { label?: unknown }[] }) => onReady({ kind: "scan", inventory: inventoryFromScan(scene), notice: null }))
        .catch(() => dollhouse("示範掃描房間載入失敗，先用平面圖 3D 娃娃屋。"));
    } else dollhouse(kind === "scan" ? "示範掃描房間尚未設定，先用平面圖 3D 娃娃屋。" : null);
  }, [source, stage, kind, scanBase, onReady]);

  const pick = (k: RoomKind) => {
    if (k === "scan" && !scanBase) { setNotice("示範掃描房間尚未設定，先用平面圖 3D 娃娃屋。"); setKind("dollhouse"); return; }
    setNotice(null); setKind(k);
  };

  if (source) {
    const pct = Math.round((Math.min(stage, ROOM_STAGES.length) / ROOM_STAGES.length) * 100);
    return (
      <section className={s.card} aria-labelledby="room-progress">
        <h2 id="room-progress">正在建立你家的 3D 房間</h2>
        <p className={s.lead}>{source}</p>
        <div className={s.bar} aria-hidden><span style={{ width: `${pct}%` }} /></div>
        <ol className={s.stages} aria-live="polite">
          {ROOM_STAGES.map((name, i) => (
            <li key={name} data-state={i < stage ? "done" : i === stage ? "now" : "todo"}>
              <span className={s.dot}>{i < stage && <Icon name="check" size={16} />}</span>{name}
            </li>
          ))}
        </ol>
      </section>
    );
  }

  return (
    <section className={s.card} aria-labelledby="room-title">
      <h2 id="room-title">上傳你家的房間</h2>
      <p className={s.lead}>錄一段家裡的影片，或拍幾張照片。素材只用來建房間和做安全檢查，處理完就刪除。</p>
      <div className={s.chips} role="group" aria-label="房間類型">
        <button type="button" className={s.chipBtn} aria-pressed={kind === "scan"} onClick={() => pick("scan")}>3D 掃描房間</button>
        <button type="button" className={s.chipBtn} aria-pressed={kind === "dollhouse"} onClick={() => pick("dollhouse")}>平面圖 3D 娃娃屋</button>
      </div>
      {notice && <p className={s.missing} role="status">{notice}</p>}
      <div className={s.drop}>
        <Icon name={kind === "scan" ? "video" : "grid"} size={36} />
        <label className={s.fileLabel}>
          <input type="file" accept={kind === "scan" ? "video/mp4,video/quicktime,image/*" : "image/*,application/pdf"}
            onChange={e => { const f = e.target.files?.[0]; if (f) setSource(`已選擇：${f.name.slice(0, 40)}`); }} />
          {kind === "scan" ? "選擇影片或照片" : "選擇平面圖"}
        </label>
        <CatButton variant="ghost" size="sm" onClick={() => setSource(kind === "scan" ? "使用示範掃描房間" : "使用示範平面圖（客廳）")}>用示範房間</CatButton>
      </div>
    </section>
  );
}
