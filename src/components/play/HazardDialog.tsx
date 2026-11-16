"use client";
// 五年後居家意外回到家（送醫或虛驚）：跳出「家裡哪邊是危險物品」彈窗（渝茜 2026-11-14）。
// 照片＝這一輪定格的環境報告裡這一項的風險裁切照（Before），由 PlayGame 經同源 API 讀好再傳進來（lib/play/year5-hazard.ts）；
// 報告 API 沒有 After（AI 模擬改善圖只在本人專用的 PDF 裡），所以這裡不放 After、也不嵌 PDF。
// 沒有真實裁切照就不跳（canShowHazard）。原生 <dialog> showModal：焦點鎖在彈窗、Esc 關閉、關閉後焦點回原處。
import { useEffect, useRef, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import type { Risk } from "@/lib/play/story";
import { hazardDialogView, type ReportHazardItem } from "@/lib/play/year5-hazard";
import d from "./hazard-dialog.module.css";

const LEVEL: Record<Risk["level"], string> = { high: "高風險", medium: "要注意", low: "低風險" };

export function HazardDialog({ risk, item, onClose }: {
  risk: Risk;
  /** 報告裡同一項（已確認有同源裁切照） */
  item: ReportHazardItem;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal?.();
    return () => { if (el?.open) el.close(); };
  }, []);

  const v = hazardDialogView(risk, item);

  return (
    <dialog ref={ref} className={d.dialog} aria-labelledby="hazard-title"
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={d.body}>
        <button type="button" className={d.close} onClick={onClose} aria-label="關閉" autoFocus><Icon name="close" /></button>
        <figure className={d.figure}>
            {imgFailed ? (
                <button type="button" className={d.retry} onClick={() => { setImgFailed(false); setAttempt(n => n + 1); }}>照片載入失敗，點這裡重新載入</button>
              ) : (
                // 同源授權路由，每次重新驗證後才轉到短效網址；不經 next/image 快取
                // eslint-disable-next-line @next/next/no-img-element
                <img key={attempt} src={v.cropUrl ?? undefined} alt={`環境報告拍到的「${v.label}」`} referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
              )}
            <figcaption>你家的環境報告拍到的位置</figcaption>
        </figure>
        <div className={d.text}>
          <p className={d.kicker}>回到家，先看看家裡這個地方</p>
          <h2 id="hazard-title" className={d.title}>{v.label}<span className={d.level} data-level={v.level}>{LEVEL[v.level]}</span></h2>
          <h3 className={d.h}>小叮嚀</h3>
          <p className={d.p}>{v.advice}</p>
          {v.note && (<><h3 className={d.h}>環境報告的說明</h3><p className={d.p}>{v.note}</p></>)}
          <div className={d.actions}><CatButton onClick={onClose}>我知道了</CatButton></div>
        </div>
      </div>
    </dialog>
  );
}
