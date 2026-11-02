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
import { STATUS_LABEL, replyStatus, roleOf, type DeskThread } from "@/lib/adoption-desk";
import type { Answers, Question } from "@/lib/adoption-form/questionnaire";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { DeclinePanel, ReturnBanner, ReturnPanel, TransferBanner, TransferPanel, type PendingReturn, type PendingTransfer } from "./ThreadActions";
import s from "./desk.module.css";

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
  thread_homed: "這隻貓已經找到家了。",
  decline_reason_required: "請填寫婉拒理由。",
  decline_reason_too_long: "婉拒理由最多 500 字。",
  transfer_not_ready: "這隻貓目前不能移轉給這位申請人。",
  transfer_confirm_mismatch: "輸入的貓名不一樣，請再確認一次。",
  transfer_pending: "這隻貓已經有一筆等待確認的移轉。",
  transfer_not_pending: "這筆移轉已經處理過了，請重新整理。",
  transfer_bad_household: "請選擇你自己的一般飼主喵戶。",
  household_limit: "你的喵戶數量已經到上限，請選擇現有的喵戶。",
  return_not_owner: "只有目前的飼主能提出退養請求。",
  return_no_origin: "這隻貓沒有原中途，無法退養。",
  return_reason_required: "請說明退養原因。",
  return_not_pending: "這筆退養請求已經處理過了，請重新整理。",
  meow_cat_returns_one_pending: "已經有一筆處理中的退養請求。",
};
const errText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? `操作失敗：${m}`;
const when = (iso: string) => new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

export function ThreadPane({ thread, userId, onChanged, onBack }: {
  thread: DeskThread; userId: string; onChanged: () => void; onBack: () => void;
}) {
  // 同一頁混合兩種角色：我是這串的會員＝申請方，否則＝審核方（只有審核方能婉拒、看背景標記）
  const role = roleOf(thread, userId);
  const sb = getBrowserSupabase();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [block, setBlock] = useState<Block>("none");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<"decline" | "block" | "transfer" | "return" | null>(null);
  const [transfer, setTransfer] = useState<PendingTransfer | null>(null);
  const [pendingReturn, setPendingReturn] = useState<PendingReturn | null>(null);
  const [catIsMine, setCatIsMine] = useState(false);
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

  // 等待確認的移轉：每次有新訊息（提出、取消、接收都會留系統事件）就重讀
  useEffect(() => {
    if (!sb) return;
    sb.from("meow_cat_transfers").select("id, to_member_id").eq("thread_id", id).eq("status", "pending").maybeSingle()
      .then(({ data }) => setTransfer(data as PendingTransfer | null));
    sb.from("meow_cat_returns").select("id, reason").eq("thread_id", id).eq("status", "pending").maybeSingle()
      .then(({ data }) => setPendingReturn(data as PendingReturn | null));
    // 退養只有貓目前的飼主能提出：讀得到貓、而且貓的喵戶是自己的
    sb.from("meow_cats").select("household:meow_households!meow_cats_household_id_fkey(owner_id)").eq("id", thread.cat_id).maybeSingle()
      .then(({ data }) => setCatIsMine((data?.household as { owner_id?: string } | null)?.owner_id === userId));
  }, [sb, id, thread.cat_id, userId, msgs?.length]);

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

  async function restore() {
    if (await call("meow_restore_thread", {})) { await loadMsgs(); onChanged(); }
  }

  // 婉拒與移轉的面板用：成功就收起面板並重讀
  async function act(fn: string, args: Record<string, unknown>) {
    const ok = Boolean(await call(fn, args));
    if (ok) { setAsking(null); await loadMsgs(); onChanged(); }
    return ok;
  }

  // 退養的函式以貓或請求為對象，不帶對話串 id
  async function actReturn(fn: string, args: Record<string, unknown>) {
    if (!sb) return false;
    setBusy(true); setError(null);
    const { error: err } = await sb.rpc(fn, args);
    setBusy(false);
    if (err) { setError(errText(err.message)); return false; }
    setAsking(null); await loadMsgs(); onChanged();
    return true;
  }

  async function setBlocked(on: boolean) {
    setAsking(null);
    const res = await call("meow_set_thread_block", { p_block: on });
    if (res) setBlock((res.data as Block) ?? "none");
  }

  const label = thread.homed_at && thread.is_adopter ? "領養人" : STATUS_LABEL[replyStatus(thread, role)];
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
          {role === "keeper" && !thread.homed_at && !thread.declined_at && !transfer && (
            <CatButton size="sm" ears={false} tail={false} disabled={busy} onClick={() => setAsking("transfer")}>移轉</CatButton>
          )}
          {role === "keeper" && !thread.homed_at && (thread.declined_at
            ? <CatButton variant="ghost" size="sm" ears={false} tail={false} disabled={busy} onClick={restore}>恢復</CatButton>
            : <CatButton variant="ghost" size="sm" ears={false} tail={false} disabled={busy} onClick={() => setAsking("decline")}>婉拒</CatButton>)}
          {role === "member" && catIsMine && !pendingReturn && (
            <CatButton variant="ghost" size="sm" ears={false} tail={false} disabled={busy} onClick={() => setAsking("return")}>退養</CatButton>
          )}
          {block === "i_blocked"
            ? <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setBlocked(false)}>解除封鎖</button>
            : <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setAsking("block")}>封鎖</button>}
        </div>
      </header>

      {asking === "decline" && <DeclinePanel threadId={id} memberName={thread.member_name} rpc={act} onCancel={() => setAsking(null)} />}
      {asking === "return" && <ReturnPanel catId={thread.cat_id} catName={thread.cat_name} onSubmit={actReturn} onCancel={() => setAsking(null)} />}
      {pendingReturn && !asking && (
        <ReturnBanner pending={pendingReturn} isMember={role === "member"} catName={thread.cat_name} memberName={thread.member_name} onSubmit={actReturn} />
      )}
      {asking === "transfer" && <TransferPanel catName={thread.cat_name} memberName={thread.member_name} rpc={act} onCancel={() => setAsking(null)} />}
      {asking === "block" && (
        <div className={s.confirm} role="alertdialog" aria-label="確認封鎖">
          <p>封鎖後，你們都不能再傳訊息給對方。之後可以解除封鎖。</p>
          <div className={f.actions}>
            <CatButton size="sm" disabled={busy} onClick={() => setBlocked(true)}>確認封鎖</CatButton>
            <button type="button" className={f.linkBtn} onClick={() => setAsking(null)}>取消</button>
          </div>
        </div>
      )}
      {transfer && !asking && (
        <TransferBanner transfer={transfer} isMember={role === "member"} catName={thread.cat_name} memberName={thread.member_name} userId={userId}
          onDone={async () => { await loadMsgs(); onChanged(); }} onError={m => setError(errText(m))} />
      )}

      <div className={s.scroll}>
        {applied && (
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
