// 虛擬飼養的聲音（第 6 份，#393）：背景音樂依場景切換、音效給第 1～5 份呼叫、靜音記住玩家的選擇。
// 音檔放在 Supabase Storage 的公開 bucket `meow-play-audio`：bgm/<ID>.mp3、sfx/<ID>.mp3，旁邊有同名 .license.txt（0035）。
// 上傳：MeowHQ「虛擬體驗元件管理」→「音效」按「新增音效」（自動改檔名、寫授權檔），或 `npm run audio:upload -- <資料夾> --apply`。
// 有沒有音檔以 Storage 實際的檔案為準（/api/play/sounds），上傳後不用改程式。
// 要找「這個事件該用哪個音效」：查下面的 SOUNDS（usedIn 寫用在哪、part 寫第幾份要呼叫），或用 soundsFor(第幾份)。
// 這個檔案只放純函式與對照表（有測試）；真的播放在 audio-player.ts。
import { SUPABASE_URL } from "@/lib/supabase/config";
import type { EndingPhase } from "./ending";
import type { NodeId } from "./story";

export const AUDIO_BUCKET = "meow-play-audio";

export type SoundKind = "bgm" | "cat" | "move" | "care" | "toy" | "ui";

export interface Sound {
  kind: SoundKind;
  /** 中文名稱 */
  label: string;
  /** 用在哪個遊戲事件 */
  usedIn: string;
  /** 第幾份要在程式裡呼叫（背景音樂自動切換，不用呼叫，寫 6） */
  part: (1 | 2 | 3 | 4 | 5 | 6)[];
  /** 初始值：讀不到 Storage 清單（/api/play/sounds）時才用；平常以 Storage 裡實際有的檔案為準 */
  ready: boolean;
}

/** 所有聲音的對照表：ID → 名稱、用在哪、誰呼叫、有沒有音檔。ID 照 docs/play-tasks/00-總表.md「聲音」。 */
export const SOUNDS = {
  // 背景音樂（自動依場景切換，見 bgmFor）
  bgm_arrive: { kind: "bgm", label: "剛到家", usedIn: "第 1 天，貓躲在外出籠、等牠出來", part: [6], ready: true },
  bgm_daily: { kind: "bgm", label: "日常", usedIn: "開場、採買、擺用品、在家的時光、白天與傍晚的節點（含結尾的前一天、隔天）；結案報告沒有專用音樂時也用這首", part: [6], ready: true },
  bgm_night: { kind: "bgm", label: "半夜", usedIn: "夜晚：第 30 天跑酷、半年後噴尿或發情大叫、第 1 天硬拉那晚", part: [6], ready: true },
  bgm_vet: { kind: "bgm", label: "醫院", usedIn: "診間：半年後、五年後、十年後看獸醫", part: [6], ready: true },
  bgm_farewell: { kind: "bgm", label: "升天", usedIn: "結尾 15 歲：暗幕全黑後才進來、回顧時播、漸白時淡出（只播一次）", part: [6], ready: true },
  bgm_report: { kind: "bgm", label: "結案報告", usedIn: "結案報告（比較活潑；還沒音檔時退回日常）", part: [6], ready: false },
  // 貓的聲音
  sfx_meow: { kind: "cat", label: "一般喵", usedIn: "貓回應、需求氣泡出現", part: [3, 4], ready: false },
  sfx_meow_cute: { kind: "cat", label: "撒嬌喵", usedIn: "摸貓摸得好、信任上升", part: [3], ready: false },
  sfx_purr: { kind: "cat", label: "呼嚕", usedIn: "摸貓、刷牙做得好", part: [3], ready: false },
  sfx_hiss: { kind: "cat", label: "哈氣", usedIn: "第 1 天硬拉、剪指甲剪太深、摸錯地方", part: [2, 3, 5], ready: true },
  sfx_scream: { kind: "cat", label: "尖叫", usedIn: "剪指甲剪太深", part: [2], ready: true },
  sfx_yowl: { kind: "cat", label: "半夜發情大叫", usedIn: "半年後，母貓未結紮半夜發情", part: [5], ready: true },
  // 貓的動作
  sfx_step: { kind: "move", label: "腳步（木地板）", usedIn: "貓在房間裡走動", part: [4], ready: false },
  sfx_dash: { kind: "move", label: "跑酷衝刺", usedIn: "第 30 天半夜跑酷", part: [5], ready: false },
  sfx_land: { kind: "move", label: "跳上家具落地", usedIn: "貓跳上、跳下家具", part: [4, 5], ready: false },
  sfx_eat: { kind: "move", label: "吃飯（咀嚼）", usedIn: "餵貓後貓吃飯", part: [1], ready: false },
  sfx_drink: { kind: "move", label: "喝水（舔水）", usedIn: "換水後貓喝水", part: [1], ready: false },
  sfx_dig: { kind: "move", label: "撥貓砂", usedIn: "貓上廁所", part: [1], ready: false },
  sfx_scratch: { kind: "move", label: "磨爪", usedIn: "貓抓板", part: [2], ready: false },
  sfx_spray: { kind: "move", label: "噴尿", usedIn: "半年後，公貓未結紮亂噴尿（和尿漬同時）", part: [5], ready: false },
  // 照顧動作
  sfx_pour_food: { kind: "care", label: "倒飼料", usedIn: "餵貓小遊戲倒乾飼料", part: [1], ready: true },
  sfx_can_open: { kind: "care", label: "開罐頭拉環", usedIn: "餵貓小遊戲開罐頭", part: [1], ready: false },
  sfx_pour_water: { kind: "care", label: "倒水", usedIn: "換水小遊戲開水龍頭", part: [1], ready: true },
  sfx_scoop: { kind: "care", label: "鏟貓砂", usedIn: "鏟屎小遊戲", part: [1], ready: true },
  sfx_bag: { kind: "care", label: "垃圾袋", usedIn: "鏟屎小遊戲倒進垃圾袋", part: [1], ready: false },
  sfx_clip: { kind: "care", label: "剪指甲「喀」", usedIn: "剪指甲小遊戲", part: [2], ready: false },
  sfx_brush: { kind: "care", label: "刷牙「刷刷」", usedIn: "刷牙小遊戲", part: [3], ready: false },
  sfx_carrier_door: { kind: "care", label: "外出籠門開關", usedIn: "外出籠（第 1 天、十年後出門）", part: [2], ready: false },
  // 逗貓
  sfx_toy: { kind: "toy", label: "玩具在地板上跑", usedIn: "3D 逗貓", part: [1, 5], ready: false },
  sfx_pounce: { kind: "toy", label: "貓撲上去", usedIn: "3D 逗貓", part: [1, 5], ready: false },
  // 介面
  sfx_tap: { kind: "ui", label: "按鈕", usedIn: "全部畫面的按鈕", part: [5], ready: false },
  sfx_trust_up: { kind: "ui", label: "信任上升（愛心）", usedIn: "信任值上升", part: [5], ready: false },
  sfx_stress_up: { kind: "ui", label: "壓力上升", usedIn: "壓力值上升", part: [5], ready: false },
  sfx_done: { kind: "ui", label: "完成", usedIn: "小遊戲成功、在家的時光做完一項", part: [1, 2, 3], ready: false },
  sfx_fail: { kind: "ui", label: "失敗", usedIn: "小遊戲失敗", part: [1, 2, 3], ready: false },
  sfx_accident: { kind: "ui", label: "居家意外（選做）", usedIn: "五年後居家意外發生的瞬間", part: [5], ready: false },
} as const satisfies Record<string, Sound>;

export type SoundId = keyof typeof SOUNDS;
export type BgmId = Extract<SoundId, `bgm_${string}`>;
export type SfxId = Extract<SoundId, `sfx_${string}`>;

const ALL = Object.keys(SOUNDS) as SoundId[];
export const BGM_IDS = ALL.filter((id): id is BgmId => id.startsWith("bgm_"));
export const SFX_IDS = ALL.filter((id): id is SfxId => id.startsWith("sfx_"));

/** 已經上傳音檔的音效（ready: true） */
export const SFX_READY: ReadonlySet<SfxId> = new Set(SFX_IDS.filter(id => SOUNDS[id].ready));

/** 第幾份要接哪些音效：soundsFor(5) → 渝茜要呼叫的音效 */
export const soundsFor = (part: Sound["part"][number]): SfxId[] => SFX_IDS.filter(id => (SOUNDS[id].part as readonly number[]).includes(part));

/** 分類名稱（MeowHQ 音效分頁、說明書用） */
export const SOUND_KIND_LABEL: Record<SoundKind, string> = {
  bgm: "背景音樂", cat: "貓的聲音", move: "貓的動作", care: "照顧動作", toy: "逗貓", ui: "介面",
};

/** 第幾份是誰做（docs/play-tasks/00-總表.md） */
export const PART_OWNER: Record<Sound["part"][number], string> = { 1: "珮瑜", 2: "Tina", 3: "世安", 4: "Tina", 5: "渝茜", 6: "子哲" };

/** 背景音樂不用誰呼叫，依場景自動切換 */
export const AUTO_CALLER = "自動切換";

/** 「第 2 份（Tina）、第 5 份（渝茜）」；背景音樂自動切換 */
export const partLabel = (id: SoundId) =>
  id.startsWith("bgm_") ? AUTO_CALLER : SOUNDS[id].part.map(n => `第 ${n} 份（${PART_OWNER[n]}）`).join("、");

/** 這個聲音由誰呼叫（組員名字，不重複）；背景音樂是「自動切換」。MeowHQ 音效分頁「誰呼叫」篩選用（#399） */
export const callersOf = (id: SoundId): string[] =>
  id.startsWith("bgm_") ? [AUTO_CALLER] : [...new Set(SOUNDS[id].part.map(n => PART_OWNER[n]))];

/** 「誰呼叫」的篩選選項：照第 1～5 份的順序列出組員，最後是「自動切換」 */
export const CALLER_OPTIONS: string[] = [...new Set(([1, 2, 3, 4, 5] as const).map(n => PART_OWNER[n])), AUTO_CALLER];

/** 授權檔網址（和音檔放在一起） */
export const licenseSrc = (id: SoundId, base = SUPABASE_URL) => {
  const src = audioSrc(id, base);
  return src ? src.replace(/\.mp3$/, ".license.txt") : "";
};

/** 要循環的背景音樂（升天只播一次） */
export const bgmLoops = (id: BgmId) => id !== "bgm_farewell";

/** Storage 裡的路徑：bgm/bgm_daily.mp3、sfx/sfx_meow.mp3 */
export const audioPath = (id: SoundId) => `${id.startsWith("bgm_") ? "bgm" : "sfx"}/${id}.mp3`;

/** 播放用的網址：Supabase 公開網址；沒連資料庫（示範模式）時讀不到，回傳空字串，播放器就不出聲。
 *  version 是 Storage 的最後更新時間（/api/play/sounds），換檔後網址不同，瀏覽器不會播到舊的。 */
export const audioSrc = (id: SoundId, base = SUPABASE_URL, version?: string) =>
  base ? `${base.replace(/\/$/, "")}/storage/v1/object/public/${AUDIO_BUCKET}/${audioPath(id)}${version ? `?v=${version}` : ""}` : "";

/** Storage 裡已經有的音檔：ID → 版本（/api/play/sounds 回傳的 files） */
export type SoundIndex = Partial<Record<SoundId, string>>;

/** 這個音效有沒有音檔：讀得到 Storage 的清單就照清單，讀不到就照 SOUNDS 的 ready */
export const hasSound = (id: SoundId, index: SoundIndex | null) => (index ? id in index : SOUNDS[id].ready);

export interface BgmInput {
  /** 流程的步驟（flow.ts 的 step） */
  step: string;
  nodeId: NodeId | null;
  /** 劇本的場景（flow.ts 的 scene） */
  scene: { bg: string; time: string };
  /** 在家的時光 */
  home: boolean;
  /** 結局的鋪陳走到哪（ending.ts）；沒有＝null */
  ending?: EndingPhase | null;
}

/**
 * 現在該播哪首背景音樂（總表「目前遊戲的節點」那張表）：
 * 開場、採買、擺用品、在家的時光＝日常；結案報告＝報告音樂（沒音檔退回日常，見 playableBgm）；診間＝醫院；
 * 結尾：前一天、隔天照一般規則，暗幕全黑之後才是升天；第 1 天＝剛到家（硬拉那晚是半夜）；其他節點的夜晚＝半夜，白天、傍晚＝日常。
 */
export function bgmFor({ step, nodeId, scene, home, ending = null }: BgmInput): BgmId {
  if (step === "report") return "bgm_report";
  if (step !== "node" || home) return "bgm_daily";
  if (nodeId === "farewell" && ending && ending !== "dark") return "bgm_farewell";
  if (scene.bg === "vet") return "bgm_vet";
  if (scene.time === "night") return "bgm_night";
  if (nodeId === "day1") return "bgm_arrive";
  return "bgm_daily";
}

/** 還沒有音檔時改播哪首（第 6 份補上音檔就自動換） */
const BGM_FALLBACK: Partial<Record<BgmId, BgmId>> = { bgm_report: "bgm_daily" };

/** 實際要播的那首：沒有音檔又有備用的，改播備用 */
export const playableBgm = (id: BgmId, index: SoundIndex | null): BgmId => (!hasSound(id, index) && BGM_FALLBACK[id]) || id;

export const MUTE_KEY = "meowho.play.muted";

/** 讀玩家上次的靜音選擇；讀不到（無痕模式、被擋）就當沒靜音 */
export function readMuted(store: Pick<Storage, "getItem"> | null | undefined): boolean {
  try { return store?.getItem(MUTE_KEY) === "1"; } catch { return false; }
}

export function writeMuted(store: Pick<Storage, "setItem"> | null | undefined, muted: boolean): void {
  try { store?.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* 存不了就只在這次有效 */ }
}

/** 淡入淡出：第 t 毫秒的音量（0～1），duration 0 直接到終點 */
export function fadeVolume(from: number, to: number, t: number, duration: number): number {
  if (duration <= 0 || t >= duration) return to;
  if (t <= 0) return from;
  return from + (to - from) * (t / duration);
}
