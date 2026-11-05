import { describe, expect, it } from "vitest";
import { emptyCompat, emptyMedical } from "./adoption";
import { compatLines, medicalLines } from "./display";

describe("貓咪頁：醫療細項轉成文字", () => {
  it("只列有資料的項目", () => {
    expect(medicalLines(emptyMedical())).toEqual([]);
    expect(medicalLines({ ...emptyMedical(), neutered: "done", vaccineDoses: 1, lastVaccineDate: "2026-08-31", fivFelv: "negative", microchip: "yes" }))
      .toEqual(["已結紮", "疫苗打了 1 劑（最後一次 2026-08-31）", "FIV／FeLV 快篩：陰性", "已植入晶片"]);
  });
  it("還沒結紮時帶出預計安排；驅蟲分體內體外", () => {
    expect(medicalLines({ ...emptyMedical(), neutered: "not_done", neuterNote: "12 月預約", dewormInternal: "done", dewormExternal: "not_done" }))
      .toEqual(["還沒結紮（12 月預約）", "體內驅蟲：已完成", "體外驅蟲：還沒"]);
  });
});

describe("貓咪頁：相處", () => {
  it("只列確定的", () => {
    expect(compatLines(emptyCompat())).toEqual([]);
    expect(compatLines({ cats: "yes", dogs: "no", kids: "unknown", guest: "unknown", notes: {} })).toEqual(["可以和其他貓相處", "不適合和狗同住"]);
  });
  it("看情況、不行接上中途的說明；陌生人也列出來（#206）", () => {
    expect(compatLines({ ...emptyCompat(), cats: "maybe", guest: "no", notes: { cats: "要隔離一週慢慢介紹", guest: "會躲" } }))
      .toEqual(["和其他貓相處要看情況（要隔離一週慢慢介紹）", "不適合和陌生人接觸（會躲）"]);
  });
});
