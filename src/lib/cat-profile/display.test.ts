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
    expect(compatLines({ cats: "yes", dogs: "no", kids: "unknown" })).toEqual(["可以和其他貓相處", "不適合和狗同住"]);
  });
});
