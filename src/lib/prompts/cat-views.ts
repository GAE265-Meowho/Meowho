// AI 三視角照片（#110）的影像生成指示：以原始照片為參考，產生同一隻貓的左側面、正面、背部高清照片。
// 用途：左側面照用來套骨架上色（paint_worker 的 view=left，頭朝畫面左邊）；正面、背部之後做 3D 真實花紋。
// 影像模型對英文指示較穩定，所以指示用英文；共同規則放 COMMON，三個角度只差構圖。
import type { GenView } from "@/lib/hq/cat-models/types";

const COMMON = `Use the cat in the reference photo as the only subject. Create a photorealistic, high-definition studio photo of this exact same cat.
Keep its fur colors, markings, stripe pattern, eye color and body proportions identical to the reference photo. Do not invent new markings.
The cat stands on all four legs, whole body and tail fully visible and not cropped. Plain light-grey seamless background, soft even lighting,
no harsh shadows, no props, no text, no other animals.`;

export const CAT_VIEW_PROMPTS: Record<GenView, string> = {
  left: `${COMMON}
Camera: true side view at the cat's height. The cat faces LEFT: its head is on the left side of the image and its tail on the right side.`,
  front: `${COMMON}
Camera: front view at the cat's eye level. The cat faces the camera directly, both eyes and both front legs visible, body symmetric.`,
  back: `${COMMON}
Camera: high angle from above and slightly behind the cat, showing the whole back from neck to tail so the back pattern is clearly visible.`,
};
