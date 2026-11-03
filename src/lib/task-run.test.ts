import { describe, expect, it } from "vitest";
import type { Task } from "./adoption-tasks";
import { abandonMissing, choose, isComplete, nextTask, parseProgress, placeFor, proofLines, roomFurniture, roomIdAt, taskScene } from "./task-run";

const task = (id: string, day: number, over: Partial<Task> = {}): Task => ({
  id, day, title: `任務${id}`, story: "劇情", action: "none", needs: [],
  options: [{ text: "好做法", good: true, feedback: "對" }, { text: "壞做法", good: false, feedback: "不對" }], ...over,
});

describe("家具替換規則（規格 09 §7.3）", () => {
  it("房間裡沒有沙發：依序找床、櫃子、椅子", () => {
    expect(placeFor("sofa", ["沙發", "床"])).toBe("沙發");
    expect(placeFor("sofa", ["床", "椅子"])).toBe("床");
    expect(placeFor("sofa", ["書桌椅子"])).toBe("椅子");
  });
  it("躲起來：床底 → 衣櫃旁 → 沙發後；桌上的小物品、門", () => {
    expect(placeFor("hiding_spot", ["沙發", "衣櫃"])).toBe("衣櫃旁");
    expect(placeFor("table_item", ["書桌"])).toBe("桌上的東西");
    expect(placeFor("door", ["房門"])).toBe("門");
  });
  it("都找不到就改成文字情境", () => {
    expect(taskScene({ needs: ["high_place"] }, ["沙發"])).toEqual({ items: [], textOnly: true });
    expect(taskScene({ needs: ["high_place"] }, ["衣櫃"])).toEqual({ items: ["櫃子"], textOnly: false });
    expect(taskScene({ needs: [] }, [])).toEqual({ items: [], textOnly: false });
  });
});

describe("進度", () => {
  const content = { tasks: [task("a", 1), task("b", 2)] };
  it("選錯可以重選，選對才完成；記下每次選了什麼和目前第幾天", () => {
    const p0 = parseProgress(null);
    const wrong = choose(p0, content.tasks[0], 1);
    expect(wrong.good).toBe(false);
    expect(wrong.progress).toEqual({ done: [], choices: { a: [1] }, day: 1 });
    const right = choose(wrong.progress, content.tasks[0], 0);
    expect(right.progress).toEqual({ done: ["a"], choices: { a: [1, 0] }, day: 1 });
    expect(nextTask(content, right.progress)?.id).toBe("b");
    expect(isComplete(content, right.progress)).toBe(false);
    const done = choose(right.progress, content.tasks[1], 0).progress;
    expect(isComplete(content, done)).toBe(true);
    expect(nextTask(content, done)).toBeNull();
  });
  it("任務證明：每個任務選了什麼、重選幾次", () => {
    const p = { done: ["a", "b"], choices: { a: [1, 0], b: [0] } };
    expect(proofLines(content, p)).toEqual([
      { title: "任務a", day: 1, tries: 2, chosen: "好做法" },
      { title: "任務b", day: 2, tries: 1, chosen: "好做法" },
    ]);
  });
  it("讀到格式不對的進度就從頭開始", () => {
    expect(parseProgress({ done: "x", choices: null })).toEqual({ done: [], choices: {} });
  });
});

describe("放棄任務", () => {
  it("理由必選，「其他」要寫說明", () => {
    expect(abandonMissing([], "")).toBe("請選擇放棄的原因");
    expect(abandonMissing(["other"], " ")).toBe("選「其他」時請寫下原因");
    expect(abandonMissing(["no_time", "other"], "要搬家")).toBeNull();
  });
});

describe("房間", () => {
  it("id 符合 meow_room_models 的格式；家具從預設房間或轉換結果讀", () => {
    expect(roomIdAt(new Date(Date.UTC(2026, 10, 4, 1, 2, 3)))).toBe("room_20261104_010203");
    expect(roomFurniture({ furniture: ["沙發"] })).toEqual(["沙發"]);
    expect(roomFurniture({ objects: [{ label: "床" }, {}] })).toEqual(["床"]);
    expect(roomFurniture(null)).toEqual([]);
  });
});
