"use client";
// MeowHQ 列表共用元件（T-HQ-08，規格書 §4.8、§4.9、§4.10）：
// 搜尋框＋篩選標籤（寫入網址）、表格（手機改卡片）、分頁、右側詳情面板（手機整頁）。
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { parseListQuery, toSearchString, type ListQuery } from "@/lib/hq/listing";
import { HqEmptyState, HqLoadError, HqNoResults, HqSkeleton } from "../HqStates";

/** 讀寫網址上的篩選條件；換篩選時回到第 1 頁 */
export function useListQuery(): [ListQuery & { page: number }, (patch: Partial<ListQuery>) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = useMemo(() => parseListQuery(new URLSearchParams(sp?.toString() ?? "")), [sp]);
  const update = useCallback((patch: Partial<ListQuery>) => {
    const next = { ...query, ...patch };
    if (!("page" in patch)) next.page = 1;
    router.replace(`${pathname}${toSearchString(next)}`, { scroll: false });
  }, [query, router, pathname]);
  return [query, update];
}

export interface Option { value: string; label: string }

export function HqTabs({ tabs, value, onChange }: { tabs: Option[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="hq-tabs" role="tablist">
      {tabs.map(t => (
        <button key={t.value} role="tab" aria-selected={t.value === value} className={t.value === value ? "on" : ""} onClick={() => onChange(t.value)}>{t.label}</button>
      ))}
    </div>
  );
}

export function HqToolbar({ q, onSearch, placeholder, statuses, status, onStatus }: {
  q?: string; onSearch: (q: string) => void; placeholder: string;
  statuses?: Option[]; status?: string; onStatus?: (s: string | undefined) => void;
}) {
  return (
    <div className="hq-toolbar">
      <form role="search" onSubmit={e => { e.preventDefault(); onSearch(String(new FormData(e.currentTarget).get("q") ?? "")); }}>
        <input className="hq-input" name="q" type="search" defaultValue={q ?? ""} placeholder={placeholder} aria-label="搜尋" />
      </form>
      {statuses && onStatus && (
        <div className="hq-chips" role="group" aria-label="篩選">
          <button className={!status ? "on" : ""} aria-pressed={!status} onClick={() => onStatus(undefined)}>全部</button>
          {statuses.map(s => (
            <button key={s.value} className={status === s.value ? "on" : ""} aria-pressed={status === s.value} onClick={() => onStatus(s.value)}>{s.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface Column<T> { key: string; label: string; render: (row: T) => React.ReactNode }

/** 表格：桌機為表格，手機（≤767px）以 CSS 轉成卡片列表；點一列開啟詳情 */
export function HqTable<T>({ rows, columns, rowKey, selectedKey, onSelect }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; selectedKey?: string | null; onSelect?: (r: T) => void;
}) {
  return (
    <table className="hq-table">
      <thead><tr>{columns.map(c => <th key={c.key} scope="col">{c.label}</th>)}</tr></thead>
      <tbody>
        {rows.map(r => {
          const k = rowKey(r);
          return (
            <tr key={k} className={selectedKey === k ? "on" : ""} onClick={onSelect ? () => onSelect(r) : undefined}
              tabIndex={onSelect ? 0 : undefined} onKeyDown={onSelect ? e => { if (e.key === "Enter") onSelect(r); } : undefined}>
              {columns.map(c => <td key={c.key} data-label={c.label}>{c.render(r)}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function HqPager({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return <p className="hq-hint hq-count">共 {total} 筆</p>;
  return (
    <nav className="hq-pager" aria-label="分頁">
      <button className="hq-btn ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>上一頁</button>
      <span>第 {page} / {pageCount} 頁（共 {total} 筆）</span>
      <button className="hq-btn ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>下一頁</button>
    </nav>
  );
}

/** 列表區的載入／失敗／空白／無結果狀態（§4.10） */
export function HqListBody({ loading, error, onRetry, total, filtered, empty, onClear, children }: {
  loading: boolean; error: boolean; onRetry: () => void; total: number; filtered: boolean;
  empty: { message: string; actionLabel: string; onAction: () => void }; onClear: () => void; children: React.ReactNode;
}) {
  if (loading) return <HqSkeleton rows={4} />;
  if (error) return <HqLoadError onRetry={onRetry} />;
  if (total === 0) return filtered ? <HqNoResults onClear={onClear} /> : <HqEmptyState {...empty} />;
  return <>{children}</>;
}

/** 列表＋右側詳情面板；手機時詳情整頁顯示並提供「返回列表」 */
export function HqSplit({ list, detail, onClose }: { list: React.ReactNode; detail: React.ReactNode | null; onClose: () => void }) {
  return (
    <div className={`hq-split${detail ? " has-detail" : ""}`}>
      <div className="hq-split-list">{list}</div>
      {detail && (
        <aside className="hq-detail" aria-label="詳細資料">
          <button className="hq-btn ghost hq-detail-close" onClick={onClose}>← 返回列表</button>
          {detail}
        </aside>
      )}
    </div>
  );
}
