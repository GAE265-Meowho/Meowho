"use client";
// 用戶權限管理｜帳號（Issue #24）：列表＋詳情（基本資料、貓戶、停權、黑名單）
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTaipeiDate, resolveSuspendUntil } from "@/lib/hq/actions";
import { roleLabel } from "@/lib/hq/audit";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import {
  buildUserViews, filterUsers, IDENTITY_LABELS, STATUS_LABELS, USER_FILTERS,
  type BanRow, type HouseholdRow, type ProfileRow, type SuspensionRow, type UserView,
} from "@/lib/hq/users";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useHqActor } from "../HqActor";
import { HqListBody, HqPager, HqSplit, HqTable, HqToolbar } from "../list/HqList";
import { BanPanel } from "./BanPanel";
import { SuspendPanel } from "./SuspendPanel";
import { useHqRpc } from "./useHqRpc";

interface Data { profiles: ProfileRow[]; households: HouseholdRow[]; suspensions: SuspensionRow[]; bans: BanRow[] }

// 本機示範模式（未連資料庫）用的假資料
const DEMO: Data = {
  profiles: [
    { id: "d1", email: "tina@example.com", display_name: "Tina", role: "system_admin", created_at: "2026-10-28T00:00:00Z" },
    { id: "d2", email: "foster@example.com", display_name: "台中小橘中途", role: "member", created_at: "2026-10-28T02:00:00Z" },
    { id: "d3", email: "friend@example.com", display_name: "貓友阿灰", role: "member", created_at: "2026-10-29T01:00:00Z" },
  ],
  households: [{ id: "h1", owner_id: "d2", name: "小橘之家", city: "台中市", district: "西屯區", verified_shelter: true }],
  suspensions: [{ user_id: "d3", reason: "辱罵或騷擾", suspended_at: "2026-10-29T00:00:00Z", suspended_until: null, lifted_at: null }],
  bans: [],
};

const statusTag = (v: UserView) => <span className={`hq-tag${v.status === "normal" ? "" : v.status === "banned" ? " danger" : " warn"}`}>{STATUS_LABELS[v.status]}</span>;

export function AccountsTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { actor, preview } = useHqActor();
  const rpc = useHqRpc();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    const sb = getBrowserSupabase();
    if (!sb || preview) { setData(DEMO); return; }
    const [p, h, s, b] = await Promise.all([
      sb.from("meow_profiles").select("id, email, display_name, role, created_at").order("created_at", { ascending: false }),
      sb.from("meow_households").select("id, owner_id, name, city, district, verified_shelter").order("created_at"),
      sb.from("meow_user_suspensions").select("user_id, reason, suspended_at, suspended_until, lifted_at").is("lifted_at", null),
      sb.from("meow_banlist").select("google_email, auth_user_id, lifted_at").is("lifted_at", null),
    ]);
    if (p.error || h.error || s.error || b.error) { setError(true); return; }
    setData({ profiles: p.data as ProfileRow[], households: h.data as HouseholdRow[], suspensions: s.data as SuspensionRow[], bans: b.data as BanRow[] });
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  const views = useMemo(() => (data ? buildUserViews(data.profiles, data.households, data.suspensions, data.bans, new Date()) : []), [data]);
  const filtered = useMemo(() => filterUsers(views, query), [views, query]);
  const page = paginate(filtered, query.page);
  const selected = views.find(v => v.id === selectedId) ?? null;

  const detail = selected && (
    <>
      <h2>{selected.name}</h2>
      <dl className="hq-dl">
        <dt>Email</dt><dd>{selected.email ?? "—"}</dd>
        <dt>身分</dt><dd>{IDENTITY_LABELS[selected.identity]}{selected.role !== "member" && `、${roleLabel(selected.role)}`}</dd>
        <dt>狀態</dt><dd>{statusTag(selected)}</dd>
        <dt>加入日期</dt><dd>{formatTaipeiDate(new Date(selected.created_at))}</dd>
      </dl>
      <section className="hq-box" aria-label="貓戶">
        <h3>貓戶（{selected.households.length}／2）</h3>
        {selected.households.length === 0 ? <p className="hq-hint" style={{ margin: 0 }}>還沒有貓戶（貓友）。</p> : (
          <ul className="hq-plain">
            {selected.households.map(h => (
              <li key={h.id}>{h.name}<span className="hq-hint">　{h.city}{h.district}</span>{h.verified_shelter && <span className="hq-tag">中途徽章</span>}</li>
            ))}
          </ul>
        )}
      </section>
      <SuspendPanel
        key={`s-${selected.id}-${selected.status}`}
        actor={actor}
        target={{ role: selected.role }}
        suspended={Boolean(selected.suspension)}
        untilText={selected.suspension ? `停權原因：${selected.suspension.reason}｜${selected.suspension.suspended_until ? `至 ${formatTaipeiDate(new Date(selected.suspension.suspended_until))}` : "直到手動解除"}` : null}
        onSubmit={async v => {
          if (v.suspend) {
            const until = resolveSuspendUntil(v.duration, new Date());
            await rpc("meow_suspend_user", { p_user_id: selected.id, p_reason: v.reason, p_until: until ? until.toISOString() : null }, `已停權 ${selected.name}`);
          } else {
            await rpc("meow_unsuspend_user", { p_user_id: selected.id, p_reason: v.reason }, `已解除停權 ${selected.name}`);
          }
          await load();
        }}
      />
      <BanPanel
        key={`b-${selected.id}-${selected.banned}`}
        actor={actor}
        target={{ role: selected.role, email: selected.email }}
        banned={selected.banned}
        onSubmit={async v => {
          if (v.ban) await rpc("meow_ban_email", { p_email: selected.email, p_reason: v.reason }, `已將 ${selected.name} 加入黑名單`);
          else await rpc("meow_unban_email", { p_email: selected.email, p_reason: v.reason }, `已將 ${selected.name} 移出黑名單`);
          await load();
        }}
      />
    </>
  );

  return (
    <HqSplit
      onClose={() => setSelectedId(null)}
      detail={detail}
      list={
        <>
          <HqToolbar q={query.q} onSearch={q => update({ q })} placeholder="搜尋名稱或 Email"
            statuses={[...USER_FILTERS]} status={query.status} onStatus={s => update({ status: s })} />
          <HqListBody loading={!data && !error} error={error} onRetry={() => void load()} total={filtered.length} filtered={Boolean(query.q || query.status)}
            onClear={() => update({ q: undefined, status: undefined })}
            empty={{ message: "目前還沒有會員", actionLabel: "回待辦總覽", onAction: () => router.push("/MeowHQ") }}>
            <HqTable
              rows={page.rows} rowKey={r => r.id} selectedKey={selectedId} onSelect={r => setSelectedId(r.id)}
              columns={[
                { key: "user", label: "使用者", render: r => <span><strong>{r.name}</strong><br /><span className="hq-hint">{r.email}</span></span> },
                { key: "identity", label: "身分", render: r => <>{IDENTITY_LABELS[r.identity]}{r.role !== "member" && <> <span className="hq-tag mute">{roleLabel(r.role)}</span></>}</> },
                { key: "households", label: "貓戶", render: r => (r.households.length ? r.households.map(h => h.name).join("、") : "—") },
                { key: "status", label: "狀態", render: statusTag },
              ]}
            />
            <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
          </HqListBody>
        </>
      }
    />
  );
}
