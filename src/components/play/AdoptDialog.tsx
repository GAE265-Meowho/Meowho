"use client";
// 虛擬飼養：結案報告之後的「〈貓名〉的領養資訊」彈窗（#354，渝茜 2026-11-14：先跳報告，再跳領養資訊，下方三顆按鈕）。
//   報告讀到最後一張卡（ReportStep 的 onReachEnd）約 0.6 秒後自動跳出；要不要自動跳由 lib/play/ending.ts 的 shouldOfferAdopt 決定，
//   同一輪只自動跳一次（記憶體＋這一輪的 sessionStorage）。報告最後也有「看看〈貓名〉的領養資訊」可以再打開（openKey 變了就打開）。
//   畫面：這隻貓在平台上的照片 → 回顧裡最後一張遊戲截圖 → 貓的剪影（SVG），不會空白；右邊是基本資料（adoptFacts）與中途的介紹。
//   按鈕（adoptActions）：填寫領養問卷（/cats/[id]/apply；中途沒開放問卷時不顯示）、聯絡中途（MessageButton，開啟或沿用私訊）、再看看其他貓咪（/find）。
//   示範模式或沒登入：前兩顆加 data-login（Providers 會提示登入）。關閉：右上角 X、Esc、點背景；關掉後焦點回到報告。
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

export function AdoptDialog({ catId, catName, photo, shot, runId, canAct, adoptable, abandoned, formOpen, facts, intro, reachedEnd, openKey }: {
  catId: string; catName: string;
  /** 基本資料（ending.ts 的 adoptFacts） */
  facts: [string, string][];
  /** 中途寫的介紹 */
  intro: string | null;
  /** 報告讀到最後了（自動跳一次） */
  reachedEnd: boolean;
  /** 報告裡按「看看領養資訊」：每按一次加一 */
  openKey: number;
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
    if (!reachedEnd || !shouldOfferAdopt({ adoptable, abandoned, seen: wasSeen(key) })) return;
    const t = setTimeout(() => { markSeen(key); setOpen(true); }, ADOPT_DELAY_MS);
    return () => clearTimeout(t);
  }, [key, adoptable, abandoned, reachedEnd]);
  useEffect(() => { if (openKey > 0) { markSeen(key); setOpen(true); } }, [openKey, key]);

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
            <span className={a.kicker}>領養資訊</span>
            <h2 id="adopt-title">{catName}的領養資訊</h2>
            {facts.length > 0 && <dl className={a.facts}>{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>}
            <p id="adopt-desc">{intro ? intro : `${catName}正在等一個家。`}</p>
            <div className={a.actions}>
              {actions.includes("apply") && (canAct
                ? <CatButton href={`/cats/${catId}/apply`}>填寫領養問卷</CatButton>
                : <span data-login={login}><CatButton onClick={() => {}}>填寫領養問卷</CatButton></span>)}
              {canAct
                ? <MessageButton catId={catId} label="聯絡中途" variant={msgVariant} />
                : <span data-login={login}><CatButton variant={msgVariant} ears={msgVariant === "primary"} onClick={() => {}}>聯絡中途</CatButton></span>}
              <CatButton variant="ghost" ears={false} href="/find">再看看其他貓咪</CatButton>
            </div>
          </div>
        </div>
      </div>
    </dialog>
  );
}
