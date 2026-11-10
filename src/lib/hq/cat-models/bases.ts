// 3D 貓咪體型預覽（#302）：/MeowHQ/assets/bases?body=large|adult|kitten|runner，四個分頁（#331 加奔跑貓）。
// 大貓是新的預覽體型，和成貓、幼貓並存；目前只做預覽，不進 BodyType（貓咪製作流程、paint_worker、資料表都還沒接）。
// 大貓、奔跑貓放在 public/hq-cat-models/base/（靜態檔）；成貓、幼貓沿用母體 API（Supabase／bundled）。
import { baseFileName, KITTEN_MAX_MONTHS, type BodyType } from "./types";

export type PreviewBody = BodyType | "large" | "runner";

export const BASE_TABS: readonly { value: PreviewBody; label: string }[] = [
  { value: "large", label: "大貓" },
  { value: "adult", label: "成貓" },
  { value: "kitten", label: "幼貓" },
  { value: "runner", label: "奔跑貓" },
];

export const BASES_PATH = "/MeowHQ/assets/bases";
const LARGE_DIR = "/hq-cat-models/base";
const LARGE_FILE = "base_clips_large.glb";
const RUNNER_FILE = "cat_runner_tabby.glb";
/** 放在 public 的靜態母體（不走母體 API） */
const STATIC_FILES: Partial<Record<PreviewBody, string>> = { large: LARGE_FILE, runner: RUNNER_FILE };
const CAT_API = "/api/hq/cat-models";

export const isPreviewBody = (v: unknown): v is PreviewBody => BASE_TABS.some(t => t.value === v);
export const resolveBaseTab = (v: unknown): PreviewBody => (isPreviewBody(v) ? v : "large");
export const baseTabHref = (body: PreviewBody) => `${BASES_PATH}?body=${body}`;

const staticFile = (body: PreviewBody) => STATIC_FILES[body];
export const previewFileName = (body: PreviewBody) => staticFile(body) ?? baseFileName(body as BodyType);
export const previewBaseUrl = (body: PreviewBody) => {
  const f = staticFile(body);
  return f ? `${LARGE_DIR}/${f}` : body === "kitten" ? `${CAT_API}/base?body=kitten` : `${CAT_API}/base`;
};
/** 「下載 GLB」：大貓是同網域靜態檔，<a download> 直接有效 */
export const previewDownloadUrl = (body: PreviewBody) => {
  const f = staticFile(body);
  return f ? `${LARGE_DIR}/${f}` : `${CAT_API}/base?body=${body}&download=1`;
};
/** CatPreview 的取景只分成貓／幼貓；大貓體長約 0.52 m、奔跑貓約 0.42 m，和成貓（約 0.45 m）相近 */
export const previewFraming = (body: PreviewBody): BodyType => (body === "kitten" ? "kitten" : "adult");

export interface BasePhoto { src: string; alt: string }
export interface BaseInfo {
  label: string;
  desc: string;
  tags: string[];
  /** 系統依年齡自動套用到上傳的貓（大貓尚未接製作流程） */
  autoApply: boolean;
  facts: { label: string; value: string }[];
  photos: BasePhoto[];
  source?: { title: string; author: string; license: string; url: string };
}

const INFO: Record<PreviewBody, BaseInfo> = {
  large: {
    label: "大貓",
    desc: "體型較大、身體較長的虎斑成貓比例。新增的體型，和成貓、幼貓並存。",
    tags: ["新體型", "僅預覽"],
    autoApply: false,
    facts: [
      { label: "體長（鼻到臀）", value: "約 0.52 m" },
      { label: "網格", value: "約 1.6 萬頂點" },
      { label: "動作", value: "待機、走路" },
      { label: "尚未完成", value: "眼球與眨眼、其他動作、接上紋理貼圖流程" },
    ],
    photos: [
      { src: `${LARGE_DIR}/large_ref_side.jpg`, alt: "大貓參考模型側面" },
      { src: `${LARGE_DIR}/large_ref_3q.jpg`, alt: "大貓參考模型斜前方" },
    ],
    source: {
      title: "Cat in Motion 3d model free",
      author: "iRahulRajput",
      license: "CC-BY 4.0",
      url: "https://sketchfab.com/3d-models/cat-in-motion-3d-model-free-baa1120483c844e6bce9744f3f868c63",
    },
  },
  runner: {
    label: "奔跑貓",
    desc: "低多邊形的橘白虎斑貓，只有奔跑動作。白肚、白胸、白襪、尾巴環紋，眼睛鼻子畫在貼圖上。",
    tags: ["低多邊形", "僅預覽"],
    autoApply: false,
    facts: [
      { label: "體長（鼻到臀）", value: "約 0.42 m" },
      { label: "網格", value: "約 400 頂點、800 面" },
      { label: "動作", value: "奔跑（1.5 秒循環，原地）" },
      { label: "貼圖", value: "2048 程序化橘白虎斑（依 3D 位置繪製，不受接縫影響）" },
    ],
    photos: [
      { src: `${LARGE_DIR}/runner_ref_side.jpg`, alt: "奔跑貓側面" },
      { src: `${LARGE_DIR}/runner_ref_3q.jpg`, alt: "奔跑貓斜前方" },
    ],
  },
  adult: {
    label: "成貓",
    desc: "標準成貓比例。",
    tags: [`${KITTEN_MAX_MONTHS} 個月以上`, "未填年齡時預設"],
    autoApply: true,
    facts: [{ label: "體長（鼻到臀）", value: "約 0.45 m" }],
    photos: [],
  },
  kitten: {
    label: "幼貓",
    desc: "頭大身短的幼貓比例。",
    tags: [`${KITTEN_MAX_MONTHS} 個月以下`],
    autoApply: true,
    facts: [{ label: "體長（鼻到臀）", value: "約 0.22 m" }],
    photos: [],
  },
};

export const baseInfo = (body: PreviewBody): BaseInfo => INFO[body];
