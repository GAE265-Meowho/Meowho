"use client";
// 貓咪區塊｜列表（規格書 04 §2.2）：搜尋、分頁；點整列或名稱進入該貓的貓咪頁（#102 移除狀態與操作欄）
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { catProgress, formatCatTime, type CatModelView } from "@/lib/hq/cat-models/types";
import { paginate, type ListQuery } from "@/lib/hq/listing";
import { HqListBody, HqPager, HqTable, HqToolbar, type Column } from "../list/HqList";
import { assetsHref, BASES_HREF, NEW_CAT_HREF, studioHref } from "./hrefs";
import { catFileUrl, useCatList } from "./useCatModels";

/** #118：還沒有 3D 的貓直接進製作glb工作區，有 3D 的進貓咪頁 */
export const catHref = (c: CatModelView) => (c.hasAlbedo ? assetsHref(c.id) : studioHref(c.id));

export function filterCats(cats: readonly CatModelView[], q: { q?: string; status?: string }): CatModelView[] {
  const text = q.q?.trim().toLowerCase();
  return cats.filter(c => (!q.status || c.status === q.status) && (!text || c.name.toLowerCase().includes(text)));
}

export function CatsTab({ query, update }: { query: ListQuery & { page: number }; update: (p: Partial<ListQuery>) => void }) {
  const router = useRouter();
  const { value, reload } = useCatList();
  const filtered = useMemo(() => filterCats(value.state === "ready" ? value.data : [], query), [value, query]);
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
      key: "photo", label: "縮圖",
      render: c => (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="hq-thumb" src={catFileUrl(c.id, "photo")} alt="" width={44} height={44} loading="lazy" />
      ),
    },
    { key: "name", label: "名稱", render: c => <Link href={catHref(c)} onClick={e => e.stopPropagation()}>{c.name}</Link> },
    // #118：原「動作數 3/9」是骨架共用的動作數、每隻都一樣，改成這隻貓的三步驟進度
    { key: "progress", label: "進度", render: c => { const p = catProgress(c); return <span className={`hq-tag ${p.tone}`}>{p.text}</span>; } },
    { key: "creator", label: "建立者", render: c => c.createdBy ?? "—" },
    { key: "updated", label: "更新時間", render: c => formatCatTime(c.updatedAt) },
    { key: "notes", label: "備註說明", render: c => c.notes || "—" },
  ];
  // #102：不顯示狀態與操作欄；整列點擊進貓咪頁，製作glb工作區從貓咪頁進入

  return (
    <>
      {/* 流程（#110 Stitch）：上傳照片 → AI 三視角 → 產生 3D；兩隻體型骨架移到另一頁，用按鈕進入 */}
      <section className="hq-flow" aria-label="製作流程">
        <ol className="hq-steps">
          <li><b>1</b><span><strong>上傳照片</strong><span className="hq-hint">原始照片與基本資料</span></span></li>
          <li><b>2</b><span><strong>AI 三視角</strong><span className="hq-hint">AI 產生左側面、正面、背部照片</span></span></li>
          <li><b>3</b><span><strong>產生 3D 貓咪</strong><span className="hq-hint">在製作glb工作區按「產生動作 glb」</span></span></li>
        </ol>
        <div className="hq-row">
          <Link href={BASES_HREF} className="hq-btn ghost">體型骨架預覽</Link>
          <Link href={NEW_CAT_HREF} className="hq-btn">新增貓咪模型</Link>
        </div>
      </section>
      <h2 className="hq-listtitle">已建立的貓咪模型</h2>
      <HqToolbar
        q={query.q} onSearch={q => update({ q })} placeholder="搜尋貓咪名稱"
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
