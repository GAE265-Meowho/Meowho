// 說說牠之後的口說追問（#478）：第一次口述沒填到的欄位，依主題一題一題用說的問，每題附一句「可以這樣說」。
// 回答只跑規則式擷取（story-rules.ts，不等 LLM），說「其他都很順利」「其他都不會」這類話時，把這題剩下的項目一起填好；
// 說「不知道」「沒有」「很健康」時，這題剩下的項目記成「不用再問」（cleared），最後的補資料點選頁就不會再出現。
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
  { id: "name", has: k => k === "name", build: () => ["這隻貓叫什麼名字？", "直接說名字就好，例如：妹妹"] },
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
    return [`照顧起來呢？${join(items)}，哪些順利、哪些比較難？`, `${items[0]}要用毛巾包，其他都很順利`];
  } },
  { id: "behavior", has: k => k.startsWith("behavior."), build: keys => {
    const items = keys.map(k => label(BEHAVIOR_ITEMS, k.slice(9)));
    const eg = keys.includes("behavior.scratch") ? "抓沙發" : items[0];
    return [`牠會不會${join(items)}？`, `偶爾會${eg}，其他都不會`];
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
/** 一句只講「不知道／沒有／很健康」 */
const NOPE = /^(牠|身體|其他|剩下的?|別的)?(都|也)?(還)?(沒有|沒|不知道|不清楚|不確定|沒試過|沒注意|忘了|很健康|健康|沒問題)/;
/** 「其他都…」「剩下的都…」 */
const REST = /^(其他|剩下的?|別的|全部|都)/;

/** 回答一題：回傳更新後的表單、這次填到的欄位、記成不用再問的欄位 */
export function answerGuide(form: NewCatForm, q: GuideQuestion, answer: string): { form: NewCatForm; filled: string[]; cleared: string[] } {
  const text = answer.trim();
  if (!text) return { form, filled: [], cleared: [] };
  if (q.id === "name") {
    const name = text.replace(/^(牠|她|他|這隻)?(的名字)?(叫做|叫|名字是|是)?\s*/, "").split(/[，,。\s的]/)[0].slice(0, 30);
    return name ? { form: markSaid({ ...form, name }, ["name"]), filled: ["name"], cleared: [] } : { form, filled: [], cleared: [] };
  }
  // 前面加逗號：讓「開頭第一段當名字」的規則不會把回答當成名字
  const r = storyExtras(form, `，${text}`);
  let next = r.form;
  const filled = new Set(r.filled);
  const left = () => q.keys.filter(k => !filled.has(k));
  const restClause = clauses(text).find(c => REST.test(c));

  if (restClause && q.id === "care") {
    const lv = handlingLevel(restClause);
    if (lv) {
      const handling = { ...next.care.handling };
      for (const k of left()) { handling[k.slice(5)] = lv; filled.add(k); }
      next = { ...next, care: { ...next.care, handling } };
    }
  }
  if (restClause && q.id === "behavior" && behaviorLevel(restClause) === "none") {
    const behavior = { ...next.behavior };
    for (const k of left()) { behavior[k.slice(9) as BehaviorKey] = { level: "none", note: null }; filled.add(k); }
    next = { ...next, behavior };
  }
  if (restClause && q.id === "compat") {
    const lv = compatLevel(restClause);
    if (lv) {
      const compat = { ...next.compat };
      for (const k of left()) { compat[k.slice(7) as (typeof COMPAT_KEYS)[number]] = lv; filled.add(k); }
      next = { ...next, compat };
    }
  }
  // 問題已經在問「不想被摸時會怎樣」，回答不用再講一次「不想被摸」
  if (q.id === "touch" && q.keys.includes("touchSigns") && !filled.has("touchSigns")) {
    const signs = SIGN_RULES.filter(([re]) => re.test(text)).map(([, k]) => k);
    if (signs.length) { next = { ...next, care: { ...next.care, touchSigns: [...new Set([...(next.care.touchSigns ?? []), ...signs])] } }; filled.add("touchSigns"); }
  }
  // 適應速度：問題已經問了「躲幾天」，只回答「兩天」也算
  if (q.id === "arrival" && q.keys.length === 1 && !filled.has(q.keys[0])) {
    const k = q.keys[0].slice(8);
    const r2 = storyExtras(next, `，${{ hide: "躲了", eat: "開始吃飯", touch: "讓我摸" }[k] ?? ""}${text}`);
    if (r2.filled.includes(q.keys[0])) { next = r2.form; filled.add(q.keys[0]); }
  }

  const cleared = clauses(text).some(c => c.length <= 12 && NOPE.test(c)) ? left() : [];
  const all = [...filled];
  return { form: markSaid(next, all), filled: all, cleared };
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
