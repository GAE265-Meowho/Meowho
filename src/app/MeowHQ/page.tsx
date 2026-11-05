"use client";
// MeowHQ 首頁：KPI Dashboard（#218）＋待辦總覽（T-HQ-07）
// #222 移除「我最近的管理動作」；#224 進頁只載一次；#226 頂部全域抓取時間＋卡片去雜訊
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardView } from "@/components/hq/dashboard/DashboardView";
import { useHqActor } from "@/components/hq/HqActor";
import { HqLoadError, HqSkeleton } from "@/components/hq/HqStates";
import { describeAudit, formatTaipei, type AuditLog } from "@/lib/hq/audit";
import { formatUpdatedAt } from "@/lib/hq/dashboard/format";
import type { DashboardPayload } from "@/lib/hq/dashboard/types";
import { hasModule, type HqActor } from "@/lib/hq/permissions";
import { countTexturePending, textureInfo } from "@/lib/hq/cat-models/types";
import { buildTodoCards, type TodoCounts } from "@/lib/hq/todos";
import { getBrowserSupabase } from "@/lib/supabase/client";

const LOG_COLS = "id, actor_id, action, target_type, target_id, reason, detail, created_at";

export default function HqHomePage() {
  const { actor, userId, preview } = useHqActor();
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [dashState, setDashState] = useState<"loading" | "ok" | "error" | "forbidden">("loading");
  const [counts, setCounts] = useState<TodoCounts>({});
  const [grantLog, setGrantLog] = useState<AuditLog[]>([]);
  const [todoState, setTodoState] = useState<"loading" | "ok" | "error">("loading");
  const actorRef = useRef<HqActor | null>(actor);
  const userIdRef = useRef(userId);
  const previewRef = useRef(preview);
  actorRef.current = actor;
  userIdRef.current = userId;
  previewRef.current = preview;
  const hasDash = useRef(false);
  hasDash.current = Boolean(dash);
  const booted = useRef(false);

  const loadDash = useCallback(async () => {
    const a = actorRef.current;
    if (!a) return;
    if (previewRef.current) {
      setDashState("ok");
      setDash(null);
      return;
    }
    if (!hasDash.current) setDashState("loading");
    try {
      const res = await fetch("/api/hq/dashboard", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) { setDashState("forbidden"); return; }
      if (!res.ok) throw new Error("dash_failed");
      setDash(await res.json() as DashboardPayload);
      setDashState("ok");
    } catch {
      if (!hasDash.current) setDashState("error");
    }
  }, []);

  const loadTodos = useCallback(async () => {
    const a = actorRef.current;
    const uid = userIdRef.current;
    if (!a) return;
    const sb = getBrowserSupabase();
    if (previewRef.current || !sb || !uid) { setTodoState("ok"); return; }
    setTodoState(s => (s === "ok" ? "ok" : "loading"));
    try {
      const next: TodoCounts = {};
      if (hasModule(a, "user_management")) {
        const r = await sb.from("meow_shelter_verifications").select("id", { count: "exact", head: true }).eq("status", "pending");
        if (r.error) throw r.error;
        next.verifications_pending = r.count ?? 0;
      }
      if (hasModule(a, "virtual_assets")) {
        const r = await sb.from("meow_cat_models").select("albedo_path,prev_albedo_path,base_version,meta,profile");
        if (!r.error) {
          next.textures_pending = countTexturePending((r.data ?? []).map(row => ({
            hasAlbedo: Boolean(row.albedo_path), body: "adult" as const,
            texture: textureInfo({
              albedo: row.albedo_path, prev: row.prev_albedo_path, confirmed: row.profile?.confirmed_albedo,
              baseVersion: row.base_version, prevBaseVersion: row.meta?.prev_base_version, ageMonths: null,
            }),
          })));
        }
      }
      if (a.role === "system_admin") {
        const g = await sb.from("meow_audit_logs").select(LOG_COLS).in("action", ["grant_module", "revoke_grant", "set_role"]).order("created_at", { ascending: false }).limit(3);
        if (g.error) throw g.error;
        setGrantLog((g.data ?? []) as AuditLog[]);
      }
      setCounts(next);
      setTodoState("ok");
    } catch {
      setTodoState(s => (s === "ok" ? "ok" : "error"));
    }
  }, []);

  const reload = useCallback(() => { void loadDash(); void loadTodos(); }, [loadDash, loadTodos]);

  // #224：進頁取得 actor 後只載一次
  useEffect(() => {
    if (!actor || booted.current) return;
    booted.current = true;
    void loadDash();
    void loadTodos();
  }, [actor, loadDash, loadTodos]);

  if (!actor || (dashState === "loading" && todoState === "loading" && !dash)) {
    return (<><h1 className="hq-h1">營運總覽</h1><HqSkeleton rows={4} /></>);
  }

  const cards = buildTodoCards(actor, counts);
  const fetchedAt = dash?.generatedAt ? formatUpdatedAt(dash.generatedAt) : null;
  return (
    <>
      <header className="hq-dash-top">
        <div className="hq-dash-top-text">
          <h1 className="hq-h1">營運總覽</h1>
          <p className="hq-sub" style={{ marginTop: 0 }}>業務、資源與系統健康 KPI；下方為你的待辦。</p>
        </div>
        <div className="hq-dash-top-meta">
          <p className="hq-dash-fetched" aria-live="polite">
            {fetchedAt ? <>資料抓取時間：<time dateTime={dash!.generatedAt}>{fetchedAt}</time></> : "資料抓取時間：—"}
          </p>
          <button type="button" className="hq-btn ghost small" onClick={reload}>重新整理</button>
        </div>
      </header>

      {dashState === "loading" && !dash && <HqSkeleton rows={3} />}
      {dashState === "error" && !dash && <HqLoadError onRetry={() => void loadDash()} />}
      {dashState === "forbidden" && <p className="hq-hint" role="alert">沒有權限讀取 KPI（需為管理員）。</p>}
      {dash && <DashboardView data={dash} />}
      {dashState === "ok" && preview && !dash && (
        <p className="hq-banner" role="status">本機預覽模式：KPI 需連線並以管理員身分呼叫 /api/hq/dashboard。</p>
      )}

      <section className="hq-section" aria-label="待辦總覽">
        <h2>待辦總覽</h2>
        <p className="hq-hint" style={{ marginTop: 0 }}>只顯示你有權限的模組。</p>
        {todoState === "loading" && <HqSkeleton rows={2} />}
        {todoState === "error" && <HqLoadError onRetry={() => void loadTodos()} />}
        {todoState === "ok" && (
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
        )}
      </section>
    </>
  );
}
