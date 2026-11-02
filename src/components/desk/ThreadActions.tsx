"use client";
// 對話框上方的動作面板（#128 追加）：婉拒（AI 先擬理由）、移轉（中途提出要再輸入貓名）、領養人確認接收。
// 寫入都走 0013 的資料庫函式，資料庫會再檢查一次（貓名、轉入喵戶、狀態）。
import { useEffect, useState } from "react";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Required from "@/components/ui/Required";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./desk.module.css";

const REASON_MAX = 500;

export interface PendingTransfer { id: string; to_member_id: string }

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<boolean>;

/** 婉拒：先向 /api/adoption/decline-draft 拿草稿，中途改完再送出 */
export function DeclinePanel({ threadId, memberName, rpc, onCancel }: { threadId: string; memberName: string; rpc: Rpc; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  const [drafting, setDrafting] = useState(true);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  async function draft() {
    setDrafting(true);
    try {
      const r = await fetch("/api/adoption/decline-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId }) });
      const d = await r.json().catch(() => ({}));
      if (typeof d.reason === "string") setReason(d.reason);
    } finally { setDrafting(false); }
  }
  useEffect(() => { draft(); }, [threadId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setTried(true);
    if (!reason.trim()) return;
    setBusy(true);
    await rpc("meow_decline_thread", { p_reason: reason.trim() });
    setBusy(false);
  }

  return (
    <div className={s.confirm} role="dialog" aria-label="婉拒這份申請">
      <p>婉拒後，{memberName}會收到通知和你寫的理由，這份申請會移到「婉拒」。之後還可以恢復。</p>
      <div className={f.field}>
        <label className={f.label} htmlFor={`reason-${threadId}`}>婉拒理由<Required /></label>
        <textarea id={`reason-${threadId}`} rows={4} maxLength={REASON_MAX} value={reason} disabled={drafting}
          placeholder={drafting ? "正在幫你擬草稿…" : "寫給申請人的說明"} onChange={e => setReason(e.target.value)} />
      </div>
      {tried && !reason.trim() && <p className={f.error} role="alert">還缺：婉拒理由</p>}
      <div className={f.actions}>
        <CatButton size="sm" disabled={busy || drafting} onClick={submit}>{busy ? "送出中…" : "確認婉拒"}</CatButton>
        <button type="button" className={f.linkBtn} disabled={drafting || busy} onClick={draft}>重新擬一份</button>
        <button type="button" className={f.linkBtn} onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 移轉（中途）：說明後果，再輸入一次貓名並勾選已確認交接，才能送出 */
export function TransferPanel({ catName, memberName, rpc, onCancel }: { catName: string; memberName: string; rpc: Rpc; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const missing = [name.trim() !== catName && "輸入貓的名字", !agreed && "確認已談好交接"].filter(Boolean);

  async function submit() {
    setTried(true);
    if (missing.length) return;
    setBusy(true);
    await rpc("meow_offer_transfer", { p_confirm_name: name.trim() });
    setBusy(false);
  }

  return (
    <div className={s.confirm} role="dialog" aria-label={`把${catName}移轉給${memberName}`}>
      <p>要把「{catName}」交給 {memberName} 嗎？{memberName} 確認接收後才會生效：</p>
      <ul className={s.consequences}>
        <li>{catName}會搬到 {memberName} 的喵戶，之後你只能查看牠的資料。</li>
        <li>領養問卷停止填寫，其他申請人會收到婉拒通知。</li>
        <li>你們的對話會移到「送養追蹤」，可以繼續關心牠的近況。</li>
      </ul>
      <div className={f.field}>
        <label className={f.label} htmlFor="transfer-name">再輸入一次貓的名字「{catName}」<Required /></label>
        <input id="transfer-name" value={name} autoComplete="off" onChange={e => setName(e.target.value)} />
      </div>
      <label className={s.check}>
        <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>我已經和 {memberName} 談好交接的時間和方式<Required /></span>
      </label>
      {tried && missing.length > 0 && <p className={f.error} role="alert">還缺：{missing.join("、")}</p>}
      <div className={f.actions}>
        <CatButton size="sm" disabled={busy} onClick={submit}>{busy ? "送出中…" : "確認移轉"}</CatButton>
        <button type="button" className={f.linkBtn} onClick={onCancel}>取消</button>
      </div>
    </div>
  );
}

/** 等待確認中的移轉：中途可以取消；領養人選轉入喵戶後接收，或先不要 */
export function TransferBanner({ transfer, isMember, catName, memberName, userId, onDone, onError }: {
  transfer: PendingTransfer; isMember: boolean; catName: string; memberName: string; userId: string;
  onDone: () => void; onError: (m: string) => void;
}) {
  const sb = getBrowserSupabase();
  const [homes, setHomes] = useState<{ id: string; name: string }[] | null>(null);
  const [dest, setDest] = useState("new");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb || !isMember) return;
    sb.from("meow_households").select("id, name").eq("owner_id", userId).eq("caretaker_type", "cat_owner").order("created_at")
      .then(({ data }) => { const list = data ?? []; setHomes(list); if (list[0]) setDest(list[0].id); });
  }, [sb, isMember, userId]);

  async function run(fn: string, args: Record<string, unknown>) {
    if (!sb) return;
    setBusy(true);
    const { error } = await sb.rpc(fn, { p_transfer_id: transfer.id, ...args });
    setBusy(false);
    if (error) onError(error.message); else onDone();
  }

  if (!isMember) return (
    <div className={s.pendingBar} role="status">
      <p>已經提出把「{catName}」交給 {memberName}，等對方確認接收。</p>
      <button type="button" className={f.linkBtn} disabled={busy} onClick={() => run("meow_cancel_transfer", {})}>取消移轉</button>
    </div>
  );

  return (
    <div className={s.pendingBar} role="dialog" aria-label={`接收${catName}`}>
      <p>中途想把「{catName}」交給你。確認接收後，{catName}會住進你選的喵戶。</p>
      {homes && (
        <div className={f.field}>
          <label className={f.label} htmlFor="transfer-dest">要住進哪個喵戶<Required /></label>
          <select id="transfer-dest" value={dest} onChange={e => { setDest(e.target.value); setSure(false); }}>
            {homes.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
            <option value="new">幫我建立一個新的喵戶</option>
          </select>
        </div>
      )}
      {sure ? (
        <div className={f.actions}>
          <CatButton size="sm" disabled={busy} onClick={() => run("meow_accept_transfer", { p_household_id: dest === "new" ? null : dest })}>
            {busy ? "處理中…" : `確定接收${catName}`}
          </CatButton>
          <button type="button" className={f.linkBtn} disabled={busy} onClick={() => setSure(false)}>再想想</button>
        </div>
      ) : (
        <div className={f.actions}>
          <CatButton size="sm" disabled={busy || !homes} onClick={() => setSure(true)}>接收{catName}</CatButton>
          <button type="button" className={f.linkBtn} disabled={busy} onClick={() => run("meow_decline_transfer", {})}>先不要</button>
        </div>
      )}
    </div>
  );
}
