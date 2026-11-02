import "server-only";
// 平面圖轉換（#138）API 入口：取登入者的 Supabase client 與 Azure Blob 儲存，交給 core.ts
import { getMediaStore } from "@/lib/storage/server";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Deps } from "./core";

/** 沒登入或 Supabase 未設定回 null（API 回 403） */
export async function floorplanDeps(): Promise<Deps | null> {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, userId: data.user.id, store: getMediaStore() } : null;
}
