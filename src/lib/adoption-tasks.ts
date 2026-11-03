// 領養任務的內容格式與檢查（規格 09 §5.2；資料庫 0017 的 meow_task_content_error 檢查同樣的最低條件）。
// 格式：{"tasks": [{"id", "day", "title", "story", "action", "needs", "options": [{"text", "good", "feedback"}]}]}
// action（3D 貓要做的動作）和 needs（需要的家具或物品）由系統依劇情帶入，中途不用設定；房間裡沒有時依替換規則換（§7.3，進行任務時處理）。
import { z } from "zod";

export const TASK_DAYS = 7;                 // 暫定 7 天（規格 09 §10.2 #1，待和渝茜確認）
export const OPTIONS_MIN = 2;
export const OPTIONS_MAX = 6;
export const TASKS_MAX = 60;
export const DIFFICULTY_LABEL = ["", "很簡單", "簡單", "一般", "有點難", "很難"] as const;

export type Need = "sofa" | "high_place" | "hiding_spot" | "table_item" | "door";
export const ACTIONS = {
  zoomies: { label: "凌晨在走廊衝刺", needs: [] as Need[], words: ["衝刺", "暴衝", "跑酷", "狂奔", "衝來衝去"] },
  jump_high: { label: "跳上高處", needs: ["high_place"] as Need[], words: ["跳上", "高處", "櫃子上", "冰箱上"] },
  sofa: { label: "窩在沙發上", needs: ["sofa"] as Need[], words: ["沙發"] },
  hide: { label: "躲起來", needs: ["hiding_spot"] as Need[], words: ["躲", "找不到牠", "床底"] },
  knock_item: { label: "把桌上的東西撥下去", needs: ["table_item"] as Need[], words: ["撥", "推下", "掉下桌", "打翻"] },
  scratch_door: { label: "抓門", needs: ["door"] as Need[], words: ["抓門", "關在門外", "門口"] },
  hairball: { label: "吐毛球", needs: [] as Need[], words: ["毛球", "嘔吐", "吐了"] },
  night_meow: { label: "半夜一直叫", needs: [] as Need[], words: ["半夜", "一直叫", "喵喵叫", "叫醒"] },
  scratch_furniture: { label: "抓家具", needs: ["sofa"] as Need[], words: ["抓沙發", "抓家具", "磨爪"] },
  none: { label: "只有文字情境", needs: [] as Need[], words: [] as string[] },
} as const;
export type Action = keyof typeof ACTIONS;
export const ACTION_KEYS = Object.keys(ACTIONS) as Action[];

/** 依劇情帶入 3D 貓的動作：找劇情裡最先出現的關鍵字；都沒有就只有文字情境 */
export function inferAction(text: string): Action {
  let best: { key: Action; at: number } | null = null;
  for (const key of ACTION_KEYS) {
    for (const w of ACTIONS[key].words) {
      const at = text.indexOf(w);
      if (at >= 0 && (!best || at < best.at)) best = { key, at };
    }
  }
  return best?.key ?? "none";
}

export const OptionSchema = z.object({ text: z.string().max(80), good: z.boolean(), feedback: z.string().max(200) });
export const TaskSchema = z.object({
  id: z.string().min(1).max(40),
  day: z.number().int().min(1).max(TASK_DAYS),
  title: z.string().max(30),
  story: z.string().max(300),
  action: z.enum(ACTION_KEYS as [Action, ...Action[]]),
  needs: z.array(z.enum(["sofa", "high_place", "hiding_spot", "table_item", "door"])),
  options: z.array(OptionSchema).max(OPTIONS_MAX),
});
export const TaskContentSchema = z.object({ tasks: z.array(TaskSchema).max(TASKS_MAX) });
export type TaskOption = z.infer<typeof OptionSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskContent = z.infer<typeof TaskContentSchema>;

/** 讀資料庫的草稿：格式不對的部分丟掉，不讓畫面壞掉 */
export function parseContent(raw: unknown): TaskContent {
  const tasks = Array.isArray((raw as { tasks?: unknown })?.tasks) ? (raw as { tasks: unknown[] }).tasks : [];
  return { tasks: tasks.map(t => TaskSchema.safeParse(t)).filter(r => r.success).map(r => r.data) };
}

export interface ContentProblem { taskId: string | null; message: string }

/** 和資料庫 meow_task_content_error 同樣的條件；全部列出來，畫面才能標出每個缺的地方 */
export function contentProblems(c: TaskContent): ContentProblem[] {
  const out: ContentProblem[] = [];
  if (c.tasks.length < 1) out.push({ taskId: null, message: "至少要有 1 個任務" });
  if (c.tasks.length > TASKS_MAX) out.push({ taskId: null, message: `任務最多 ${TASKS_MAX} 個` });
  const seen = new Set<string>();
  for (const t of c.tasks) {
    const name = `「${t.title.trim() || `第 ${t.day} 天`}」`;
    if (seen.has(t.id)) out.push({ taskId: t.id, message: `${name}的編號重複` });
    seen.add(t.id);
    if (!t.story.trim()) out.push({ taskId: t.id, message: `${name}還沒有劇情` });
    if (t.options.length < OPTIONS_MIN || t.options.length > OPTIONS_MAX) out.push({ taskId: t.id, message: `${name}要有 ${OPTIONS_MIN}～${OPTIONS_MAX} 個選項` });
    if (t.options.some(o => !o.text.trim() || !o.feedback.trim())) out.push({ taskId: t.id, message: `${name}有選項沒有文字或回饋` });
    if (!t.options.some(o => o.good)) out.push({ taskId: t.id, message: `${name}至少要有一個好的選項` });
  }
  return out;
}

/** 存之前：去頭尾空白，動作和需要的物品依劇情重新帶入 */
export function normalizeContent(c: TaskContent): TaskContent {
  return {
    tasks: c.tasks.map(t => {
      const action = inferAction(`${t.title} ${t.story}`);
      return {
        ...t, title: t.title.trim(), story: t.story.trim(), action, needs: [...ACTIONS[action].needs],
        options: t.options.map(o => ({ ...o, text: o.text.trim(), feedback: o.feedback.trim() })),
      };
    }).sort((a, b) => a.day - b.day),
  };
}

let seq = 0;
export const newTaskId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`;

export const blankTask = (day: number): Task => ({
  id: newTaskId(), day: Math.min(Math.max(day, 1), TASK_DAYS), title: "", story: "", action: "none", needs: [],
  options: [{ text: "", good: true, feedback: "" }, { text: "", good: false, feedback: "" }],
});

/** 自己寫的範本：每天一個空白任務，第 1 天先放一個例子 */
export function templateContent(catName: string): TaskContent {
  const first: Task = {
    ...blankTask(1),
    title: "第一個晚上",
    story: `凌晨三點，${catName}在走廊來回衝刺，把你吵醒了。`,
    options: [
      { text: "睡前陪牠玩 15 分鐘逗貓棒，消耗體力", good: true, feedback: "對！睡前的遊戲能讓貓晚上睡得比較安穩。" },
      { text: "起床大聲制止牠", good: false, feedback: "大聲制止會讓牠緊張，也可能變成牠討關注的方式。" },
    ],
  };
  return normalizeContent({ tasks: [first, ...Array.from({ length: 2 }, (_, i) => blankTask(i + 2))] });
}

// ---------- AI 草稿 ----------
export const TaskDraftSchema = z.object({
  tasks: z.array(z.object({
    day: z.number().int().min(1).max(TASK_DAYS).describe(`第幾天，1～${TASK_DAYS}`),
    title: z.string().min(1).max(30).describe("任務名稱，2～12 字"),
    story: z.string().min(1).max(300).describe("任務情境：這隻貓在領養人家裡做了什麼，1～2 句，最多 80 字"),
    options: z.array(z.object({
      text: z.string().min(1).max(80).describe("領養人可以選的做法，最多 30 字"),
      good: z.boolean().describe("是不是好的做法"),
      feedback: z.string().min(1).max(200).describe("選了之後中途給的回饋，1～2 句，最多 60 字"),
    })).min(OPTIONS_MIN).max(4),
  })).min(3).max(TASK_DAYS),
});
export type TaskDraft = z.infer<typeof TaskDraftSchema>;

/** AI 草稿 → 任務內容：補上編號、動作和需要的物品；每個任務至少要有一個好的選項 */
export function draftToContent(d: TaskDraft): TaskContent {
  return normalizeContent({
    tasks: d.tasks.map(t => ({
      id: newTaskId(), day: t.day, title: t.title, story: t.story, action: "none" as Action, needs: [],
      options: t.options.some(o => o.good) ? t.options : t.options.map((o, i) => ({ ...o, good: i === 0 })),
    })),
  });
}
