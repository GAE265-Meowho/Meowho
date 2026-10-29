"use client";
// 用戶權限管理｜中途認證（Issue #24）：待審佇列（等最久的在前）、核准／退回、撤銷徽章
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { composeReason, formatTaipeiDate, getQuickReasons } from "@/lib/hq/actions";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import {
  filterVerifications, ORG_TYPE_LABELS, REJECT_QUICK_REASONS, VERIFICATION_FILTERS, VERIFICATION_STATUS_LABELS,
  type VerificationRow,
} from "@/lib/hq/users";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useHqActor } from "../HqActor";
import { HqSaveButton } from "../HqStates";
import { HqListBody, HqPager, HqSplit, HqTable, HqToolbar } from "../list/HqList";
import { ReasonField } from "./ReasonField";
import { useHqRpc } from "./useHqRpc";

const DEMO: VerificationRow[] = [{
  id: "v1", household_id: "h1", applicant_id: "d2", org_type: "personal_foster", org_name: null, proof_url: null,
  description: "在台中做個人中途三年，目前照顧 4 隻待領養的貓。", status: "pending", review_note: null,
  created_at: "2026-10-28T03:00:00Z", reviewed_at: null,
  household: { name: "小橘之家", city: "台中市", district: "西屯區", verified_shelter: false },
}];

type Mode = null | "approve" | "reject" | "revoke";
const EMPTY = { quick: "", extra: "" };

function VerificationDetail({ v, onDone }: { v: VerificationRow; onDone: () => Promise<void> }) {
  const rpc = useHqRpc();
  const [mode, setMode] = useState<Mode>(null);
  const [reason, setReason] = useState(EMPTY);
  const text = composeReason(reason.quick, reason.extra);
  const name = v.household?.name ?? "貓戶";
  const open = (m: Mode) => { setMode(m); setReason(EMPTY); };

  async function save() {
    if (mode === "approve") await rpc("meow_review_verification", { verification_id: v.id, approve: true, note: text || null }, `已核准 ${name} 的中途認證`);
    else if (mode === "reject") await rpc("meow_review_verification", { verification_id: v.id, approve: false, note: text }, `已退回 ${name} 的中途認證`);
    else if (mode === "revoke") await rpc("meow_revoke_badge", { p_household_id: v.household_id, p_reason: text }, `已撤銷 ${name} 的中途徽章`);
    setMode(null);
    await onDone();
  }

  return (
    <>
      <h2>{name}</h2>
      <dl className="hq-dl">
        <dt>狀態</dt><dd>{VERIFICATION_STATUS_LABELS[v.status]}{v.household?.verified_shelter && <> <span className="hq-tag">中途徽章</span></>}</dd>
        <dt>地區</dt><dd>{v.household ? `${v.household.city}${v.household.district}` : "—"}</dd>
        <dt>類型</dt><dd>{ORG_TYPE_LABELS[v.org_type]}{v.org_name && `｜${v.org_name}`}</dd>
        <dt>申請日期</dt><dd>{formatTaipeiDate(new Date(v.created_at))}</dd>
        {v.proof_url && <><dt>證明</dt><dd><a href={v.proof_url} target="_blank" rel="noreferrer">查看證明</a></dd></>}
        {v.review_note && <><dt>審核備註</dt><dd>{v.review_note}</dd></>}
      </dl>
      <p className="hq-box" style={{ whiteSpace: "pre-wrap" }}>{v.description}</p>

      {mode === null && (
        <div className="hq-row hq-actions">
          {v.status === "pending" && <>
            <button className="hq-btn" onClick={() => open("approve")}>核准</button>
            <button className="hq-btn ghost" onClick={() => open("reject")}>退回</button>
          </>}
          {v.status === "approved" && v.household?.verified_shelter && <button className="hq-btn danger" onClick={() => open("revoke")}>撤銷徽章</button>}
        </div>
      )}
      {mode && (
        <fieldset className="hq-fieldset">
          <legend>{mode === "approve" ? "核准中途認證" : mode === "reject" ? "退回申請" : "撤銷中途徽章"}</legend>
          {mode === "approve"
            ? <ReasonField quick={[]} value={reason} onChange={setReason} />
            : <ReasonField quick={mode === "reject" ? REJECT_QUICK_REASONS : getQuickReasons("revoke_badge")} value={reason} onChange={setReason} />}
          <p className="hq-hint">{mode === "approve" ? "備註可留空；核准後貓戶會立即顯示中途徽章並收到通知。" : mode === "reject" ? "原因會通知申請人；要求補件請選「退回並要求補件」，對方可再次申請。" : "撤銷後立即失去認證中途權限。"}</p>
          <div className="hq-row hq-actions">
            <HqSaveButton onSave={save} disabled={mode !== "approve" && !text}>{mode === "approve" ? "確認核准" : mode === "reject" ? "確認退回" : "確認撤銷"}</HqSaveButton>
            <button type="button" className="hq-btn ghost" onClick={() => setMode(null)}>取消</button>
          </div>
        </fieldset>
      )}
    </>
  );
}

export function SheltersTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { preview } = useHqActor();
  const [rows, setRows] = useState<VerificationRow[] | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    const sb = getBrowserSupabase();
    if (!sb || preview) { setRows(DEMO); return; }
    const { data, error } = await sb.from("meow_shelter_verifications")
      .select("id, household_id, applicant_id, org_type, org_name, proof_url, description, status, review_note, created_at, reviewed_at, household:meow_households(name, city, district, verified_shelter)");
    if (error) { setError(true); return; }
    setRows(data as unknown as VerificationRow[]);
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => filterVerifications(rows ?? [], query), [rows, query]);
  const page = paginate(filtered, query.page);
  const selected = rows?.find(r => r.id === selectedId) ?? null;

  return (
    <HqSplit
      onClose={() => setSelectedId(null)}
      detail={selected && <VerificationDetail key={`${selected.id}-${selected.status}`} v={selected} onDone={load} />}
      list={
        <>
          <HqToolbar q={query.q} onSearch={q => update({ q })} placeholder="搜尋貓戶或單位名稱"
            statuses={[...VERIFICATION_FILTERS]} status={query.status} onStatus={s => update({ status: s })} />
          <HqListBody loading={!rows && !error} error={error} onRetry={() => void load()} total={filtered.length} filtered={Boolean(query.q || query.status)}
            onClear={() => update({ q: undefined, status: undefined })}
            empty={{ message: "目前沒有中途認證申請", actionLabel: "回待辦總覽", onAction: () => router.push("/MeowHQ") }}>
            <HqTable
              rows={page.rows} rowKey={r => r.id} selectedKey={selectedId} onSelect={r => setSelectedId(r.id)}
              columns={[
                { key: "household", label: "貓戶", render: r => <span><strong>{r.household?.name ?? "—"}</strong><br /><span className="hq-hint">{r.household ? `${r.household.city}${r.household.district}` : ""}</span></span> },
                { key: "type", label: "類型", render: r => ORG_TYPE_LABELS[r.org_type] },
                { key: "date", label: "申請日期", render: r => formatTaipeiDate(new Date(r.created_at)) },
                { key: "status", label: "狀態", render: r => <span className={`hq-tag${r.status === "pending" ? " warn" : r.status === "rejected" ? " mute" : ""}`}>{VERIFICATION_STATUS_LABELS[r.status]}</span> },
              ]}
            />
            <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
          </HqListBody>
        </>
      }
    />
  );
}
