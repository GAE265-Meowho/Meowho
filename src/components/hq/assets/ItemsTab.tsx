"use client";
// 生活用品（#197）：上傳 .glb、類別管理、左側篩選；資料在 meow_items／meow-items。
import { useCallback, useEffect, useMemo, useState } from "react";
import { HqSaveButton } from "@/components/hq/HqStates";
import { measureGlbFile } from "@/lib/hq/items/glb-bounds";
import {
  MAX_ITEM_BYTES, filterItems, formatItemPrice,
  type HouseholdItem, type ItemCategory, type ItemFilter,
} from "@/lib/hq/items/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { deleteJson, hintError, postJson } from "./useCatModels";
import styles from "./itemsTab.module.css";

const API = "/api/hq/items";
const ERRORS: Record<string, string> = {
  file_invalid: "請選 .glb 模型檔",
  file_too_large: `檔案不能超過 ${MAX_ITEM_BYTES / 1024 / 1024} MB`,
  name_required: "請填產品名稱",
  category_required: "請選類別",
  model_invalid: "模型路徑無效",
  category_name_required: "請填類別名稱",
  category_in_use: "這個類別還有用品，請先刪用品",
  not_found: "找不到這一筆",
  permission_denied: "你沒有這個功能的權限",
};

function dimsText(it: HouseholdItem): string | null {
  if (it.widthM == null || it.depthM == null || it.heightM == null) return null;
  return `${it.widthM} × ${it.depthM} × ${it.heightM} m（寬×深×高）`;
}

export function ItemsTab() {
  const [categories, setCategories] = useState<ItemCategory[]>([]);
  const [items, setItems] = useState<HouseholdItem[]>([]);
  const [filter, setFilter] = useState<ItemFilter>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sizeWarn, setSizeWarn] = useState<string | null>(null);
  const [newCat, setNewCat] = useState("");
  const [name, setName] = useState("貓砂盆");
  const [nameEn, setNameEn] = useState("Litter Box");
  const [categoryId, setCategoryId] = useState("litter_box");
  const [price, setPrice] = useState("1127");
  const [instructions, setInstructions] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dims, setDims] = useState<{ widthM: number; depthM: number; heightM: number } | null>(null);

  const visible = useMemo(() => filterItems(items, filter), [items, filter]);

  const reload = useCallback(async () => {
    const [cRes, iRes] = await Promise.all([
      fetch(`${API}/categories`, { cache: "no-store" }),
      fetch(API, { cache: "no-store" }),
    ]);
    if (!cRes.ok || !iRes.ok) { setLoadError(true); return; }
    const cJson = (await cRes.json()) as { categories: ItemCategory[] };
    const iJson = (await iRes.json()) as { items: HouseholdItem[] };
    setCategories(cJson.categories);
    setItems(iJson.items);
    setLoadError(false);
    setCategoryId(id => cJson.categories.some(c => c.id === id) ? id : cJson.categories[0]?.id ?? "");
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function onPickFile(f: File | null) {
    setFile(f);
    setDims(null);
    setSizeWarn(null);
    setFormError(null);
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".glb")) { setFormError(ERRORS.file_invalid); setFile(null); return; }
    if (f.size > MAX_ITEM_BYTES) { setFormError(ERRORS.file_too_large); setFile(null); return; }
    try {
      const m = await measureGlbFile(f);
      setDims({ widthM: m.widthM, depthM: m.depthM, heightM: m.heightM });
      setSizeWarn(m.warning);
    } catch {
      setFormError("無法讀取模型尺寸，仍可上傳，但請稍後確認比例。");
    }
  }

  async function upload() {
    setFormError(null);
    if (!file) throw hintError("請先選擇 .glb 檔");
    if (!name.trim()) throw hintError(ERRORS.name_required);
    if (!categoryId) throw hintError(ERRORS.category_required);
    const sb = getBrowserSupabase();
    if (!sb) throw hintError("無法連線到儲存空間，請重新整理後再試");
    const ticket = await postJson<{ bucket: string; path: string; token: string }>(
      `${API}/upload`, { type: file.type || "model/gltf-binary", size: file.size }, ERRORS,
    );
    const { error } = await sb.storage.from(ticket.bucket).uploadToSignedUrl(
      ticket.path, ticket.token, file, { contentType: file.type || "model/gltf-binary" },
    );
    if (error) throw hintError("模型上傳失敗，請檢查網路後再試一次");
    const priceNum = price.trim() === "" ? undefined : Number(price);
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) throw hintError("價格請填 0 以上的數字");
    await postJson(`${API}`, {
      name, nameEn, categoryId, priceTwd: priceNum, instructions,
      modelPath: ticket.path,
      widthM: dims?.widthM, depthM: dims?.depthM, heightM: dims?.heightM,
    }, ERRORS);
    setFile(null); setDims(null); setSizeWarn(null); setInstructions("");
    await reload();
  }

  async function addCategory() {
    setFormError(null);
    await postJson(`${API}/categories`, { name: newCat }, ERRORS);
    setNewCat("");
    await reload();
  }

  async function removeCategory(id: string) {
    setFormError(null);
    await deleteJson(`${API}/categories?id=${encodeURIComponent(id)}`, ERRORS);
    await reload();
  }

  async function removeItem(id: string) {
    setFormError(null);
    await deleteJson(`${API}?id=${encodeURIComponent(id)}`, ERRORS);
    await reload();
  }

  function toggleCat(id: string) {
    setFilter(old => {
      const selected = old.categoryIds ?? [];
      return { ...old, categoryIds: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] };
    });
  }

  if (loadError) {
    return <p className="hq-box" role="alert">載入生活用品失敗。<button type="button" className="hq-btn ghost" onClick={() => void reload()}>再試一次</button></p>;
  }

  return (
    <section className={styles.catalog} aria-label="生活用品">
      <div className={styles.bar}>
        <div><h2>生活用品</h2><p className="hq-hint">上傳 .glb，分類篩選後可放到虛擬體驗房間裡。</p></div>
        <label className={styles.search}>搜尋<input className="hq-input" value={filter.query ?? ""} onChange={e => setFilter(old => ({ ...old, query: e.target.value }))} placeholder="名稱或說明" /></label>
      </div>

      <form className={`hq-box ${styles.form}`} onSubmit={e => e.preventDefault()} aria-label="新增生活用品">
        <strong>新增用品</strong>
        <div className={styles.formRow}>
          <label className="hq-label">產品名稱<input className="hq-input" value={name} onChange={e => setName(e.target.value)} required maxLength={80} /></label>
          <label className="hq-label">英文名稱<input className="hq-input" value={nameEn} onChange={e => setNameEn(e.target.value)} maxLength={80} /></label>
          <label className="hq-label">類別
            <select className="hq-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="hq-label">價格（TWD）<input className="hq-input" inputMode="numeric" value={price} onChange={e => setPrice(e.target.value)} placeholder="例如 1127" /></label>
        </div>
        <label className="hq-label">使用說明<textarea className="hq-input" rows={2} value={instructions} onChange={e => setInstructions(e.target.value)} maxLength={4000} /></label>
        <label className="hq-label">3D 模型（.glb，最大 20MB）
          <input type="file" accept=".glb,model/gltf-binary" onChange={e => void onPickFile(e.target.files?.[0] ?? null)} />
        </label>
        {dims && <p className="hq-hint">量到尺寸：{dims.widthM} × {dims.depthM} × {dims.heightM} m</p>}
        {sizeWarn && <p className={styles.warn} role="status">{sizeWarn}</p>}
        {formError && <p className={styles.warn} role="alert">{formError}</p>}
        <HqSaveButton onSave={upload}>上傳並儲存</HqSaveButton>
      </form>

      <button className={`hq-btn ghost ${styles.filterToggle}`} aria-controls="item-filters" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>分類篩選</button>
      <div className={styles.layout}>
        <aside id="item-filters" className={`${styles.filters} ${filtersOpen ? styles.expanded : ""}`} aria-label="生活用品分類篩選">
          <details open>
            <summary>類別</summary>
            {categories.map(c => (
              <div key={c.id} className={styles.catRow}>
                <label className={styles.check}>
                  <input type="checkbox" checked={filter.categoryIds?.includes(c.id) ?? false} onChange={() => toggleCat(c.id)} />
                  {c.name}
                </label>
                <button type="button" className="hq-btn ghost" onClick={() => void removeCategory(c.id).catch(err => setFormError(err instanceof Error ? err.message : ERRORS.permission_denied))}>刪除</button>
              </div>
            ))}
          </details>
          <label className="hq-label">新增類別
            <input className="hq-input" value={newCat} onChange={e => setNewCat(e.target.value)} maxLength={40} placeholder="例如 跳台" />
          </label>
          <HqSaveButton onSave={addCategory}>新增類別</HqSaveButton>
          <button type="button" className="hq-btn ghost" onClick={() => setFilter({})}>清除篩選</button>
        </aside>
        <div>
          <p className={styles.count} aria-live="polite">{visible.length} 件用品</p>
          <div className={styles.grid}>
            {visible.map(it => (
              <article key={it.id} className={styles.card}>
                <div className={styles.preview} aria-hidden="true">.glb</div>
                <div className={styles.copy}>
                  <div className={styles.tags}><span>{it.categoryName}</span></div>
                  <h3>{it.name}</h3>
                  {it.nameEn && <p className={styles.en}>{it.nameEn}</p>}
                  <strong className={styles.price}>{formatItemPrice(it.priceTwd)}</strong>
                  {dimsText(it) && <p className={styles.dims}>{dimsText(it)}</p>}
                  {it.instructions && <p className="hq-hint">{it.instructions}</p>}
                  <div className={styles.actions}>
                    <a className="hq-btn ghost" href={it.modelUrl} target="_blank" rel="noopener noreferrer">開啟模型</a>
                    <button type="button" className="hq-btn ghost" onClick={() => void removeItem(it.id).catch(err => setFormError(err instanceof Error ? err.message : "刪除失敗"))}>刪除</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {!visible.length && <p role="status" className="hq-box">還沒有符合條件的生活用品。可先上傳貓砂盆 litter_box.glb。</p>}
        </div>
      </div>
    </section>
  );
}
