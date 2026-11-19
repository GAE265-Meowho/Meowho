// MeowHQ「影片 › 前導影片」（#489，Tina 2026-11-18）
// 內容來源：《小橘的第二個家》v3 交叉敘事分鏡腳本（docs/video/前導影片分鏡腳本_v3.md）。
// 改腳本時兩邊一起改；這裡只放畫面要用的資料與純函式，上傳在 src/components/hq/videos/。
// 圖片存在 meow-site-assets bucket 的 videos/trailer/（0037：所有管理員都能上傳與列出，不能刪除）。

/** 分鏡的「線」：貓線、人線、匯聚（兩人同框或分割畫面）、產品、無（字卡） */
export type ShotLine = "貓" | "人" | "匯" | "產品" | "—";
/** 這一格要怎麼做出來：AI 生成、系統錄影截圖、剪輯軟體做的字卡／動畫 */
export type FrameMake = "ai" | "record" | "edit";

export const FRAME_MAKE_LABELS: Record<FrameMake, string> = {
  ai: "AI 生成",
  record: "系統錄影截圖",
  edit: "剪輯字卡",
};

/** refs：這一格要掛的定角／定景參考圖（RefSlot 的 id），會寫進完整 prompt 的開頭 */
export type Frame = { id: string; make: FrameMake; label?: string; prompt: string; refs: string[] };
export type Shot = {
  no: number;
  line: ShotLine;
  time: string;
  picture: string;
  voice: string;
  sfx: string;
  frames: Frame[];
};
/** key：段落代號，生成紀錄（meow_trailer_gen_logs.section）用 */
export type SectionKey = "opening" | "cross" | "product" | "ending";
export type ShotSection = { key: SectionKey; title: string; range: string; note?: string; shots: Shot[] };
export type RefSlot = {
  id: string;
  kind: "character" | "scene";
  name: string;
  setting: string;
  prompt: string;
  /** 寫進英文 prompt 的角色／場景說明，讓生成工具知道這張參考圖是誰、是哪裡 */
  en: string;
};

export const STYLE_TAIL = "cinematic, photorealistic, soft natural light, shallow depth of field, 35mm film look";
export const LINE_TAIL: Partial<Record<ShotLine, string>> = {
  貓: "low camera angle at cat eye level",
  人: "eye-level shot, cool fluorescent and screen light",
};

/** 參考圖的固定檔名：組員從 MeowHQ 下載定角／定景照時用這個檔名，prompt 裡也寫這個檔名 */
export const refFileName = (refId: string) => `${refId}.webp`;

export function refById(refId: string): RefSlot | undefined {
  return [...CHARACTERS, ...SCENES].find(r => r.id === refId);
}

/** 參考圖用在哪些鏡頭：由每一格的 refs 算出來，不另外手寫 */
export function usedInShots(refId: string): number[] {
  return SHOT_SECTIONS.flatMap(sec => sec.shots).filter(s => s.frames.some(f => f.refs.includes(refId))).map(s => s.no);
}

/**
 * AI 鏡頭要貼進生成工具的完整 prompt：
 * 開頭列出要掛的參考圖（Image 1、2…＝哪個檔案、是誰或哪裡），接著鏡頭 prompt＋風格尾巴（貓線、人線再加各自的尾巴）。
 */
export function fullPrompt(frame: Frame, line: ShotLine): string {
  if (frame.make !== "ai") return frame.prompt;
  const body = [frame.prompt, STYLE_TAIL, LINE_TAIL[line]].filter(Boolean).join(", ");
  const refs = frame.refs.map(refById).filter((r): r is RefSlot => Boolean(r));
  if (!refs.length) return body;
  const list = refs.map((r, i) => `Image ${i + 1} = ${refFileName(r.id)}: ${r.en}.`).join("\n");
  const keep = "Keep every character's face, fur pattern, hairstyle and outfit, and the location's layout, exactly the same as in the reference images.";
  return `Reference images (attach in this order):\n${list}\n${keep}\n\n${body}`;
}

export const VIDEO_TABS = [
  { value: "trailer", label: "前導影片：分鏡" },
  { value: "trailer-clips", label: "前導影片：影片" }, // #493 產生影片，#501 改以完成的影片為主（網址不變）
  { value: "trailer-voice", label: "前導影片：配音" }, // #504
] as const;
export type VideoTab = (typeof VIDEO_TABS)[number]["value"];

/** 下載最新腳本時的檔名，和 Tina 電腦裡的檔名一致（#498） */
export const TRAILER_MD_FILENAME = "Meowho喵戶 前導影片分鏡腳本《小橘的第二個家》v3 交叉敘事.md";

export const TRAILER_TITLE = "Meowho喵戶 前導影片《小橘的第二個家》v3 交叉敘事";
export const TRAILER_SUMMARY =
  "約 3 分鐘的故事短片，兩條線交叉剪接：中途貓小橘怕再被送回來，想領養的小傑怕自己做不好。最後兩條線匯聚到「他們要怎麼相遇」，再帶出產品。核心訊息：領養不是終點，終養才是。";
export const TRAILER_FACTS: [string, string][] = [
  ["長度", "約 3:00（雙旁白合計約 430 字）"],
  ["比例", "16:9，1080p"],
  ["結構", "遺棄開場 0:00–0:15 → 交叉敘事 0:15–1:32 → 匯聚與產品登場 1:32–2:40 → 相遇結尾 2:40–3:00"],
  ["敘事觀點", "小橘第一人稱（貓線）、小傑第一人稱（人線）輪流出現，關鍵處用分割畫面或對切讓兩人同框"],
  ["系統畫面", "1:37 之後用真實系統錄影或截圖，不用 AI 生成"],
];

/** 兩條線的視覺語言：觀眾靠鏡頭高度和色調分辨現在是誰的線，不靠字幕 */
export const LINE_LOOK: { aspect: string; cat: string; human: string; merged: string }[] = [
  { aspect: "鏡頭高度", cat: "低機位，約貓眼高度", human: "平視，人眼高度", merged: "兩種高度在同一場景出現" },
  { aspect: "色調", cat: "冷藍（雨夜）、倒敘偏暖黃", human: "冷灰綠（螢幕光、日光燈）", merged: "暖金色" },
  { aspect: "聲音", cat: "雨聲、鋼琴", human: "冷氣聲、手機通知、鍵盤聲", merged: "主旋律進來" },
  { aspect: "旁白聲線", cat: "年輕、溫柔、帶一點童聲", human: "28 歲男聲，低、慢、自言自語感", merged: "兩人輪流說同一句話的上下半" },
];

/** 定角照：所有鏡頭都用挑定的這一張當參考圖（Reference／Element），角色每一幕才會長得一樣 */
export const CHARACTERS: RefSlot[] = [
  {
    id: "char-xiaoju", kind: "character", name: "小橘",
    setting: "1 歲左右的橘色虎斑貓，琥珀色眼睛，白胸口（每一幕都要在）",
    prompt: "Character reference sheet of a young orange tabby cat, about 1 year old, amber eyes, white chest patch, slim build. Front view, side view, back view, and three expressions: scared, curious, relaxed. Plain light gray background, soft natural lighting, photorealistic, consistent design.",
    en: "Xiaoju, the young orange tabby cat (amber eyes, white chest patch)",
  },
  {
    id: "char-xiaojie", kind: "character", name: "小傑",
    setting: "28 歲台灣男性，AI 導入顧問，正常上下班，獨居台北小套房；想養貓想了兩年，安靜、細心、容易想太多，平時穿休閒上衣、上班穿襯衫",
    prompt: "Character reference sheet of a 28-year-old Taiwanese man, an AI consultant with a regular 9-to-6 office job, calm and thoughtful, tends to overthink, short black hair, round glasses. Two outfits: a plain casual T-shirt at home and a light blue button-up shirt for work. Front view, side view, and three expressions: hesitant, focused, warm smile. Plain light gray background, photorealistic.",
    en: "Xiaojie, a 28-year-old Taiwanese man with short black hair and round glasses",
  },
  {
    id: "char-afang", kind: "character", name: "阿芳",
    setting: "36 歲台灣女性，中途媽媽，溫柔、對貓有愛心與熱情，但貓被退養時會感到很疲憊，穿咖啡色針織外套（每一幕同一件）",
    prompt: "Character reference sheet of a 36-year-old Taiwanese woman, a cat rescuer, kind and warm face with a hint of tiredness, shoulder-length black hair tied back, brown knitted cardigan, jeans. Front view, side view, and three expressions: worried, gentle smile, teary. Plain light gray background, photorealistic.",
    en: "Afang, a 36-year-old Taiwanese cat rescuer in a brown knitted cardigan",
  },
  {
    id: "char-couple", kind: "character", name: "情侶（配角）",
    setting: "20 多歲年輕情侶，女生染金色頭髮，第一次領養小橘。要固定兩人的外貌、髮型與服裝；表情從初次領養的開心期待、環境被弄亂的無奈、對抓沙發和電線缺乏耐心，到爭吵生氣",
    prompt: "Character reference sheet of a young Taiwanese couple in their mid-20s. The woman has dyed blonde shoulder-length hair and wears a white hoodie; the man has short black hair and wears a dark green T-shirt. The same two people shown in four moments: excited and happy, helpless at a messy room, impatient, arguing angrily. Plain light gray background, photorealistic, consistent faces and outfits.",
    en: "the young couple (the woman has dyed blonde hair and a white hoodie, the man wears a dark green T-shirt)",
  },
];

/** 定景照：重複出現的場景先固定一張，同一空間的鏡頭構圖才對得上 */
export const SCENES: RefSlot[] = [
  {
    id: "scene-studio", kind: "scene", name: "小傑的套房",
    setting: "台北約 8 坪小套房，一扇大窗、一張沙發、書桌；書桌下有一團沒整理的延長線和充電線。人線前半段都在這裡，結尾也回到這裡",
    prompt: "Small Taipei studio apartment about 25 square meters, one large window, a gray sofa, a desk with a laptop, a messy tangle of power strips and charging cables under the desk, minimal furniture, lived-in but tidy. Wide shot, photorealistic.",
    en: "Xiaojie's small Taipei studio apartment (large window, gray sofa, desk with cables underneath)",
  },
  {
    id: "scene-afang-home", kind: "scene", name: "阿芳家（中途之家）",
    setting: "中途之家就是阿芳家：老公寓一樓，門口有鐵門和幾盆植物（開場雨夜的紙箱、鏡 12 抱起小橘都在門口）；屋裡有貓窩、貓抓柱和幾個外出籠，廚房餐桌靠窗，阿芳拍小橘、在廚房回訊息都在這裡。中途之家不只一隻貓：除了小橘，還住著兩隻中途貓「短耳貓」和「灰寶」，只當背景，不搶小橘的戲",
    prompt: "Ground-floor apartment of a Taiwanese cat rescuer in an old building, shown in two views: the front doorstep with an iron gate, a few potted plants and a dim yellow street light; and the cozy interior with a kitchen table by the window, cat beds, scratching posts and a few pet carriers, warm light, lived-in and slightly cluttered. Two resident shelter cats live here: a short-eared cat and a gray cat named Huibao, resting on a cat bed and a scratching post; neither of them is orange. Wide shots, photorealistic, no people.",
    en: "Afang's ground-floor apartment, which is also the cat shelter (doorstep with an iron gate and potted plants; kitchen table by the window, cat beds, pet carriers; two resident cats in the background: a short-eared cat and a gray cat named Huibao)",
  },
  {
    id: "scene-couple-home", kind: "scene", name: "情侶家",
    setting: "年輕情侶的公寓客廳：布沙發、電視櫃下外露的電線、餐桌上一瓶白百合，好看但沒有防貓",
    prompt: "Modern Taipei apartment living room of a young couple, fabric sofa, TV cabinet with exposed power cords and chargers underneath, dining table with a vase of white lilies, stylish but not cat-proofed. Wide shot, photorealistic, no people.",
    en: "the couple's living room (fabric sofa, TV cabinet, dining table with a vase of white lilies)",
  },
];

/** 每一格 AI 分鏡要掛的參考圖：角色在前、場景在後（生成工具多半最多 4 張，這裡每格都 ≤ 4） */
export const FRAME_REFS: Record<string, string[]> = {
  "s01": ["scene-afang-home"],
  "s02": ["char-xiaoju", "scene-afang-home"],
  "s04": ["char-xiaojie", "scene-studio"],
  "s05": ["char-xiaoju", "char-afang"],
  "s07-1": ["char-afang", "char-xiaoju", "scene-afang-home"],
  "s07-2": ["char-xiaoju", "char-afang", "scene-afang-home"],
  "s10": ["char-xiaojie", "scene-studio"],
  "s11": ["char-couple", "char-xiaoju", "char-afang", "scene-afang-home"],
  "s12-1": ["char-xiaoju", "scene-couple-home"],
  "s12-2": ["char-xiaoju", "scene-couple-home"],
  "s13": ["char-xiaojie", "scene-studio"],
  "s14-1": ["char-xiaoju", "scene-couple-home"],
  "s14-2": ["char-xiaoju", "char-couple", "scene-couple-home"],
  "s15": ["char-xiaojie", "scene-studio"],
  "s16-1": ["char-afang", "char-xiaoju", "scene-afang-home"],
  "s16-2": ["char-xiaojie", "scene-studio"],
  "s18": ["char-afang", "char-xiaoju", "scene-afang-home"],
  "s19": ["char-xiaojie", "scene-studio"],
  "s20": ["char-xiaojie", "scene-studio"],
  "s22": ["char-xiaojie", "scene-studio"],
  "s31": ["char-afang", "char-xiaoju", "char-xiaojie", "scene-afang-home"],
  "s26-1": ["char-afang", "scene-afang-home"],
  "s26-2": ["char-xiaojie", "scene-studio"],
  "s28": ["char-xiaoju", "char-xiaojie", "char-afang", "scene-studio"],
  "s29": ["char-xiaoju", "char-xiaojie", "scene-studio"],
  "s30": ["char-xiaoju", "scene-studio"],
};
const ai = (id: string, prompt: string, label?: string): Frame => ({ id, make: "ai", prompt, label, refs: FRAME_REFS[id] ?? [] });
const rec = (id: string, prompt: string): Frame => ({ id, make: "record", prompt, refs: [] });
const edit = (id: string, prompt: string): Frame => ({ id, make: "edit", prompt, refs: [] });

export const SHOT_SECTIONS: ShotSection[] = [
  {
    key: "opening", title: "第一段：遺棄開場", range: "0:00–0:15",
    shots: [
      { no: 1, line: "貓", time: "0:00–0:06", picture: "雨夜，中途之家門口放著紙箱。鏡頭從遠處緩慢推近，只有雨聲。", voice: "—", sfx: "只有雨聲",
        frames: [ai("s01", "Rainy night, a closed cardboard box sitting alone on a wet doorstep of an old Taiwanese apartment, dim yellow street light, raindrops, slow dolly-in, cold blue tones, melancholic mood")] },
      { no: 2, line: "貓", time: "0:06–0:15", picture: "接續鏡 1 同一個雨夜紙箱：鏡頭進到箱子裡，小橘縮在角落，肚子餓（輕舔嘴唇／空食碗意象），雨聲持續", voice: "小橘：「這是我第二次，被送回來。我不知道哪裡做錯了……我只想要一個，不會再把我送走的家。」", sfx: "肚子餓的喵叫、下雨聲",
        frames: [ai("s02", "Continuity from the previous shot (s01): looking down into the SAME sealed shipping cardboard box from that rainy Taiwanese doorstep — a top-loading carton with clear packing tape on the top flaps, now slightly open from above. Inside, a SMALL young orange tabby cat curled up in the corner (slim, fits in one corner, NOT oversized), ears down, looking up at the camera, hungry and weak — empty food dish nearby and licking its lips, soft rain light from the open top flaps, wet cardboard walls, melancholic mood")] },
    ],
  },
  {
    key: "cross", title: "第二段：交叉敘事", range: "0:15–1:32",
    shots: [
      { no: 3, line: "人", time: "0:15–0:21", picture: "同一個雨夜，小傑下班回家打開套房的門，屋裡沒開燈，窗外是同一場雨", voice: "小傑：「我想養一隻貓，想了兩年。」", sfx: "雨聲延續（聲音橋接）、開門聲",
        frames: [ai("s04", "Rainy night, a young man with round glasses wearing a light blue button-up shirt opening the door of a dark small studio apartment after work, tired, rain streaking down the large window, city lights outside, cool blue-gray tones")] },
      { no: 4, line: "貓", time: "0:21–0:28", picture: "倒敘：半年前寒夜，阿芳在路邊機車下蹲下，伸手接小橘", voice: "小橘：「第一次遇見阿芳，是在一個很冷的晚上。」", sfx: "音樂轉溫暖",
        frames: [ai("s05", "Flashback, cold winter night on a Taiwanese street, a woman in a brown knitted cardigan crouches down beside a small orange tabby kitten under a scooter, reaching out gently, warm street light, soft film grain")] },
      { no: 5, line: "貓", time: "0:28–0:36", picture: "阿芳家，用手機拍小橘吃飯、睡覺，短耳貓和灰寶在旁邊吃飯、打盹；吹風機一響，只有小橘嚇得躲起來，另外兩隻照睡，阿芳在筆記本上記一筆", voice: "小橘：「她每天幫我拍照，記下我吃多少、睡多久、怕什麼聲音。」", sfx: "快門聲、吹風機聲",
        frames: [
          ai("s07-1", "Cozy small apartment, the woman takes photos of the orange tabby cat eating from a bowl with her smartphone, two other shelter cats (a short-eared cat and a gray cat) eating and dozing in the background, over-the-shoulder shot, morning sunlight", "5-1 拍小橘吃飯"),
          ai("s07-2", "Only the orange tabby cat startles and hides behind a sofa as a hair dryer turns on, while the short-eared cat and the gray cat keep sleeping calmly, the woman writing a note in a small notebook", "5-2 吹風機嚇到"),
        ] },
      { no: 6, line: "匯", time: "0:36–0:44", picture: "分割畫面：左半阿芳把小橘照片貼進群組，右半小傑睡前躺在床上滑同一個群組；訊息往上刷，小橘的照片被推走", voice: "小傑：「每一隻都很可愛，可是哪一隻適合我？」", sfx: "通知聲越來越密",
        frames: [edit("s08", "用動態設計或螢幕錄影，不用 AI：假的社群介面，兩支手機並排，同一則貼文在左邊送出、在右邊被滑走")] },
      { no: 7, line: "貓", time: "0:44–0:50", picture: "情侶開心地抱走小橘，灰寶在窗邊看著小橘被帶走", voice: "小橘：「後來有人帶我回家，他們很喜歡我。」", sfx: "輕快音樂",
        frames: [ai("s11", "A happy young couple carrying the orange tabby cat in a pet carrier out of an apartment door, smiling, daylight, the rescuer woman waving goodbye in background, a gray cat watching from the window behind her")] },
      { no: 8, line: "貓", time: "0:50–0:58", picture: "快切：情侶家電視櫃下一團外露的電線，小橘湊過去用掌子撥；桌上的百合花，小橘湊近聞", voice: "小橘：「可是他們不知道電線要收好，不知道百合花會讓我生病……」", sfx: "音樂漸弱",
        frames: [
          ai("s12-1", "Low angle, an orange tabby cat crouching under a TV cabinet, curiously pawing at a tangle of exposed power cords and chargers, dim living room, tense mood", "8-1 撥弄電線"),
          ai("s12-2", "Close-up of an orange tabby cat sniffing a vase of white lilies on a dining table, soft daylight, subtle sense of danger", "8-2 聞百合花"),
        ] },
      { no: 9, line: "人", time: "0:58–1:08", picture: "晚上下班後，書桌檯燈下，小傑用筆電查「第一次養貓要注意什麼」，清單寫著「電線收好、不要放百合、窗戶裝紗網」，他停在「電線收好」；接著低頭看腳邊那團延長線和充電線，皺眉", voice: "小傑：「我查了好多養貓要注意的事……我家的電線，安全嗎？」", sfx: "鍵盤聲、插頭拔起聲",
        frames: [
          ai("s10", "Night, a young man with round glasses at his desk in a small Taipei studio apartment under a warm desk lamp, reading a laptop screen that shows a first-time cat owner checklist (keep cables tidy, no lilies, window screens), his finger pausing on the line about cables, reflections of text in his glasses", "9-1 查養貓注意事項"),
          ai("s13", "Night, the same young man glancing down from his desk chair at a messy tangle of power strips and charging cables on the floor under his desk, worried frown, warm desk lamp light, low composition echoing a cat under a TV cabinet", "9-2 看腳邊電線"),
        ] },
      { no: 10, line: "貓", time: "1:08–1:16", picture: "帳單散在桌上；接沙發底下的低角度，小橘躲著，背景情侶在吵架", voice: "小橘：「他們不是壞人，只是還沒準備好。」", sfx: "時鐘聲",
        frames: [
          ai("s14-1", "Top-down shot of a table covered with vet bills and receipts, a cat paw stepping into frame, muted colors", "10-1 散落的帳單"),
          ai("s14-2", "Low angle from under a sofa, an orange tabby cat hiding in the shadow, a young couple arguing out of focus in the background, cold tones", "10-2 躲在沙發下"),
        ] },
      { no: 11, line: "人", time: "1:16–1:22", picture: "手機畫面停在領養申請頁，「我想領養」按鈕下方，小傑的拇指懸著；最後鎖上螢幕，畫面變黑，映出他的臉", voice: "小傑：「我怕的不是麻煩，是我會讓牠失望。」", sfx: "只剩時鐘聲",
        frames: [ai("s15", "Close-up of a man's thumb hovering over a button on a smartphone screen, hesitating, then the screen turns off and reflects his face, dark room, cool tones")] },
      { no: 12, line: "匯", time: "1:22–1:27", picture: "雨夜門口，阿芳打開紙箱抱起小橘，眼眶紅了；接小傑站在窗邊看雨。兩顆鏡頭用同一個雨聲接起來，最後並排成分割畫面", voice: "小橘：「所以，我回來了。」字幕：「一個怕再被送回來，一個怕自己做不好。」", sfx: "靜音 2 秒",
        frames: [
          ai("s16-1", "Rainy night doorstep, the woman in a brown knitted cardigan opens the cardboard box and lifts the wet orange tabby cat into her arms, teary eyes, cold blue light with warm light from the door behind her", "12-1 阿芳抱起小橘"),
          ai("s16-2", "A young man with round glasses standing by a rain-streaked window in a dark studio apartment, looking out at the city, silhouette, cold blue tones", "12-2 小傑窗邊看雨"),
        ] },
      { no: 13, line: "匯", time: "1:27–1:32", picture: "同一個畫面切成三格子畫面（左＝阿芳、中＝小橘、右＝小傑），三人同時在苦惱：阿芳在門口空紙箱旁扶額、小橘裹著毛巾耳朵垂下、小傑在窗邊拿著手機皺眉。接鏡 12 並排的兩格，中間再推開一格放小橘；三人最後一起說出同一句話", voice: "阿芳、小橘、小傑（三人齊聲）：「難道沒有一個平台可以解決這些問題嗎？」", sfx: "雨聲收掉，三人的聲音疊在一起，說完停一拍",
        frames: [ai("s31", "ONE single 16:9 frame divided into three vertical split-screen panels of equal width separated by thin dark lines, all three characters troubled at the same moment, same rainy-night cold blue tone and same eye-line height across panels. LEFT panel: the woman in a brown knitted cardigan at the shelter apartment doorstep beside the empty wet cardboard box, rubbing her forehead, tired and worried. CENTER panel: the small orange tabby cat wrapped in a towel on the doormat, ears down, looking up anxiously. RIGHT panel: the young man with round glasses by the rain-streaked window of his dark studio apartment, holding his phone, frowning and hesitant. Medium close-ups, each subject centered in its panel")] },
    ],
  },
  {
    key: "product", title: "第三段：匯聚與產品登場", range: "1:32–2:40",
    note: "每一顆鏡頭都要同時照到兩條線：功能是「替誰解決了什麼」，旁白就由那個人說。鏡 18–21 的畫面主體是小傑 3D 房間裡的 3D 小橘，右上角一直放著信任、壓力、花費三個數值。",
    shots: [
      { no: 14, line: "—", time: "1:32–1:37", picture: "黑畫面，Meowho喵戶 門口貓頭 Logo 浮現", voice: "字幕：「如果，相遇可以慢一點、準一點？」", sfx: "一聲貓叫，音樂重新進來",
        frames: [edit("s17", "用剪輯軟體做 Logo 動畫，用向量的門口貓頭款 Logo")] },
      { no: 15, line: "產品", time: "1:37–1:45", picture: "① 建貓：阿芳的喵戶裡有三隻貓（小橘、短耳貓、灰寶），她點進小橘，上傳小橘的影片和照片、寫下個性；系統生成像本尊的 3D 小橘。切到小傑手機上打開同一張介紹頁", voice: "小橘：「這一次，我的樣子和個性，都被好好記下來。」", sfx: "明亮音樂",
        frames: [ai("s18", "The woman in a brown knitted cardigan filming the orange tabby cat with her phone as it plays on the floor, the short-eared cat and the gray cat lounging nearby, warm afternoon light", "穿插")] },
      { no: 16, line: "產品", time: "1:45–1:52", picture: "② 幫我找貓：小傑輸入「上班族，白天不在家，想要安靜一點的貓」，系統推薦小橘並附上推薦理由", voice: "小傑：「我只說了我怎麼生活，」小橘：「適合我的人，就找到了我。」", sfx: "—",
        frames: [ai("s19", "A young man with round glasses sitting on the sofa of a small Taipei studio apartment at night, typing on his phone, face lit by the screen, a slight surprised smile", "穿插")] },
      { no: 17, line: "產品", time: "1:52–2:00", picture: "③ 拍自家影片：小傑繞套房一圈，房間變成 3D；安全檢測標出書桌下的電線「可能被啃咬」。接小傑把電線收進集線盒", voice: "小傑：「桌下那團電線，我在牠來之前就整理好了。」", sfx: "—",
        frames: [ai("s20", "The young man tidying the power cables under his desk into a cable management box and wrapping them with protective sleeves, focused, daylight, the same desk from earlier", "穿插")] },
      { no: 18, line: "產品", time: "2:00–2:05", picture: "④ 領養任務開場：依小橘的年齡採買、和每月預算比一比；擺用品，碗和砂盆的位置選項就是 AI 從小傑家找出的家具", voice: "小橘：「他先替我擺好了碗和砂盆。」字幕：「領養任務：3D 小橘住進你家的 3D 房間」", sfx: "放東西的輕響",
        frames: [rec("s21", "系統錄影：領養任務開場（採買與預算）、擺用品")] },
      { no: 19, line: "產品", time: "2:05–2:12", picture: "⑤ 第 1 天：3D 小橘躲進外出籠，小傑選「等牠自己出來」，信任往上跳；快切逗貓、餵貓、鏟屎", voice: "小傑：「第一天，我學會了等。」", sfx: "選擇音效、逗貓棒鈴鐺聲",
        frames: [ai("s22", "Close-up of the young man's thumb gently tapping his phone screen, a soft smile, evening lamp light", "穿插")] },
      { no: 20, line: "產品", time: "2:12–2:19", picture: "⑥ 一生 7 個時刻快切：「半年後：要不要結紮」「五年後：你家的風險變成意外」「10 年後：熟齡健檢」「15 歲：道別」，花費數字一路往上加", voice: "小橘：「他在帶我回家之前，就先學會了照顧我。」", sfx: "時間流逝的音效、花費跳動聲",
        frames: [rec("s23", "系統錄影：半年後、五年後、10 年後、15 歲四個時刻，字卡用剪輯軟體疊上；五年後要帶到獸醫提示文字")] },
      { no: 21, line: "產品", time: "2:19–2:23", picture: "⑦ 試養報告：小橘活了幾年、對小傑的感覺、一生總花費", voice: "小傑：「我在自己家，先陪牠走了一輩子。」", sfx: "—",
        frames: [rec("s24", "系統錄影：試養報告頁")] },
      { no: 22, line: "產品", time: "2:23–2:26", picture: "⑧ 提出領養：小傑按下「我想領養」，附上試養報告和問卷送出。呼應鏡 11：這次拇指沒有停", voice: "—", sfx: "送出音效",
        frames: [rec("s25", "系統錄影：提出領養、附上試養報告與問卷")] },
      { no: 23, line: "匯", time: "2:26–2:35", picture: "⑨ 和中途對話：分割畫面，左半阿芳在廚房、右半小傑在沙發；中間疊上系統的對話串一來一回", voice: "小橘：「這一次，她可以慢慢問，他也答得出來。」", sfx: "訊息提示音一來一回",
        frames: [
          ai("s26-1", "The woman in a brown knitted cardigan sitting at her kitchen table typing on her phone, thoughtful, warm light", "23-1 左半：阿芳打字"),
          ai("s26-2", "The young man with round glasses on his sofa typing a reply on his phone, focused, evening lamp light", "23-2 右半：小傑回覆"),
        ] },
      { no: 24, line: "產品", time: "2:35–2:40", picture: "⑩ 移轉：阿芳按下移轉，小橘移到小傑的喵戶；紀錄分成「中途時期」和「新家時期」", voice: "小橘：「然後，她按下了移轉。」", sfx: "一聲輕快的提示音",
        frames: [rec("s27", "系統錄影：移轉、貓的紀錄分期")] },
    ],
  },
  {
    key: "ending", title: "第四段：相遇結尾", range: "2:40–3:00",
    shots: [
      { no: 25, line: "匯", time: "2:40–2:48", picture: "小傑的套房，阿芳把外出籠放在地上打開；小傑沒有伸手，蹲在旁邊等。小橘慢慢走出來，走到窗邊坐下曬太陽", voice: "小傑：「你好，小橘。」", sfx: "溫暖主旋律",
        frames: [ai("s28", "Low angle at cat eye level, a pet carrier door opening on the floor of a sunny small studio apartment, the orange tabby cat stepping out slowly on its own and walking toward a sunny window, a young man with round glasses kneeling nearby patiently without reaching out, a woman in a brown knitted cardigan watching, golden hour light")] },
      { no: 26, line: "匯", time: "2:48–2:53", picture: "小橘在窗邊睡著，書桌下的電線已經收得整整齊齊；小傑在沙發上看書", voice: "小橘：「現在，我有了第二個家。」", sfx: "—",
        frames: [ai("s29", "The orange tabby cat napping by a sunny window in a cozy small studio apartment, neatly organized cables in a box under the desk, the young man reading on the sofa nearby, golden hour light")] },
      { no: 27, line: "匯", time: "2:53–3:00", picture: "小橘轉頭看鏡頭，慢慢眨眼；Logo＋標語", voice: "小橘：「謝謝你，讓我不用再回到那個紙箱。」小傑：「也謝謝你，等我準備好。」字幕：「Meowho喵戶｜讓每一次相遇，都走到最後。」", sfx: "收尾音、貓叫一聲",
        frames: [ai("s30", "Close-up of the orange tabby cat by the sunny window slowly turning its head to look into the camera and blinking slowly, peaceful, warm golden light")] },
    ],
  },
];

/** 呼應鏡頭（Match Cut）：剪接時讓前後兩顆鏡頭的構圖或動作對齊 */
export const MATCH_CUTS: { name: string; from: string; to: string; meaning: string }[] = [
  { name: "同一場雨", from: "鏡 1–2 紙箱在雨裡", to: "鏡 3 小傑開門，窗外同一場雨", meaning: "他們在同一座城市，卻還沒相遇" },
  { name: "同一個群組", from: "鏡 6 左半：阿芳貼文", to: "鏡 6 右半：小傑睡前在滑", meaning: "資訊明明在，卻對不上" },
  { name: "同一團電線", from: "鏡 8 小橘撥弄電視櫃下的電線", to: "鏡 9 小傑查到「電線要收好」，低頭看自己腳邊的延長線", meaning: "小傑擔心的，正是小橘被退養的原因" },
  { name: "同一個停頓", from: "鏡 10 小橘躲在沙發下", to: "鏡 11 小傑的手指停在「我想領養」上", meaning: "兩個人都還沒準備好" },
  { name: "兩格變三格", from: "鏡 12 阿芳和小傑並排的兩格分割畫面", to: "鏡 13 同一個畫面切成三格，中間推開一格放小橘，三人同時苦惱", meaning: "三個人卡在同一個問題上，帶出產品" },
  { name: "同一個分割畫面", from: "鏡 6 兩支手機各滑各的", to: "鏡 23 兩支手機在對話串裡一來一回", meaning: "從「對不上」變成「說得上話」" },
  { name: "怕什麼聲音", from: "鏡 5 阿芳記下小橘怕什麼聲音", to: "鏡 23 阿芳問小傑家吵不吵", meaning: "中途記下的事，終於有人接得住" },
  { name: "同一個外出籠", from: "鏡 19 3D 小橘躲在外出籠裡", to: "鏡 25 真的外出籠在小傑家打開", meaning: "虛擬試養過的事，真的發生了" },
  { name: "從箱子出來", from: "鏡 2 小橘縮在紙箱裡", to: "鏡 25 小橘自己走出外出籠", meaning: "結局是開場的反轉" },
];

/** 旁白完整稿：兩個聲線各自生成一支音檔，再依分鏡表切段對齊 */
export const NARRATION: { who: "橘" | "傑"; text: string }[] = [
  { who: "橘", text: "這是我第二次，被送回來。我不知道哪裡做錯了……我只想要一個，不會再把我送走的家。" },
  { who: "傑", text: "我想養一隻貓，想了兩年。" },
  { who: "橘", text: "第一次遇見阿芳，是在一個很冷的晚上。" },
  { who: "橘", text: "她每天幫我拍照，記下我吃多少、睡多久、怕什麼聲音。" },
  { who: "傑", text: "每一隻都很可愛，可是哪一隻適合我？" },
  { who: "橘", text: "後來有人帶我回家，他們很喜歡我。" },
  { who: "橘", text: "可是他們不知道電線要收好，不知道百合花會讓我生病……" },
  { who: "傑", text: "我查了好多養貓要注意的事……我家的電線，安全嗎？" },
  { who: "橘", text: "他們不是壞人，只是還沒準備好。" },
  { who: "傑", text: "我怕的不是麻煩，是我會讓牠失望。" },
  { who: "橘", text: "所以，我回來了。" },
  { who: "橘", text: "這一次，我的樣子和個性，都被好好記下來。" },
  { who: "傑", text: "我只說了我怎麼生活，" },
  { who: "橘", text: "適合我的人，就找到了我。" },
  { who: "傑", text: "桌下那團電線，我在牠來之前就整理好了。" },
  { who: "橘", text: "他先替我擺好了碗和砂盆。" },
  { who: "傑", text: "第一天，我學會了等。" },
  { who: "橘", text: "他在帶我回家之前，就先學會了照顧我。" },
  { who: "傑", text: "我在自己家，先陪牠走了一輩子。" },
  { who: "橘", text: "這一次，她可以慢慢問，他也答得出來。" },
  { who: "橘", text: "然後，她按下了移轉。" },
  { who: "傑", text: "你好，小橘。" },
  { who: "橘", text: "現在，我有了第二個家。" },
  { who: "橘", text: "謝謝你，讓我不用再回到那個紙箱。" },
  { who: "傑", text: "也謝謝你，等我準備好。" },
];

// ───────────── 上傳與進度 ─────────────

export const TRAILER_BUCKET = "meow-site-assets";
export const TRAILER_DIR = "videos/trailer";
/** bucket 上限 1 MB（0003）：上傳前在瀏覽器縮到最長邊 1920px、轉 WebP */
export const FRAME_MAX_EDGE = 1920;
export const FRAME_MAX_BYTES = 1024 * 1024;
/** 原始檔大小上限（縮圖前），超過直接擋，避免瀏覽器解碼太大的圖 */
export const FRAME_SOURCE_MAX_BYTES = 30 * 1024 * 1024;

/** 所有上傳格：定角、定景、每一格分鏡圖（順序就是畫面順序） */
export function allSlotIds(): string[] {
  return [...CHARACTERS.map(c => c.id), ...SCENES.map(s => s.id), ...SHOT_SECTIONS.flatMap(sec => sec.shots.flatMap(s => s.frames.map(f => f.id)))];
}

export function frameCounts(): Record<FrameMake, number> & { total: number } {
  const frames = SHOT_SECTIONS.flatMap(sec => sec.shots.flatMap(s => s.frames));
  const n = (m: FrameMake) => frames.filter(f => f.make === m).length;
  return { ai: n("ai"), record: n("record"), edit: n("edit"), total: frames.length };
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 存檔路徑：videos/trailer/<格>__<yyyymmddhhmmss>.webp；同一格重傳就是新的一版，畫面取最新一版 */
export function frameStoragePath(slotId: string, now: Date): string {
  const ts = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
  return `${TRAILER_DIR}/${slotId}__${ts}.webp`;
}

export type SlotUpload = { name: string; versions: number };
/** 由資料夾裡的檔名找出每一格的最新版（檔名時間戳可以直接比字串） */
export function latestBySlot(names: readonly string[]): Record<string, SlotUpload> {
  const known = new Set(allSlotIds());
  const out: Record<string, SlotUpload> = {};
  for (const name of names) {
    const m = /^([a-z0-9-]+)__(\d{14})\.webp$/.exec(name);
    if (!m || !known.has(m[1])) continue;
    const prev = out[m[1]];
    out[m[1]] = { name: !prev || name > prev.name ? name : prev.name, versions: (prev?.versions ?? 0) + 1 };
  }
  return out;
}

/** 進度：哪一類完成幾格 */
export function uploadProgress(uploaded: Record<string, SlotUpload>) {
  const has = (id: string) => Boolean(uploaded[id]);
  const frames = SHOT_SECTIONS.flatMap(sec => sec.shots.flatMap(s => s.frames));
  return {
    characters: { done: CHARACTERS.filter(c => has(c.id)).length, total: CHARACTERS.length },
    scenes: { done: SCENES.filter(s => has(s.id)).length, total: SCENES.length },
    frames: { done: frames.filter(f => has(f.id)).length, total: frames.length },
  };
}

export function validateFrameFile(file: { type: string; size: number }): { ok: true } | { ok: false; message: string } {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return { ok: false, message: "只收 PNG、JPG、WebP 圖片" };
  if (file.size > FRAME_SOURCE_MAX_BYTES) return { ok: false, message: "圖片超過 30 MB，請先縮小再上傳" };
  return { ok: true };
}

/** 等比例縮到最長邊不超過 max（不放大） */
export function fitWithin(w: number, h: number, max = FRAME_MAX_EDGE): { w: number; h: number } {
  const s = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * s), h: Math.round(h * s) };
}
