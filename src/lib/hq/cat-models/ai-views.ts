// AI 三視角照片（#110）：以原始照片為參考，平行產生左側面、正面、背部，各自存檔。
// 這裡只負責流程；影像生成（editImage）與存檔（save）由呼叫端注入，本機與 Supabase 共用，也方便測試。
import { editImage, ImageGenError, type ImageConfig } from "@/lib/ai/image";
import { CAT_VIEW_PROMPTS } from "@/lib/prompts/cat-views";
import type { GenView } from "./types";

export type ViewResults = Partial<Record<GenView, { path: string } | { error: string }>>;

export interface GenerateDeps {
  /** 以參考照片和指示產生一張 PNG */
  edit: (prompt: string) => Promise<Uint8Array>;
  /** 存檔，回傳存放路徑 */
  save: (view: GenView, png: Uint8Array) => Promise<string>;
}

const message = (e: unknown) => (e instanceof ImageGenError ? e.message : "產生失敗，請重新產生");

/** 平行產生指定角度；單張失敗不影響其他張 */
export async function generateViews(views: GenView[], deps: GenerateDeps): Promise<ViewResults> {
  const entries = await Promise.all(views.map(async view => {
    try {
      const png = await deps.edit(CAT_VIEW_PROMPTS[view]);
      return [view, { path: await deps.save(view, png) }] as const;
    } catch (e) {
      return [view, { error: message(e) }] as const;
    }
  }));
  return Object.fromEntries(entries) as ViewResults;
}

/** 用 Azure 影像模型產生的 edit 函式 */
export const azureEdit = (cfg: ImageConfig, reference: { bytes: Uint8Array; mime: string }) =>
  (prompt: string) => editImage(cfg, { image: reference.bytes, mime: reference.mime, prompt });

/** 全部失敗時（例如讀不到原始照片）用同一個原因 */
export const failAll = (views: GenView[], error: string): ViewResults =>
  Object.fromEntries(views.map(v => [v, { error }])) as ViewResults;
