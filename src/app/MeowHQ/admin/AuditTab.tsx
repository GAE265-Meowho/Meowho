"use client";
// 稽核日誌（規格書 §4.3）：唯讀；依操作者、動作、日期區間篩選；每頁 20 筆
import { useCallback, useEffect, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { HqLoadError, HqSkeleton } from "@/components/hq/HqStates";
import { HqPager } from "@/components/hq/list/HqList";
import { AUDIT_ACTIONS, AUDIT_ACTION_LABELS, describeAudit, formatTaipei, type AuditLog } from "@/lib/hq/audit";
import { PAGE_SIZE } from "@/lib/hq/listing";
import { getBrowserSupabase } from "@/lib/supabase/client";

const COLS = "id, actor_id, action, target_type, target_id, reason, detail, created_at";
interface Filter { actor: string; action: string; from: string; to: string }
const EMPTY: Filter = { actor: "", action: "", from: "", to: "" };

/** 台北日期（YYYY-MM-DD）→ UTC ISO；to 取當天結束 */
const taipei = (d: string, end = false) => new Date(`${d}T${end ? "23:59:59.999" : "00:00:00"}+08:00`).toISOString();

export function AuditTab() {
  const { preview } = useHqActor();
  const [filter, setFilter] = useState<Filter>(EMPTY);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [people, setPeople] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const sb = getBrowserSupabase();
    if (preview || !sb) return;
    sb.from("meow_profiles").select("id, email, display_name").in("role", ["admin", "system_admin"]).then(({ data }) => {
      setPeople(Object.fromEntries((data ?? []).map(p => [p.id, p.display_name || p.email || p.id])));
    });
  }, [preview]);

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) { setState("ok"); return; }
    setState("loading");
    let q = sb.from("meow_audit_logs").select(COLS, { count: "exact" });
    if (filter.actor) q = q.eq("actor_id", filter.actor);
    if (filter.action) q = q.eq("action", filter.action);
    if (filter.from) q = q.gte("created_at", taipei(filter.from));
    if (filter.to) q = q.lte("created_at", taipei(filter.to, true));
    const { data, count, error } = await q.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    if (error) { setState("error"); return; }
    setRows((data ?? []) as AuditLog[]); setTotal(count ?? 0); setState("ok");
  }, [filter, page, preview]);
  useEffect(() => { void load(); }, [load]);

  const set = (patch: Partial<Filter>) => { setFilter(f => ({ ...f, ...patch })); setPage(1); };
  const filtered = Object.values(filter).some(Boolean);

  return (
    <section className="hq-section" aria-label="稽核日誌">
      <div className="hq-row" role="group" aria-label="篩選">
        <select className="hq-input" value={filter.actor} onChange={e => set({ actor: e.target.value })} aria-label="操作者">
          <option value="">全部操作者</option>
          {Object.entries(people).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <select className="hq-input" value={filter.action} onChange={e => set({ action: e.target.value })} aria-label="動作">
          <option value="">全部動作</option>
          {AUDIT_ACTIONS.map(a => <option key={a} value={a}>{AUDIT_ACTION_LABELS[a]}</option>)}
        </select>
        <input className="hq-input" type="date" value={filter.from} onChange={e => set({ from: e.target.value })} aria-label="開始日期" />
        <input className="hq-input" type="date" value={filter.to} onChange={e => set({ to: e.target.value })} aria-label="結束日期" />
        {filtered && <button className="hq-btn ghost small" onClick={() => set(EMPTY)}>清除篩選</button>}
      </div>
      {state === "loading" ? <HqSkeleton rows={4} /> : state === "error" ? <HqLoadError onRetry={() => void load()} /> : rows.length === 0 ? (
        <p className="hq-hint">{filtered ? "沒有符合條件的紀錄" : "還沒有稽核紀錄"}</p>
      ) : (
        <>
          <ul className="hq-log">
            {rows.map(l => (
              <li key={l.id}>
                <strong>{describeAudit(l)}</strong>
                <span className="hq-hint">操作者：{people[l.actor_id] ?? "（已非管理員）"}</span>
                <span className="hq-hint">原因：{l.reason}</span>
                <time className="hq-hint">{formatTaipei(l.created_at)}</time>
              </li>
            ))}
          </ul>
          <HqPager page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} onPage={setPage} />
        </>
      )}
    </section>
  );
}
