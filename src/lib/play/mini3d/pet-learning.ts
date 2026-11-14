import type { petResult } from "./pet-rules";

const CAT = "https://pmc.ncbi.nlm.nih.gov/articles/PMC8381768/";
const PROTECTION = "https://www.cats.org.uk/cats-blog/how-to-pet-a-cat";
const HANDLING = "https://pmc.ncbi.nlm.nih.gov/articles/PMC10845437/";

export const PET_LESSONS = {
  invite: { hint: "先讓貓咪決定是否願意和你互動。", detail: "在真實生活中，先留出空間讓牠主動靠近。牠沒有靠近時，可以繼續觀察，或讓牠休息。", source: CAT },
  observe: { hint: "先輕摸頭或下巴附近，觀察牠的反應。", detail: "頭和臉頰附近可以先試。背部是否舒服，要看個別偏好與當下反應。先避開肚子和尾巴。", source: PROTECTION },
  relaxed: { hint: "牠看起來比較放鬆。停一下，看看牠是否想繼續。", detail: "合併觀察姿勢、接近或避開的動作。眨眼、呼嚕或尾巴動作都可能受情境影響。", source: HANDLING },
  warning: { hint: "牠開始轉頭了，先停下來觀察。", detail: "看向別處、耳朵轉向或尾巴急動時，可以先停手，留空間讓牠自己選擇。", source: CAT },
  pause: { hint: "停手也是照顧。等牠自己選擇是否再次接近。", detail: "輕摸幾秒後放手觀察。牠沒有主動接近時，讓牠休息。", source: CAT },
  leaving: { hint: "牠選擇離開，讓牠休息吧。", detail: "留出離開的路，讓牠自行決定何時再靠近。", source: PROTECTION },
} as const;

export function petCue(pose: string, annoyance: number, paused: boolean, pauseDue: boolean): keyof typeof PET_LESSONS {
  if (pose === "leaving") return "leaving";
  if (paused) return "pause";
  if (pose === "resisting" || annoyance >= 28) return "warning";
  if (pauseDue) return "pause";
  return pose === "relaxed" ? "relaxed" : "observe";
}

export function finishPetSession(guided: boolean, interacted: boolean, result: ReturnType<typeof petResult>) {
  return guided || !interacted ? null : result;
}
