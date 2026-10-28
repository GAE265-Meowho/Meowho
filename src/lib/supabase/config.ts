export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** 尚未設定 Supabase 時（例如本機剛 clone），畫面仍可運作，只是不能登入與儲存 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
export const TERMS_VERSION = "2026-10-28";
export const PHOTO_BUCKET = "cat-photos";
