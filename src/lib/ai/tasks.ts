// 領養任務草稿（規格 09 §5.2）：中途按「AI 幫我生成」時，依這隻貓的資料擬任務，中途修改後儲存。
// 提示詞在 src/lib/prompts/adoption.ts；貓的資料都是中途寫的內容，一律經 wrapUserInput 包成資料區。
import type { BaseMessage } from "@langchain/core/messages";
import type { Runnable } from "@langchain/core/runnables";
import { TaskDraftSchema, type TaskDraft } from "@/lib/adoption-tasks";
import { TASK_DRAFT } from "@/lib/prompts/adoption";
import { createStructuredChain } from "./chain";
import { wrapUserInput } from "./guard";

type Runner = Runnable<BaseMessage[], unknown>;

export interface TaskCatContext {
  name: string; lifeStage: string | null; personality: string[]; health: string[]; habits: string[];
  description: string | null; timeline: string[]; videoNotes: string[];
}

const STAGE: Record<string, string> = { kitten: "幼貓", adult: "成貓", senior: "老貓" };

export const taskDraftChain = (runner: Runner) => createStructuredChain(TASK_DRAFT.system, TaskDraftSchema, runner);

// 每一欄都限制長度，避免把太長的內容送進模型
export const taskDraftInput = (c: TaskCatContext) => ({
  text: `請幫中途設計這隻貓的領養任務。\n${wrapUserInput([
    `貓的名字：${c.name.slice(0, 30)}`,
    `年齡層：${(c.lifeStage && STAGE[c.lifeStage]) || "不確定"}`,
    c.personality.length ? `個性：${c.personality.slice(0, 12).join("、")}` : "個性：沒有填寫",
    c.health.length ? `健康：${c.health.slice(0, 8).join("、")}` : "",
    c.habits.length ? `生活習慣：${c.habits.slice(0, 12).join("、")}` : "",
    c.description ? `中途的描述：${c.description.slice(0, 600)}` : "",
    c.timeline.length ? `故事：${c.timeline.slice(-10).map(e => e.slice(0, 80)).join("；")}` : "",
    c.videoNotes.length ? `影片觀察：${c.videoNotes.slice(0, 3).map(e => e.slice(0, 80)).join("；")}` : "",
  ].filter(Boolean).join("\n"))}`,
});

/** AI 沒設定或失敗時的固定草稿（幼貓、老貓、其他成貓三種情境）；0018 的系統預設任務也是這份內容 */
export function fallbackTaskDraft(name: string, lifeStage: string | null): TaskDraft {
  const kitten = lifeStage === "kitten";
  const senior = lifeStage === "senior";
  return { tasks: [
    { day: 1, title: "第一個晚上", story: `${name}剛到新家，一整個下午都躲在床底不出來。`, options: [
      { text: "放好水和貓砂，給牠時間慢慢出來", good: true, feedback: "對！剛到新家的貓需要時間，先讓牠自己探索最安心。" },
      { text: "把牠從床底抱出來安撫", good: false, feedback: "強迫抱出來會讓牠更害怕，等牠準備好再互動。" },
    ] },
    { day: 2, title: "凌晨暴衝", story: `凌晨三點，${name}在走廊來回衝刺，把你吵醒了。`, options: [
      { text: "睡前陪牠玩 15 分鐘逗貓棒", good: true, feedback: "睡前消耗體力，晚上會睡得比較安穩。" },
      { text: "起床大聲制止牠", good: false, feedback: "大聲制止會讓牠緊張，也可能變成討關注的方式。" },
    ] },
    senior ? { day: 3, title: "跳不上沙發", story: `${name}想跳上沙發，試了兩次都沒跳上去。`, options: [
      { text: "在沙發旁放一個矮凳當階梯", good: true, feedback: "老貓關節比較弱，降低高度能讓牠繼續待在喜歡的地方。" },
      { text: "把牠抱上去就好", good: false, feedback: "偶爾可以，但牠自己上不去時會很挫折，環境調整比較好。" },
    ] } : { day: 3, title: "桌上的杯子", story: `${name}跳上書桌，把你的水杯撥到地上。`, options: [
      { text: "把易碎物收好，給牠一個可以跳的貓跳台", good: true, feedback: "給牠合適的高處，比禁止更有效。" },
      { text: "噴水嚇牠", good: false, feedback: "噴水會破壞信任，牠只會學到趁你不在時再跳。" },
    ] },
    { day: 4, title: kitten ? "啃電線" : "抓沙發", story: kitten ? `${name}在咬充電線。` : `${name}開始抓沙發的扶手。`, options: kitten ? [
      { text: "把電線收好或套上保護套", good: true, feedback: "幼貓愛咬東西，先把危險的東西收起來最重要。" },
      { text: "沒關係，牠長大就不咬了", good: false, feedback: "咬電線可能觸電，要先處理環境。" },
    ] : [
      { text: "在沙發旁放一個貓抓板", good: true, feedback: "磨爪是本能，給牠可以抓的地方就好。" },
      { text: "幫牠去爪", good: false, feedback: "去爪會傷害貓，台灣的中途幾乎都不接受。" },
    ] },
    { day: 5, title: "吐毛球", story: `早上起床，發現${name}在地上吐了一團毛球。`, options: [
      { text: "清乾淨，多幫牠梳毛；常常吐就帶去給獸醫看", good: true, feedback: "偶爾吐毛球很常見，梳毛能減少；頻繁嘔吐要看醫生。" },
      { text: "馬上餵人吃的胃藥", good: false, feedback: "人的藥可能對貓有害，不要自己餵藥。" },
    ] },
  ] };
}
