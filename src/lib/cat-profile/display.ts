// 貓咪頁（#70）：把醫療細項、相處轉成給人看的短句；沒有資料的項目不列，畫面保持乾淨
import { COMPAT_KEYS, COMPAT_LABEL, type Compat, type Medical } from "./adoption";

const DONE = { done: "已完成", not_done: "還沒", unknown: "" } as const;
const FIV = { negative: "陰性", fiv_positive: "FIV 陽性", felv_positive: "FeLV 陽性", both_positive: "FIV、FeLV 皆陽性", untested: "" } as const;

export function medicalLines(m: Medical): string[] {
  const out: string[] = [];
  if (m.neutered === "done") out.push(m.neuterNote ? `已結紮（${m.neuterNote}）` : "已結紮");
  if (m.neutered === "not_done") out.push(m.neuterNote ? `還沒結紮（${m.neuterNote}）` : "還沒結紮");
  if (m.vaccineDoses !== null) out.push(`疫苗打了 ${m.vaccineDoses} 劑${m.lastVaccineDate ? `（最後一次 ${m.lastVaccineDate}）` : ""}`);
  if (m.dewormInternal !== "unknown") out.push(`體內驅蟲：${DONE[m.dewormInternal]}`);
  if (m.dewormExternal !== "unknown") out.push(`體外驅蟲：${DONE[m.dewormExternal]}`);
  if (m.fivFelv !== "untested") out.push(`FIV／FeLV 快篩：${FIV[m.fivFelv]}${m.testDate ? `（${m.testDate}）` : ""}`);
  if (m.microchip === "yes") out.push("已植入晶片");
  if (m.microchip === "no") out.push("還沒植入晶片");
  if (m.history.trim()) out.push(`病史：${m.history.trim()}`);
  if (m.medication.trim()) out.push(`目前用藥：${m.medication.trim()}`);
  return out;
}

/** 跟誰處得來：看情況、不行時接上中途的說明 */
export function compatLines(c: Compat): string[] {
  return COMPAT_KEYS.flatMap(k => {
    const who = COMPAT_LABEL[k];
    const note = c.notes?.[k]?.trim();
    const tail = note ? `（${note}）` : "";
    return c[k] === "yes" ? [`可以和${who}相處`] : c[k] === "maybe" ? [`和${who}相處要看情況${tail}`]
      : c[k] === "no" ? [`不適合和${who}${k === "guest" ? "接觸" : "同住"}${tail}`] : [];
  });
}
