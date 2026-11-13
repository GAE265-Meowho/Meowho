// 行政區浮水印。嘉義市只留縣市名，不寫東區、西區。
// 名稱先依行政區外框決定直排或橫排與字級，再跟鄰近名稱錯開。

import { projectTaiwan } from "@/lib/adopt-map";
import { taiwanCountyLabels } from "@/lib/geo/county-labels";
import { DISTRICTS } from "@/lib/geo/region-bounds";

export type TownSpot = { text: string; x: number; y: number; area: number };

const BASE = 12;
const MIN = 5;

export function hideTownLabel(city: string, district: string) {
  return city === "嘉義市" && (district === "東區" || district === "西區");
}

export function ringArea(ring: { x: number; y: number }[]) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return Math.abs(area) / 2;
}

/** 第一圈是外框，後面是洞。 */
export function projectedArea(polys: { x: number; y: number }[][][]) {
  let area = 0;
  for (const poly of polys) {
    if (!poly[0] || poly[0].length < 3) continue;
    area += ringArea(poly[0]);
    for (const hole of poly.slice(1)) area -= ringArea(hole);
  }
  return Math.max(area, 1);
}

function referenceArea(areas: number[]) {
  const sorted = [...areas].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * 0.75) - 1));
  return sorted[index] || 1;
}

function tightness(a: TownSpot, b: TownSpot, size: number) {
  const width = ((a.text.length + b.text.length) * size) / 2;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  const limitY = size * 0.85;
  if (dx >= width - 0.5 || dy >= limitY) return 0;
  return Math.min(1, Math.max(1 - dx / width, 1 - dy / limitY));
}

/**
 * 沒跟別人重疊的維持 12。有重疊的依面積縮小；
 * 跟兩個以上疊在一起、或幾乎疊在同一個點，再往下收到最小 5。
 */
export function townFontSizes(towns: TownSpot[], base = BASE, min = MIN) {
  const ref = referenceArea(towns.map((town) => town.area));
  const sizes = towns.map((town) => {
    let worst = 0;
    let count = 0;
    for (const other of towns) {
      if (other === town) continue;
      const hit = tightness(town, other, base);
      if (hit <= 0) continue;
      count += 1;
      if (hit > worst) worst = hit;
    }
    if (count === 0) return base;
    const areaRatio = Math.min(1, Math.sqrt(Math.max(town.area, 1) / ref));
    const density = Math.min(1, worst * 0.7 + Math.min(count, 4) * 0.14);
    const ratio = areaRatio * (1 - density * 0.78);
    return Math.max(min, Math.min(base, Math.round(min + (base - min) * ratio)));
  });
  for (let pass = 0; pass < 2; pass++) {
    const next = [...sizes];
    towns.forEach((town, index) => {
      const hits = towns.filter((other, otherIndex) => otherIndex !== index && overlapsAt(town, towns[otherIndex], sizes[index], sizes[otherIndex]));
      if (hits.length >= 2) next[index] = Math.max(min, sizes[index] - 2);
    });
    for (let index = 0; index < sizes.length; index++) sizes[index] = next[index];
  }
  return sizes;
}

function overlapsAt(a: TownSpot, b: TownSpot, sizeA: number, sizeB: number) {
  const width = (a.text.length * sizeA + b.text.length * sizeB) / 2;
  return Math.abs(a.x - b.x) < width - 0.5 && Math.abs(a.y - b.y) < Math.max(sizeA, sizeB) * 0.85;
}

export type LabelBounds = { minX: number; minY: number; maxX: number; maxY: number };

type RingPoint = { x: number; y: number };

function largestOuter(polys: RingPoint[][][]) {
  let best = -1;
  let ring: RingPoint[] | undefined;
  for (const poly of polys) {
    const outer = poly[0];
    if (!outer || outer.length < 3) continue;
    const area = ringArea(outer);
    if (area > best) {
      best = area;
      ring = outer;
    }
  }
  return ring;
}

function pointInRing(x: number, y: number, ring: RingPoint[]) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const cross = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-6) + a.x;
    if (cross) hit = !hit;
  }
  return hit;
}

/** 最大那塊外框的寬高，用來決定區名直排或橫排。 */
export function labelBox(polys: RingPoint[][][]) {
  const ring = largestOuter(polys);
  if (!ring) return { width: 1, height: 1, minX: 0, minY: 0, maxX: 1, maxY: 1 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of ring) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  return {
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
    minX,
    minY,
    maxX,
    maxY,
  };
}

export function fitTownLabel(text: string, width: number, height: number, max = 13, vertical?: boolean) {
  const boxW = Math.max(width, 1);
  const boxH = Math.max(height, 1);
  const upright = vertical ?? boxH > boxW * 1.15;
  const chars = Math.max([...text].length, 1);
  const pad = 0.7;
  const raw = upright ? Math.min(boxW * pad, (boxH * pad) / chars) : Math.min(boxH * pad, (boxW * pad) / chars);
  return { vertical: upright, size: Math.min(max, raw) };
}

export type SettledLabel = {
  key: string;
  role: "town" | "county";
  text: string;
  x: number;
  y: number;
  vertical: boolean;
  size: number;
  cap: number;
  tracking: number;
  /** 外框高除以寬。接近 1 才允許改直橫來避開重疊。 */
  stretch: number;
  bounds?: LabelBounds;
};

const MIN_SIZE = 3.2;
const GAP = 0.15;
/** 實測中文字高約是字級的 1.12 倍，碰撞框要跟著字形而不是只看字級。 */
const GLYPH = 1.12;

export function labelInk(label: Pick<SettledLabel, "text" | "x" | "y" | "size" | "vertical" | "tracking">) {
  const chars = Math.max([...label.text].length, 1);
  const tracking = label.vertical ? 0 : Math.max(0, chars - 1) * label.size * label.tracking;
  const w = label.vertical ? label.size * GLYPH : chars * label.size + tracking;
  const h = label.vertical ? (chars - 1) * label.size + label.size * GLYPH : label.size * GLYPH;
  return { left: label.x - w / 2, top: label.y - h / 2, right: label.x + w / 2, bottom: label.y + h / 2, w, h };
}

export function labelsOverlap(a: SettledLabel, b: SettledLabel) {
  const A = labelInk(a);
  const B = labelInk(b);
  return A.left < B.right + GAP && A.right + GAP > B.left && A.top < B.bottom + GAP && A.bottom + GAP > B.top;
}

function overlapSpan(a: SettledLabel, b: SettledLabel) {
  const A = labelInk(a);
  const B = labelInk(b);
  const ox = Math.min(A.right, B.right) - Math.max(A.left, B.left);
  const oy = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
  if (ox + GAP <= 0 || oy + GAP <= 0) return null;
  return { ox: ox + GAP, oy: oy + GAP };
}

function clampLabel(label: SettledLabel) {
  if (!label.bounds) return;
  const { w, h } = labelInk(label);
  const { minX, minY, maxX, maxY } = label.bounds;
  const loX = minX + w / 2;
  const hiX = maxX - w / 2;
  const loY = minY + h / 2;
  const hiY = maxY - h / 2;
  label.x = loX <= hiX ? Math.min(hiX, Math.max(loX, label.x)) : (minX + maxX) / 2;
  label.y = loY <= hiY ? Math.min(hiY, Math.max(loY, label.y)) : (minY + maxY) / 2;
}

function nudge(label: SettledLabel, dx: number, dy: number) {
  if (!label.bounds) return;
  label.x += dx;
  label.y += dy;
  clampLabel(label);
}

function tryFlip(label: SettledLabel, other: SettledLabel) {
  if (!label.bounds || label.stretch >= 1.35 || label.stretch <= 1 / 1.35) return false;
  const width = label.bounds.maxX - label.bounds.minX;
  const height = label.bounds.maxY - label.bounds.minY;
  const vertical = !label.vertical;
  const size = fitTownLabel(label.text, width, height, label.cap, vertical).size;
  if (size < 1) return false;
  const trial: SettledLabel = { ...label, vertical, size };
  clampLabel(trial);
  const before = overlapSpan(label, other);
  const after = overlapSpan(trial, other);
  const beforeArea = before ? before.ox * before.oy : 0;
  const afterArea = after ? after.ox * after.oy : 0;
  if (!(afterArea < beforeArea - 0.01)) return false;
  label.vertical = vertical;
  label.size = size;
  label.x = trial.x;
  label.y = trial.y;
  return true;
}

/** 先依各區外框排好的字，若還疊到別的名稱，就在區內挪開並縮小較大的那個。 */
export function settleLabels<T extends SettledLabel>(labels: T[]): T[] {
  const next = labels.map((label) => ({ ...label, bounds: label.bounds ? { ...label.bounds } : undefined }));
  for (let pass = 0; pass < 48; pass++) {
    let changed = false;
    for (let i = 0; i < next.length; i++) {
      for (let j = i + 1; j < next.length; j++) {
        const dx = Math.abs(next[i].x - next[j].x);
        const dy = Math.abs(next[i].y - next[j].y);
        if (dx > 160 || dy > 80) continue;
        const span = overlapSpan(next[i], next[j]);
        if (!span) continue;
        const before = `${next[i].x.toFixed(2)}:${next[i].y.toFixed(2)}:${next[i].size.toFixed(2)}:${next[i].vertical}|${next[j].x.toFixed(2)}:${next[j].y.toFixed(2)}:${next[j].size.toFixed(2)}:${next[j].vertical}`;
        const alongX = span.ox <= span.oy;
        const dir = alongX ? Math.sign(next[i].x - next[j].x) || 1 : Math.sign(next[i].y - next[j].y) || 1;
        const push = (alongX ? span.ox : span.oy) / 2;
        if (alongX) {
          nudge(next[i], dir * push, 0);
          nudge(next[j], -dir * push, 0);
        } else {
          nudge(next[i], 0, dir * push);
          nudge(next[j], 0, -dir * push);
        }
        if (overlapSpan(next[i], next[j])) {
          const flipped = tryFlip(next[i], next[j]) || tryFlip(next[j], next[i]);
          if (!flipped && overlapSpan(next[i], next[j])) {
            const bigger = labelInk(next[i]).w * labelInk(next[i]).h >= labelInk(next[j]).w * labelInk(next[j]).h ? next[i] : next[j];
            const smaller = bigger === next[i] ? next[j] : next[i];
            const floor = 1.2;
            const shrink = (label: SettledLabel) => {
              label.size = label.size > MIN_SIZE
                ? Math.max(MIN_SIZE, label.size * 0.86)
                : Math.max(floor, label.size * 0.86);
              clampLabel(label);
            };
            if (bigger.size > floor + 0.05) shrink(bigger);
            else if (smaller.size > floor + 0.05) shrink(smaller);
          }
        }
        const after = `${next[i].x.toFixed(2)}:${next[i].y.toFixed(2)}:${next[i].size.toFixed(2)}:${next[i].vertical}|${next[j].x.toFixed(2)}:${next[j].y.toFixed(2)}:${next[j].size.toFixed(2)}:${next[j].vertical}`;
        if (after !== before) changed = true;
      }
    }
    if (!changed) break;
  }
  return next;
}

/** 名稱放在行政區外框中間；中心落在區外就改放代表點，並縮到不超出外框。方向跟整個行政區的形狀走。 */
export function placeDistrictLabel(
  key: string,
  text: string,
  polys: RingPoint[][][],
  fallback: { x: number; y: number },
): SettledLabel {
  const box = labelBox(polys);
  const ring = largestOuter(polys);
  let x = (box.minX + box.maxX) / 2;
  let y = (box.minY + box.maxY) / 2;
  let width = box.width;
  let height = box.height;
  if (!ring || !pointInRing(x, y, ring)) {
    x = fallback.x;
    y = fallback.y;
    width = Math.max(1, 2 * Math.min(Math.max(0, x - box.minX), Math.max(0, box.maxX - x)));
    height = Math.max(1, 2 * Math.min(Math.max(0, y - box.minY), Math.max(0, box.maxY - y)));
  }
  const shape = fitTownLabel(text, box.width, box.height);
  const fitted = fitTownLabel(text, width, height, shape.size, shape.vertical);
  return {
    key,
    role: "town",
    text,
    x,
    y,
    vertical: fitted.vertical,
    size: fitted.size,
    cap: fitted.size,
    tracking: 0,
    stretch: box.height / box.width,
    bounds: { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY },
  };
}

function projectDistrict(polys: [number, number][][][]) {
  return polys
    .map((poly) => poly.map((ring) => ring.map(([lng, lat]) => projectTaiwan(lat, lng))).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

/** 全島區名與縣市名一起排，讓放大後的字盡量不疊在一起。縣市名只縮小、不挪位，虛線起點才不會跑掉。 */
let nationalCache: { towns: SettledLabel[]; counties: SettledLabel[] } | null = null;

export function nationalNameLabels() {
  if (nationalCache) return nationalCache;
  const towns = DISTRICTS.filter((district) => !hideTownLabel(district.c, district.n)).map((district) => {
    const text = district.n.replace(/(區|鄉|鎮|市)$/, "");
    return placeDistrictLabel(
      `${district.c}-${district.n}`,
      text,
      projectDistrict(district.p),
      projectTaiwan(district.l[1], district.l[0]),
    );
  });
  const counties = taiwanCountyLabels().map((county) => ({
    key: county.name,
    role: "county" as const,
    text: county.text,
    x: county.x,
    y: county.y,
    vertical: false,
    size: 22 * county.scale,
    cap: 22 * county.scale,
    tracking: 0.08,
    stretch: 1,
  }));
  const settled = settleLabels([...towns, ...counties]);
  nationalCache = {
    towns: settled.filter((label) => label.role === "town"),
    counties: settled.filter((label) => label.role === "county"),
  };
  return nationalCache;
}
