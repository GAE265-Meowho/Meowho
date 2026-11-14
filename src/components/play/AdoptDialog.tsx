"use client";
// 虛擬飼養：結案報告出現後的「認養貓咪」彈窗（#354，渝茜 2026-11-14）。要不要跳由 lib/play/ending.ts 的 shouldOfferAdopt 決定。
//   報告頁淡入、活潑音樂開始後約 1.6 秒跳出；同一輪只自動跳一次（記憶體＋這一輪的 sessionStorage，重新整理報告頁不再跳）。
//   畫面：這隻貓在平台上的照片 → 回顧裡最後一張遊戲截圖 → 貓的剪影（SVG），不會空白。
//   主按鈕＝填認養問卷（/cats/[id]/apply，同貓咪頁；中途沒開放問卷時不顯示，見 adoptActions）；次按鈕＝去跟中途談談（沿用貓咪頁的 MessageButton，開啟或沿用和喵戶長的私訊）。
//   示範模式或沒登入：兩顆按鈕加 data-login（Providers 會提示登入）。關閉：右上角 X、Esc、點背景；關掉後停在報告頁，焦點回到報告。
import { useEffect, useRef, useState } from "react";
import { MessageButton } from "@/components/cats/MessageButton";
import CatButton from "@/components/ui/CatButton";
import { ADOPT_DELAY_MS, adoptActions, adoptSeenKey, shouldOfferAdopt } from "@/lib/play/ending";
import a from "./adopt.module.css";

const seenNow = new Set<string>();
const session = () => { try { return window.sessionStorage; } catch { return null; } };
const wasSeen = (key: string) => seenNow.has(key) || session()?.getItem(key) === "1";
const markSeen = (key: string) => { seenNow.add(key); try { session()?.setItem(key, "1"); } catch { /* 只記在記憶體 */ } };

/** 沒有照片也沒有截圖時的貓剪影 */
const Silhouette = () => (
  <svg viewBox="0 0 120 120" aria-hidden="true">
    <path fill="currentColor" d="M34 22l12 18c4-1 9-2 14-2s10 1 14 2l12-18 4 30c6 7 10 16 10 26 0 22-18 34-40 34S20 100 20 78c0-10 4-19 10-26z" />
    <path fill="var(--cream)" d="M46 70q4-5 8 0M66 70q4-5 8 0" stroke="var(--cream)" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function AdoptDialog({ catId, catName, photo, shot, runId, canAct, adoptable, abandoned, formOpen }: {
  catId: string; catName: string;
  /** 中途是否開放認養問卷（source.ts 的 formOpen） */
  formOpen: boolean;
  /** 這隻貓在平台上的照片（source.ts 的 photo） */
  photo: string | null;
  /** 回顧裡最後一張遊戲截圖 */
  shot: string | null;
  runId: string | null;
  /** 已登入、不是示範貓：按鈕真的能用；否則加 data-login */
  canAct: boolean;
  adoptable: boolean;
  abandoned: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const key = adoptSeenKey(runId, catId);

  useEffect(() => {
    if (!shouldOfferAdopt({ adoptable, abandoned, seen: wasSeen(key) })) return;
    const t = setTimeout(() => { markSeen(key); setOpen(true); }, ADOPT_DELAY_MS);
    return () => clearTimeout(t);
  }, [key, adoptable, abandoned]);

  useEffect(() => {
    const d = ref.current;
    if (!open || !d || d.open) return;
    try { d.showModal(); } catch { d.setAttribute("open", ""); }
  }, [open]);

  const close = () => {
    ref.current?.close();
    setOpen(false);
    // 焦點回到報告頁的第一張卡
    const report = document.querySelector<HTMLElement>('[aria-labelledby="report-title"]');
    if (report) { report.tabIndex = -1; report.focus({ preventScroll: true }); }
  };

  if (!open) return null;
  const src = photo ?? shot;
  const login = canAct ? undefined : "認養這隻貓";
  const actions = adoptActions({ formOpen });
  // 第一顆是主按鈕：沒開放問卷時只剩「去跟中途談談」，改用主要樣式
  const msgVariant = actions[0] === "message" ? "primary" : "ghost";
  return (
    <dialog ref={ref} className={a.dialog} aria-labelledby="adopt-title" aria-describedby="adopt-desc"
      onCancel={ev => { ev.preventDefault(); close(); }}
      onClick={ev => { if (ev.target === ref.current) close(); }}>
      <div className={a.inner}>
        <button type="button" className={a.close} aria-label="關閉" onClick={close}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
        </button>
        <div className={a.body}>
          <div className={a.photo}>
            {/* 照片是 Storage 公開網址或遊戲截圖的 data URL，不經 next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt={catName} /> : <Silhouette />}
          </div>
          <div className={a.text}>
            <span className={a.kicker}>認養貓咪</span>
            <h2 id="adopt-title">想讓{catName}真的回家嗎？</h2>
            <p id="adopt-desc">{catName}正在等一個家。{formOpen ? "準備好了，可以先填認養問卷，或先和照顧牠的中途聊聊。" : "想多認識牠，可以先和照顧牠的中途聊聊。"}</p>
            <div className={a.actions}>
              {actions.includes("apply") && (canAct
                ? <CatButton href={`/cats/${catId}/apply`}>填認養問卷</CatButton>
                : <span data-login={login}><CatButton onClick={() => {}}>填認養問卷</CatButton></span>)}
              {canAct
                ? <MessageButton catId={catId} label="去跟中途談談" variant={msgVariant} />
                : <span data-login={login}><CatButton variant={msgVariant} ears={msgVariant === "primary"} onClick={() => {}}>去跟中途談談</CatButton></span>}
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
