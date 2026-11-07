import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { ITEM_BUCKET } from "@/lib/hq/items/types";
import { toPlayCatalog } from "@/lib/play/catalog";

// 虛擬飼養：後台「生活用品」的價格、尺寸與模型網址。meow_items 的 RLS 只給管理員讀，前台玩家讀不到，所以由伺服器用 service role 代讀，
// 只回傳類別名稱、品名、價格、模型網址（公開 bucket）與尺寸（不回傳使用說明等其他欄位）。不需要登入。
// 沒設定 service role、讀取失敗時回空清單（200），遊戲沿用程式裡寫的估價與模型，流程不會卡住。
export const dynamic = "force-dynamic";

const publicUrl = (path: string) => `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${ITEM_BUCKET}/${path}`;

export async function GET() {
  const sb = getAdminSupabase();
  if (!sb) return NextResponse.json({ items: [] });
  const { data, error } = await sb.from("meow_items").select("name,price_twd,model_path,width_m,depth_m,height_m,meow_item_categories(name)");
  if (error || !data) return NextResponse.json({ items: [] });
  return NextResponse.json(
    { items: toPlayCatalog(data as unknown as Parameters<typeof toPlayCatalog>[0], publicUrl) },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
