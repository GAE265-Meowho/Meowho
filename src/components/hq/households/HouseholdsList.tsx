"use client";
// 貓戶管理（Issue #179）：類別分頁＋搜尋＋列表，點一列在右側看詳情。第一版唯讀。
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatTaipeiDate } from "@/lib/hq/actions";
import {
  buildHouseholdViews, CAT_STATUS_LABELS, categoryCounts, filterHouseholds, HOUSEHOLD_CATEGORIES,
  type HouseholdView, type HqCatRow, type HqHouseholdRow, type HqOwnerRow,
} from "@/lib/hq/households";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { CARETAKER_LABEL } from "@/lib/onboarding/household";
import { LIFE_STAGE_LABEL, type LifeStage } from "@/lib/cat-profile/life-stage";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { photoSrc } from "@/lib/supabase/config";
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
  cats: [
    { id: "c1", household_id: "h1", name: "橘寶", status: "adoptable", life_stage: "kitten", photo_url: null, created_at: "2026-10-30T00:00:00Z" },
    { id: "c2", household_id: "h1", name: "小黑", status: "preparing", life_stage: "adult", photo_url: null, created_at: "2026-10-31T00:00:00Z" },
    { id: "c3", household_id: "h2", name: "阿灰", status: "own", life_stage: "senior", photo_url: null, created_at: "2026-10-29T00:00:00Z" },
  ],
};

/** 貓咪照片：存 bucket 路徑或完整網址（meow-cat-photos 是公開 bucket）；本機示範模式沒有 Supabase 時不顯示 */
const sbPhoto = (path: string) => { const sb = getBrowserSupabase(); return sb ? photoSrc(sb, path) : /^https?:/.test(path) ? path : null; };

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
    // 登入者身分直讀：0020 的 RLS 讓有「貓戶管理」模組者讀全部貓戶、貓咪、貓戶長
    const [h, o, c] = await Promise.all([
      sb.from("meow_households").select("id, owner_id, name, caretaker_type, city, district, default_visibility, verified_shelter, created_at"),
      sb.from("meow_profiles").select("id, display_name, email"),
      sb.from("meow_cats").select("id, household_id, name, status, life_stage, photo_url, created_at"),
    ]);
    if (h.error || o.error || c.error) { setError(true); return; }
    setData({ households: h.data as HqHouseholdRow[], owners: o.data as HqOwnerRow[], cats: c.data as HqCatRow[] });
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
      <section aria-label="貓咪">
        <h3 className="hq-h3">貓咪（{selected.cats.total}）</h3>
        {selected.catList.length === 0 ? <p className="hq-hint">這個貓戶還沒有貓咪。</p> : (
          <ul className="hq-catcards">
            {selected.catList.map(cat => (
              <li key={cat.id}>
                <a href={`/cats/${cat.id}`} target="_blank" rel="noreferrer" className="hq-catcard">
                  <span className="hq-catcard-photo">
                    {cat.photo_url && sbPhoto(cat.photo_url) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sbPhoto(cat.photo_url)!} alt="" loading="lazy" />
                    ) : <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M5 10l1-5 4 3h4l4-3 1 5c.9 1.2 1.3 2.6 1.3 4 0 4-3.6 6-8.3 6s-8.3-2-8.3-6c0-1.4.4-2.8 1.3-4z" /></svg>}
                  </span>
                  <strong>{cat.name}</strong>
                  <span className="hq-catcard-meta">
                    <span className={`hq-tag${cat.status === "adoptable" ? "" : cat.status === "preparing" ? " warn" : " mute"}`}>{CAT_STATUS_LABELS[cat.status] ?? cat.status}</span>
                    {cat.life_stage && LIFE_STAGE_LABEL[cat.life_stage as LifeStage] && <span className="hq-hint">{LIFE_STAGE_LABEL[cat.life_stage as LifeStage]}</span>}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
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
