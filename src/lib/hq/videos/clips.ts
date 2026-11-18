// MeowHQ「影片 › 前導影片：產生影片」（#493，Tina 2026-11-18）
// 每格 AI 分鏡的圖生影片 prompt：起始畫面＝該格分鏡圖，參考圖＝FRAME_REFS，再加動作與運鏡。
// 剪接長度由分鏡表的時間算出；生成長度取 5、10、15 秒（Kling 3.0 單段最長 15 秒），剪接時再裁。
import {
  SHOT_SECTIONS, refById, refFileName, type Frame, type RefSlot, type Shot, type ShotSection,
} from "./trailer";

export type ClipMotion = { action: string; camera: string };

/** 每格 AI 分鏡的動作與運鏡（英文，直接貼進圖生影片工具） */
export const CLIP_MOTION: Record<string, ClipMotion> = {
  s01: { action: "Raindrops fall steadily on the closed cardboard box and splash on the wet tiles; the street light flickers slightly. Only the sound of rain.", camera: "Slow dolly-in from far away toward the box." },
  s02: { action: "The cat's amber eyes peek through the narrow gap between the two top flaps of the same sealed shipping box (clear packing tape on the flaps; no side slit, no side-cut opening, no torn side wall), blink slowly, ears twitching at the sound of the rain.", camera: "Very slow push-in, focus locked on the eyes." },
  s03: { action: "The cat curls up tighter in the corner, ears flatten, then it slowly looks up toward the camera.", camera: "Static top-down shot with subtle handheld breathing." },
  s04: { action: "Xiaojie opens the door, pauses in the dark doorway, drops his shoulders and steps in; rain runs down the window behind him.", camera: "Static shot from inside the room, eye level." },
  s05: { action: "Afang slowly crouches and reaches out her hand; the kitten hesitates, then sniffs her fingers.", camera: "Low-angle slow push-in." },
  s06: { action: "Xiaojie scrolls with his thumb, stops on a cat photo, lingers, then keeps scrolling; screen light flickers on his face.", camera: "Slow push-in to a close-up of his face." },
  "s07-1": { action: "The orange cat eats from the bowl while the short-eared cat and the gray cat eat and doze nearby; Afang lifts her phone and taps the screen to take a photo.", camera: "Static over-the-shoulder shot." },
  "s07-2": { action: "A hair dryer turns on off-screen; only the orange cat startles and dashes behind the sofa, the other two cats keep sleeping; Afang turns and writes a note in her small notebook.", camera: "Quick pan following the cat, then settle on the notebook." },
  s10: { action: "Xiaojie reads the screen, frowns slightly and pushes up his glasses; lines of text scroll in the reflection of his lenses.", camera: "Static close-up with a very slow push-in." },
  s11: { action: "The couple walks out of the door carrying the pet carrier, smiling at each other; Afang waves goodbye in the background while the gray cat watches from the window.", camera: "Static wide shot with a slight pan following them." },
  "s12-1": { action: "The cat crouches and gently pats the tangled cords with one paw, curious, without biting them.", camera: "Static low-angle shot at cat eye level." },
  "s12-2": { action: "The cat leans in and sniffs the lily petals, whiskers moving, without biting or licking them.", camera: "Slow push-in close-up." },
  s13: { action: "Xiaojie crouches down, looks at the cable tangle under his desk, frowns and touches one cable.", camera: "Static low angle, same composition as the cat under the TV cabinet." },
  "s14-1": { action: "A cat paw steps onto the pile of bills; the papers shift slightly.", camera: "Static top-down shot." },
  "s14-2": { action: "The cat hides under the sofa with wide eyes; the out-of-focus couple argues and gestures in the background.", camera: "Static low shot from under the sofa." },
  s15: { action: "His thumb hovers over the button, trembles slightly and pulls back; the screen turns off and reflects his face.", camera: "Static extreme close-up." },
  "s16-1": { action: "Afang opens the box, lifts the wet cat into her arms and holds it tight, tears in her eyes.", camera: "Slow push-in." },
  "s16-2": { action: "Xiaojie stands still by the window watching the rain, breathing slowly.", camera: "Static silhouette shot with a slow push-in." },
  s18: { action: "Afang films the cat playing with a toy on the floor and smiles at her phone screen.", camera: "Gentle handheld shot at eye level." },
  s19: { action: "Xiaojie types on his phone, pauses, and a slight surprised smile appears.", camera: "Slow push-in." },
  s20: { action: "Xiaojie gathers the cables into a cable management box, wraps them with a protective sleeve and closes the lid.", camera: "Static medium shot with a slight tilt down." },
  s22: { action: "His thumb gently taps the phone screen and he smiles softly.", camera: "Static close-up." },
  "s26-1": { action: "Afang types a message, pauses to think, then taps send.", camera: "Static medium shot." },
  "s26-2": { action: "Xiaojie reads the message, smiles and types a reply.", camera: "Static medium shot." },
  s28: { action: "The carrier door opens; the cat slowly steps out, looks around, walks to the sunny window and sits down. Xiaojie stays kneeling without reaching out; Afang watches quietly.", camera: "Low angle at cat eye level, slow follow." },
  s29: { action: "The cat sleeps by the window, its side gently rising and falling; Xiaojie turns a page on the sofa.", camera: "Static wide shot with a very slow push-in." },
  s30: { action: "The cat slowly turns its head toward the camera and blinks slowly.", camera: "Static close-up with a very slow push-in." },
};

/** 負面 prompt：所有格共用（工具有 Negative prompt 欄位就貼） */
export const NEGATIVE_PROMPT =
  "cat biting or chewing cables, cat eating flowers, extra limbs, extra tails, deformed paws, morphing faces, changing fur pattern, changing outfits, text, subtitles, watermark, logo, flicker, fast cuts";

const toSec = (t: string) => { const [m, s] = t.split(":").map(Number); return m * 60 + s; };

/** 鏡頭長度（秒），由「0:20–0:30」算出 */
export function shotSeconds(shot: Pick<Shot, "time">): number {
  const [a, b] = shot.time.split("–");
  return toSec(b) - toSec(a);
}

/** 這一格在成片裡用幾秒（同一顆鏡頭多格就平分）、建議生成幾秒（5／10／15，剪接時再裁） */
export function clipLength(shot: Shot): { cut: number; generate: 5 | 10 | 15 } {
  const ai = shot.frames.filter(f => f.make === "ai").length || 1;
  const cut = Math.round((shotSeconds(shot) / ai) * 10) / 10;
  return { cut, generate: cut <= 5 ? 5 : cut <= 10 ? 10 : 15 };
}

/** 起始畫面（分鏡圖）的固定下載檔名 */
export const startFrameFileName = (frameId: string) => `${frameId}.webp`;

/** 圖生影片的完整 prompt：起始畫面、參考圖、動作、運鏡、一致性要求 */
export function motionPrompt(frame: Frame): string {
  const m = CLIP_MOTION[frame.id];
  if (frame.make !== "ai" || !m) return "";
  const refs = frame.refs.map(refById).filter((r): r is RefSlot => Boolean(r));
  const lines = [
    `Image-to-video. Start frame = ${startFrameFileName(frame.id)} (the storyboard image of this shot).`,
    ...(refs.length ? ["Reference images (attach in this order):", ...refs.map((r, i) => `Image ${i + 1} = ${refFileName(r.id)}: ${r.en}.`)] : []),
    `Action: ${m.action}`,
    `Camera: ${m.camera}`,
    "Keep the composition, lighting and color of the start frame. Keep every character's face, fur pattern, hairstyle and outfit exactly the same as in the reference images. Natural, gentle motion; no scene cuts.",
  ];
  return lines.join("\n");
}

export type ClipItem = { shot: Shot; frame: Frame; cut: number; generate: 5 | 10 | 15 };
/** 產生影片 tab 的清單：只有 AI 生成的格子；系統錄影與剪輯字卡不用生成 */
export function clipSections(): { key: ShotSection["key"]; title: string; range: string; items: ClipItem[] }[] {
  return SHOT_SECTIONS.map(sec => ({
    key: sec.key,
    title: sec.title,
    range: sec.range,
    items: sec.shots.flatMap(shot => shot.frames.filter(f => f.make === "ai").map(frame => ({ shot, frame, ...clipLength(shot) }))),
  })).filter(sec => sec.items.length);
}
