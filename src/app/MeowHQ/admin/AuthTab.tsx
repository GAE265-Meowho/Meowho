"use client";
// 管理員授權（規格書 §4.3）：管理員 × 模組勾選矩陣、新增管理員、撤銷身分。所有寫入走 RPC（原因必填、寫稽核日誌）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { HqLoadError, HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { useHqToast } from "@/components/hq/HqToast";
import { composeReason } from "@/lib/hq/actions";
import { ADMIN_QUICK_REASONS, diffGrants, type GrantMap } from "@/lib/hq/admin-auth";
import { roleLabel } from "@/lib/hq/audit";
import { canRemoveSystemAdmin } from "@/lib/hq/permissions";
import { ADMIN_MODULE_LABELS, GRANTABLE_MODULES } from "@/lib/hq/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { ReasonField } from "./ReasonField";

interface AdminRow { id: string; email: string | null; display_name: string | null; role: "admin" | "system_admin" }
const LOG = "/MeowHQ/admin?tab=audit";
const needReason = () => { throw { hint: "請填寫原因" }; };

export function AuthTab() {
  const { userId, preview, reload: reloadActor } = useHqActor();
  const toast = useHqToast();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [saved, setSaved] = useState<GrantMap>({});
  const [draft, setDraft] = useState<GrantMap>({});
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [reason, setReason] = useState({ quick: "", extra: "" });
  const [roleReason, setRoleReason] = useState({ quick: "", extra: "" });
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "system_admin">("admin");
  const [removing, setRemoving] = useState<AdminRow | null>(null);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) { setState("ok"); return; }
    setState("loading");
    const [p, g] = await Promise.all([
      sb.from("meow_profiles").select("id, email, display_name, role").in("role", ["admin", "system_admin"]).order("role", { ascending: false }).order("email"),
      sb.from("meow_admin_module_grants").select("admin_id, module"),
    ]);
    if (p.error || g.error) { setState("error"); return; }
    const map: GrantMap = {};
    for (const a of p.data ?? []) map[a.id] = [];
    for (const r of g.data ?? []) if (map[r.admin_id]) map[r.admin_id] = [...map[r.admin_id], r.module];
    setAdmins((p.data ?? []) as AdminRow[]);
    setSaved(map); setDraft(map); setState("ok");
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  const changes = useMemo(() => diffGrants(saved, draft), [saved, draft]);
  const changeCount = changes.grants.length + changes.revokes.length;
  const systemAdminCount = admins.filter(a => a.role === "system_admin").length;
  const name = (a: AdminRow) => a.display_name || a.email || "（未命名）";

  const toggle = (id: string, m: string) => setDraft(d => {
    const cur = d[id] ?? [];
    return { ...d, [id]: cur.includes(m) ? cur.filter(x => x !== m) : [...cur, m] };
  });

  async function saveGrants() {
    const r = composeReason(reason.quick, reason.extra);
    if (!r) needReason();
    const sb = getBrowserSupabase();
    if (!sb) return;
    for (const c of changes.grants) {
      const { error } = await sb.rpc("meow_grant_module", { p_admin_id: c.adminId, p_module: c.module, p_reason: r });
      if (error) { await load(); throw error; }
    }
    for (const c of changes.revokes) {
      const { error } = await sb.rpc("meow_revoke_module", { p_admin_id: c.adminId, p_module: c.module, p_reason: r });
      if (error) { await load(); throw error; }
    }
    setReason({ quick: "", extra: "" });
    toast.show({ message: `已更新 ${changeCount} 項模組授權`, logHref: LOG });
    await load();
  }

  async function setRole(email: string, role: "admin" | "system_admin" | "member", done: string) {
    const r = composeReason(roleReason.quick, roleReason.extra);
    if (!r) needReason();
    if (!email.trim()) throw { hint: "請輸入 Email" };
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { error } = await sb.rpc("meow_set_role", { p_email: email.trim(), p_role: role, p_reason: r });
    if (error) throw error;
    setRoleReason({ quick: "", extra: "" }); setNewEmail(""); setRemoving(null);
    toast.show({ message: done, logHref: LOG });
    await load();
    reloadActor();
  }

  if (state === "loading") return <HqSkeleton rows={4} />;
  if (state === "error") return <HqLoadError onRetry={() => void load()} />;

  return (
    <>
      {preview && <p className="hq-note">預覽模式不連資料庫，看不到管理員清單。</p>}

      <section className="hq-section" aria-label="模組授權">
        <h2>模組授權</h2>
        <p className="hq-hint">系統管理員擁有全部模組；勾選後填原因再儲存。</p>
        <table className="hq-table hq-matrix">
          <thead><tr><th scope="col">管理員</th>{GRANTABLE_MODULES.map(m => <th key={m} scope="col">{ADMIN_MODULE_LABELS[m]}</th>)}<th scope="col">身分</th></tr></thead>
          <tbody>
            {admins.map(a => {
              const sys = a.role === "system_admin";
              const lastSys = sys && !canRemoveSystemAdmin(systemAdminCount).allowed;
              return (
                <tr key={a.id}>
                  <td data-label="管理員"><strong>{name(a)}</strong><br /><span className="hq-hint">{a.email}{a.id === userId ? "（你）" : ""}</span></td>
                  {GRANTABLE_MODULES.map(m => (
                    <td key={m} data-label={ADMIN_MODULE_LABELS[m]}>
                      {sys ? <span className="hq-tag mute">全部模組</span> : (
                        <label className="hq-check">
                          <input type="checkbox" checked={(draft[a.id] ?? []).includes(m)} onChange={() => toggle(a.id, m)}
                            aria-label={`${name(a)}：${ADMIN_MODULE_LABELS[m]}`} />
                        </label>
                      )}
                    </td>
                  ))}
                  <td data-label="身分">
                    <div className="hq-row">
                      <span className={`hq-tag${sys ? " warn" : ""}`}>{roleLabel(a.role)}</span>
                      <button className="hq-btn ghost small" disabled={lastSys} onClick={() => setRemoving(a)}>撤銷身分</button>
                    </div>
                    {lastSys && <span className="hq-hint">至少要保留一位系統管理員</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {changeCount > 0 && (
          <div className="hq-box">
            <h3>變更 {changeCount} 項（授予 {changes.grants.length}、撤銷 {changes.revokes.length}）</h3>
            <ReasonField quick={ADMIN_QUICK_REASONS.grant} value={reason} onChange={setReason} />
            <div className="hq-row">
              <HqSaveButton onSave={saveGrants}>儲存授權</HqSaveButton>
              <button className="hq-btn ghost" onClick={() => setDraft(saved)}>取消變更</button>
            </div>
          </div>
        )}
      </section>

      {removing && (
        <section className="hq-section" aria-label="撤銷身分">
          <div className="hq-box">
            <h3>撤銷「{name(removing)}」的{roleLabel(removing.role)}身分</h3>
            <p className="hq-note">撤銷後改為一般會員，模組授權一併清除；原本的貓戶、貓友身分不受影響。</p>
            <ReasonField quick={ADMIN_QUICK_REASONS.role} value={roleReason} onChange={setRoleReason} />
            <div className="hq-row">
              <HqSaveButton onSave={() => setRole(removing.email ?? "", "member", `已撤銷 ${name(removing)} 的管理身分`)}>確認撤銷</HqSaveButton>
              <button className="hq-btn ghost" onClick={() => setRemoving(null)}>取消</button>
            </div>
          </div>
        </section>
      )}

      <section className="hq-section" aria-label="新增管理員">
        <h2>新增管理員</h2>
        <div className="hq-box">
          <p className="hq-hint">對方需先用 Google 登入過 Meow Home。管理員同時仍可以是貓戶長或貓友。</p>
          <div className="hq-row">
            <input className="hq-input" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email" aria-label="Email" />
            <select className="hq-input" value={newRole} onChange={e => setNewRole(e.target.value as "admin" | "system_admin")} aria-label="角色">
              <option value="admin">管理員</option>
              <option value="system_admin">系統管理員</option>
            </select>
          </div>
          {!removing && <ReasonField quick={ADMIN_QUICK_REASONS.role} value={roleReason} onChange={setRoleReason} />}
          <HqSaveButton disabled={Boolean(removing)} onSave={() => setRole(newEmail, newRole, `已將 ${newEmail.trim()} 設為${roleLabel(newRole)}`)}>新增</HqSaveButton>
        </div>
      </section>
    </>
  );
}
