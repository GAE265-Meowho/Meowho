"use client";
/* eslint-disable @next/next/no-img-element */
// 領養管理（#128）：申請方和審核方共用一頁。上方兩排篩選（分類、貓）、左欄「貓 × 對方」卡片、右欄對話框。
// 讀得到哪些對話串交給 RLS（我是會員的串＋我喵戶的串）；角色、狀態、分類由 lib/adoption-desk 依每一串計算。
// 網址 ?t=<對話串> 指到某一串（通知連到這裡）；舊通知的 #cat-<id> 與修改頁的 ?cat=<id> 會先篩選那隻貓。
// 手機（≤767px）兩層：沒選串時只看列表，選了只看對話，對話上方有返回。
import { useCallback, useEffect, useMemo, useState } from "react";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import f from "@/components/onboarding/intake.module.css";
import { buildDesk, type Category, type DeskThread } from "@/lib/adoption-desk";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";
import { ThreadPane } from "./ThreadPane";
import s from "./desk.module.css";

const SELECT = "id, cat_id, member_id, cat_name, member_name, household_name, declined_at, homed_at, is_adopter, last_message_at, member_text_at, keeper_text_at, member_read_at, keeper_read_at, cat:meow_cats(photo_url)";

type Row = Omit<DeskThread, "cat_photo"> & { cat: { photo_url: string | null } | null };

const day = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
    : `${d.getMonth() + 1}/${d.getDate()}`;
};

export function AdoptionDesk({ userId }: { userId: string }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<DeskThread[] | undefined>(undefined);
  const [category, setCategory] = useState<Category>("all");
  const [cat, setCat] = useState("all");
  const [sel, setSel] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("meow_threads").select(SELECT).order("last_message_at", { ascending: false }).limit(300);
    setRows(((data ?? []) as unknown as Row[]).map(({ cat: c, ...r }) => ({ ...r, cat_photo: c?.photo_url ? photoSrc(sb, c.photo_url) : null })));
  }, [sb]);

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
    const ch = sb.channel(`desk-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meow_threads" }, () => load())
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { sb.removeChannel(ch); window.removeEventListener("focus", onFocus); };
  }, [sb, userId, load]);

  const threads = useMemo(() => rows ?? [], [rows]);
  const desk = useMemo(() => buildDesk(threads, userId, { category, cat }), [threads, userId, category, cat]);
  const current = threads.find(x => x.id === sel) ?? null;
  const currentId = current?.id;
  const currentHome = current ? (current.homed_at ? "homed" : current.declined_at ? "declined" : "all") : null;

  // 從通知或網址打開某一串時，切到那一串所在的分類
  useEffect(() => {
    if (!currentHome) return;
    setCategory(c => (currentHome !== "all" ? currentHome : c === "declined" || c === "homed" ? "all" : c));
  }, [currentId, currentHome]);

  function open(id: string | null) {
    setSel(id);
    const u = new URL(window.location.href);
    u.hash = "";
    if (id) u.searchParams.set("t", id); else u.searchParams.delete("t");
    window.history.pushState(null, "", u);
  }

  function pickCategory(k: Category) {
    setCategory(k);
    // 換分類後，原本選的貓不在這個分類就回到全部的貓
    if (cat !== "all" && !buildDesk(threads, userId, { category: k, cat: "all" }).cats.some(c => c.id === cat)) setCat("all");
  }

  if (rows === undefined) return <p className={f.lead} role="status">載入中…</p>;
  if (!threads.length) return (
    <section className={`${f.card} ${f.center}`}>
      <h2>還沒有領養申請或私訊</h2>
      <p className={f.lead}>填寫領養問卷、傳訊息給喵戶長，或有人申請你的待領養貓時，對話都會出現在這裡。</p>
      <div className={f.actions} style={{ justifyContent: "center" }}>
        <CatButton href="/#adopt">去看待領養的貓</CatButton>
        <CatButton variant="ghost" href="/me">回到我的喵戶</CatButton>
      </div>
    </section>
  );

  return (
    <div className={`${s.desk} ${current ? s.picked : ""}`}>
      <div className={s.filters}>
        <div className={s.chips} role="group" aria-label="依分類篩選">
          {desk.categories.map(c => (
            <button key={c.key} type="button" className={s.chip} aria-pressed={category === c.key} onClick={() => pickCategory(c.key)}>
              {c.label}<span className={s.count}>{c.count}</span>
            </button>
          ))}
        </div>
        <div className={s.chips} role="group" aria-label="依貓篩選">
          <button type="button" className={s.chip} aria-pressed={cat === "all"} onClick={() => setCat("all")}>全部的貓</button>
          {desk.cats.map(c => (
            <button key={c.id} type="button" className={s.chip} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
              {c.name}
              {c.unread > 0 && <span className={s.unreadNum} aria-label={`${c.unread} 則未讀`}>{c.unread}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className={s.cols}>
        <ul className={s.list} aria-label="對話列表">
          {desk.cards.length === 0 && <li className={s.empty}>這個篩選下沒有對話</li>}
          {desk.cards.map(c => (
            <li key={c.id}>
              <button type="button" className={`${s.card} ${c.unread ? s.unread : ""}`} aria-current={c.id === sel ? "true" : undefined} onClick={() => open(c.id)}>
                <span className={s.thumb}>{c.photo ? <img src={c.photo} alt="" /> : <Icon name="cat" size={22} />}</span>
                <span className={s.cardText}>
                  <b>{c.catName}<span className={s.x} aria-hidden> × </span><span className={s.sr}>，</span>{c.who}</b>
                  <span className={s.cardMeta}>
                    {c.adopter ? <span className={`${s.status} ${s.adopter}`}>領養人</span> : <span className={s.status}>{c.label}</span>}
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
            ? <ThreadPane key={current.id} thread={current} userId={userId} onChanged={load} onBack={() => open(null)} />
            : <div className={s.placeholder}><Icon name="comment" size={40} /><p>選一則對話開始聊</p></div>}
        </section>
      </div>
    </div>
  );
}
