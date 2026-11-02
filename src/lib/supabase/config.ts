export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** 尚未設定 Supabase 時（例如本機剛 clone），畫面仍可運作，只是不能登入與儲存 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const TERMS_VERSION = "2026-10-28";
/** 共用 Supabase 專案：Meowho喵戶 的資料表、bucket 一律以 meow 開頭（AGENTS.md §8） */
export const PHOTO_BUCKET = "meow-cat-photos";

/** 貓咪照片的網址：上傳的照片存 bucket 路徑；示範資料直接存完整網址（supabase/seed/demo_cats.sql） */
export const photoSrc = (sb: { storage: { from: (b: string) => { getPublicUrl: (p: string) => { data: { publicUrl: string } } } } }, path: string) =>
  /^https?:\/\//.test(path) ? path : sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
