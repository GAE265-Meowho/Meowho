// MeowHQ「影片 › 前導影片：產生影片」（#493，Tina 2026-11-18）
// 每格 AI 分鏡的圖生影片 prompt：起始畫面＝該格分鏡圖，參考圖＝FRAME_REFS，再加動作與運鏡。
// 剪接長度由分鏡表的時間算出；生成長度取 5、10、15 秒（Kling 3.0 單段最長 15 秒），剪接時再裁。
import {
  SHOT_SECTIONS, refById, refFileName, type Frame, type RefSlot, type Shot, type ShotSection,
} from "./trailer";
import { VIDEO_AUDIO_PROMPT } from "./voice";

/** cuts（#545）：一鏡太短、要拆成幾支短片分別生成時用；每支用分鏡計畫圖的某一格當起始畫面 */
export type ClipCut = { panel: number; title: string; action: string; camera: string };
export type ClipMotion = { action: string; camera: string; cuts?: ClipCut[]; cutNote?: string };

/** 每格 AI 分鏡的動作與運鏡（英文，直接貼進圖生影片工具） */
export const CLIP_MOTION: Record<string, ClipMotion> = {
  s01: { action: "Raindrops fall steadily on the closed cardboard box and splash on the wet tiles; the street light flickers slightly. Only the sound of rain.", camera: "Slow dolly-in from far away toward the box." },
  s02: { action: "Continuity from the previous rainy-doorstep box shot: inside the same cardboard box, the small hungry orange tabby curls up tighter in the corner, shivering from the cold, ears flatten; it licks its lips, glances at the empty spot where a food bowl should be and lets out a soft hungry meow; rain keeps drumming on the box.", camera: "Static top-down shot with subtle handheld breathing, looking into the open top of the box." },
  s04: { action: "Xiaojie opens the door, pauses in the dark doorway, drops his shoulders and steps in; rain runs down the window behind him.", camera: "Static shot from inside the room, eye level." },
  s05: { action: "Afang slowly crouches and reaches out her hand; the kitten hesitates, then sniffs her fingers.", camera: "Low-angle slow push-in." },
  "s07-1": { action: "The orange cat eats from the bowl while the short-eared cat and the gray cat eat and doze nearby; Afang lifts her phone and taps the screen to take a photo.", camera: "Static over-the-shoulder shot." },
  "s07-2": { action: "Afang switches on the hair dryer; only the orange cat startles and dashes into the cat bed while the other two cats keep sleeping. She switches off the hair dryer, glances at the cat bed, picks up the notebook from the table and writes a short note.", camera: "Low angle at cat eye level; quick pan following the cat into the cat bed, then tilt up to Afang and the notebook (page blurred, no readable text)." },
  s10: { action: "Xiaojie scrolls the cat-care checklist on the laptop, then stops; his finger rests on one line.", camera: "Static wide shot from the doorway, matching the 9-1 frame; a very slow push-in toward the desk." },
  s11: { action: "At Afang's doorstep, the young couple faces Afang; she gently hands over the pet carrier with the orange tabby cat inside and the woman takes it by the handle, the cat peeking out through the carrier door. The couple smile at each other, turn and walk away down the path carrying the carrier. Afang stays at the door watching them leave, while the gray cat watches from the window behind her.", camera: "Static medium shot from the side of the doorway, then a slow pan following the couple as they leave." },
  "s12-1": { action: "The cat crouches and gently pats the tangled cords with one paw, curious, without biting them.", camera: "Static low-angle shot at cat eye level." },
  "s12-2": { action: "The cat leans in and sniffs the lily petals, whiskers moving, without biting or licking them.", camera: "Slow push-in close-up." },
  s13: { action: "He slowly looks down at the cable tangle under his desk and frowns; he nudges one cable with his foot.", camera: "Same doorway framing as 9-1; slow push-in toward the cables under the desk. Do not move any furniture." },
  "s14-1": { action: "A cat paw steps onto the pile of bills; the papers shift slightly.", camera: "Static top-down shot." },
  "s14-2": { action: "The cat hides under the sofa with wide eyes; the out-of-focus couple argues and gestures in the background.", camera: "Static low shot from under the sofa." },
  s15: {
    action: "He sits on the sofa holding his phone; his thumb hovers over the button and pulls back; he locks the screen and the dark screen reflects his face.",
    camera: "Four short clips cut together in editing (see below).",
    cuts: [
      { panel: 2, title: "medium shot on the sofa", action: "The man sits on the edge of the sofa leaning forward, holding his phone in both hands; he stops scrolling and stares at the screen, completely still except for slow breathing. Rain runs down the window behind him.", camera: "Static medium shot from the side, very slow push-in toward his face and the phone. Keep the sofa, the floor lamp, the coffee table with the mug and the book, and the rainy window exactly as in the start frame; do not add or move any furniture." },
      { panel: 5, title: "thumb hovering", action: "His thumb hovers just above the phone screen, trembles slightly, almost touches it, then slowly pulls back without tapping. The screen stays blurred with no readable text.", camera: "Static extreme close-up on the thumb and screen, shallow depth of field." },
      { panel: 13, title: "his face", action: "He looks down at the phone, swallows, his eyes lower and he lets out a quiet breath; a faint frown.", camera: "Static close-up on his face, very slow push-in." },
      { panel: 15, title: "dark screen reflection", action: "He presses the side button and the screen goes dark; his face and glasses become faintly reflected on the black glass; he holds still.", camera: "Static close-up on the phone in his hands, focus shifts slightly onto the reflection." },
    ],
    cutNote: "Shot 11 is only 6 seconds: take about 1.5 seconds from each clip, in the order ① ② ③ ④. The adoption page with the 我想領養 button is composited onto clip ② in editing; the voice-over starts on clip ③. Extra negative prompt: readable text on screen, extra fingers, deformed hands, furniture moving, daylight, camera shake.",
  },
  "s16-1": { action: "Afang opens the box, lifts the wet cat into her arms and holds it tight, tears in her eyes.", camera: "Slow push-in." },
  "s16-2": { action: "Xiaojie stands still by the window watching the rain, breathing slowly.", camera: "Static silhouette shot with a slow push-in." },
  s18: { action: "Afang films the cat playing with a toy on the floor and smiles at her phone screen.", camera: "Gentle handheld shot at eye level." },
  s19: { action: "Xiaojie types on his phone, pauses, and a slight surprised smile appears.", camera: "Slow push-in." },
  s20: { action: "Xiaojie gathers the cables into a cable management box, wraps them with a protective sleeve and closes the lid.", camera: "Static medium shot with a slight tilt down." },
  s22: { action: "His thumb gently taps the phone screen and he smiles softly.", camera: "Static close-up." },
  s31: { action: "All three panels play at the same time: Afang rubs her forehead beside the empty box, the towel-wrapped orange cat lowers its ears and looks up, Xiaojie frowns at his phone by the rainy window; near the end all three look up and their lips move together as if saying one short line.", camera: "Locked-off static frame; keep the three panel borders fixed and the eye lines level across panels." },
  "s26-1": { action: "Afang types a message, pauses to think, then taps send.", camera: "Static medium shot." },
  "s26-2": { action: "Xiaojie reads the message, smiles and types a reply.", camera: "Static medium shot." },
  s28: { action: "The carrier door opens; the cat slowly steps out, looks around, walks to the sunny window and sits down. Xiaojie stays kneeling without reaching out; Afang watches quietly.", camera: "Low angle at cat eye level, slow follow." },
  s29: { action: "The cat sleeps by the window, its side gently rising and falling; Xiaojie turns a page on the sofa.", camera: "Static wide shot with a very slow push-in." },
  s30: { action: "Sitting on the sofa, Xiaojie holds the cat in his arms and strokes its back; the cat slowly turns its head toward the camera and blinks slowly.", camera: "Very slow push-in from medium close-up to the cat's face; keep the sofa, floor lamp, window and desk where the studio reference places them." },
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
  if (m.cuts?.length) return cutsPrompt(frame, m, refs);
  const lines = [
    `Image-to-video. Start frame = ${startFrameFileName(frame.id)} (the storyboard image of this shot).`,
    ...(refs.length ? ["Reference images (attach in this order):", ...refs.map((r, i) => `Image ${i + 1} = ${refFileName(r.id)}: ${r.en}.`)] : []),
    `Action: ${m.action}`,
    `Camera: ${m.camera}`,
    "Keep the composition, lighting and color of the start frame. Keep every character's face, fur pattern, hairstyle and outfit exactly the same as in the reference images. Natural, gentle motion; no scene cuts.",
    VIDEO_AUDIO_PROMPT, // #504：旁白、配樂、字幕都在剪輯時才加
  ];
  return lines.join("\n");
}

/** 拆成幾支短片的鏡頭（#545）：共用開頭＋每支一段，起始畫面是分鏡計畫圖的第幾格 */
function cutsPrompt(frame: Frame, m: ClipMotion, refs: RefSlot[]): string {
  const marks = ["①", "②", "③", "④", "⑤", "⑥"];
  return [
    `Image-to-video, ${m.cuts!.length} separate short clips. The start frames are panels of the storyboard plan for this shot (${startFrameFileName(frame.id)}). Generate each clip for 5 seconds.`,
    ...(refs.length ? ["Reference images (attach in this order):", ...refs.map((r, i) => `Image ${i + 1} = ${refFileName(r.id)}: ${r.en}.`)] : []),
    "For every clip: keep the man's face, glasses, gray T-shirt, the room and the lighting exactly as in the start frame. Rainy night, warm lamp light mixed with cool blue window light. Natural, gentle motion. Audio: rain ambience only.",
    VIDEO_AUDIO_PROMPT,
    ...m.cuts!.flatMap((c, i) => ["", `Clip ${marks[i]} start frame = panel ${c.panel} (${c.title})`, `Action: ${c.action}`, `Camera: ${c.camera}`]),
    ...(m.cutNote ? ["", m.cutNote] : []),
  ].join("\n");
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
