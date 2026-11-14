"use client";
// 虛擬飼養：讀「這個帳號、這隻貓」的真實資料（取代原本寫死的麻糬、子哲的房間、重填的預算）。
//   貓咪由 lib/play/source.ts 的 loadPlayCat 讀；這裡讀：喵戶＝登入者名下的一般飼主喵戶（可選）；預算＝meow_household_budgets（只有喵戶長讀得到）；
//   3D 房間＝這個喵戶最新完成的 meow_room_models；環境報告＝這個喵戶最新 ready 的 meow_env_reports。
// 每一項讀不到都有備案（見 PlayGame），所以這裡只回傳「讀到什麼」，undefined＝還在讀。
import { useEffect, useState } from "react";
import { useAuth } from "@/components/Auth";
import { homeSceneBase } from "@/lib/home-room";
import { normalizeHome, type PlayerHome } from "@/lib/play/background";
import type { Hazard } from "@/lib/play/hazards";
import { hazardsFromReport, pickReport } from "@/lib/play/player-data";
import type { Ready } from "@/lib/play/run-gate";
import { getBrowserSupabase } from "@/lib/supabase/client";

export interface PlayHousehold { id: string; name: string; home: PlayerHome }

/** 登入者名下的一般飼主喵戶（舊的在前）；undefined＝還在讀，空陣列＝沒登入或沒有 */
export function usePlayHouseholds(): PlayHousehold[] | undefined {
  const { loading, user } = useAuth();
  const [list, setList] = useState<PlayHousehold[] | undefined>(undefined);
  useEffect(() => {
    if (loading) return;
    const sb = getBrowserSupabase();
    if (!sb || !user) { setList([]); return; }
    let alive = true;
    sb.from("meow_households").select("id, name, home").eq("owner_id", user.id).eq("caretaker_type", "cat_owner").order("created_at")
      .then(({ data }) => { if (alive) setList((data ?? []).map(h => ({ id: h.id as string, name: h.name as string, home: normalizeHome(h.home) }))); });
    return () => { alive = false; };
  }, [loading, user]);
  return list;
}

export interface HouseholdExtras {
  /** 每月預算（新台幣）；沒填是 null */
  budget: number | null;
  /** 我的 3D 房間：id 與成果資料夾網址；null＝還沒建好 */
  room: { id: string; base: string } | null;
  /** 環境報告轉成的危險清單；null＝沒有可用的報告 */
  hazards: Hazard[] | null;
  /** 開始領養任務前的檢查（run-gate.ts）：房間、這間房間的居家安全報告是備齊、處理中、還是沒有 */
  roomState: Ready;
  reportState: Ready;
}

/** 選定喵戶的預算、3D 房間、環境報告；undefined＝還在讀 */
export function useHouseholdExtras(householdId: string | null): HouseholdExtras | undefined {
  const [state, setState] = useState<{ id: string; v: HouseholdExtras } | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !householdId) return;
    let alive = true;
    (async () => {
      const [{ data: b }, { data: rooms }, { data: pending }, { data: reports }] = await Promise.all([
        sb.from("meow_household_budgets").select("monthly_twd").eq("household_id", householdId).maybeSingle(),
        sb.from("meow_room_models").select("id").eq("owner_household_id", householdId).eq("status", "ready").not("completed_at", "is", null)
          .order("created_at", { ascending: false }).limit(1),
        sb.from("meow_room_models").select("id").eq("owner_household_id", householdId).in("status", ["queued", "running"]).limit(1),
        sb.from("meow_env_reports").select("room_model_id, status, items, created_at").eq("household_id", householdId)
          .order("created_at", { ascending: false }).limit(20),
      ]);
      if (!alive) return;
      const roomId = (rooms?.[0]?.id as string | undefined) ?? null;
      const rows = (reports ?? []) as { room_model_id: string | null; status: string; items: unknown; created_at: string }[];
      const report = pickReport(rows, roomId);
      // 這間房間最新的一份報告（和 meow_start_play_run 一樣看最新那份）：ready＝可以開始、queued／running＝處理中、其他＝還沒有
      const latest = roomId ? rows.find(r => r.room_model_id === roomId) : undefined;
      const reportState: Ready = !latest ? "none" : latest.status === "ready" ? "ready" : latest.status === "queued" || latest.status === "running" ? "pending" : "none";
      setState({
        id: householdId,
        v: {
          budget: typeof b?.monthly_twd === "number" ? b.monthly_twd : null,
          room: roomId ? { id: roomId, base: homeSceneBase(householdId, roomId) } : null,
          hazards: report ? hazardsFromReport(report.items) : null,
          roomState: roomId ? "ready" : pending?.length ? "pending" : "none",
          reportState,
        },
      });
    })().catch(() => { if (alive) setState({ id: householdId, v: { budget: null, room: null, hazards: null, roomState: "none", reportState: "none" } }); });
    return () => { alive = false; };
  }, [householdId]);
  return state && state.id === householdId ? state.v : undefined;
}

/**
 * 這一輪開始時定格的居家安全報告（meow_task_runs.env_report_id，由 meow_start_play_run 寫入；續玩也讀同一份）。
 * 五年後居家危險彈窗只讀這份，不讀最新報告。undefined＝還在讀；null＝沒有紀錄或沒有定格報告。
 */
export function useRunReportId(runId: string | null): string | null | undefined {
  const [state, setState] = useState<{ id: string; v: string | null } | null>(null);
  useEffect(() => {
    const sb = getBrowserSupabase();
    if (!sb || !runId) return;
    let alive = true;
    sb.from("meow_task_runs").select("env_report_id").eq("id", runId).maybeSingle()
      .then(({ data }) => { if (alive) setState({ id: runId, v: (data?.env_report_id as string | null | undefined) ?? null }); },
        () => { if (alive) setState({ id: runId, v: null }); });
    return () => { alive = false; };
  }, [runId]);
  if (!runId) return null;
  return state && state.id === runId ? state.v : undefined;
}
