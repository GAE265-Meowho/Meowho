import { describe, expect, it } from "vitest";
import { blankTask, contentProblems, draftToContent, inferAction, normalizeContent, parseContent, templateContent, type Task } from "./adoption-tasks";

const ok = (over: Partial<Task> = {}): Task => ({
  id: "t1", day: 1, title: "第一個晚上", story: "凌晨在走廊衝刺", action: "zoomies", needs: [],
  options: [{ text: "睡前陪玩", good: true, feedback: "對" }, { text: "大聲制止", good: false, feedback: "不好" }], ...over,
});

describe("3D 貓的動作依劇情帶入（規格 09 §5.2）", () => {
  it("找劇情裡最先出現的關鍵字", () => {
    expect(inferAction("牠跳上櫃子，又把桌上的杯子撥下去")).toBe("jump_high");
    expect(inferAction("把桌上的杯子撥下去後躲到床底")).toBe("knock_item");
    expect(inferAction("今天第一次幫牠剪指甲")).toBe("none");
  });
  it("存之前重新帶入動作與需要的家具", () => {
    const [t] = normalizeContent({ tasks: [ok({ story: " 牠一直抓門 ", action: "none", needs: [] })] }).tasks;
    expect(t).toMatchObject({ story: "牠一直抓門", action: "scratch_door", needs: ["door"] });
  });
});

describe("儲存任務的檢查（和資料庫 meow_task_content_error 相同）", () => {
  it("劇情、2～6 個選項、每個選項都有回饋、至少一個好的選項", () => {
    expect(contentProblems({ tasks: [ok()] })).toEqual([]);
    expect(contentProblems({ tasks: [] })[0].message).toBe("至少要有 1 個任務");
    expect(contentProblems({ tasks: [ok({ story: " " })] }).map(p => p.message)).toEqual(["「第一個晚上」還沒有劇情"]);
    expect(contentProblems({ tasks: [ok({ options: [ok().options[0]] })] }).map(p => p.message)).toEqual(["「第一個晚上」要有 2～6 個選項"]);
    expect(contentProblems({ tasks: [ok({ options: [{ text: "a", good: true, feedback: "" }, ok().options[1]] })] }).map(p => p.message))
      .toEqual(["「第一個晚上」有選項沒有文字或回饋"]);
    expect(contentProblems({ tasks: [ok({ options: ok().options.map(o => ({ ...o, good: false })) })] }).map(p => p.message))
      .toEqual(["「第一個晚上」至少要有一個好的選項"]);
  });
  it("每個問題都標出是哪個任務", () => {
    const p = contentProblems({ tasks: [ok(), ok({ id: "t2", title: "", day: 3, story: "" })] });
    expect(p).toEqual([{ taskId: "t2", message: "「第 3 天」還沒有劇情" }]);
  });
  it("新的空白任務和範本：範本第 1 天是完整的例子，其他要中途補", () => {
    expect(blankTask(9).day).toBe(7);
    const tpl = templateContent("橘子");
    expect(tpl.tasks[0].story).toContain("橘子");
    expect(contentProblems({ tasks: [tpl.tasks[0]] })).toEqual([]);
    expect(contentProblems(tpl).length).toBeGreaterThan(0);
  });
});

describe("AI 草稿與資料庫草稿", () => {
  it("AI 草稿補上編號與動作，依天數排序；沒有好的選項就把第一個當好的", () => {
    const c = draftToContent({ tasks: [
      { day: 2, title: "躲起來", story: "牠躲到床底不出來", options: [{ text: "等牠", good: true, feedback: "對" }, { text: "拉出來", good: false, feedback: "不好" }] },
      { day: 1, title: "吵醒", story: "半夜一直叫", options: [{ text: "a", good: false, feedback: "x" }, { text: "b", good: false, feedback: "y" }] },
    ] });
    expect(c.tasks.map(t => `${t.day}:${t.action}`)).toEqual(["1:night_meow", "2:hide"]);
    expect(c.tasks[0].options[0].good).toBe(true);
    expect(new Set(c.tasks.map(t => t.id)).size).toBe(2);
  });
  it("讀到格式不對的草稿就丟掉那一個任務", () => {
    expect(parseContent({ tasks: [ok(), { id: "bad" }] }).tasks).toHaveLength(1);
    expect(parseContent(null).tasks).toEqual([]);
  });
});
