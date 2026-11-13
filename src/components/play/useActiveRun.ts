"use client";
// 領養任務：讀「自己進行中的那一筆」（RLS 只讀得到自己的），給全站的回任務按鈕、貓咪頁按鈕、/play 共用。
// 開始、放棄、完成之後呼叫 notifyRunChanged()，所有用到的地方會重讀。
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { getBrowserSupabase } from "@/lib/supabase/client";

export interface ActiveRun { runId: string; catId: string; catName: string; progress: unknown }

const EVENT = "meow:run-changed";
export const notifyRunChanged = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT)); };

/** 自己進行中的任務；undefined＝還在讀（或沒登入前），null＝沒有；沒連資料庫一律 null */
export function useActiveRun(): ActiveRun | null | undefined {
  const { loading, user } = useAuth();
  const [run, setRun] = useState<ActiveRun | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick(n => n + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    if (!sb || !user) { setRun(null); return; }
    let alive = true;
    (async () => {
      const { data } = await sb.from("meow_task_runs").select("id, cat_id, progress").eq("member_id", user.id).eq("status", "in_progress").limit(1).maybeSingle();
      if (!alive) return;
      if (!data) { setRun(null); return; }
      const { data: cat } = await sb.from("meow_cats").select("name").eq("id", data.cat_id).maybeSingle();
      if (alive) setRun({ runId: data.id as string, catId: data.cat_id as string, catName: (cat?.name as string | undefined) ?? "這隻貓", progress: data.progress });
    })().catch(() => { if (alive) setRun(null); });
    return () => { alive = false; };
  }, [loading, user, tick]);
  return run;
}

/** 這隻貓最近一次完成的時間（做完過才有）；undefined＝還在讀，null＝沒做完過 */
export function useLastDone(catId: string): string | null | undefined {
  const { loading, user } = useAuth();
  const [at, setAt] = useState<string | null | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const on = () => setTick(n => n + 1);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    if (!sb || !user) { setAt(null); return; }
    let alive = true;
    sb.from("meow_task_runs").select("finished_at").eq("member_id", user.id).eq("cat_id", catId).eq("status", "completed")
      .order("finished_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => { if (alive) setAt((data?.finished_at as string | undefined) ?? null); });
    return () => { alive = false; };
  }, [loading, user, catId, tick]);
  return at;
}

/** 直接讀一筆進行中紀錄的完整進度（續玩用） */
export function useRunProgress(runId: string | null): { loading: boolean; progress: unknown; envReportId: string | null; roomId: string | null } {
  const [state, setState] = useState<{ id: string; progress: unknown; envReportId: string | null; roomId: string | null } | null>(null);
  const load = useCallback(async (id: string) => {
    const sb = getBrowserSupabase();
    if (!sb) return;
    const { data } = await sb.from("meow_task_runs").select("progress, env_report_id, room_model_id").eq("id", id).maybeSingle();
    setState({ id, progress: data?.progress ?? null, envReportId: (data?.env_report_id as string | null | undefined) ?? null, roomId: (data?.room_model_id as string | null | undefined) ?? null });
  }, []);
  useEffect(() => { if (runId) void load(runId); }, [runId, load]);
  return runId && state?.id === runId ? { loading: false, progress: state.progress, envReportId: state.envReportId, roomId: state.roomId } : { loading: Boolean(runId), progress: null, envReportId: null, roomId: null };
}
