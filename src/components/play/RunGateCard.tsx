"use client";
// 領養任務開始前被擋下的畫面（run-gate.ts 的結果）：說明缺什麼、下一步去哪。處理中的情況可以去看其他貓，好了會通知。
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import type { Gate } from "@/lib/play/run-gate";

export function RunGateCard({ gate, catName, catHref, householdId, here, onGuide }: {
  gate: Exclude<Gate, { kind: "demo" | "start" | "resume" }>; catName: string; catHref: string; householdId: string | null; here: string; onGuide: () => void;
}) {
  const sceneHref = householdId ? `/homes/${householdId}/scene?next=${encodeURIComponent(here)}` : null;
  const others = <CatButton variant="ghost" href="/#adopt">先去看其他貓</CatButton>;
  switch (gate.kind) {
    case "loading": return <p className={f.lead} role="status">讀取你的資料…</p>;
    case "login": return <p className={f.lead} role="status">請先登入，登入後回到這裡接著做。</p>;
    case "need_household": return <p className={f.lead} role="status">先建立你的喵戶，建好後回到這裡接著做。</p>;
    case "not_adoptable":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>{catName}目前不能進行領養任務</h2>
          <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/#adopt">看看其他貓</CatButton></div>
        </section>
      );
    case "foster_only":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>領養任務需要你自己家的喵戶</h2>
          <p className={f.lead}>領養任務會在你家的 3D 房間裡進行。你目前只有中途喵戶，中途沒有自己家的 3D 房間，請先建立個人喵戶。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>
            <CatButton onClick={onGuide}>建立個人喵戶</CatButton>
            <CatButton variant="ghost" href={catHref}>回到{catName}的貓咪頁</CatButton>
          </div>
        </section>
      );
    case "other_cat":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>你正在進行{gate.catName}的領養任務</h2>
          <p className={f.lead}>同時只能進行一隻貓的領養任務。請回到{catName}的貓咪頁，選擇繼續{gate.catName}的任務，或放棄後改做{catName}的。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>
            <CatButton href={`/cats/${encodeURIComponent(gate.catId)}/play`}>繼續{gate.catName}的任務</CatButton>
            <CatButton variant="ghost" href={catHref}>回到{catName}的貓咪頁</CatButton>
          </div>
        </section>
      );
    case "need_room":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>先建立你家的 3D 房間</h2>
          <p className={f.lead}>領養任務會在你家的 3D 房間裡進行，讓{catName}在你家走一圈；同一支影片也會做出居家安全報告，五年後的意外就來自這份報告。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>
            {sceneHref && <CatButton href={sceneHref}>建立我家的 3D 房間</CatButton>}
            {others}
          </div>
        </section>
      );
    case "room_pending":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>你家的 3D 房間還在製作中</h2>
          <p className={f.lead}>模型做好會通知你，請稍等一下再回來。這段時間可以先去看看其他貓。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>{others}<CatButton variant="ghost" href={catHref}>回到{catName}的貓咪頁</CatButton></div>
        </section>
      );
    case "need_report":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>這間房間還沒有居家安全報告</h2>
          <p className={f.lead}>領養任務需要這間房間的居家安全報告。請重新上傳房間影片，同一支影片會同時做出 3D 房間和安全報告。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>
            {sceneHref && <CatButton href={sceneHref}>前往我的 3D 房間</CatButton>}
            {others}
          </div>
        </section>
      );
    case "report_pending":
      return (
        <section className={`${f.card} ${f.center}`}>
          <h2>居家安全報告還在製作中</h2>
          <p className={f.lead}>報告好了會通知你，請稍等一下再回來。這段時間可以先去看看其他貓。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}>{others}<CatButton variant="ghost" href={catHref}>回到{catName}的貓咪頁</CatButton></div>
        </section>
      );
  }
}
