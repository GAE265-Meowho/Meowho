"use client";
// 統計（規格書 §4.3）：會員、貓戶、貓咪、認證中途數（只算筆數，不讀內容）
import { useCallback, useEffect, useState } from "react";
import { useHqActor } from "@/components/hq/HqActor";
import { HqLoadError, HqSkeleton } from "@/components/hq/HqStates";
import { getBrowserSupabase } from "@/lib/supabase/client";

type Stats = { members: number; households: number; cats: number; shelters: number };
const LABELS: Record<keyof Stats, string> = { members: "會員", households: "貓戶", cats: "貓咪", shelters: "認證中途" };

export function StatsTab() {
  const { preview } = useHqActor();
  const [stats, setStats] = useState<Stats | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  const load = useCallback(async () => {
    const sb = getBrowserSupabase();
    if (preview || !sb) { setStats({ members: 0, households: 0, cats: 0, shelters: 0 }); setState("ok"); return; }
    setState("loading");
    const head = { count: "exact" as const, head: true };
    const [m, h, c, s] = await Promise.all([
      sb.from("meow_profiles").select("id", head),
      sb.from("meow_households").select("id", head),
      sb.from("meow_cats").select("id", head),
      sb.from("meow_households").select("id", head).eq("verified_shelter", true),
    ]);
    if (m.error || h.error || c.error || s.error) { setState("error"); return; }
    setStats({ members: m.count ?? 0, households: h.count ?? 0, cats: c.count ?? 0, shelters: s.count ?? 0 });
    setState("ok");
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  if (state === "error") return <HqLoadError onRetry={() => void load()} />;
  if (state === "loading" || !stats) return <HqSkeleton rows={2} />;
  return (
    <div className="hq-cards">
      {(Object.keys(LABELS) as (keyof Stats)[]).map(k => (
        <section key={k} className="hq-tcard" aria-label={LABELS[k]}>
          <h2>{LABELS[k]}</h2>
          <div className={`hq-total${stats[k] ? "" : " zero"}`}>{stats[k]}</div>
        </section>
      ))}
    </div>
  );
}
