"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { FOOD_AGES, FOOD_CATEGORIES, FOOD_PRODUCTS, foodProducts, formatFoodPrice, type FoodFilter } from "@/lib/hq/food/catalog";
import styles from "./foodTab.module.css";

export function FoodTab() {
  const [filter, setFilter] = useState<FoodFilter>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const products = useMemo(() => foodProducts(filter), [filter]);
  const facets = useMemo(() => {
    const labels = (key: "needs" | "neutered") => [...new Map(FOOD_PRODUCTS.flatMap(p => p[key]).map(t => [t.code, t.label])).entries()];
    return [
      { key: "categories" as const, title: "產品種類", options: Object.entries(FOOD_CATEGORIES).filter(([c]) => FOOD_PRODUCTS.some(p => p.category === c)) },
      { key: "ages" as const, title: "年齡", options: Object.entries(FOOD_AGES).filter(([a]) => FOOD_PRODUCTS.some(p => p.ages.includes(a))) },
      { key: "needs" as const, title: "特殊需求", options: labels("needs") },
      { key: "neutered" as const, title: "絕育", options: labels("neutered") },
    ];
  }, []);
  function toggle(key: "categories" | "ages" | "needs" | "neutered", value: string) {
    setFilter(old => { const selected = old[key] ?? []; return { ...old, [key]: selected.includes(value) ? selected.filter(x => x !== value) : [...selected, value] }; });
  }
  return <section className={styles.catalog} aria-label="皇家食物元件">
    <div className={styles.bar}><div><h2>Royal Canin 法國皇家</h2><p className="hq-hint">食物元件</p></div>
      <label className={styles.search}>搜尋產品<input className="hq-input" value={filter.query ?? ""} onChange={e => setFilter(old => ({ ...old, query: e.target.value }))} placeholder="名稱或產品編號" /></label>
    </div>
    <button className={`hq-btn ghost ${styles.filterToggle}`} aria-controls="food-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(open => !open)}>分類篩選</button>
    <div className={styles.layout}><aside id="food-filters" className={`${styles.filters} ${filtersOpen ? styles.expanded : ""}`} aria-label="食物分類篩選">
      {facets.filter(g => g.options.length).map(group => <details key={group.key} open><summary>{group.title}</summary>
        {group.options.map(([value, label]) => <label key={value} className={styles.check}><input type="checkbox" checked={filter[group.key]?.includes(value) ?? false} onChange={() => toggle(group.key, value)} />{label}</label>)}
      </details>)}
      <button className="hq-btn ghost" onClick={() => setFilter({})}>清除篩選</button>
    </aside><div><p className={styles.count} aria-live="polite">{products.length} 項產品</p>
      <div className={styles.grid}>{products.map((product, index) => <article className={styles.product} key={product.id}>
        {/* Importer already produces bounded WebP thumbnails; no second server-side resize needed. */}
        <div className={styles.photo}><Image src={product.image} alt={product.name} fill unoptimized loading={index < 4 ? "eager" : "lazy"} sizes="(max-width: 600px) 80vw, (max-width: 1100px) 40vw, 260px" style={{ objectFit: "contain" }} /></div>
        <div className={styles.copy}><div className={styles.tags}><span>{FOOD_CATEGORIES[product.category]}</span>{product.requiresVetDiagnosis && <span>獸醫配方</span>}</div>
          <h3>{product.name}</h3>
          <p className={styles.pack}>{product.referencePrice?.pack ?? product.packs.map(p => p.label).join(" ／ ")}</p>
          <strong className={styles.price}>{formatFoodPrice(product.referencePrice?.amount ?? null)}{product.referencePrice && <span>／{product.referencePrice.note.startsWith("估算") ? "估算參考價" : "參考價"}</span>}</strong>
          <div className={styles.links}><a className="hq-btn ghost" href={product.officialUrl} target="_blank" rel="noopener noreferrer" aria-label={`${product.name} 官方詳細資訊（另開分頁）`}>官方詳細資訊 <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg></a>
            {product.referencePrice && <a href={product.referencePrice.url} target="_blank" rel="noopener noreferrer">價格來源 <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></svg></a>}</div>
          {product.referencePrice && <p className={styles.date}>查價 {product.referencePrice.checkedOn} · {product.referencePrice.source}</p>}
          {product.referencePrice?.note.startsWith("估算") && <p className={styles.date}>{product.referencePrice.note}</p>}
        </div></article>)}</div>
      {!products.length && <p role="status" className="hq-box">沒有符合篩選條件的產品。</p>}
    </div></div>
  </section>;
}
