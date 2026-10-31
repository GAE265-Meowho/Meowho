"use client";
// 貓咪區塊｜列表（規格書 04 §2.2）：搜尋、狀態篩選、分頁；點名稱進入該貓的貓咪頁
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { formatTaipeiDate } from "@/lib/hq/actions";
import { CLIP_LIBRARY } from "@/lib/hq/cat-models/clips";
import { CAT_MODEL_STATUSES, CAT_STATUS_LABELS, CAT_STATUS_TONE, type CatModelView } from "@/lib/hq/cat-models/types";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { HqListBody, HqPager, HqTable, HqToolbar, type Column } from "../list/HqList";
import { catFileUrl, useCatList } from "./useCatModels";

const READY_CLIPS = CLIP_LIBRARY.filter(c => c.status === "ready").length;

export function filterCats(cats: readonly CatModelView[], q: { q?: string; status?: string }): CatModelView[] {
  const text = q.q?.trim().toLowerCase();
  return cats.filter(c => (!q.status || c.status === q.status) && (!text || c.name.toLowerCase().includes(text)));
}

export const assetsHref = (id: string) => `/MeowHQ/assets/cats/${id}`;

export function CatsTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { value, reload } = useCatList();
  const filtered = useMemo(() => filterCats(value.state === "ready" ? value.data : [], query), [value, query]);
  const page = paginate(filtered, query.page);

  if (value.state === "disabled") {
    return (
      <div className="hq-state">
        <p>貓咪模型的資料來源還沒有啟用。</p>
        <p className="hq-hint">本機預覽：在 .env.local 設定 CAT_STUDIO_ROOT（指到放 adoption_cats 與 cat_base 的資料夾），再重新啟動 npm run dev。</p>
      </div>
    );
  }

  const columns: Column<CatModelView>[] = [
    {
      key: "photo", label: "縮圖",
      render: c => (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hq-thumb" src={catFileUrl(c.id, "photo")} alt="" width={44} height={44} loading="lazy" />
      ),
    },
    { key: "name", label: "名稱", render: c => <Link href={assetsHref(c.id)} onClick={e => e.stopPropagation()}>{c.name}</Link> },
    { key: "status", label: "狀態", render: c => <span className={`hq-tag${CAT_STATUS_TONE[c.status] ? ` ${CAT_STATUS_TONE[c.status]}` : ""}`}>{CAT_STATUS_LABELS[c.status]}</span> },
    { key: "clips", label: "動作數", render: () => `${READY_CLIPS} / ${CLIP_LIBRARY.length}` },
    { key: "updated", label: "更新時間", render: c => formatTaipeiDate(new Date(c.updatedAt)) },
    { key: "ops", label: "操作", render: c => <Link href={assetsHref(c.id)} onClick={e => e.stopPropagation()}>預覽動作</Link> },
  ];

  return (
    <>
      <HqToolbar
        q={query.q} onSearch={q => update({ q })} placeholder="搜尋貓咪名稱"
        statuses={CAT_MODEL_STATUSES.map(s => ({ value: s, label: CAT_STATUS_LABELS[s] }))}
        status={query.status} onStatus={status => update({ status })}
      />
      <HqListBody
        loading={value.state === "loading"} error={value.state === "error"} onRetry={reload}
        total={filtered.length} filtered={Boolean(query.q || query.status)}
        empty={{ message: "還沒有貓咪模型。新增與貼圖工作頁會在下一個 PR 開放；目前可先用 Cat Studio 建立貓咪。", actionLabel: "重新整理", onAction: reload }}
        onClear={() => update({ q: undefined, status: undefined })}
      >
        <HqTable rows={page.rows} columns={columns} rowKey={c => c.id} onSelect={c => router.push(assetsHref(c.id))} />
        <HqPager page={page.page} pageCount={page.pageCount} total={page.total} onPage={p => update({ page: p })} />
      </HqListBody>
    </>
  );
}
