// 生活用品（#197）：寫入用登入者 session，RLS 的 virtual_assets 把關；GLB 由瀏覽器直傳公開 bucket。
import "server-only";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { getServerSupabase } from "@/lib/supabase/server";
import {
  ITEM_BUCKET, checkGlb, newItemPath,
  type HouseholdItem, type ItemCategory, type ItemProblem,
} from "./types";

async function userClient() {
  const sb = await getServerSupabase();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ? { sb, userId: data.user.id } : null;
}

function publicUrl(path: string): string {
  return `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${ITEM_BUCKET}/${path}`;
}

interface CategoryRow { id: string; name: string; sort_order: number }
interface ItemRow {
  id: string; name: string; name_en: string | null; category_id: string;
  price_twd: number | null; instructions: string | null; model_path: string;
  width_m: number | null; depth_m: number | null; height_m: number | null; created_at: string;
  meow_item_categories: { name: string } | null;
}

function toItem(row: ItemRow): HouseholdItem {
  return {
    id: row.id, name: row.name, nameEn: row.name_en, categoryId: row.category_id,
    categoryName: row.meow_item_categories?.name ?? row.category_id,
    priceTwd: row.price_twd, instructions: row.instructions, modelPath: row.model_path,
    modelUrl: publicUrl(row.model_path),
    widthM: row.width_m == null ? null : Number(row.width_m),
    depthM: row.depth_m == null ? null : Number(row.depth_m),
    heightM: row.height_m == null ? null : Number(row.height_m),
    createdAt: row.created_at,
  };
}

export async function listCategories(): Promise<ItemCategory[] | null> {
  const user = await userClient();
  if (!user) return null;
  const { data, error } = await user.sb.from("meow_item_categories").select("id,name,sort_order").order("sort_order").order("name");
  if (error) return null;
  return (data as CategoryRow[]).map(r => ({ id: r.id, name: r.name, sortOrder: r.sort_order }));
}

export async function listItems(): Promise<HouseholdItem[] | null> {
  const user = await userClient();
  if (!user) return null;
  const { data, error } = await user.sb.from("meow_items")
    .select("id,name,name_en,category_id,price_twd,instructions,model_path,width_m,depth_m,height_m,created_at,meow_item_categories(name)")
    .order("created_at", { ascending: false });
  if (error) return null;
  return (data as unknown as ItemRow[]).map(toItem);
}

export type UploadTicket = { ok: true; bucket: string; path: string; token: string };

export async function createItemUpload(type: unknown, size: unknown): Promise<
  UploadTicket | { ok: false; code: ItemProblem }
> {
  const problem = checkGlb(type, size);
  if (problem) return { ok: false, code: problem };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const path = newItemPath();
  const { data, error } = await user.sb.storage.from(ITEM_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, code: "permission_denied" };
  return { ok: true, bucket: ITEM_BUCKET, path, token: data.token };
}

function slugCategory(name: string): string {
  const ascii = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return ascii || `item_${Date.now().toString(36)}`;
}

export async function createCategory(name: unknown): Promise<
  { ok: true; category: ItemCategory } | { ok: false; code: ItemProblem }
> {
  const n = typeof name === "string" ? name.trim() : "";
  if (!n || n.length > 40) return { ok: false, code: "category_name_required" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  let id = slugCategory(n);
  for (let i = 0; i < 5; i++) {
    const { data: max } = await user.sb.from("meow_item_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1);
    const sort = ((max?.[0] as { sort_order?: number } | undefined)?.sort_order ?? 0) + 1;
    const { data, error } = await user.sb.from("meow_item_categories").insert({ id, name: n, sort_order: sort }).select("id,name,sort_order").single();
    if (!error && data) {
      const row = data as CategoryRow;
      return { ok: true, category: { id: row.id, name: row.name, sortOrder: row.sort_order } };
    }
    if (error?.code === "23505") { id = `${slugCategory(n)}_${i + 2}`; continue; }
    return { ok: false, code: "permission_denied" };
  }
  return { ok: false, code: "permission_denied" };
}

export async function deleteCategory(id: unknown): Promise<{ ok: true } | { ok: false; code: ItemProblem }> {
  if (typeof id !== "string" || !id) return { ok: false, code: "not_found" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { count } = await user.sb.from("meow_items").select("id", { count: "exact", head: true }).eq("category_id", id);
  if ((count ?? 0) > 0) return { ok: false, code: "category_in_use" };
  const { error } = await user.sb.from("meow_item_categories").delete().eq("id", id);
  if (error) return { ok: false, code: error.code === "PGRST116" ? "not_found" : "permission_denied" };
  return { ok: true };
}

export async function createItem(input: {
  name: unknown; nameEn?: unknown; categoryId: unknown; priceTwd?: unknown;
  instructions?: unknown; modelPath: unknown;
  widthM?: unknown; depthM?: unknown; heightM?: unknown;
}): Promise<{ ok: true; item: HouseholdItem } | { ok: false; code: ItemProblem }> {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) return { ok: false, code: "name_required" };
  const categoryId = typeof input.categoryId === "string" ? input.categoryId : "";
  if (!categoryId) return { ok: false, code: "category_required" };
  const modelPath = typeof input.modelPath === "string" ? input.modelPath : "";
  if (!modelPath || !/\.glb$/i.test(modelPath)) return { ok: false, code: "model_invalid" };
  const nameEn = typeof input.nameEn === "string" && input.nameEn.trim() ? input.nameEn.trim().slice(0, 80) : null;
  const instructions = typeof input.instructions === "string" && input.instructions.trim()
    ? input.instructions.trim().slice(0, 4000) : null;
  const price = typeof input.priceTwd === "number" && Number.isFinite(input.priceTwd) && input.priceTwd >= 0
    ? Math.round(input.priceTwd) : null;
  const dim = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null);
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data, error } = await user.sb.from("meow_items").insert({
    name, name_en: nameEn, category_id: categoryId, price_twd: price, instructions,
    model_path: modelPath, width_m: dim(input.widthM), depth_m: dim(input.depthM), height_m: dim(input.heightM),
  }).select("id,name,name_en,category_id,price_twd,instructions,model_path,width_m,depth_m,height_m,created_at,meow_item_categories(name)").single();
  if (error || !data) {
    await user.sb.storage.from(ITEM_BUCKET).remove([modelPath]);
    return { ok: false, code: "permission_denied" };
  }
  return { ok: true, item: toItem(data as unknown as ItemRow) };
}

export async function deleteItem(id: unknown): Promise<{ ok: true } | { ok: false; code: ItemProblem }> {
  if (typeof id !== "string" || !id) return { ok: false, code: "not_found" };
  const user = await userClient();
  if (!user) return { ok: false, code: "permission_denied" };
  const { data: row } = await user.sb.from("meow_items").select("model_path").eq("id", id).maybeSingle();
  if (!row) return { ok: false, code: "not_found" };
  const path = (row as { model_path: string }).model_path;
  const { error } = await user.sb.from("meow_items").delete().eq("id", id);
  if (error) return { ok: false, code: "permission_denied" };
  await user.sb.storage.from(ITEM_BUCKET).remove([path]);
  return { ok: true };
}
