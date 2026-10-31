"use client";
// 貓咪模型資料（規格書 04 §3、§4）：目前只有「本機檔案」來源（PR 2a，開發模式、設了 CAT_STUDIO_ROOT 才有資料）。
// PR 3 會加上 Supabase 來源；元件只依賴這個 hook，不用改。
import { useCallback, useEffect, useState } from "react";
import type { CatModelView } from "@/lib/hq/cat-models/types";

/** loading＝讀取中；disabled＝資料來源沒啟用（沒設 CAT_STUDIO_ROOT 或在正式環境）；missing＝找不到這隻貓；error＝讀取失敗 */
export type Loadable<T> = { state: "loading" } | { state: "disabled" } | { state: "missing" } | { state: "error" } | { state: "ready"; data: T };

export const CAT_API = "/api/hq/cat-models";
export const catFileUrl = (id: string, kind: "photo" | "albedo" | "albedo_prev", bust?: string) =>
  `${CAT_API}/${id}/file/${kind}${bust ? `?t=${encodeURIComponent(bust)}` : ""}`;
export const BASE_GLB_URL = `${CAT_API}/base`;

/** 帶白話訊息的錯誤：HqSaveButton 只會顯示 hint（見 errors.ts），所以訊息要放在 hint */
export const hintError = (message: string) => Object.assign(new Error(message), { hint: message });

/** POST JSON；失敗時依 API 回的 error 代碼丟出白話訊息 */
export async function postJson<T = Record<string, unknown>>(url: string, body: unknown, errors: Record<string, string>): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (res.ok) return json as T;
  throw hintError(errors[json?.error] ?? "操作失敗，請稍後再試");
}

async function load<T>(url: string, pick: (json: { cats?: CatModelView[]; cat?: CatModelView | null }) => T | null): Promise<Loadable<T>> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (json?.enabled === false) return { state: "disabled" };
    if (res.status === 404) return { state: "missing" };
    if (!res.ok) return { state: "error" };
    const data = pick(json);
    return data === null ? { state: "error" } : { state: "ready", data };
  } catch {
    return { state: "error" };
  }
}

export function useCatList() {
  const [value, setValue] = useState<Loadable<CatModelView[]>>({ state: "loading" });
  const reload = useCallback(() => {
    setValue({ state: "loading" });
    void load(CAT_API, j => j.cats ?? null).then(setValue);
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { value, reload };
}

export function useCat(id: string) {
  const [value, setValue] = useState<Loadable<CatModelView>>({ state: "loading" });
  const reload = useCallback(() => {
    void load(`${CAT_API}/${id}`, j => j.cat ?? null).then(setValue);
  }, [id]);
  useEffect(() => {
    let alive = true;
    void load(`${CAT_API}/${id}`, j => j.cat ?? null).then(v => { if (alive) setValue(v); });
    return () => { alive = false; };
  }, [id]);
  return { value, reload };
}
