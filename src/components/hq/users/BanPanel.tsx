"use client";
// 黑名單（規格書 §4.6、R9）：只有系統管理員能操作；對象只限貓友與貓戶長；加入需原因＋輸入對方 Email 確認。
import { useId, useState } from "react";
import { composeReason, confirmBanEmail, getQuickReasons } from "@/lib/hq/actions";
import type { HqActor } from "@/lib/hq/permissions";
import type { HqRole } from "@/lib/hq/types";
import { HqSaveButton } from "../HqStates";
import { ReasonField } from "./ReasonField";

export type BanSubmit = { ban: boolean; reason: string };

export function BanPanel({ actor, target, banned, onSubmit }: {
  actor: HqActor | null; target: { role: HqRole; email: string | null }; banned: boolean;
  onSubmit: (v: BanSubmit) => Promise<void> | void;
}) {
  const emailId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const [email, setEmail] = useState("");
  if (actor?.role !== "system_admin") return null;

  const isAdmin = target.role === "admin" || target.role === "system_admin";
  const text = composeReason(reason.quick, reason.extra);
  const emailOk = banned || confirmBanEmail(email, target.email).ok;

  function close() { setOpen(false); setReason({ quick: "", extra: "" }); setEmail(""); }
  async function save() { await onSubmit({ ban: !banned, reason: text }); close(); }

  return (
    <section className="hq-box" aria-label="黑名單">
      <h3>黑名單</h3>
      <p className="hq-hint" style={{ margin: 0 }}>{banned ? "此帳號在黑名單中，無法登入 Meow Home。" : "永久禁止此 Google 帳號註冊或登入。"}</p>
      {!open && (
        <div className="hq-row">
          <button type="button" className={`hq-btn ${banned ? "ghost" : "danger"} small`} disabled={!banned && isAdmin} onClick={() => setOpen(true)}>
            {banned ? "移出黑名單" : "加入黑名單"}
          </button>
          {!banned && isAdmin && <span className="hq-hint">需先撤銷管理員身分</span>}
        </div>
      )}
      {open && (
        <>
          <ReasonField quick={getQuickReasons(banned ? "unban" : "ban")} value={reason} onChange={setReason} />
          {!banned && (
            <>
              <label htmlFor={emailId} className="hq-label">輸入對方 Email 確認</label>
              <input id={emailId} className="hq-input" type="email" value={email} placeholder={target.email ?? ""} onChange={e => setEmail(e.target.value)} />
            </>
          )}
          <div className="hq-row hq-actions">
            <HqSaveButton onSave={save} disabled={!text || !emailOk}>{banned ? "確認移出黑名單" : "確認加入黑名單"}</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={close}>取消</button>
          </div>
        </>
      )}
    </section>
  );
}
