"use client";
// 貓咪區塊｜列表（規格書 04 §2.2）：搜尋、分頁；點整列或名稱進入該貓的貓咪頁
// #159 改版：5 欄（貓咪模型、進度、備註說明、建立者／更新、操作）、依進度篩選、排隊或生成中也能刪
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  BODY_LABELS, BODY_ORDER, CAT_STEPS, catListGroup, catProgresses, hasConfirmedLook, isJobActive, formatCatTime, type CatListGroup, type CatModelView,
} from "@/lib/hq/cat-models/types";
import { FLOW_ICONS, FlowStepper } from "./FlowStepper";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { HqListBody, HqPager, HqTable, HqToolbar, type Column } from "../list/HqList";
import { assetsHref, BASES_HREF, NEW_CAT_HREF, studioHref } from "./hrefs";
import { CAT_API, catFileUrl, deleteJson, postJson, useCatList } from "./useCatModels";
import { HqSaveButton } from "../HqStates";
import { useHqToast } from "../HqToast";

const DELETE_ERRORS: Record<string, string> = {
  template: "內建的示範貓不能刪除",
  not_found: "找不到這隻貓，可能已被刪除",
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  disabled: "資料來源還沒有啟用",
};

/** 刪除：按一次「刪除」後在原位確認（同平面圖轉換），不跳視窗。#159：排隊或生成中也能刪，任務一併取消；示範貓不能刪 */
function DeleteCell({ cat, onDeleted }: { cat: CatModelView; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (cat.builtin) return <span className="hq-hint" title={DELETE_ERRORS.template}>不可刪除</span>;
  return (
    <span className="hq-row-tight" onClick={e => e.stopPropagation()}>
      {confirming ? (
        <span className="hq-delconfirm" role="alert">
          <span>確定刪除「{cat.name}」？3D 模型與貼圖會一併刪除，無法復原。{isJobActive(cat.status) && "進行中的任務會一併取消。"}</span>
          <span className="hq-row-tight">
            <button type="button" className="hq-btn ghost small" onClick={() => setConfirming(false)}>取消</button>
            <HqSaveButton danger onSave={async () => { await deleteJson(`${CAT_API}/${cat.id}`, DELETE_ERRORS); onDeleted(); }}>確認刪除</HqSaveButton>
          </span>
        </span>
      ) : (
        <button type="button" className="hq-btn ghost small hq-btn-del" aria-label={`刪除${cat.name}`} onClick={() => setConfirming(true)}>刪除</button>
      )}
    </span>
  );
}

/** #159 進度：未完成顯示「狀態＋n/4」與 4 段進度條，下方為目前步驟；完成顯示標籤。雙體型時分到成貓／幼貓欄。 */
function ProgressCell({ cat, body }: { cat: CatModelView; body?: "adult" | "kitten" }) {
  const list = catProgresses(cat);
  const selected = body ? list.filter(p => p.body === body) : list;
  const labeled = !body && list.length > 1;
  return (
    <span className="hq-progress-list">
      {selected.map(p => {
        const name = labeled ? `${BODY_LABELS[p.body]} ` : "";
        if (p.step === 4) return <span key={p.body} className="hq-tag">{name}完成</span>;
        const [stepText, state] = p.text.split("・");
        return (
          <span key={p.body} className={`hq-progress ${p.tone}`}>
            <span className="hq-progress-head"><span>{name}{state ?? "進行中"}</span><span>{p.step}/4</span></span>
            <span className="hq-progress-bar" role="progressbar" aria-label={`${name}${p.text}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={p.step}>
              {[1, 2, 3, 4].map(n => <span key={n} className={n <= p.step ? "on" : ""} />)}
            </span>
            <span className="hq-progress-step">{stepText.replace(/^\d\/4 /, "")}</span>
          </span>
        );
      })}
      {!selected.length && <span className="hq-hint">—</span>}
    </span>
  );
}

function formatAge(ageMonths: number | null): string {
  if (ageMonths === null) return "—";
  const years = Math.floor(ageMonths / 12);
  const months = ageMonths % 12;
  if (!years) return `${ageMonths} 個月`;
  return months ? `${years} 歲 ${months} 個月` : `${years} 歲`;
}

const BACKFILL_ERRORS: Record<string, string> = {
  permission_denied: "你沒有虛擬體驗元件管理的權限，或登入已過期",
  disabled: "只有正式站（Supabase）能排紋理貼圖",
};

/** 補排紋理貼圖：三視角已完成、缺成貓或幼貓貼圖的貓排進 paint worker（同一隻貓兩個體型依序做） */
function BackfillButton({ onDone }: { onDone: () => void }) {
  const toast = useHqToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true); setError(null);
    try {
      const r = await postJson<{ queued: { name: string }[]; waiting: number }>(`${CAT_API}/auto-paint`, {}, BACKFILL_ERRORS);
      const waiting = r.waiting ? `；${r.waiting} 隻還沒完成 AI 三視角` : "";
      toast.show({ message: r.queued.length ? `已排入 ${r.queued.length} 隻：${r.queued.map(q => q.name).join("、")}${waiting}` : `每隻貓都已經有一對紋理貼圖或正在產生${waiting}` });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失敗，請稍後再試");
    } finally { setBusy(false); }
  }
  return (
    <span className="hq-save">
      <button type="button" className="hq-btn ghost" onClick={run} disabled={busy} title="缺成貓或幼貓紋理貼圖的貓補進排程">
        {busy ? "排程中…" : "補排紋理貼圖"}
      </button>
      {error && <span className="hq-error" role="alert">{error}</span>}
    </span>
  );
}

const GROUPS: { value: Exclude<CatListGroup, "other">; label: string }[] = [
  { value: "running", label: "產生中" }, { value: "done", label: "完成" }, { value: "demo", label: "示範貓" },
];

/** #118：還沒有 3D 的貓直接進製作glb工作區，有 3D 的進貓咪頁（#129：以「有確認過的紋理貼圖」為準） */
export const catHref = (c: CatModelView) => (hasConfirmedLook(c) ? assetsHref(c.id) : studioHref(c.id));

/** 搜尋名稱或建立者；status 為進度分組（#159：running／done／demo） */
export function filterCats(cats: readonly CatModelView[], q: { q?: string; status?: string }): CatModelView[] {
  const text = q.q?.trim().toLowerCase();
  return cats.filter(c => (!q.status || catListGroup(c) === q.status)
    && (!text || c.name.toLowerCase().includes(text) || (c.createdBy ?? "").toLowerCase().includes(text)));
}

export function CatsTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { value, reload } = useCatList();
  const toast = useHqToast();
  const all = useMemo(() => (value.state === "ready" ? value.data : []), [value]);
  const filtered = useMemo(() => filterCats(all, query), [all, query]);
  const chips = GROUPS.map(g => ({ value: g.value, label: `${g.label} ${all.filter(c => catListGroup(c) === g.value).length}` }));
  const page = paginate(filtered, query.page);

  if (value.state === "disabled") {
    return (
      <div className="hq-state">
        <p>貓咪模型的資料來源還沒有啟用。</p>
        <p className="hq-hint">本機可在 .env.local 設定 CAT_STUDIO_ROOT（adoption_cats 與 cat_base）後重開 dev；正式站會帶已完成的示範貓。</p>
      </div>
    );
  }

  const columns: Column<CatModelView>[] = [
    {
      key: "cat", label: "貓咪",
      render: c => (
        <span className="hq-catcell">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hq-thumb" src={catFileUrl(c.id, "photo")} alt="" width={44} height={44} loading="lazy" />
          <span className="hq-stack">
            <Link href={catHref(c)} onClick={e => e.stopPropagation()}>{c.name}</Link>
            {/* #181：前台中途建的貓顯示所屬喵戶 */}
            {c.household && <span className="hq-hint">喵戶：{c.household.name}</span>}
            {c.builtin && <span className="hq-tag mute">示範貓</span>}
          </span>
        </span>
      ),
    },
    { key: "age", label: "年齡", render: c => <span>{formatAge(c.ageMonths)}</span> },
    { key: "adult", label: "3D 成貓", render: c => <ProgressCell cat={c} body="adult" /> },
    { key: "kitten", label: "3D 幼貓", render: c => <ProgressCell cat={c} body="kitten" /> },
    { key: "notes", label: "說明", render: c => (c.notes ? <span className="hq-clamp2" title={c.notes}>{c.notes}</span> : <span className="hq-hint">尚未填寫</span>) },
    {
      key: "creator", label: "建立者／更新",
      render: c => <span className="hq-stack"><span>{c.createdBy ?? "—"}</span><span className="hq-hint">{formatCatTime(c.updatedAt)}</span></span>,
    },
    { key: "actions", label: "操作", render: c => <DeleteCell cat={c} onDeleted={() => { toast.show({ message: `已刪除「${c.name}」` }); reload(); }} /> },
  ];
  // 整列點擊進貓咪頁，製作glb工作區從貓咪頁進入

  return (
    <>
      {/* 流程（#110 Stitch；#129 改 4 步）：上傳照片 → AI 三視角 → 紋理貼圖 → 動作 glb；兩隻體型骨架移到另一頁，用按鈕進入 */}
      <details className="hq-flow" open>
        <summary><strong>製作流程</strong></summary>
        {/* #129：改為 4 步；第 3 步的紋理貼圖要人工確認才能進第 4 步，不滿意回到第 3 步重新產生。
            每隻貓都要做成貓、幼貓一對：照片與 AI 三視角共用，第 3 步起分流，紋理貼圖與動作 glb 各自產生、各自確認 */}
        <div className="hq-flowfork">
          <div className="hq-flowfork-shared">
            <h3>共用<small>成貓、幼貓用同一組</small></h3>
            <FlowStepper overview short label="成貓、幼貓共用的步驟"
              steps={CAT_STEPS.slice(0, 2).map((s, i) => ({ title: s.title, desc: s.desc, icon: FLOW_ICONS[i], state: "todo" }))} />
          </div>
          <svg className="hq-flowfork-split" viewBox="0 0 56 100" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 50H24V25H56M24 50V75H56" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </svg>
          <div className="hq-flowfork-lanes">
            {BODY_ORDER.map(body => (
              <div key={body} className="hq-flowfork-lane">
                <h3>{BODY_LABELS[body]}模型<small>各自產生、各自確認</small></h3>
                <FlowStepper overview short start={3} label={`${BODY_LABELS[body]}製作流程`} loop={{ from: 1, to: 0, text: "不滿意可重新產生紋理貼圖" }}
                  steps={CAT_STEPS.slice(2).map((s, i) => ({ title: s.title, desc: s.desc, icon: FLOW_ICONS[i + 2], state: "todo" }))} />
              </div>
            ))}
          </div>
        </div>
      </details>
      <hr className="hq-divider" />
      <div className="hq-flow-actions">
        <BackfillButton onDone={reload} />
        <Link href={NEW_CAT_HREF} className="hq-btn">新增貓咪</Link>
        <Link href={BASES_HREF} className="hq-btn ghost">3D 貓咪體型預覽</Link>
      </div>
      <hr className="hq-divider" />
      <h2 className="hq-listtitle">貓咪模型</h2>
      <HqToolbar
        q={query.q} onSearch={q => update({ q })} placeholder="搜尋貓咪名稱或建立者"
        statuses={chips} status={query.status} onStatus={status => update({ status, page: 1 })} filterLabel="依進度篩選"
      />
      <HqListBody
        loading={value.state === "loading"} error={value.state === "error"} onRetry={reload}
        total={filtered.length} filtered={Boolean(query.q || query.status)}
        empty={{ message: "還沒有貓咪模型。按上方「新增貓咪模型」上傳照片開始。", actionLabel: "重新整理", onAction: reload }}
        onClear={() => update({ q: undefined, status: undefined })}
      >
        <HqTable rows={page.rows} columns={columns} rowKey={c => c.id} onSelect={c => router.push(catHref(c))} />
        <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
      </HqListBody>
    </>
  );
}
