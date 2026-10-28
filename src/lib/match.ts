// 一句話配對（原型：關鍵字規則）。正式版由 RAG API 取代，但保留同樣的輸入輸出形狀。
import type { Cat } from "./mock-data";

export const CITIES = ["台北市","新北市","桃園市","台中市","台南市","高雄市","基隆市","新竹市","新竹縣","苗栗縣","彰化縣","南投縣","雲林縣","嘉義市","嘉義縣","屏東縣","宜蘭縣","花蓮縣","台東縣"];

export interface ParsedQuery {
  city: string | null;
  novice: boolean; gentle: boolean; independent: boolean; kids: boolean; special: boolean;
  adult: boolean; kitten: boolean;
}

export function parseQuery(q: string): ParsedQuery {
  const city = CITIES.find(c => q.includes(c) || q.includes(c.slice(0, 2))) ?? null;
  return {
    city,
    novice: /第一次|新手|沒養過/.test(q),
    gentle: /親人|溫和|撒嬌|黏/.test(q),
    independent: /上班|獨立|白天不在/.test(q),
    kids: /小孩|小朋友|孩子/.test(q),
    special: /特別照護|特殊|處方|生病|老貓/.test(q),
    adult: /成貓/.test(q),
    kitten: /幼貓|小貓/.test(q),
  };
}

export function describeConditions(p: ParsedQuery, scope: "city" | "all", fallbackCity: string): string {
  return [
    scope === "city" ? (p.city ?? fallbackCity) : "全台",
    p.adult && "成貓", p.kitten && "幼貓", p.novice && "新手友善", p.gentle && "親人",
    p.independent && "獨立", p.kids && "適合有小孩", p.special && "特殊照護",
  ].filter(Boolean).join("、");
}

export function matchCats(cats: Cat[], q: string, scope: "city" | "all", fallbackCity: string, limit = 3) {
  const p = parseQuery(q);
  const city = p.city ?? fallbackCity;
  const pool = scope === "city" ? cats.filter(c => c.city === city) : cats;
  const ranked = pool
    .map(c => {
      let s = 0;
      if (p.novice) s += c.novice ? 2 : -2;
      if (p.gentle) s += c.tags.some(t => /親人|溫和|撒嬌|黏/.test(t)) ? 2 : 0;
      if (p.independent) s += c.independent ? 2 : 0;
      if (p.kids) s += c.kids ? 2 : -1;
      if (p.special) s += c.special ? 3 : 0;
      if (p.adult) s += c.ageBand === "成貓" ? 1 : 0;
      if (p.kitten) s += c.ageBand === "幼貓" ? 1 : 0;
      if (c.city === city) s += 1;
      return { cat: c, score: s };
    })
    .sort((a, b) => b.score - a.score || b.cat.waitDays - a.cat.waitDays)
    .slice(0, limit);
  return { parsed: p, city, conditions: describeConditions(p, scope, fallbackCity), results: ranked };
}

/** 帶我回家：訪客依縣市、等最久優先（FR-07-08） */
export function adoptList(cats: Cat[], city: string, limit = 4) {
  return cats.filter(c => c.city === city).sort((a, b) => b.waitDays - a.waitDays).slice(0, limit);
}
