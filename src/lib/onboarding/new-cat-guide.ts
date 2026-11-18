// 說說牠之後的口說補充（#478）：第一次口述沒填到的欄位彙整成一個對話框，依主題列出還要講什麼，每項附「可以這樣說」。
// 中途一次講一段（answerMissing），只跑規則式擷取（story-rules.ts，不等 LLM）；講完還缺的再列一次，直到講完或改用點的。
// 說「其他都很順利」「其他都不會」時，把上一句講到的主題剩下的項目一起填好；
// 說「不知道」「沒有」「很健康」時，那個主題剩下的項目記成「不用再問」（cleared），最後的補資料點選頁就不會再出現。
// 追問完還沒填、也沒說不知道的欄位，才交給補資料頁用點的。
import { ARRIVAL_ITEMS, BEHAVIOR_ITEMS, CARE_ITEMS, COMPAT_KEYS, COMPAT_LABEL, type BehaviorKey } from "../cat-profile/adoption";
import { TRAITS } from "../cat-profile/tags";
import { markSaid, storyExtras, type NewCatForm } from "./new-cat-form";
import { SIGN_RULES, behaviorLevel, compatLevel, handlingLevel } from "./story-rules";

export type GuideId = "name" | "basic" | "looks" | "meet" | "medical" | "body" | "traits" | "care" | "behavior" | "compat" | "arrival" | "habits" | "touch";
export interface GuideQuestion { id: GuideId; keys: string[]; ask: string; hint: string }

const label = (pairs: readonly (readonly [string, string])[], k: string) => pairs.find(([x]) => x === k)?.[1] ?? k;
const TRAIT_ASK: Record<string, [string, string]> = {
  energy: ["活潑還是愛睡", "很活潑"], bond: ["黏人還是獨立", "有點黏人"], brave: ["親人還是怕生", "很親人"], adapt: ["換環境適應快還是慢熱", "慢熱"],
};
const MED_ASK: Record<string, [string, string]> = {
  neutered: ["結紮了嗎", "已經結紮了"], vaccine: ["疫苗打了幾劑", "打了兩劑疫苗"], deworm: ["有驅蟲嗎", "體內體外都驅蟲了"],
  fiv: ["驗過 FIV 嗎", "FIV 陰性"], chip: ["有晶片嗎", "有晶片"],
};
const join = (xs: string[]) => xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join("、")}和${xs[xs.length - 1]}`;

/** 每個主題：涵蓋哪些欄位、怎麼問 */
/** build 回傳 [題目, 範例回答, 範例後面接的一句（可省略）] */
const TOPICS: { id: GuideId; has: (k: string) => boolean; build: (keys: string[], name: string) => [string, string, string?] }[] = [
  { id: "name", has: k => k === "name", build: () => ["這隻貓叫什麼名字？", "牠叫妹妹"] },
  { id: "basic", has: k => ["sex", "age", "weight"].includes(k), build: (keys, n) => {
    const q = [keys.includes("sex") && "是男生還是女生", keys.includes("age") && "大概幾歲或幾個月", keys.includes("weight") && "大概幾公斤"].filter(Boolean) as string[];
    const h = [keys.includes("sex") && "女生", keys.includes("age") && "大概一歲", keys.includes("weight") && "三公斤"].filter(Boolean) as string[];
    return [`${n}${q.join("？")}？`, h.join("，")];
  } },
  { id: "looks", has: k => k === "coat" || k === "breed", build: keys => keys.length === 2 ? ["牠是什麼毛色、什麼品種？", "橘白虎斑的米克斯"]
    : keys[0] === "coat" ? ["牠是什麼毛色？", "橘白虎斑"] : ["牠是什麼品種？", "米克斯"] },
  { id: "meet", has: k => k === "origin" || k === "since", build: (keys, n) => {
    const q = [keys.includes("origin") && `在哪裡遇到${n}的`, keys.includes("since") && "哪一天來你這裡的"].filter(Boolean) as string[];
    const h = [keys.includes("origin") && "在公園撿到的", keys.includes("since") && "8 月 1 號來的"].filter(Boolean) as string[];
    return [`${q.join("？")}？`, h.join("，")];
  } },
  { id: "medical", has: k => k in MED_ASK, build: keys => [`健康的部分：${keys.map(k => MED_ASK[k][0]).join("？")}？`, keys.map(k => MED_ASK[k][1]).join("，")] },
  { id: "body", has: k => ["healthTags", "history", "medication"].includes(k), build: () =>
    ["身體有什麼要注意的嗎？像慢性病、以前受過傷、每天要吃藥？", "有點食物過敏，每天吃一次藥", "都沒有就說「很健康」"] },
  { id: "traits", has: k => k.startsWith("scale.") || k === "extraTags", build: keys => {
    const t = keys.filter(k => k.startsWith("scale.")).map(k => k.slice(6));
    const q = [...t.map(k => TRAIT_ASK[k][0]), ...(keys.includes("extraTags") ? ["還有愛撒嬌、愛踏踏這類的嗎"] : [])];
    const h = [...t.map(k => TRAIT_ASK[k][1]), ...(keys.includes("extraTags") ? ["會踩踏"] : [])];
    return [`牠的個性呢？${q.join("？")}？`, h.join("，")];
  } },
  { id: "care", has: k => k.startsWith("care."), build: keys => {
    const items = keys.map(k => label(CARE_ITEMS, k.slice(5)));
    const eg = keys.includes("care.nail") ? "剪指甲要用毛巾包" : `${items[0]}要技巧`;
    return [`照顧起來呢？${join(items)}，哪些順利、哪些比較難？`, `${eg}，其他都很順利`];
  } },
  { id: "behavior", has: k => k.startsWith("behavior."), build: keys => {
    const items = keys.map(k => label(BEHAVIOR_ITEMS, k.slice(9)));
    return [`牠會不會${join(items)}？`, keys.includes("behavior.scratch") ? "偶爾會抓沙發，其他壞習慣都不會" : "壞習慣都不會"];
  } },
  { id: "compat", has: k => k.startsWith("compat."), build: keys => {
    const items = keys.map(k => COMPAT_LABEL[k.slice(7) as (typeof COMPAT_KEYS)[number]]);
    return [`牠跟${join(items)}處得來嗎？`, `跟${items[0]}可以，其他不知道`];
  } },
  { id: "arrival", has: k => k.startsWith("arrival."), build: keys => {
    const ask: Record<string, [string, string]> = { hide: ["躲了幾天才出來", "躲了兩天"], eat: ["第幾天開始吃飯", "第二天就開始吃飯"], touch: ["多久讓你摸", "一個禮拜才讓我摸"] };
    const ks = keys.map(k => k.slice(8));
    return [`剛來的時候，${ks.map(k => ask[k][0]).join("、")}？`, ks.map(k => ask[k][1]).join("，")];
  } },
  { id: "habits", has: k => k === "habits" || k === "otherNote", build: keys => [
    keys.includes("habits") ? "平常吃什麼、喜歡待哪裡、愛玩什麼、怕什麼？" + (keys.includes("otherNote") ? "最愛的東西是什麼？" : "") : "牠最愛的東西是什麼？",
    keys.includes("habits") ? "吃乾飼料，喜歡待在高處，愛玩逗貓棒，怕吸塵器" + (keys.includes("otherNote") ? "，最愛紙箱" : "") : "最愛紙箱",
  ] },
  { id: "touch", has: k => k.startsWith("touch"), build: keys => {
    const q = [keys.includes("touch") && "摸哪裡牠會開心、哪裡不能摸", keys.includes("touchLimit") && "摸多久會膩", keys.includes("touchSigns") && "不想被摸時會怎樣"].filter(Boolean) as string[];
    const h = [keys.includes("touch") && "最喜歡被摸下巴，不要摸肚子", keys.includes("touchLimit") && "摸一兩分鐘就膩", keys.includes("touchSigns") && "會甩尾巴走開"].filter(Boolean) as string[];
    return [`${q.join("？")}？`, h.join("，")];
  } },
];

/** 還沒填的欄位 → 要追問的題目（照流程順序；每題只問這題裡還沒填的項目） */
export function guideQuestions(missing: readonly string[], catName: string): GuideQuestion[] {
  const n = catName.trim() || "牠";
  return TOPICS.flatMap(t => {
    const keys = missing.filter(t.has);
    if (!keys.length) return [];
    const [ask, hint, tail] = t.build(keys, n);
    return [{ id: t.id, keys, ask, hint: `可以這樣說：「${hint}」${tail ? `，${tail}` : ""}` }];
  });
}

const clauses = (s: string) => s.split(/[，,。；;！!？?\n]/).map(c => c.trim()).filter(Boolean);
/** 整句只講「不知道／沒有／很健康」 */
const NOPE = /^(牠|身體|其他|剩下的?|別的)?(都|也)?(還)?(沒有|沒|不知道|不清楚|不確定|沒試過|沒注意|忘了|很健康|健康|沒問題)(了|耶|欸|喔|啦)?$/;
/** 「其他都…」「剩下的都…」「壞習慣都不會」：指這個主題剩下的項目 */
const REST = /其他|剩下|別的|全部|^都|(壞習慣|照顧|照護|個性)都/;

/** 一句話在講哪個主題（「其他都…」這種沒講主題的句子沿用上一句的主題） */
const TOPIC_WORDS: [GuideId, RegExp][] = [
  ["medical", /結紮|疫苗|驅蟲|FIV|FeLV|晶片/i],
  ["body", /健康|過敏|吃藥|受過傷|慢性|身體/],
  ["care", /剪指甲|抱起來|抱牠|外出籠|餵藥|梳毛|刷牙|看醫生|看獸醫|照顧|照護/],
  ["behavior", /亂尿|咬手|咬人|抓人|護食|抓沙發|抓家具|半夜|衝門|出門|咬電線|壞習慣/],
  ["compat", /(跟|和).{0,3}(貓|狗|小孩|小朋友|客人|陌生人)|^(貓|狗|小孩|小朋友|客人|陌生人)|處得來/],
  ["arrival", /剛來|躲|開始吃|讓我摸|給摸|第.天/],
  ["touch", /摸|膩|甩尾巴|走開/],
  ["traits", /活潑|愛睡|黏人|獨立|親人|怕生|適應|慢熱|個性/],
  ["habits", /飼料|乾乾|罐頭|罐罐|待在|愛玩|吸塵器|打雷|貓砂|最愛/],
  ["basic", /公斤|kg|歲|個月|男生|女生|公的|母的/i],
  ["meet", /撿到|遇到|收容所|棄養|[日號]來|來的/],
  ["looks", /毛色|虎斑|米克斯|品種|三花|玳瑁|賓士/],
];
const topicOf = (c: string) => TOPIC_WORDS.find(([, re]) => re.test(c))?.[0] ?? null;
/** 沒講主題的「都不會」「也不會」：一段話裡講好幾件事時，指的是壞習慣，不沿用上一句的主題 */
const BARE_NOT = /^(其他|剩下的?|別的)?(都|也)?(不會|沒有壞習慣)/;

/**
 * 一段話回答所有還沒填的（彙整的對話框）：先跑規則式擷取，再處理「其他都…」「不知道」這種指一整個主題的句子。
 * 回傳更新後的表單、這次填到的欄位、記成不用再問的欄位。
 */
export function answerMissing(form: NewCatForm, missing: readonly string[], answer: string): { form: NewCatForm; filled: string[]; cleared: string[] } {
  const text = answer.trim();
  if (!text) return { form, filled: [], cleared: [] };
  // 前面加逗號：讓「開頭第一段當名字」的規則不會把回答當成名字；名字只認「牠叫…」「名字是…」
  const r = storyExtras(form, `，${text}`);
  let next = r.form;
  const filled = new Set(r.filled);
  if (!form.name.trim()) {
    const m = text.match(/(?:牠|她|他|這隻)?(?:的名字)?(?:叫做|叫|名字是)\s*([^\s，,。的]{1,10})/);
    if (m) { next = { ...next, name: m[1] }; filled.add("name"); }
  }
  const has = (t: GuideId) => (k: string) => guideQuestions([k], "").some(q => q.id === t);
  const left = (t: GuideId) => missing.filter(k => has(t)(k) && !filled.has(k));
  const cleared = new Set<string>();

  let topic: GuideId | null = null;
  for (const c of clauses(text)) {
    topic = topicOf(c) ?? (BARE_NOT.test(c) ? "behavior" : topic);
    if (!topic) continue;
    if (NOPE.test(c)) { left(topic).forEach(k => cleared.add(k)); continue; }
    if (!REST.test(c)) continue;
    if (topic === "care") {
      const lv = handlingLevel(c);
      if (lv) {
        const handling = { ...next.care.handling };
        for (const k of left("care")) { handling[k.slice(5)] = lv; filled.add(k); }
        next = { ...next, care: { ...next.care, handling } };
      }
    } else if (topic === "behavior" && behaviorLevel(c) === "none") {
      const behavior = { ...next.behavior };
      for (const k of left("behavior")) { behavior[k.slice(9) as BehaviorKey] = { level: "none", note: null }; filled.add(k); }
      next = { ...next, behavior };
    } else if (topic === "compat") {
      const lv = compatLevel(c);
      if (lv) {
        const compat = { ...next.compat };
        for (const k of left("compat")) { compat[k.slice(7) as (typeof COMPAT_KEYS)[number]] = lv; filled.add(k); }
        next = { ...next, compat };
      }
    }
  }
  // 提示已經寫了「不想被摸時會怎樣」，回答不用再講一次「不想被摸」
  if (missing.includes("touchSigns") && !filled.has("touchSigns")) {
    const signs = SIGN_RULES.filter(([re]) => re.test(text)).map(([, k]) => k);
    if (signs.length) { next = { ...next, care: { ...next.care, touchSigns: [...new Set([...(next.care.touchSigns ?? []), ...signs])] } }; filled.add("touchSigns"); }
  }
  const all = [...filled];
  return { form: markSaid(next, all), filled: all, cleared: [...cleared].filter(k => !filled.has(k)) };
}

/** 欄位代號 → 給中途看的名稱（「記下了：體重、驅蟲」） */
export function keyLabel(k: string): string {
  const fixed: Record<string, string> = {
    name: "名字", sex: "性別", age: "年紀", weight: "體重", coat: "毛色", breed: "品種", origin: "相遇的地方", since: "來的時間",
    neutered: "結紮", vaccine: "疫苗", deworm: "驅蟲", fiv: "FIV／FeLV", chip: "晶片", healthTags: "身體狀況", history: "其他身體狀況", medication: "用藥",
    extraTags: "其他個性", habits: "習慣", otherNote: "最愛的東西", touch: "摸哪裡", touchLimit: "摸多久會膩", touchSigns: "不想被摸的反應",
  };
  if (fixed[k]) return fixed[k];
  const [head, sub] = k.split(".");
  if (head === "scale") return TRAITS.find(t => t.key === sub)?.name ?? k;
  if (head === "care") return label(CARE_ITEMS, sub);
  if (head === "behavior") return label(BEHAVIOR_ITEMS, sub);
  if (head === "compat") return COMPAT_LABEL[sub as (typeof COMPAT_KEYS)[number]] ?? k;
  if (head === "arrival") return label(ARRIVAL_ITEMS, sub);
  return k;
}
