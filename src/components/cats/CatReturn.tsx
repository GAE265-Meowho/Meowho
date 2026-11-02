"use client";
// 退養請求（#109）：一般飼主在貓咪頁向原中途提出、可以撤回；原中途在「我的喵戶」確認收回或婉拒。
// 寫入一律走 0009 的資料庫函式（狀態、所屬喵戶只能由流程改變）。私訊（#70）做好後在這裡加「傳訊息給飼主」。
import { useCallback, useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./catPage.module.css";

export interface ReturnRow {
  id: string; cat_id: string; cat_name: string; from_household_name: string; reason: string;
  status: "pending" | "returned" | "declined" | "withdrawn"; created_at: string; resolved_at: string | null;
}

export const RETURN_STATUS: Record<ReturnRow["status"], string> = { pending: "處理中", returned: "已收回", declined: "已婉拒", withdrawn: "已撤回" };
const COLS = "id, cat_id, cat_name, from_household_name, reason, status, created_at, resolved_at";

const ERRORS: Record<string, string> = {
  return_not_owner: "只有目前的飼主能提出退養請求。",
  return_no_origin: "這隻貓沒有原中途，無法退養。",
  return_reason_required: "請說明退養原因。",
  return_not_pending: "這筆請求已經處理過了，請重新整理。",
  meow_cat_returns_one_pending: "已經有一筆處理中的退養請求。",
};
const errText = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? `送出失敗：${m}`;
const day = (iso: string) => iso.slice(0, 10).replaceAll("-", "/");

/** 飼主：貓咪頁上的退養請求 */
export function ReturnRequest({ catId, catName }: { catId: string; catName: string }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<ReturnRow[] | null>(null);
  const [writing, setWriting] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sb) return;
    const { data } = await sb.from("meow_cat_returns").select(COLS).eq("cat_id", catId).order("created_at", { ascending: false });
    setRows((data ?? []) as ReturnRow[]);
  }, [sb, catId]);
  useEffect(() => { load(); }, [load]);

  async function call(fn: string, args: Record<string, unknown>) {
    if (!sb) return false;
    setBusy(true); setError(null);
    const { error: err } = await sb.rpc(fn, args);
    setBusy(false);
    if (err) { setError(errText(err.message)); return false; }
    await load();
    return true;
  }

  async function submit() {
    setTried(true);
    if (!reason.trim()) return;
    if (await call("meow_request_cat_return", { p_cat_id: catId, p_reason: reason })) { setWriting(false); setReason(""); setTried(false); }
  }

  if (!sb || rows === null) return null;
  const pending = rows.find(r => r.status === "pending");
  const past = rows.filter(r => r.status !== "pending");

  return (
    <section className={f.card} aria-labelledby="sec-return">
      <h2 id="sec-return">退養</h2>
      {pending ? (
        <>
          <p className={f.lead}>{day(pending.created_at)} 已向原中途提出退養請求，等中途和你聯絡。</p>
          <p className={s.story}>{pending.reason}</p>
          <div className={f.actions}>
            <CatButton variant="ghost" size="sm" ears={false} disabled={busy} onClick={() => call("meow_withdraw_cat_return", { p_return_id: pending.id })}>
              {busy ? "處理中…" : "撤回請求"}
            </CatButton>
          </div>
        </>
      ) : writing ? (
        <div className={f.field}>
          <label className={f.label} htmlFor="return-reason">退養原因<Required /></label>
          <textarea id="return-reason" rows={4} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)}
            placeholder={`例如：要出國工作，沒辦法帶${catName}一起去`} />
          {tried && !reason.trim() && <p className={f.error} role="alert">還缺：退養原因</p>}
          <div className={f.actions}>
            <CatButton disabled={busy} onClick={submit}>{busy ? "送出中…" : "送出退養請求"}</CatButton>
            <button type="button" className={f.linkBtn} onClick={() => { setWriting(false); setTried(false); }}>取消</button>
          </div>
        </div>
      ) : (
        <>
          <p className={f.lead}>真的無法繼續照顧{catName}時，可以向原中途提出退養請求。中途和你聊過、確認後，{catName}會回到中途身邊。</p>
          <div className={f.actions}>
            <CatButton variant="ghost" size="sm" ears={false} onClick={() => setWriting(true)}>提出退養請求</CatButton>
          </div>
        </>
      )}
      {error && <p className={f.error} role="alert">{error}</p>}
      {past.length > 0 && (
        <ul className={s.list}>
          {past.map(r => <li key={r.id}>{day(r.created_at)} 提出，{RETURN_STATUS[r.status]}</li>)}
        </ul>
      )}
    </section>
  );
}

/** 原中途：「我的喵戶」上處理中的退養請求 */
export function ReturnInbox({ homeIds, onReturned }: { homeIds: string[]; onReturned: () => void }) {
  const sb = getBrowserSupabase();
  const [rows, setRows] = useState<ReturnRow[]>([]);
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = homeIds.join(",");

  const load = useCallback(async () => {
    if (!sb || !key) return;
    const { data } = await sb.from("meow_cat_returns").select(COLS).in("origin_household_id", key.split(",")).eq("status", "pending").order("created_at");
    setRows((data ?? []) as ReturnRow[]);
  }, [sb, key]);
  useEffect(() => { load(); }, [load]);

  async function resolve(id: string, accept: boolean) {
    if (!sb) return;
    setBusy(true); setError(null);
    const { error: err } = await sb.rpc("meow_resolve_cat_return", { p_return_id: id, p_accept: accept });
    setBusy(false); setAsking(null);
    if (err) { setError(errText(err.message)); return; }
    await load();
    if (accept) onReturned();
  }

  if (!rows.length) return null;
  return (
    <section className={f.card} aria-labelledby="return-inbox">
      <h2 id="return-inbox">退養請求（{rows.length}）</h2>
      <ul className={s.returns}>
        {rows.map(r => (
          <li key={r.id}>
            <p><b>「{r.from_household_name}」想把「{r.cat_name}」退回給你</b><span className={f.lead}>{day(r.created_at)}</span></p>
            <p className={s.story}>{r.reason}</p>
            {asking === r.id ? (
              <div className={f.actions}>
                <span className={f.lead}>確認收回後，{r.cat_name}會回到你的喵戶、改回待領養，原本的問卷維持暫停。</span>
                <CatButton size="sm" disabled={busy} onClick={() => resolve(r.id, true)}>{busy ? "處理中…" : "確認收回"}</CatButton>
                <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setAsking(null)}>取消</button>
              </div>
            ) : (
              <div className={f.actions}>
                <CatButton size="sm" disabled={busy} onClick={() => setAsking(r.id)}>收回{r.cat_name}</CatButton>
                <CatButton variant="ghost" size="sm" ears={false} disabled={busy} onClick={() => resolve(r.id, false)}>不用退養</CatButton>
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className={f.error} role="alert">{error}</p>}
    </section>
  );
}
