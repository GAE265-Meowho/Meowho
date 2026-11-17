"use client";
// 對話框裡的居家安全報告（規格 09 §7.2、決策 007）：報告預設只有領養人自己看得到，
// 領養人在這裡按「分享居家安全報告」（0017 的 meow_share_env_report）後，這個對話串的中途才看得到。
// 中途只看摘要、風險項目與裁切照（/api/homes/[id]/reports/[reportId] 會再檢查分享紀錄），PDF 只給本人。
// 預設分享最新一份，也可以改選其他檢測紀錄；同一份重複分享不會重複留系統訊息。
import { useEffect, useState } from "react";
import { SafetyReportDetails } from "@/app/homes/[id]/safety/SafetyReportDetails";
import f from "@/components/onboarding/intake.module.css";
import CatButton from "@/components/ui/CatButton";
import Icon from "@/components/ui/Icon";
import { envShareOptions, type ReportRow } from "@/lib/home-room";
import { getBrowserSupabase } from "@/lib/supabase/client";
import s from "./desk.module.css";

type Row = ReportRow & { household_id: string };
interface Shared { report_id: string; shared_at: string; household_id: string; created_at: string }
const date = (iso: string) => new Date(iso).toLocaleDateString("zh-TW", { month: "numeric", day: "numeric" });

export function EnvReportShare({ threadId, userId, isKeeper, refresh, onShared, onError }: {
  threadId: string; userId: string; isKeeper: boolean; refresh: number; onShared: () => void; onError: (message: string) => void;
}) {
  const sb = getBrowserSupabase();
  const [mine, setMine] = useState<Row[]>([]);
  const [shared, setShared] = useState<Shared[]>([]);
  const [picked, setPicked] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sb) return;
    let alive = true;
    (async () => {
      // 分享紀錄：中途讀得到自己對話串的、領養人讀得到自己報告的（0017 RLS）
      const { data: shares } = await sb.from("meow_env_report_shares").select("report_id, shared_at").eq("thread_id", threadId).order("shared_at", { ascending: false });
      const ids = (shares ?? []).map(x => x.report_id as string);
      const { data: reports } = ids.length
        ? await sb.from("meow_env_reports").select("id, household_id, created_at").in("id", ids)
        : { data: [] };
      const byId = new Map((reports ?? []).map(r => [r.id as string, r as { household_id: string; created_at: string }]));
      const list = (shares ?? []).flatMap(x => {
        const r = byId.get(x.report_id as string);
        return r ? [{ report_id: x.report_id as string, shared_at: x.shared_at as string, household_id: r.household_id, created_at: r.created_at }] : [];
      });
      // 領養人：自己所有喵戶產生好的報告
      let own: Row[] = [];
      if (!isKeeper) {
        const { data: homes } = await sb.from("meow_households").select("id").eq("owner_id", userId);
        const homeIds = (homes ?? []).map(h => h.id as string);
        if (homeIds.length) {
          const { data } = await sb.from("meow_env_reports").select("id, household_id, status, room_model_id, created_at, items")
            .in("household_id", homeIds).eq("status", "ready").order("created_at", { ascending: false });
          own = (data ?? []) as Row[];
        }
      }
      if (alive) { setShared(list); setMine(own); }
    })();
    return () => { alive = false; };
  }, [sb, threadId, userId, isKeeper, refresh]);

  const options = envShareOptions(mine, shared.map(x => x.report_id));
  const choice = options.find(x => x.id === picked) ?? options[0];

  async function share() {
    if (!sb || !choice) return;
    setBusy(true);
    const { error } = await sb.rpc("meow_share_env_report", { p_report_id: choice.id, p_thread_id: threadId });
    setBusy(false);
    if (error) onError(error.message); else onShared();
  }

  if (isKeeper && !shared.length) return null;
  if (!isKeeper && !options.length) return null;

  return (
    <div className={s.taskProof}>
      {shared.map(x => (
        <div key={x.report_id} className={s.envShared}>
          <button type="button" className={s.toggle} aria-expanded={open === x.report_id} onClick={() => setOpen(v => v === x.report_id ? null : x.report_id)}>
            {date(x.created_at)}的居家安全報告<span aria-hidden>{open === x.report_id ? "收合" : "展開"}</span>
          </button>
          {open === x.report_id && <SafetyReportDetails householdId={x.household_id} reportId={x.report_id} summaryOnly />}
        </div>
      ))}
      {!isKeeper && choice && (
        <div className={s.envShare}>
          {options.length > 1 && (
            <label className={f.field}>
              <span className={f.label}>要分享的報告</span>
              <select value={choice.id} onChange={e => setPicked(e.target.value)}>
                {options.map(x => <option key={x.id} value={x.id}>{date(x.created_at)}・{x.source}{x.shared ? "（已分享）" : ""}</option>)}
              </select>
            </label>
          )}
          <div className={f.actions}>
            {choice.shared
              ? <CatButton size="sm" ears={false} tail={false} disabled><Icon name="check" size={16} />已分享這份報告</CatButton>
              : <CatButton size="sm" disabled={busy} onClick={share}>分享居家安全報告</CatButton>}
          </div>
        </div>
      )}
    </div>
  );
}
