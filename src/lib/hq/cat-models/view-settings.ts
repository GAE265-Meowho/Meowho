// AI 三視角（#110）的啟動選項，本機與 Supabase 共用
import type { ViewsDeps } from "./ai-views";
import { AI_QUALITIES, AI_SIZES, type AiQuality, type AiSize } from "./types";

/** makeEdit／analyze 可注入假的（測試用）；quality、size 來自畫面「進階」 */
export interface StartViewsOptions {
  makeEdit?: () => ViewsDeps["edit"];
  analyze?: ViewsDeps["analyze"];
  now?: Date;
  quality?: unknown;
  size?: unknown;
}

/** 畫質、尺寸只收白名單內的值，其他當沒填 */
export function viewSettings(opts: { quality?: unknown; size?: unknown }): { quality?: AiQuality; size?: AiSize } {
  const out: { quality?: AiQuality; size?: AiSize } = {};
  if ((AI_QUALITIES as readonly unknown[]).includes(opts.quality)) out.quality = opts.quality as AiQuality;
  if ((AI_SIZES as readonly unknown[]).includes(opts.size)) out.size = opts.size as AiSize;
  return out;
}
