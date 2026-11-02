"use client";
/* eslint-disable @next/next/no-img-element */
// 領養管理的對話框（#128，#70 私訊）：上方是貓與對方、背景標記、可收合的問卷回答；中間是訊息；底部輸入框。
// 寫入一律走 0011 的資料庫函式；新訊息用 Supabase Realtime 即時出現，切回視窗時也會重新讀一次。
// 背景標記：「系統認證」依系統紀錄（目前只有「送出了這隻貓的領養問卷」，7 天虛擬飼養完成後再加）；
// 「自填」等領養人 profile（#56）做好後從那裡讀，現在沒有資料就不顯示。
import { useCallback, useEffect, useRef, useState } from "react";
import { AnswerList } from "@/components/adoption-form/Responses";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { KEEPER_STATUS, MEMBER_STATUS, replyStatus, type DeskThread, type Role } from "@/lib/adoption-desk";
import type { Answers, Question } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./desk.module.css";

export interface PaneThread extends DeskThread { member_id: string; household_id: string }
interface Msg { id: string; sender_id: string | null; kind: "text" | "system"; body: string; created_at: string }
interface Applied { questions: Question[]; answers: Answers; photo_paths: string[]; submitted_at: string | null }
type Block = "none" | "i_blocked" | "blocked";

const MAX = 1000;
const ERRORS: Record<string, string> = {
  message_empty: "請輸入訊息。",
  message_too_long: `訊息最多 ${MAX} 字。`,
  message_blocked: "你們之間有封鎖設定，無法傳送。",
  message_suspended: "帳號目前無法傳送訊息。",
  thread_not_participant: "找不到這段對話，請重新整理。",
  thread_not_keeper: "只有喵戶長可以這樣做。",
  thread_cat_gone: "這隻貓已經不在你的喵戶等家了，不能恢復。",
};
const errText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? `操作失敗：${m}`;
const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function ThreadPane({ thread, role, userId, onChanged, onBack }: {
  thread: PaneThread; role: Role; userId: string; onChanged: () => void; onBack: () => void;
}) {
  const sb = getBrowserSupabase();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [block, setBlock] = useState<Block>("none");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"decline" | "block" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const id = thread.id;

  const markRead = useCallback(async () => {
    if (!sb) return;
    await sb.rpc("meow_mark_thread_read", { p_thread_id: id });
    onChanged();
  }, [sb, id, onChanged]);

  const loadMsgs = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("meow_messages").select("id, sender_id, kind, body, created_at").eq("thread_id", id).order("created_at").limit(500);
    setMsgs((data ?? []) as Msg[]);
  }, [sb, id]);

  useEffect(() => {
    if (!sb) return;
    loadMsgs().then(markRead);
    sb.rpc("meow_thread_block_state", { p_thread_id: id }).then(({ data }) => setBlock((data as Block) ?? "none"));
    // 問卷回答：中途看申請人的、領養人看自己的（貓移轉後中途就讀不到了，這時不顯示）
    (async () => {
      const { data: form } = await sb.from("meow_adoption_forms").select("id, questions").eq("cat_id", thread.cat_id).maybeSingle();
      if (!form) return;
      const { data: r } = await sb.from("meow_adoption_responses").select("answers, photo_paths, submitted_at")
        .eq("form_id", form.id).eq("respondent_id", thread.member_id).neq("status", "draft")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (r) setApplied({ questions: form.questions as Question[], ...(r as Omit<Applied, "questions">) });
    })();

    const ch = sb.channel(`thread-${id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meow_messages", filter: `thread_id=eq.${id}` }, p => {
        const m = p.new as Msg;
        setMsgs(list => (list && !list.some(x => x.id === m.id) ? [...list, m] : list));
        if (document.visibilityState === "visible") markRead();
      })
      .subscribe();
    const onFocus = () => loadMsgs();
    window.addEventListener("focus", onFocus);
    return () => { sb.removeChannel(ch); window.removeEventListener("focus", onFocus); };
  }, [sb, id, thread.cat_id, thread.member_id, loadMsgs, markRead]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [msgs?.length]);

  async function call(fn: string, args: Record<string, unknown>) {
    if (!sb) return null;
    setBusy(true); setError(null);
    const res = await sb.rpc(fn, { p_thread_id: id, ...args });
    setBusy(false);
    if (res.error) { setError(errText(res.error.message)); return null; }
    return res;
  }

  async function send() {
    const body = text.trim();
    if (!body) return;
    if (Array.from(body).length > MAX) { setError(ERRORS.message_too_long); return; }
    if (await call("meow_send_message", { p_body: body })) { setText(""); await loadMsgs(); onChanged(); }
  }

  async function decline(on: boolean) {
    setAsking(null);
    if (await call(on ? "meow_decline_thread" : "meow_restore_thread", {})) { await loadMsgs(); onChanged(); }
  }

  async function setBlocked(on: boolean) {
    setAsking(null);
    const res = await call("meow_set_thread_block", { p_block: on });
    if (res) setBlock((res.data as Block) ?? "none");
  }

  const status = replyStatus(thread);
  const label = (role === "keeper" ? KEEPER_STATUS : MEMBER_STATUS)[status];
  const other = role === "keeper" ? thread.member_name : thread.household_name;

  return (
    <div className={s.thread}>
      <header className={s.head}>
        <button type="button" className={s.back} onClick={onBack} aria-label="回到列表"><Icon name="close" size={20} /></button>
        <span className={s.thumb}>{thread.cat_photo ? <img src={thread.cat_photo} alt="" /> : <Icon name="cat" size={22} />}</span>
        <div className={s.headText}>
          <h2><a href={`/cats/${thread.cat_id}`}>{thread.cat_name}</a><span className={s.x} aria-hidden> × </span><span className={s.sr}>，</span>{other}</h2>
          <span className={s.status}>{label}</span>
        </div>
        <div className={s.headActions}>
          {role === "keeper" && (thread.declined_at
            ? <CatButton variant="ghost" size="sm" ears={false} tail={false} disabled={busy} onClick={() => decline(false)}>恢復</CatButton>
            : <CatButton variant="ghost" size="sm" ears={false} tail={false} disabled={busy} onClick={() => setAsking("decline")}>婉拒</CatButton>)}
          {block === "i_blocked"
            ? <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setBlocked(false)}>解除封鎖</button>
            : <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setAsking("block")}>封鎖</button>}
        </div>
      </header>

      {asking && (
        <div className={s.confirm} role="alertdialog" aria-label={asking === "decline" ? "確認婉拒" : "確認封鎖"}>
          <p>{asking === "decline"
            ? `婉拒後，${thread.member_name}會收到通知，這份申請會移到「婉拒」。之後還可以恢復。`
            : `封鎖後，你們都不能再傳訊息給對方。之後可以解除封鎖。`}</p>
          <div className={f.actions}>
            <CatButton size="sm" disabled={busy} onClick={() => (asking === "decline" ? decline(true) : setBlocked(true))}>
              {asking === "decline" ? "確認婉拒" : "確認封鎖"}
            </CatButton>
            <button type="button" className={f.linkBtn} onClick={() => setAsking(null)}>取消</button>
          </div>
        </div>
      )}

      <div className={s.scroll}>
        {(role === "keeper" || applied) && (
          <div className={s.about}>
            {role === "keeper" && applied && (
              <ul className={s.badges} aria-label="背景標記">
                <li className={s.verified}><Icon name="check" size={16} />系統認證：送出了「{thread.cat_name}」的領養問卷</li>
              </ul>
            )}
            {applied && (
              <>
                <button type="button" className={s.toggle} aria-expanded={showAnswers} onClick={() => setShowAnswers(v => !v)}>
                  {role === "keeper" ? "領養問卷回答" : "我送出的問卷"}{applied.submitted_at ? `（${when(applied.submitted_at)}）` : ""}
                  <span aria-hidden>{showAnswers ? "收合" : "展開"}</span>
                </button>
                {showAnswers && <AnswerList questions={applied.questions} answers={applied.answers} photoPaths={applied.photo_paths} />}
              </>
            )}
          </div>
        )}

        <ol className={s.msgs} aria-live="polite">
          {msgs === null && <li className={s.system}>載入中…</li>}
          {msgs?.map(m => m.kind === "system"
            ? <li key={m.id} className={s.system}>{m.body}<time dateTime={m.created_at}>{when(m.created_at)}</time></li>
            : (
              <li key={m.id} className={m.sender_id === userId ? s.mine : s.theirs}>
                <p>{m.body}</p>
                <time dateTime={m.created_at}>{when(m.created_at)}</time>
              </li>
            ))}
        </ol>
        <div ref={endRef} />
      </div>

      {error && <p className={f.error} role="alert">{error}</p>}
      {block === "none" ? (
        <form className={s.composer} onSubmit={e => { e.preventDefault(); send(); }}>
          <textarea aria-label={`傳訊息給${other}`} rows={2} maxLength={MAX} value={text} onChange={e => setText(e.target.value)}
            placeholder="輸入訊息"
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <CatButton type="submit" size="sm" ears={false} disabled={busy || !text.trim()}><Icon name="send" size={18} />傳送</CatButton>
        </form>
      ) : (
        <p className={s.blocked}>{block === "i_blocked" ? "你已封鎖對方，解除封鎖後才能傳訊息。" : "目前無法傳訊息給對方。"}</p>
      )}
    </div>
  );
}
