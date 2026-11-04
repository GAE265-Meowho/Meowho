"use client";
// 貓戶管理（Issue #179）：類別分頁＋搜尋＋列表，點一列在右側看詳情。第一版唯讀。
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTaipeiDate } from "@/lib/hq/actions";
import {
  buildHouseholdViews, categoryCounts, filterHouseholds, HOUSEHOLD_CATEGORIES,
  type HouseholdView, type HqCatRow, type HqHouseholdRow, type HqOwnerRow,
} from "@/lib/hq/households";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { CARETAKER_LABEL } from "@/lib/onboarding/household";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useHqActor } from "../HqActor";
import { HqListBody, HqPager, HqSplit, HqTable, HqTabs, HqToolbar } from "../list/HqList";

interface Data { households: HqHouseholdRow[]; owners: HqOwnerRow[]; cats: HqCatRow[] }

// 本機示範模式（未連資料庫）用的假資料
const DEMO: Data = {
  households: [
    { id: "h1", owner_id: "d2", name: "小橘之家", caretaker_type: "personal_foster", city: "台中市", district: "西屯區", default_visibility: "public", verified_shelter: true, created_at: "2026-10-28T02:00:00Z" },
    { id: "h2", owner_id: "d3", name: "阿灰的窩", caretaker_type: "cat_owner", city: "台北市", district: "大安區", default_visibility: "private", verified_shelter: false, created_at: "2026-10-29T01:00:00Z" },
  ],
  owners: [{ id: "d2", display_name: "台中小橘中途", email: "foster@example.com" }, { id: "d3", display_name: "貓友阿灰", email: "friend@example.com" }],
  cats: [{ household_id: "h1", status: "adoptable" }, { household_id: "h1", status: "preparing" }, { household_id: "h2", status: "own" }],
};

const catsText = (v: HouseholdView) => {
  const parts = [v.cats.adoptable && `待領養 ${v.cats.adoptable}`, v.cats.preparing && `準備中 ${v.cats.preparing}`].filter(Boolean);
  return `${v.cats.total} 隻${parts.length ? `（${parts.join("、")}）` : ""}`;
};

export function HouseholdsList({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { preview } = useHqActor();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    const sb = getBrowserSupabase();
    if (!sb || preview) { setData(DEMO); return; }
    const res = await fetch("/api/hq/households").catch(() => null);
    if (res?.ok) { setData(await res.json() as Data); return; }
    if (res?.status !== 503) { setError(true); return; }
    // 伺服器沒設 SUPABASE_SERVICE_ROLE_KEY（503）：改用登入者身分直讀。RLS 下有「用戶權限管理」者（含系統管理員）看得到全部貓戶，
    // 其他管理員只看得到公開貓戶；私密貓咪不會計入。Vercel 設好金鑰後就走上面的 API。
    const [h, o, c] = await Promise.all([
      sb.from("meow_households").select("id, owner_id, name, caretaker_type, city, district, default_visibility, verified_shelter, created_at"),
      sb.from("meow_profiles").select("id, display_name, email"),
      sb.from("meow_cats").select("household_id, status"),
    ]);
    if (h.error) { setError(true); return; }
    setData({ households: h.data as HqHouseholdRow[], owners: (o.data ?? []) as HqOwnerRow[], cats: (c.data ?? []) as HqCatRow[] });
  }, [preview]);
  useEffect(() => { void load(); }, [load]);

  const views = useMemo(() => (data ? buildHouseholdViews(data.households, data.owners, data.cats) : []), [data]);
  const counts = categoryCounts(views);
  const tab = HOUSEHOLD_CATEGORIES.some(c => c.value === query.tab) ? query.tab! : "all";
  const filtered = useMemo(() => filterHouseholds(views, query), [views, query]);
  const page = paginate(filtered, query.page);
  const selected = views.find(v => v.id === selectedId) ?? null;

  const detail = selected && (
    <>
      <h2>{selected.name}</h2>
      <dl className="hq-dl">
        <dt>類別</dt><dd>{CARETAKER_LABEL[selected.caretaker_type]}{selected.verified_shelter && <> <span className="hq-tag">中途徽章</span></>}</dd>
        <dt>貓戶長</dt><dd>{selected.ownerName}{selected.ownerEmail && selected.ownerEmail !== selected.ownerName && <><br /><span className="hq-hint">{selected.ownerEmail}</span></>}</dd>
        <dt>地區</dt><dd>{selected.city}{selected.district}</dd>
        <dt>公開設定</dt><dd>{selected.default_visibility === "public" ? "公開" : "私密"}</dd>
        <dt>建立日期</dt><dd>{formatTaipeiDate(new Date(selected.created_at))}</dd>
      </dl>
      <section className="hq-box" aria-label="貓咪">
        <h3>貓咪（{selected.cats.total}）</h3>
        <dl className="hq-dl">
          <dt>待領養</dt><dd>{selected.cats.adoptable}</dd>
          <dt>準備中</dt><dd>{selected.cats.preparing}</dd>
          <dt>已領養</dt><dd>{selected.cats.adopted}</dd>
          <dt>自家貓</dt><dd>{selected.cats.own}</dd>
        </dl>
      </section>
    </>
  );

  return (
    <>
      <HqTabs tabs={HOUSEHOLD_CATEGORIES.map(c => ({ value: c.value, label: data ? `${c.label}（${counts[c.value]}）` : c.label }))} value={tab}
        onChange={v => { setSelectedId(null); update({ tab: v === "all" ? undefined : v }); }} />
      <HqSplit
        onClose={() => setSelectedId(null)}
        detail={detail}
        list={
          <>
            <HqToolbar q={query.q} onSearch={q => update({ q })} placeholder="搜尋貓戶、貓戶長、Email 或地區" />
            <HqListBody loading={!data && !error} error={error} onRetry={() => void load()} total={filtered.length} filtered={Boolean(query.q || tab !== "all")}
              onClear={() => update({ q: undefined, tab: undefined })}
              empty={{ message: "目前還沒有貓戶", actionLabel: "回待辦總覽", onAction: () => router.push("/MeowHQ") }}>
              <HqTable
                rows={page.rows} rowKey={r => r.id} selectedKey={selectedId} onSelect={r => setSelectedId(r.id)}
                columns={[
                  { key: "name", label: "貓戶", render: r => <span><strong>{r.name}</strong>{r.verified_shelter && <> <span className="hq-tag">中途徽章</span></>}{r.default_visibility === "private" && <> <span className="hq-tag mute">私密</span></>}</span> },
                  { key: "type", label: "類別", render: r => CARETAKER_LABEL[r.caretaker_type] },
                  { key: "owner", label: "貓戶長", render: r => r.ownerName },
                  { key: "area", label: "地區", render: r => `${r.city}${r.district}` },
                  { key: "cats", label: "貓咪", render: catsText },
                  { key: "created", label: "建立日期", render: r => formatTaipeiDate(new Date(r.created_at)) },
                ]}
              />
              <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
            </HqListBody>
          </>
        }
      />
    </>
  );
}
