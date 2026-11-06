// 各 AI 任務的輸出格式（zod）。LangChain withStructuredOutput 會把它轉成供應商的 JSON Schema，
// 回來的結果也會再用同一份 schema 驗證，格式不對就當作失敗、改用規則式。
import { z } from "zod";

export const HouseholdExtractionSchema = z.object({
  caretakerType: z.enum(["personal_foster", "shelter_org", "cat_owner"]).nullable().describe("照顧者類型"),
  name: z.string().nullable().describe("貓戶名稱，最多 30 字"),
  city: z.string().nullable().describe("縣市，例如 台中市"),
  district: z.string().nullable().describe("區／鄉鎮市，例如 北屯區"),
  intro: z.string().nullable().describe("1～3 句介紹，最多 200 字"),
  catCount: z.number().int().nullable().describe("目前照顧的貓咪數量"),
  allowStrangerMessages: z.boolean().nullable().describe("是否願意讓陌生人私訊"),
  reply: z.string().describe("30 字內的溫暖回應"),
});

export const CatPhotoSchema = z.object({
  isCat: z.boolean().describe("照片主角是否為貓"),
  breed: z.string().nullable().describe("品種，看不出來寫 米克斯"),
  coat: z.string().nullable().describe("毛色花紋"),
  ageBand: z.enum(["幼貓", "成貓", "熟齡", "老貓"]).nullable().describe("年齡層"),
  confidence: z.number().min(0).max(1).describe("0～1 信心分數"),
  comment: z.string().describe("25 字內的溫暖觀察"),
});

export const CatStorySchema = z.object({
  traits: z.array(z.string()).describe("2～5 個性格標籤，每個 2～4 字"),
  quirks: z.string().nullable().describe("特殊癖好，用頓號串成一句"),
  notes: z.string().nullable().describe("其他補充 1～2 句"),
  neutered: z.boolean().nullable().describe("是否已結紮"),
  reply: z.string().describe("30 字內的溫暖回應"),
});

export type HouseholdExtractionOut = z.infer<typeof HouseholdExtractionSchema>;
export type CatPhotoOut = z.infer<typeof CatPhotoSchema>;
export type CatStoryOut = z.infer<typeof CatStorySchema>;

// ---------- 建檔對話引擎（#72）：每一句話擷取所有能填的欄位 ----------
// 標籤用一般字串陣列：模型偶爾給清單外的字時不讓整句失敗，由引擎的 pickTags 過濾

export const HouseholdTurnSchema = z.object({
  caretakerType: z.enum(["personal_foster", "shelter_org", "cat_owner"]).nullable().describe("照顧者身分，沒提到填 null"),
  name: z.string().nullable().describe("喵戶名稱，最多 30 字，沒提到填 null"),
  city: z.string().nullable().describe("縣市，例如 台中市，沒提到填 null"),
  district: z.string().nullable().describe("區／鄉鎮市，例如 北屯區，沒提到填 null"),
  intro: z.string().nullable().describe("喵戶介紹 1～3 句，最多 200 字，沒提到填 null"),
  reply: z.string().describe("30 字內的溫暖回應，不用 emoji"),
});

export const CatTurnSchema = z.object({
  name: z.string().nullable().describe("貓咪名字，沒提到填 null"),
  sex: z.enum(["male", "female", "unknown"]).nullable().describe("使用者明說的性別；說不確定填 unknown；沒提到填 null"),
  birthday: z.string().nullable().describe("YYYY-MM-DD，使用者明說生日才填（只用來判斷年齡層，不會存）"),
  estAgeMonths: z.number().int().nullable().describe("使用者說的大約月齡（例如 2 歲 → 24、剛滿月 → 1；只用來判斷年齡層，不會存）"),
  lifeStage: z.enum(["kitten", "adult", "senior"]).nullable().describe("使用者直接說幼貓／小貓、成貓、老貓時才填"),
  coat: z.string().nullable().describe("毛色花紋"),
  breed: z.string().nullable().describe("品種"),
  personalityTags: z.array(z.string()).describe("只能從個性標籤清單挑選"),
  healthTags: z.array(z.string()).describe("只能從健康標籤清單挑選"),
  description: z.string().nullable().describe("使用者描述個性、習慣、健康的原話，整理成通順句子但不增減事實"),
  timeline: z.array(z.object({
    date: z.string().describe("照使用者寫的日期，例如 8/01、2024/3/5"),
    event: z.string().describe("那天發生的事，保留原文重點，60 字內"),
  })).describe("有寫日期的事件，依原文順序；沒有就給空陣列"),
  medical: z.object({
    neutered: z.enum(["done", "not_done", "unknown"]).nullable().describe("結紮：已結紮 done、還沒 not_done；沒提到 null"),
    neuterNote: z.string().nullable().describe("結紮日期或還沒結紮時的預計安排"),
    vaccineDoses: z.number().int().nullable().describe("疫苗打了幾劑（第一劑＝1）；沒提到 null"),
    lastVaccineDate: z.string().nullable().describe("最後一次施打日期 YYYY-MM-DD；沒提到 null"),
    dewormInternal: z.enum(["done", "not_done", "unknown"]).nullable().describe("體內驅蟲"),
    dewormExternal: z.enum(["done", "not_done", "unknown"]).nullable().describe("體外驅蟲"),
    fivFelv: z.enum(["negative", "fiv_positive", "felv_positive", "both_positive", "untested"]).nullable().describe("FIV／FeLV 快篩結果"),
    testDate: z.string().nullable().describe("快篩日期 YYYY-MM-DD"),
    microchip: z.enum(["yes", "no", "unknown"]).nullable().describe("是否已植入晶片"),
    history: z.string().nullable().describe("病史，照原文"),
    medication: z.string().nullable().describe("目前用藥，照原文"),
  }).describe("醫療細項；只填使用者明確寫出的，其他 null"),
  compat: z.object({
    cats: z.enum(["yes", "maybe", "no", "unknown"]).nullable(),
    dogs: z.enum(["yes", "maybe", "no", "unknown"]).nullable(),
    kids: z.enum(["yes", "maybe", "no", "unknown"]).nullable(),
    guest: z.enum(["yes", "maybe", "no", "unknown"]).nullable(),
  }).describe("能否和其他貓、狗、小孩、陌生人相處：可以 yes、看情況 maybe、不行 no；沒提到 null"),
  habits: z.array(z.string()).describe("只能從生活習慣清單挑選"),
  adoptionTerms: z.array(z.string()).describe("送養條件，盡量對應送養條件清單的寫法"),
  adoptionNote: z.string().nullable().describe("清單以外的送養條件"),
  handover: z.array(z.string()).describe("只能從交接物品清單挑選"),
  wantsReview: z.boolean().describe("使用者表示「先這樣」、想直接看名片時為 true"),
  reply: z.string().describe("30 字內的溫暖回應，不用 emoji"),
});

export const CatPhotoAnalysisSchema = z.object({
  isCat: z.boolean().describe("照片主角是否為貓"),
  inappropriate: z.boolean().describe("是否含裸露、血腥、虐待動物等違反善良風俗的內容"),
  sameCatAsReference: z.boolean().nullable().describe("有參考照片時，是否為同一隻貓；明顯不同才填 false；沒有參考照片填 null"),
  coat: z.string().nullable().describe("毛色花紋"),
  breed: z.string().nullable().describe("品種，看不出來填 null"),
  estAgeMonths: z.number().int().nullable().describe("估計月齡，看不出來填 null"),
  confidence: z.number().min(0).max(1).describe("0～1 信心分數"),
});

export type HouseholdTurnOut = z.infer<typeof HouseholdTurnSchema>;
export type CatTurnOut = z.infer<typeof CatTurnSchema>;
export type CatPhotoAnalysisOut = z.infer<typeof CatPhotoAnalysisSchema>;

// ---------- 平面圖讀圖（#138，規格 docs/hq/05 §5）：一間房一張平面圖，或 1～4 張實景照片（#144）----------
// 座標一律公尺、平面 (x, y)，原點在房間左上角；牆用中心線端點。陣列欄位不用 tuple（部分供應商的嚴格模式不支援），
// 由 src/lib/hq/floorplans/read.ts 整理成 meta 的格式並檢查是否合理。
export const FLOORPLAN_FURNITURE_KINDS = [
  "sofa", "bed", "table", "chair", "desk", "wardrobe", "cabinet", "tv_stand", "counter", "toilet", "bathtub",
  "fan", "computer", "cup", "vase", "notebook", "other",
] as const;

export const floorplanRoomSchema = z.object({
  // 放在最前面：先用文字把每面牆有什麼說清楚，再給座標，家具位置比較準（Tina 2026-11-03 實測照片推估偏差大）
  layoutNotes: z.string().describe("先依序描述每面牆（walls 的索引）上有哪些門窗、哪些家具靠著它，每面牆一句，200 字內"),
  kind: z.enum(["floorplan", "photo", "other"]).describe("floorplan＝俯視平面圖；photo＝室內實景照片；other＝都不是"),
  name: z.string().nullable().describe("圖上標示的房間名稱，例如 客廳；看不出來填 null"),
  scale: z.object({
    mPerPx: z.number().nullable().describe("每個像素約幾公尺；算不出來填 null"),
    source: z.enum(["label", "estimate"]).describe("label＝讀圖上的尺寸標註；estimate＝用門寬、床長等常見尺寸推估"),
  }),
  wallHeightM: z.number().nullable().describe("圖上標示的牆高（公尺），沒標示填 null"),
  walls: z.array(z.object({
    ax: z.number(), ay: z.number(), bx: z.number(), by: z.number(),
    t: z.number().nullable().describe("牆厚（公尺），看不出來填 null"),
  })).describe("牆的中心線，公尺；首尾相接圍出房間"),
  openings: z.array(z.object({
    kind: z.enum(["door", "window"]),
    wall: z.number().int().describe("所在牆在 walls 陣列的索引（從 0 起）"),
    at: z.number().describe("從該牆起點 (ax, ay) 到開口起點的距離（公尺）"),
    w: z.number().describe("開口寬（公尺）"),
  })),
  furniture: z.array(z.object({
    kind: z.enum(FLOORPLAN_FURNITURE_KINDS),
    label: z.string().describe("圖上的家具名稱或中文名稱，例如 沙發"),
    wall: z.number().int().nullable().describe("背面靠著哪一面牆（walls 的索引）；床頭、沙發背、櫃子背、書桌靠牆那側；不靠牆填 null"),
    // 跟 wall 一樣必填＋nullable：Azure 嚴格 structured output 不接受 optional 欄位（會整次讀圖失敗）
    parent: z.number().int().nullable().describe("放在哪一件家具上（furniture 陣列索引）；computer／cup／vase／notebook 指向 desk／table／cabinet／counter；落地填 null"),
    x: z.number().describe("家具中心 x（公尺）"),
    y: z.number().describe("家具中心 y（公尺）"),
    w: z.number().describe("寬（公尺）：靠牆時是沿著牆的長度；不靠牆時沿 x"),
    d: z.number().describe("深（公尺）：靠牆時是離開牆的深度；不靠牆時沿 y"),
    rot: z.number().describe("不靠牆時的旋轉角度（度），通常 0 或 90；靠牆時由系統決定，填 0"),
  })),
});
export type FloorplanRoomOut = z.infer<typeof floorplanRoomSchema>;
