// AI 三視角照片（#110）：① 判斷年齡（幼貓／成貓）→ ② 以原始照片（＋其他角度照片）為參考，平行產生左側面、正面、背部。
// 這裡只負責流程；讀照片、存檔、影像生成、年齡判斷都由呼叫端注入，本機與 Supabase 共用，也方便測試。
import { editImage, ImageGenError, type ImageConfig, type ImageUsage, type Reference } from "@/lib/ai/image";
import { buildViewPrompt, type Bilingual } from "@/lib/prompts/cat-views";
import type { AiAge, GenView } from "./types";

export type ViewResults = Partial<Record<GenView, { path: string; usage: ImageUsage | null } | { error: string }>>;

export interface ViewsDeps {
  /** 參考照片：第一張是原始照片，後面是其他角度照片 */
  refs: Reference[];
  /** 以參考照片和指示產生一張 PNG */
  edit: (refs: Reference[], prompt: string) => Promise<{ png: Uint8Array; usage: ImageUsage | null }>;
  /** 存檔，回傳存放路徑 */
  save: (view: GenView, png: Uint8Array) => Promise<string>;
  /** 看原始照片估年齡；沒設定 AI 或失敗回 null */
  analyze?: (ref: Reference) => Promise<Omit<AiAge, "source"> | null>;
  /** 表單填的月齡；AI 判斷不出來時用它 */
  formAgeMonths?: number | null;
}

export interface ViewsOutcome {
  results: ViewResults;
  age: AiAge;
  prompts: Partial<Record<GenView, Bilingual>>;
}

const message = (e: unknown) => (e instanceof ImageGenError ? e.message : "產生失敗，請重新產生");

/** 年齡：AI 估得出來用 AI，不然用表單填的，都沒有就是 null */
export async function resolveAge(deps: Pick<ViewsDeps, "refs" | "analyze" | "formAgeMonths">): Promise<AiAge> {
  let ai: Omit<AiAge, "source"> | null = null;
  try { ai = deps.refs[0] && deps.analyze ? await deps.analyze(deps.refs[0]) : null; } catch { ai = null; }
  if (ai && typeof ai.months === "number") return { ...ai, source: "ai" };
  const form = typeof deps.formAgeMonths === "number" ? deps.formAgeMonths : null;
  return { months: form, isCat: ai?.isCat ?? null, coat: ai?.coat ?? null, breed: ai?.breed ?? null, confidence: ai?.confidence ?? null, source: form !== null ? "form" : null };
}

/** 判斷年齡後平行產生指定角度；單張失敗不影響其他張 */
export async function generateViews(views: GenView[], deps: ViewsDeps): Promise<ViewsOutcome> {
  const age = await resolveAge(deps);
  const prompts: Partial<Record<GenView, Bilingual>> = {};
  const entries = await Promise.all(views.map(async view => {
    const prompt = buildViewPrompt(view, { ageMonths: age.months, refCount: deps.refs.length });
    prompts[view] = prompt;
    try {
      const { png, usage } = await deps.edit(deps.refs, prompt.en);
      return [view, { path: await deps.save(view, png), usage }] as const;
    } catch (e) {
      return [view, { error: message(e) }] as const;
    }
  }));
  return { results: Object.fromEntries(entries) as ViewResults, age, prompts };
}

/** 用 Azure 影像模型產生的 edit 函式 */
export const azureEdit = (cfg: ImageConfig, size?: string) => (refs: Reference[], prompt: string) => editImage(cfg, { refs, prompt, size });

/** 全部失敗時（例如讀不到原始照片）用同一個原因 */
export const failAll = (views: GenView[], error: string): ViewResults =>
  Object.fromEntries(views.map(v => [v, { error }])) as ViewResults;
