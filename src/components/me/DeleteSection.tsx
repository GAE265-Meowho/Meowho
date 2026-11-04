"use client";
// 刪除喵戶、刪除貓咪（我的喵戶改版，子哲 2026-11-04）：從「我的喵戶」移到修改頁的最下方，刪除前再問一次。
// 刪除邏輯沿用 delete-cat.ts：先刪照片與影片，再刪資料庫紀錄。從中途領養來的貓不能刪，要退養時到貓咪頁向原中途提出（#109）。
import { useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ADOPTED_CAT, deleteCat, deleteHousehold } from "./delete-cat";
import s from "./me.module.css";

function Confirm({ title, warn, label, run }: { title: string; warn: string; label: string; run: () => Promise<string | null> }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={`${f.card} ${s.danger}`} aria-labelledby="danger-title">
      <h2 id="danger-title">{title}</h2>
      {asking ? (
        <>
          <p className={f.lead}>{warn}</p>
          {error && <p className={f.error} role="alert">{error}</p>}
          <div className={f.actions}>
            <CatButton size="sm" disabled={busy} onClick={async () => {
              setBusy(true); setError(null);
              const err = await run();
              setBusy(false);
              if (err) setError(err); else window.location.href = "/me";
            }}>{busy ? "刪除中…" : "確定刪除"}</CatButton>
            <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setAsking(false)}>取消</button>
          </div>
        </>
      ) : (
        <div className={f.actions}><button type="button" className={s.dangerBtn} onClick={() => setAsking(true)}>{label}</button></div>
      )}
    </section>
  );
}

/** 修改喵戶頁的最下方：裡面有從中途領養來的貓時不能刪 */
export function DeleteHome({ home, cats }: { home: { id: string; name: string }; cats: { id: string; origin_household_id: string | null }[] }) {
  const adopted = cats.filter(c => c.origin_household_id).length;
  if (adopted) return (
    <section className={`${f.card} ${s.danger}`} aria-labelledby="danger-title">
      <h2 id="danger-title">刪除喵戶</h2>
      <p className={f.lead}>這個喵戶裡有 {adopted} 隻從中途領養來的貓，要先向原中途提出退養，才能刪除喵戶。</p>
    </section>
  );
  return (
    <Confirm title="刪除喵戶" label="刪除這個喵戶"
      warn={`確定刪除「${home.name}」？${cats.length ? `裡面的 ${cats.length} 隻貓、照片、影片和領養問卷都會一起刪除，` : ""}刪除後無法復原。`}
      run={async () => {
        const sb = getBrowserSupabase();
        const err = sb ? await deleteHousehold(sb, home.id, cats.map(c => c.id)) : null;
        return err ? `刪除失敗：${err}` : null;
      }} />
  );
}

/** 修改貓咪頁的最下方：從中途領養來的貓改成連到退養 */
export function DeleteCat({ cat }: { cat: { id: string; name: string; fromFoster: boolean } }) {
  if (cat.fromFoster) return (
    <section className={`${f.card} ${s.danger}`} aria-labelledby="danger-title">
      <h2 id="danger-title">刪除貓咪</h2>
      <p className={f.lead}>{ADOPTED_CAT}</p>
      <div className={f.actions}><CatButton variant="ghost" size="sm" href={`/cats/${cat.id}#sec-return`}>到貓咪頁退養</CatButton></div>
    </section>
  );
  return (
    <Confirm title="刪除貓咪" label={`刪除${cat.name}`} warn={`確定刪除${cat.name}？照片和影片也會一起刪除，刪除後無法復原。`}
      run={async () => {
        const sb = getBrowserSupabase();
        const err = sb ? await deleteCat(sb, cat.id) : null;
        return err ? (err === ADOPTED_CAT ? err : `刪除失敗：${err}`) : null;
      }} />
  );
}
