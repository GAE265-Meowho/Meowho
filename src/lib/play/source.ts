// 領養任務要演哪一隻貓（#273）：貓咪頁「進行領養任務」→ /cats/[id]/play，PlayGame 只從這裡拿貓。
// 現在一律回 DEMO 麻糬（虎斑示範模型，見 cats.ts），網址上的 id 只先記下來。
// 之後接真的貓：在 loadPlayCat 裡用 catId 讀 meow_cats（名字、毛色）和這隻貓確認過的 meow_cat_models（母體＋貼圖），
// 讀不到或還沒有 3D 模型時退回 demoPlayCat，PlayGame 不用改。故事文案（story.ts）裡寫死的「麻糬」要另外換成 name。
import type { BodyType } from "@/lib/hq/cat-models/types";
import { PLAY_CAT, playCatLook, type PlayCatLook } from "./cats";

export interface PlayCatSource {
  /** 網址上的貓咪 id（/cats/[id]/play） */
  catId: string;
  name: string;
  coat: string;
  /** true＝還在用 DEMO 麻糬，不是這隻貓自己的資料 */
  demo: boolean;
  /** 各體型（幼貓／成貓）要用的 3D 母體與貼圖 */
  look: (body: BodyType) => PlayCatLook;
}

export function demoPlayCat(catId: string): PlayCatSource {
  return { catId, name: PLAY_CAT.name, coat: PLAY_CAT.coat, demo: true, look: playCatLook };
}

/** 接口：之後改成讀這隻貓的資料與 3D 模型；目前直接回 DEMO。 */
export async function loadPlayCat(catId: string): Promise<PlayCatSource> {
  return demoPlayCat(catId);
}
