"use client";
// 待辦總覽（T-HQ-07，規格書 §4.1）：只顯示有權限的模組；卡片點入帶篩選；下方是自己最近 5 筆管理動作。
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { HqLoadError, HqSkeleton } from "@/components/hq/HqStates";
import { describeAudit, formatTaipei, type AuditLog } from "@/lib/hq/audit";
import { hasModule } from "@/lib/hq/permissions";
import { buildTodoCards, recentOwnActions, type TodoCounts } from "@/lib/hq/todos";
import { getBrowserSupabase } from "@/lib/supabase/client";

const LOG_COLS = "id, actor_id, action, target_type, target_id, reason, detail, created_at";

export default function HqHomePage() {
  const { actor, userId, preview } = useHqActor();
  const [counts, setCounts] = useState<TodoCounts>({});
  const [mine, setMine] = useState<AuditLog[]>([]);
  const [grantLog, setGrantLog] = useState<AuditLog[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    if (!actor) return;
    const sb = getBrowserSupabase();
    if (preview || !sb || !userId) { setState("ok"); return; }
    setState("loading");
    try {
      const next: TodoCounts = {};
      if (hasModule(actor, "user_management")) {
        const r = await sb.from("meow_shelter_verifications").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (r.error) throw r.error;
        next.verifications_pending = r.count ?? 0;
      }
      const own = await sb.from("meow_audit_logs").select(LOG_COLS).eq("actor_id", userId).order("created_at", { ascending: false }).limit(5);
      if (own.error) throw own.error;
      if (actor.role === "system_admin") {
        const g = await sb.from("meow_audit_logs").select(LOG_COLS).in("action", ["grant_module", "revoke_grant", "set_role"]).order("created_at", { ascending: false }).limit(3);
        if (g.error) throw g.error;
        setGrantLog((g.data ?? []) as AuditLog[]);
      }
      setCounts(next);
      setMine(recentOwnActions((own.data ?? []) as AuditLog[], userId));
      setState("ok");
    } catch {
      setState("error");
    }
  }, [actor, userId, preview]);

  useEffect(() => { void load(); }, [load]);

  if (!actor || state === "loading") return (<><h1 className="hq-h1">待辦總覽</h1><HqSkeleton rows={3} /></>);
  if (state === "error") return (<><h1 className="hq-h1">待辦總覽</h1><HqLoadError onRetry={() => void load()} /></>);

  const cards = buildTodoCards(actor, counts);
  return (
    <>
      <h1 className="hq-h1">待辦總覽</h1>
      <p className="hq-sub" style={{ marginTop: 0 }}>只顯示你有權限的模組。</p>
      <div className="hq-cards">
        {cards.map(c => (
          <section key={c.module} className="hq-tcard" aria-label={c.label}>
            <h2>{c.label}</h2>
            {c.status === "todo" && <div className="hq-total">{c.total}</div>}
            {(c.status === "empty" || c.status === "unavailable") && <div className="hq-total zero">{c.statusText}</div>}
            {c.items.length > 0 && (
              <ul>{c.items.map(i => <li key={i.key}><Link href={i.href}><span>{i.label}</span><b>{i.count}</b></Link></li>)}</ul>
            )}
            {c.status === "info" && (
              grantLog.length ? (
                <ul>{grantLog.map(l => <li key={l.id}><Link href="/MeowHQ/admin?tab=audit"><span>{describeAudit(l)}</span><span className="hq-hint">{formatTaipei(l.created_at).slice(5)}</span></Link></li>)}</ul>
              ) : <div className="hq-total zero">最近沒有授權變更</div>
            )}
          </section>
        ))}
      </div>

      <section className="hq-section" aria-label="我最近的管理動作">
        <h2>我最近的管理動作</h2>
        {mine.length === 0 ? <p className="hq-hint">還沒有管理動作。</p> : (
          <ul className="hq-log">
            {mine.map(l => (
              <li key={l.id}><strong>{describeAudit(l)}</strong><span className="hq-hint">原因：{l.reason}</span><time className="hq-hint">{formatTaipei(l.created_at)}</time></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
