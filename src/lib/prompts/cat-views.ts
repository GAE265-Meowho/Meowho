// AI 三視角照片（#110）的影像生成指示：以原始照片為參考，產生同一隻貓的左側面、正面、背部高清照片。
// 用途：左側面照用來套骨架上色（paint_worker 的 view=left，頭朝畫面左邊）；正面、背部之後做 3D 真實花紋。
// 影像模型對英文指示較穩定，送出用英文；每段都附中文翻譯，製作glb工作區可切換中英顯示。
// 2026-11-02 Tina 以 cat_studio/ai_views_demo.py 在 gpt-image-2 實測調整：左側面要站姿不走路、背部明確不畫臉、幼貓保持幼貓比例。
import type { GenView } from "@/lib/hq/cat-models/types";

export interface Bilingual { en: string; zh: string }

const COMMON: Bilingual = {
  en: `Use the cat in the reference photo as the only subject. Create a photorealistic, high-definition studio photo of this exact same cat.
Keep its fur colors, markings, stripe pattern, eye color and body proportions identical to the reference photo. Do not invent new markings.
The cat stands on all four legs, whole body and tail fully visible and not cropped. Plain light-grey seamless background, soft even lighting,
no harsh shadows, no props, no text, no other animals.`,
  zh: `以參考照片中的貓為唯一主角，產生這隻貓的寫實高清棚拍照片。
毛色、花紋、條紋、眼睛顏色、身體比例都要和參考照片一模一樣，不要自己加新的花紋。
貓四腳站立，全身和尾巴都要完整入鏡、不能被裁掉。淺灰色無縫純色背景、柔和均勻的光線，
沒有強烈陰影、沒有道具、沒有文字、沒有其他動物。`,
};

const CAMERA: Record<GenView, Bilingual> = {
  left: {
    en: "Camera: true side view (profile) at the cat's height, camera perpendicular to the body. The cat faces LEFT: head on the left side of the image, tail on the right. The head is level and in line with the body, looking straight ahead to the left (face in profile, not turned toward the camera). The cat is standing still, not walking: all four legs straight down, the far legs slightly offset from the near legs so all four paws are visible on the floor. The tail extends behind the body and is not curled over the back.",
    zh: "相機：和貓同高的正側面，鏡頭和身體垂直。貓朝左：頭在畫面左邊、尾巴在右邊。頭保持水平、和身體成一直線，看向左前方（側臉，不轉向鏡頭）。貓站著不動、不是走路：四條腿直直向下，遠側的腳和近側的腳稍微錯開，四個腳掌都看得到。尾巴往身體後方伸，不要捲在背上。",
  },
  front: {
    en: "Camera: straight-on front view at the cat's eye level. The cat's whole body faces the camera head-on: face, chest and both front legs point toward the viewer. The body is NOT turned sideways and the side of the body is not visible.",
    zh: "相機：和貓眼睛同高的正前方。貓整個身體正對鏡頭：臉、胸口和兩隻前腳都朝向觀看者；身體不能側轉，看不到身體側面。",
  },
  back: {
    en: "Camera: rear view from behind and slightly above the cat. The cat faces AWAY from the camera, toward the back of the scene: we see the back of its head and the backs of its ears, the whole back from neck to tail, and the tail. The face, eyes and nose are NOT visible. This is not a front view and not a side view.",
    zh: "相機：從貓的後方稍高處拍。貓背對鏡頭、面向場景深處：看得到後腦勺和耳朵背面、從脖子到尾巴的整個背部，以及尾巴。看不到臉、眼睛和鼻子。這不是正面照，也不是側面照。",
  },
};

/** 每個角度的基本指示（不含年齡、參考照片說明） */
export const CAT_VIEW_PROMPTS: Record<GenView, Bilingual> = {
  left: { en: `${COMMON.en}\n${CAMERA.left.en}`, zh: `${COMMON.zh}\n${CAMERA.left.zh}` },
  front: { en: `${COMMON.en}\n${CAMERA.front.en}`, zh: `${COMMON.zh}\n${CAMERA.front.zh}` },
  back: { en: `${COMMON.en}\n${CAMERA.back.en}`, zh: `${COMMON.zh}\n${CAMERA.back.zh}` },
};

export type AgeBand = "kitten" | "adult" | "senior" | "unknown";

/** 依月齡分年齡層：6 個月以下幼貓（同骨架規則 KITTEN_MAX_MONTHS）、10 歲以上老貓 */
export function ageBand(months: number | null | undefined): AgeBand {
  if (typeof months !== "number" || !Number.isFinite(months) || months < 0) return "unknown";
  if (months <= 6) return "kitten";
  if (months >= 120) return "senior";
  return "adult";
}

/** 年齡層的補充指示；看不出來就不加 */
export function ageNote(months: number | null | undefined): Bilingual | null {
  const band = ageBand(months);
  const m = typeof months === "number" ? Math.round(months) : null;
  const en = m !== null ? ` (about ${m} months old)` : "";
  const zh = m !== null ? `（約 ${m} 個月大）` : "";
  if (band === "kitten") return {
    en: `This is a kitten${en}. Keep kitten proportions: a large head relative to the body, big eyes, short legs and a short, rounded body. Do not make it look like an adult cat.`,
    zh: `這是幼貓${zh}。保持幼貓比例：頭相對身體比較大、眼睛大、腿短、身體短而圓。不要畫成成貓的樣子。`,
  };
  if (band === "adult") return { en: `This is an adult cat${en}. Keep adult cat proportions.`, zh: `這是成貓${zh}。保持成貓比例。` };
  if (band === "senior") return { en: `This is a senior cat${en}. Keep its adult proportions and natural senior appearance.`, zh: `這是老貓${zh}。保持成貓比例與自然的老貓外觀。` };
  return null;
}

/** 多張參考照片時說明它們是同一隻貓；只有一張就不加 */
export function refsNote(n: number): Bilingual | null {
  if (n <= 1) return null;
  return {
    en: `Reference images 1-${n} are photos of the same cat from different angles; combine them to get every marking right.`,
    zh: `參考圖 1～${n} 是同一隻貓不同角度的照片；綜合這些照片，把每一處花紋都畫對。`,
  };
}

/** 組出實際送出的指示（英文送模型，中文給人看）：參考照片說明 → 年齡 → 角度指示 */
export function buildViewPrompt(view: GenView, opts: { ageMonths?: number | null; refCount?: number } = {}): Bilingual {
  const parts = [refsNote(opts.refCount ?? 1), ageNote(opts.ageMonths), CAT_VIEW_PROMPTS[view]].filter((p): p is Bilingual => Boolean(p));
  return { en: parts.map(p => p.en).join("\n"), zh: parts.map(p => p.zh).join("\n") };
}
