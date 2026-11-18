
// Curated paraphrases. Priority is the user's product policy, not an official scale.
// This catalogue provides guidance, not fourteen executable visual risk rules.
export const GUIDANCE_VERSION = "single-cat-14/2026-11-01.2";
const cp = "https://www.cats.org.uk/help-and-advice/";
export const GUIDANCE_SOURCES = {
  CP_HOME: { url: cp + "caring-for-your-cat/home-and-environment/keeping-your-cat-safe", checked_on: "2026-11-01" },
  CP_PREP: { url: cp + "getting-a-cat/preparing-for-a-cat", checked_on: "2026-11-01" },
  CP_POISON: { url: cp + "caring-for-your-cat/home-and-environment/poisoning", checked_on: "2026-11-01" },
  CP_FOOD: { url: cp + "caring-for-your-cat/diet/cats-and-human-foods", checked_on: "2026-11-01" },
  CP_FEED: { url: cp + "caring-for-your-cat/diet/feeding", checked_on: "2026-11-01" },
  CP_INDOOR: { url: "https://www.cats.org.uk/media/ed1bri0v/indoor-and-outdoor-cats-2025.pdf", checked_on: "2026-11-01" },
  RSPCA_HOME: { url: "https://www.rspca.org.uk/en/adviceandwelfare/pets/cats/environment", checked_on: "2026-11-01" },
  FVMA: { url: "https://catvets.com/wp-content/uploads/2024/12/FelineVMA-Environmental-Needs_Web.pdf", checked_on: "2026-11-01" },
  ASPCA_PLANTS: { url: "https://www.aspca.org/pet-care/animal-poison-control/cats-plant-list", checked_on: "2026-11-01" },
  ASPCA_WINDOWS: { url: "https://www.aspca.org/pet-care/cat-care/common-cat-diseases", checked_on: "2026-11-01" },
} as const;

type GuidanceItem = {
  id: string;
  title: string;
  priority: "HIGH" | "BASIC" | "ENRICHMENT";
  principle: string;
  // Product application / proposed placement; not an institutional quotation.
  application: string;
  photo_limit: string;
  sources: { id: keyof typeof GUIDANCE_SOURCES; section: string }[];
};

export const SINGLE_CAT_GUIDANCE: GuidanceItem[] = [
  {
    id: "H01", title: "窗戶與陽台", priority: "HIGH",
    principle: "避免貓從可開啟的窗戶及陽台逃脫、墜落或受困；防護須牢固且合適。",
    application: "可開啟窗戶與陽台優先安排防墜防逃設施；不要把一般防蟲紗窗當作已驗證的貓咪防護。關窗時提出開窗前預防建議，不冒稱目前已有墜落風險。",
    photo_limit: "單張照片不能驗證網材、固定、承重與安全規格；未看見網不代表沒有網。",
    sources: [{id:"CP_HOME",section:"Common household hazards for cats → windows"},{id:"ASPCA_WINDOWS",section:"High-Rise Syndrome → Prevention"}],
  },
  {
    id: "H02", title: "有毒植物", priority: "HIGH",
    principle: "依學名查核對貓的毒性，防止接觸已知有毒植物；百合尤其優先處理。",
    application: "確認是 Lilium、Hemerocallis、蘇鐵、黃金葛、龜背芋或蘆薈等已收錄有毒植物時安排移除；百合不以放高處替代移除。疑似接觸或誤食立即聯絡獸醫。",
    photo_limit: "相似葉形只能提出學名候選，不能確認品種或中毒；未知植物不直接判有毒，資料未收錄也不代表無毒。",
    sources: [{id:"ASPCA_PLANTS",section:"Plants Toxic to Cats → individual Scientific Name / Toxicity entries"},{id:"CP_POISON",section:"Lilies and other poisonous plants"}],
  },
  {
    id: "H03", title: "化學物品", priority: "HIGH",
    principle: "避免貓接觸清潔用品、藥物及有害精油。",
    application: "清潔劑、殺蟲劑與藥品收進可關閉或上鎖的櫃中；貓咪活動區避免精油擴香。",
    photo_limit: "瓶罐外觀不能確認內容物、濃度、櫃鎖或實際氣味；看到擴香器不等於已確認有毒精油。",
    sources: [{id:"CP_HOME",section:"Cats and cleaning products"},{id:"CP_POISON",section:"Paracetamol poisoning in cats; Are essential oils poisonous to cats?"}],
  },
  {
    id: "H04", title: "電線與繩索", priority: "HIGH",
    principle: "避免貓接觸可能造成咬傷、纏繞或吞食的外露電線與線狀用品。",
    application: "桌下電線用保護套或理線槽收整，固定窗簾拉繩；線狀玩具在互動結束後收好。",
    photo_limit: "可辨識外露與垂落線材，但不能由照片斷言已通電、會啃咬或平時有收玩具。",
    sources: [{id:"CP_HOME",section:"Common household hazards for cats → wires and cables; string; rubber bands and hair bands"}],
  },
  {
    id: "H05", title: "家具與家電", priority: "HIGH",
    principle: "提供穩固的活動設施；家電與活動家具使用前避免夾傷或困住貓。",
    application: "現場檢查並固定容易傾倒的櫃架；洗衣機、烘衣機啟動前確認內部沒有貓咪。櫃架固定是一般安全延伸建議。",
    photo_limit: "外觀不能驗證家具固定與承重，也不能知道洗衣機內是否藏貓或使用前檢查習慣。",
    sources: [{id:"CP_HOME",section:"Common household hazards for cats → washing machines and tumble dryers; reclining chairs"},{id:"CP_INDOOR",section:"Scratching and climbing → sturdy base"}],
  },
  {
    id: "H06", title: "食物安全", priority: "HIGH",
    principle: "防止貓取得巧克力、洋蔥、葡萄等不適合貓的食物。",
    application: "將危險食物、廚房剩食與垃圾收好，避免貓在料理時接近暴露的食材。",
    photo_limit: "模糊食物不能直接確認成分或毒性；沒有看到食物也不能證明廚房及垃圾桶安全。",
    sources: [{id:"CP_FOOD",section:"Human foods that are toxic to cats; How to prevent your cat from eating harmful food"}],
  },
  {
    id: "H07", title: "貓砂盆", priority: "BASIC",
    principle: "單貓提供兩盆作為準備目標，分散於安靜、易進出的位置，與飲食區分開；每天至少清理一次。",
    application: "依全屋格局選擇兩個不同的安靜位置，而不是固定要求特定兩個角落；保持進出路線暢通。",
    photo_limit: "單張照片不能統計全屋盆數、清理頻率或判定角落一定不合適。",
    sources: [{id:"CP_PREP",section:"Things you'll need for your new cat"},{id:"CP_INDOOR",section:"Toileting"},{id:"RSPCA_HOME",section:"Making your home suitable for a cat → Toilet"}],
  },
  {
    id: "H08", title: "飲水區", priority: "BASIC",
    principle: "提供乾淨新鮮飲水並每日換水，飲水與食物、如廁區分開。",
    application: "依格局在客廳及另一處安靜位置規劃飲水選擇；這些房間名稱是擺放應用，不是官方指定地點。",
    photo_limit: "不能憑水面外觀驗證換水頻率、水質或全屋飲水點數量。",
    sources: [{id:"CP_FEED",section:"Feeding your cat → fresh water; separate bowls"},{id:"CP_PREP",section:"Food and water bowls"},{id:"CP_INDOOR",section:"Toileting → away from food and water bowls"}],
  },
  {
    id: "H09", title: "餵食區", priority: "BASIC",
    principle: "進食需要安靜與不受打擾的環境，食物、飲水及如廁資源分開配置。",
    application: "規劃遠離貓砂盆、頻繁通行的出入口及吵雜家電的食碗位置。",
    photo_limit: "可指出可見的資源集中與通道，但不能從靜態照片證實平時噪音或全屋可用選擇。",
    sources: [{id:"CP_PREP",section:"Food and water bowls"},{id:"FVMA",section:"2 Provide multiple and separated key environmental resources"}],
  },
  {
    id: "H10", title: "垂直空間", priority: "BASIC",
    principle: "提供可抵達、穩固的高處，讓貓登高、觀察與休息。",
    application: "可考慮有合適防護的窗邊或穩固牆面設置跳台與層架，保留落腳面與抵達路線。",
    photo_limit: "照片不能驗證固定、承重或個體跳躍能力；高櫃存在不是不穩或違規的證據。",
    sources: [{id:"CP_INDOOR",section:"Hiding places; Scratching and climbing"},{id:"RSPCA_HOME",section:"Making your home suitable for a cat → High places"}],
  },
  {
    id: "H11", title: "躲藏空間", priority: "BASIC",
    principle: "提供可退避、休息的安全空間，尊重貓自主進出及互動選擇。",
    application: "在可見且安靜的家具旁或臥室規劃紙箱、貓窩，讓貓自由進出；躲藏時不要強行打擾。位置必須說明遮蔽、入口方向、需移走的物品與保持的通道。",
    photo_limit: "暗處不是已確認的躲藏點；位置只是候選，仍需確認尺寸、通風與進出動線，不捏造方框。",
    sources: [{id:"FVMA",section:"1 Provide a safe place; 4 Positive, consistent, and predictable human–cat interaction"},{id:"RSPCA_HOME",section:"Making your home suitable for a cat → Somewhere to hide"}],
  },
  {
    id: "H12", title: "磨爪區", priority: "BASIC",
    principle: "提供底座穩固、能充分伸展的抓撓設施，可靠近睡眠位置。",
    application: "在睡窩旁及常抓的沙發附近安排抓柱或抓板；沙發附近是依實際使用習慣的應用建議。",
    photo_limit: "照片不能證實抓撓習慣、設施穩固程度或是否符合這隻貓的伸展需求。",
    sources: [{id:"CP_INDOOR",section:"Scratching and climbing"}],
  },
  {
    id: "H13", title: "睡眠與感官", priority: "ENRICHMENT",
    principle: "提供舒適、安靜的休息處，尊重貓對強烈氣味及聲音的敏感性。",
    application: "選擇避免冷風直吹、強烈香味及持續噪音的睡窩位置。",
    photo_limit: "照片不能測量氣味、聲音、氣流或室溫；只能提出位置候選和現場檢查事項。",
    sources: [{id:"RSPCA_HOME",section:"Making your home suitable for a cat → Bed"},{id:"FVMA",section:"Understanding the needs of your cat; 5 Sense of smell"}],
  },
  {
    id: "H14", title: "運動與探索", priority: "ENRICHMENT",
    principle: "提供遊戲、探索及模擬狩獵的機會，可使用互動玩具及益智餵食。",
    application: "保留客廳遊戲動線，每天安排逗貓棒互動，搭配藏食或益智玩具；線狀玩具使用後收好。",
    photo_limit: "照片不能判定每天互動時間、貓的偏好或活動量；未見玩具不代表沒有遊戲機會。",
    sources: [{id:"FVMA",section:"3 Provide opportunity for play and predatory behavior"},{id:"RSPCA_HOME",section:"Making your home suitable for a cat → Toys and space to play"}],
  },
];
