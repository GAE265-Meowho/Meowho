"use client";
// 平面圖轉換（#138，規格 docs/hq/05 §3.1）：新增一戶＋一戶一列的清單（戶名、房間數、建立者、更新時間、刪除）。點進去上傳各房間平面圖。
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHqToast } from "@/components/hq/HqToast";
import { HqLoadError, HqSaveButton, HqSkeleton } from "@/components/hq/HqStates";
import { NAME_MAX, type FloorplanSummary } from "@/lib/hq/floorplans/types";
import { floorplanHref } from "./hrefs";
import { FLOORPLAN_API, FLOORPLAN_ERRORS, sendJson } from "./floorplanApi";
import { hintError, postJson } from "./useCatModels";

type State = { state: "loading" } | { state: "error"; message?: string } | { state: "ready"; houses: FloorplanSummary[]; storage: boolean };

const fmt = (iso: string) => new Date(iso).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });

export function FloorplanTab() {
  const router = useRouter();
  const [data, setData] = useState<State>({ state: "loading" });
  const [name, setName] = useState("");
  // 建立成功後到換頁前按鈕保持停用：換頁慢時不會被連按建立出好幾戶
  const [created, setCreated] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const toast = useHqToast();

  const load = useCallback(async () => {
    const res = await fetch(FLOORPLAN_API, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      const code = ((await res?.json().catch(() => ({}))) as { error?: string } | undefined)?.error;
      return setData({ state: "error", message: code === "db_not_ready" || code === "permission_denied" ? FLOORPLAN_ERRORS[code] : undefined });
    }
    const json = (await res.json()) as { houses: FloorplanSummary[]; storage: boolean };
    setData({ state: "ready", ...json });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    if (!name.trim()) throw hintError(FLOORPLAN_ERRORS.name_required);
    const { id } = await postJson<{ id: string }>(FLOORPLAN_API, { name }, FLOORPLAN_ERRORS);
    setCreated(true);
    router.push(floorplanHref(id));
  };

  return (
    <div className="hq-floorplans">
      <section className="hq-box" aria-label="新增一戶">
        <h3>新增一戶</h3>
        <label className="hq-label" htmlFor="fp-name">戶名</label>
        <input id="fp-name" className="hq-input" maxLength={NAME_MAX} placeholder="例如：小美家" value={name} onChange={e => setName(e.target.value)} />
        <div className="hq-row hq-actions">
          <HqSaveButton onSave={create} disabled={!name.trim() || created}>{created ? "開啟中…" : "建立"}</HqSaveButton>
        </div>
        {data.state === "ready" && !data.storage && <p className="hq-note" role="alert">尚未設定 Azure Blob，建立後還不能上傳平面圖。</p>}
      </section>

      {data.state === "loading" && <HqSkeleton rows={3} />}
      {data.state === "error" && (data.message ? <p className="hq-error" role="alert">{data.message}</p> : <HqLoadError onRetry={load} />)}
      {data.state === "ready" && (data.houses.length === 0 ? (
        <div className="hq-state"><p>還沒有任何一戶。輸入戶名建立第一戶，再上傳各房間的平面圖。</p></div>
      ) : (
        <table className="hq-table" aria-label="平面圖清單">
          <thead><tr><th>戶名</th><th>房間數</th><th>建立者</th><th>更新時間</th><th><span className="hq-sr">動作</span></th></tr></thead>
          <tbody>
            {data.houses.map(h => (
              <tr key={h.id}>
                <td><Link href={floorplanHref(h.id)} className="hq-link">{h.name}</Link></td>
                <td>{h.roomCount}</td>
                <td>{h.createdBy ?? "—"}</td>
                <td>{fmt(h.updatedAt)}</td>
                <td>
                  {deleting === h.id ? (
                    <span className="hq-row hq-row-tight">
                      <HqSaveButton onSave={async () => {
                        await sendJson(`${FLOORPLAN_API}/${h.id}`, "DELETE");
                        setDeleting(null);
                        toast.show({ message: `已刪除「${h.name}」` });
                        await load();
                      }}>確認刪除</HqSaveButton>
                      <button type="button" className="hq-btn ghost small" onClick={() => setDeleting(null)}>取消</button>
                    </span>
                  ) : <button type="button" className="hq-btn ghost small" aria-label={`刪除${h.name}`} onClick={() => setDeleting(h.id)}>刪除</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}
