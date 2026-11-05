"use client";
// 虛擬體驗右側用品選單（#197）：類別篩選；左去背縮圖、右文字；拖進房間或點選後點地板。
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState } from "react";
import { filterItems, type HouseholdItem, type ItemCategory } from "@/lib/hq/items/types";
import { assetSectionHref } from "./hrefs";
import { setItemDragData } from "./itemDrag";
import styles from "./experienceItemPalette.module.css";

const ItemGlbThumb = dynamic(() => import("./ItemGlbThumb").then(m => m.ItemGlbThumb), {
  ssr: false,
  loading: () => <span className="hq-item-glb-fallback" aria-hidden="true">…</span>,
});

export function ExperienceItemPalette({
  categories, items, selectedId, onSelect,
}: {
  categories: ItemCategory[];
  items: HouseholdItem[];
  selectedId: string | null;
  onSelect: (item: HouseholdItem) => void;
}) {
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const visible = useMemo(
    () => filterItems(items, { categoryIds, query }),
    [items, categoryIds, query],
  );

  function toggleCat(id: string) {
    setCategoryIds(old => (old.includes(id) ? old.filter(x => x !== id) : [...old, id]));
  }

  return (
    <aside className={styles.panel} aria-label="生活用品選單">
      <div className={styles.head}>
        <h3>生活用品</h3>
        <p className="hq-hint">拖進房間就放好；點一下再點地板也可以。放好的還能拖來拖去。</p>
      </div>

      {categories.length > 0 && (
        <div className={styles.cats} role="group" aria-label="類別篩選">
          <button type="button" className={`${styles.chip}${categoryIds.length === 0 ? ` ${styles.on}` : ""}`}
            aria-pressed={categoryIds.length === 0} onClick={() => setCategoryIds([])}>全部</button>
          {categories.map(c => (
            <button key={c.id} type="button"
              className={`${styles.chip}${categoryIds.includes(c.id) ? ` ${styles.on}` : ""}`}
              aria-pressed={categoryIds.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.name}</button>
          ))}
        </div>
      )}

      <label className={styles.search}>搜尋
        <input className="hq-input" value={query} onChange={e => setQuery(e.target.value)} placeholder="名稱" />
      </label>

      <p className={styles.count} aria-live="polite">{visible.length} 件</p>

      {!items.length ? (
        <p className={styles.empty} role="status">還沒有生活用品。<Link href={assetSectionHref("items")}>去上傳</Link></p>
      ) : !visible.length ? (
        <p className={styles.empty} role="status">沒有符合篩選的用品。</p>
      ) : (
        <div className={styles.list} role="list">
          {visible.map(it => (
            <div
              key={it.id}
              role="listitem"
              className={`${styles.row}${selectedId === it.id ? ` ${styles.on}` : ""}`}
              aria-pressed={selectedId === it.id}
              tabIndex={0}
              draggable
              title={`拖「${it.name}」進房間`}
              onClick={() => onSelect(it)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(it); }
              }}
              onDragStart={e => {
                setItemDragData(e.dataTransfer, it.id);
                onSelect(it);
                const pic = e.currentTarget.querySelector(`.${styles.pic}`);
                if (pic instanceof HTMLElement) {
                  e.dataTransfer.setDragImage(pic, pic.clientWidth / 2, pic.clientHeight / 2);
                }
              }}
            >
              <div className={styles.pic}>
                <ItemGlbThumb url={it.modelUrl} label={it.name} />
              </div>
              <div className={styles.copy}>
                <span className={styles.name}>{it.name}</span>
                <span className={styles.cat}>{it.categoryName}</span>
                <span className={styles.hint}>{selectedId === it.id ? "已選 · 拖進房間或點地板" : "按住拖進房間"}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
