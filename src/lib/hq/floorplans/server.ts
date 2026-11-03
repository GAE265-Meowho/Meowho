import "server-only";
// 平面圖轉換（#138）API 入口：取登入者的 Supabase client 與 Azure Blob 儲存，交給 core.ts
import { after } from "next/server";
import { isAIConfigured, readFloorplanRoom } from "@/lib/ai/server";
import { getMediaStore } from "@/lib/storage/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { startRoomRead, type Deps } from "./core";

/** 沒登入或 Supabase 未設定回 null（API 回 403） */
export async function floorplanDeps(): Promise<Deps | null> {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, userId: data.user.id, store: getMediaStore() } : null;
}

/**
 * 開始 AI 讀圖（規格 §5、Q2 預設全自動）：房間先標「讀圖中」，讀圖本身放 after() 背景執行，畫面輪詢看結果。
 * 固定用 Azure 聊天部署（AZURE_OPENAI_CHAT_DEPLOYMENT_NAME）；沒設定回 ai_disabled，房間維持「待讀圖」。
 */
export async function scheduleRoomRead(deps: Deps, houseId: string, roomId: unknown) {
  if (!isAIConfigured("azure")) return { ok: false as const, code: "ai_disabled" as const };
  const r = await startRoomRead(deps, houseId, roomId, readFloorplanRoom);
  if (!r.ok) return r;
  after(async () => {
    try { await r.run(); } catch (e) { console.warn("[floorplans] AI 讀圖失敗：", e instanceof Error ? e.message : e); }
  });
  return { ok: true as const };
}
