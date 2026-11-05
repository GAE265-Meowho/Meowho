"use client";
// 虛擬體驗右側用品選單（#197）：左道具格可拖、右文字只是提示；只能拖進房間放置（點地板不會新增）。
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useState, type DragEvent } from "react";
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

  function startIconDrag(e: DragEvent<HTMLDivElement>, item: HouseholdItem) {
    setItemDragData(e.dataTransfer, item.id);
    onSelect(item);
    const slot = e.currentTarget;
    e.dataTransfer.setDragImage(slot, slot.clientWidth / 2, slot.clientHeight / 2);
  }

  return (
    <aside className={styles.panel} aria-label="生活用品選單">
      <div className={styles.head}>
        <h3>生活用品</h3>
        <p className="hq-hint">拖左邊圖進房間才會放置；點地板不會新增。放好的可用手掌模式拖移，上方 × 可刪除。</p>
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
          {visible.map(it => {
            const on = selectedId === it.id;
            return (
              <div
                key={it.id}
                role="listitem"
                className={`${styles.row}${on ? ` ${styles.on}` : ""}`}
              >
                <div
                  className={styles.pic}
                  draggable
                  title={`拖「${it.name}」進房間`}
                  aria-label={`拖曳 ${it.name}`}
                  onClick={() => onSelect(it)}
                  onDragStart={e => startIconDrag(e, it)}
                >
                  <ItemGlbThumb url={it.modelUrl} label={it.name} />
                </div>
                <button
                  type="button"
                  className={styles.copy}
                  aria-pressed={on}
                  onClick={() => onSelect(it)}
                >
                  <span className={styles.name}>{it.name}</span>
                  <span className={styles.cat}>{it.categoryName}</span>
                  <span className={styles.hint}>{on ? "已選 · 拖左邊圖進房間" : "拖左邊圖進房間"}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
