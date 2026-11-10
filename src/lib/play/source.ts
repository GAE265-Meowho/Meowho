// 領養任務要演哪一隻貓（#273）：貓咪頁「進行領養任務」→ /cats/[id]/play，PlayGame 只從這裡拿貓。
// loadPlayCat 用網址上的 catId 讀 meow_cats（名字、花色、生活階段、生日／估計月齡）和這隻貓確認過的 3D 貼圖
// （meow_cat_model_variants.confirmed_albedo）；讀不到貓或沒有 3D 貼圖時退回 DEMO 麻糬的示範虎斑，PlayGame 不用改。
// 劇本與小遊戲裡的名字由 〈貓名〉／CatgameMini 換成 name（story.ts、CatgameMini.tsx）。
import { albedoSrc } from "@/lib/cat-publish";
import type { BodyType } from "@/lib/hq/cat-models/types";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { SUPABASE_URL } from "@/lib/supabase/config";
import { catLookFor, PLAY_CAT, playCatLook, type PlayCatLook } from "./cats";
import { ageMonths, ageText, BASE_MOOD, bodyOfStage, startMood, touchFavOf, type KeeperNotes, type StartMood } from "./player-data";

export interface PlayCatSource {
  /** 網址上的貓咪 id（/cats/[id]/play） */
  catId: string;
  name: string;
  /** 花色；沒填是 null */
  coat: string | null;
  /** 「2 歲」「5 個月」…；沒有生日也沒有估計月齡時，幼貓寫「幼貓」，其他空字串 */
  ageText: string;
  /** 實際月齡；不知道是 null（劇本改用原本的 2 個月起算） */
  months: number | null;
  /** 這隻貓現在的體型（還沒開始劇情時顯示用） */
  body: BodyType;
  /** 性別、是否已結紮（劇情用；不知道是 unknown／null） */
  sex: "male" | "female" | "unknown";
  neutered: boolean | null;
  /** 中途對這隻貓的評論算出來的起始信任、壓力（0～100）與原因 */
  mood: StartMood;
  /** 中途寫的「喜歡被摸的地方」（摸貓小遊戲的最愛）；沒寫是 null */
  touchFav: "head" | "chin" | "back" | null;
  /** 虎斑才畫條紋（小遊戲裡的貓） */
  tabby: boolean;
  /** true＝還在用 DEMO 麻糬，不是這隻貓自己的資料 */
  demo: boolean;
  /** 各體型（幼貓／成貓）要用的 3D 母體與貼圖 */
  look: (body: BodyType) => PlayCatLook;
}

export function demoPlayCat(catId: string): PlayCatSource {
  return { catId, name: PLAY_CAT.name, coat: PLAY_CAT.coat, sex: "unknown", neutered: null, mood: { ...BASE_MOOD, reasons: [] }, touchFav: null, ageText: "", months: null, body: "kitten", tabby: true, demo: true, look: playCatLook };
}

/** 讀這隻貓；任何一步失敗都回 DEMO，不擋遊戲 */
export async function loadPlayCat(catId: string): Promise<PlayCatSource> {
  const sb = getBrowserSupabase();
  if (!sb) return demoPlayCat(catId);
  try {
    const [{ data: c }, { data: model }] = await Promise.all([
      sb.from("meow_cats").select("name, coat, sex, neutered, life_stage, birthday, est_age_months, personality_scale, personality_tags, personality_notes, description, intro, care").eq("id", catId).maybeSingle(),
      sb.from("meow_cat_models").select("variants:meow_cat_model_variants(body_type, confirmed_albedo)").eq("cat_id", catId).maybeSingle(),
    ]);
    if (!c?.name) return demoPlayCat(catId);
    const albedo: Partial<Record<BodyType, string>> = {};
    for (const v of (model?.variants as { body_type: string; confirmed_albedo: string | null }[] | undefined) ?? []) {
      const url = albedoSrc(v.confirmed_albedo, SUPABASE_URL);
      if (url && (v.body_type === "kitten" || v.body_type === "adult")) albedo[v.body_type] = url;
    }
    const months = ageMonths(c as { birthday: string | null; est_age_months: number | null });
    const coat = (c.coat as string | null) || null;
    return {
      catId, name: c.name as string, coat, months,
      sex: c.sex === "male" || c.sex === "female" ? c.sex : "unknown",
      neutered: typeof c.neutered === "boolean" ? c.neutered : null,
      mood: startMood({
        scale: c.personality_scale as KeeperNotes["scale"], tags: c.personality_tags as string[] | null,
        text: [c.description, c.intro, ...Object.values((c.personality_notes ?? {}) as Record<string, unknown>).map(String)].filter(Boolean).join("。"),
        arrival: ((c.care as { arrival?: Record<string, string> } | null)?.arrival) ?? null,
      }),
      touchFav: touchFavOf((c.care as { touch?: Record<string, string> } | null)?.touch),
      ageText: ageText(months, c.life_stage as string | null),
      body: bodyOfStage(c.life_stage as string | null),
      tabby: Boolean(coat?.includes("虎斑")),
      demo: false,
      look: body => catLookFor(body, albedo),
    };
  } catch {
    return demoPlayCat(catId);
  }
}
