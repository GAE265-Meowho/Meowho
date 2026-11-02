"use client";
/* eslint-disable @next/next/no-img-element */
// 領養管理／我的領養申請（#128）：上方兩排篩選（回覆狀態、貓）、左欄「貓 × 申請人」卡片、右欄對話框。
// 一個「會員 × 貓」一個對話串（0011）；中途（keeper）看自己中途喵戶的串，領養人（member）看自己開的串。
// 網址 ?t=<對話串> 指到某一串（通知連到這裡）；舊通知的 #cat-<id> 與修改頁的 ?cat=<id> 會先篩選那隻貓。
// 手機（≤767px）兩層：沒選串時只看列表，選了只看對話，對話上方有返回。
import { useCallback, useEffect, useMemo, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import f from "@/components/onboarding/intake.module.css";
import { buildDesk, type DeskThread, type Role, type StatusFilter } from "@/lib/adoption-desk";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";
import { ThreadPane, type PaneThread } from "./ThreadPane";
import s from "./desk.module.css";

const SELECT = "id, cat_id, member_id, household_id, cat_name, member_name, household_name, declined_at, last_message_at, member_text_at, keeper_text_at, member_read_at, keeper_read_at, cat:meow_cats(status, household_id, photo_url)";

interface Row extends Omit<DeskThread, "cat_waiting" | "cat_photo"> {
  member_id: string; household_id: string;
  cat: { status: string; household_id: string; photo_url: string | null } | null;
}

const day = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
    : `${d.getMonth() + 1}/${d.getDate()}`;
};

export function AdoptionDesk({ role, userId }: { role: Role; userId: string }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<PaneThread[] | undefined>(undefined);
  const [noFoster, setNoFoster] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    let q = sb.from("meow_threads").select(SELECT).order("last_message_at", { ascending: false }).limit(300);
    if (role === "keeper") {
      const { data: homes } = await sb.from("meow_households").select("id").eq("owner_id", userId).neq("caretaker_type", "cat_owner");
      const ids = (homes ?? []).map(h => h.id as string);
      if (!ids.length) { setNoFoster(true); setRows([]); return; }
      q = q.in("household_id", ids);
    } else {
      q = q.eq("member_id", userId);
    }
    const { data } = await q;
    setRows(((data ?? []) as unknown as Row[]).map(({ cat: c, ...r }) => ({
      ...r,
      cat_waiting: c?.status === "adoptable" && c.household_id === r.household_id,
      cat_photo: c?.photo_url ? photoSrc(sb, c.photo_url) : null,
    })));
  }, [sb, role, userId]);

  // 讀網址：?t= 選串；#cat- 或 ?cat= 先篩選那隻貓
  useEffect(() => {
    const read = () => {
      const u = new URL(window.location.href);
      setSel(u.searchParams.get("t"));
      const c = u.searchParams.get("cat") ?? (u.hash.startsWith("#cat-") ? u.hash.slice(5) : null);
      if (c) setCat(c);
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  // 列表：進來讀一次；有新訊息或狀態變了（Realtime）、切回視窗時重新讀
  useEffect(() => {
    if (!sb) return;
    load();
    const ch = sb.channel(`desk-${role}-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meow_threads" }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { sb.removeChannel(ch); window.removeEventListener("focus", onFocus); };
  }, [sb, role, userId, load]);

  const threads = useMemo(() => rows ?? [], [rows]);
  const desk = useMemo(() => buildDesk(threads, role, { status, cat }), [threads, role, status, cat]);
  const current = threads.find(x => x.id === sel) ?? null;

  function open(id: string | null) {
    setSel(id);
    const u = new URL(window.location.href);
    u.hash = "";
    if (id) u.searchParams.set("t", id); else u.searchParams.delete("t");
    window.history.pushState(null, "", u);
  }

  if (rows === undefined) return <p className={f.lead} role="status">載入中…</p>;
  if (noFoster) return (
    <section className={`${f.card} ${f.center}`}>
      <h2>還沒有中途喵戶</h2>
      <p className={f.lead}>建立中途喵戶、放上待領養貓之後，領養申請和私訊會出現在這裡。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
    </section>
  );
  if (!threads.length) return (
    <section className={`${f.card} ${f.center}`}>
      {role === "keeper" ? (
        <>
          <h2>還沒有人申請</h2>
          <p className={f.lead}>在待領養貓的「修改」頁開放領養問卷，有人填寫或私訊時會出現在這裡。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/me">回到我的喵戶</CatButton></div>
        </>
      ) : (
        <>
          <h2>還沒有申請或私訊</h2>
          <p className={f.lead}>在待領養貓的頁面填寫領養問卷，或傳訊息給喵戶長。</p>
          <div className={f.actions} style={{ justifyContent: "center" }}><CatButton variant="ghost" href="/#adopt">去看待領養的貓</CatButton></div>
        </>
      )}
    </section>
  );

  return (
    <div className={`${s.desk} ${current ? s.picked : ""}`}>
      <div className={s.filters}>
        <div className={s.chips} role="group" aria-label="依回覆狀態篩選">
          {desk.statusChips.map(c => (
            <button key={c.key} type="button" className={s.chip} aria-pressed={status === c.key} onClick={() => setStatus(c.key)}>
              {c.label}<span className={s.count}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className={s.chips} role="group" aria-label="依貓篩選">
          <button type="button" className={s.chip} aria-pressed={cat === "all"} onClick={() => setCat("all")}>全部的貓</button>
          {desk.catChips.map(c => (
            <button key={c.id} type="button" className={s.chip} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}
              style={{ "--c": `var(--desk-${c.color})` } as React.CSSProperties}>
              <span className={s.dot} aria-hidden />{c.name}{c.gone ? (role === "keeper" ? "（已領養）" : "（已找到家）") : ""}
              {c.unread > 0 && <span className={s.unreadNum} aria-label={`${c.unread} 則未讀`}>{c.unread}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={s.cols}>
        <ul className={s.list} aria-label={role === "keeper" ? "申請列表" : "我的申請"}>
          {desk.cards.length === 0 && <li className={s.empty}>這個篩選下沒有申請</li>}
          {desk.cards.map(c => (
            <li key={c.id}>
              <button type="button" className={`${s.card} ${c.unread ? s.unread : ""}`} aria-current={c.id === sel ? "true" : undefined}
                onClick={() => open(c.id)} style={{ "--c": `var(--desk-${c.color})`, "--c-soft": `var(--desk-${c.color}-soft)` } as React.CSSProperties}>
                <span className={s.thumb}>{c.photo ? <img src={c.photo} alt="" /> : <Icon name="cat" size={22} />}</span>
                <span className={s.cardText}>
                  <b>{c.catName}<span className={s.x} aria-hidden> × </span><span className={s.sr}>，</span>{c.who}</b>
                  <span className={s.cardMeta}>
                    <span className={s.status}>{c.label}</span>
                    <time dateTime={c.lastAt}>{day(c.lastAt)}</time>
                  </span>
                </span>
                {c.unread && <span className={s.newDot} aria-label="未讀" />}
              </button>
            </li>
          ))}
        </ul>

        <section className={s.pane} aria-label="對話">
          {current
            ? <ThreadPane key={current.id} thread={current} role={role} userId={userId} onChanged={load} onBack={() => open(null)} />
            : <div className={s.placeholder}><Icon name="comment" size={40} /><p>選一則申請開始對話</p></div>}
        </section>
      </div>
    </div>
  );
}
