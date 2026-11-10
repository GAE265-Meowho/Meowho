// 縣市名放在自己的臨海處；沒有海岸就放在境內離行政區字最遠的空位。
// 名字的方框不能落到其他縣市裡。
// 新竹縣、台中市再沿指定方向挪到更靠近自己的海岸；屏東縣改釘在泰武右邊。

export type LabelPoint = { x: number; y: number };
export type LabelRing = LabelPoint[];
/** 第一圈是外框，後面是洞（例如新北包住台北的那個洞）。 */
export type LabelPoly = LabelRing[];

export function countyLabelText(name: string) {
  if (name === "連江縣") return "馬祖・連江";
  if (name === "新竹市" || name === "新竹縣" || name === "嘉義市" || name === "嘉義縣") return name;
  return name.replace(/[市縣]$/, "");
}

export function countyLabelSize(name: string) {
  const text = countyLabelText(name);
  return { hw: Math.max(28, text.length * 14), hh: 14 };
}

function pointInRing(x: number, y: number, ring: LabelRing) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    const cross = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 1e-6) + a.x;
    if (cross) hit = !hit;
  }
  return hit;
}

function insidePoly(x: number, y: number, poly: LabelPoly) {
  const [outer, ...holes] = poly;
  if (!outer || outer.length < 3 || !pointInRing(x, y, outer)) return false;
  return holes.every((hole) => hole.length < 3 || !pointInRing(x, y, hole));
}

export function insideCounties(x: number, y: number, polys: LabelPoly[]) {
  return polys.some((poly) => insidePoly(x, y, poly));
}

export function edgeClearance(x: number, y: number, polys: LabelPoly[]) {
  let min = Infinity;
  for (const poly of polys) {
    const ring = poly[0];
    if (!ring || ring.length < 2) continue;
    for (let index = 0; index < ring.length; index++) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
      const d = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
      if (d < min) min = d;
    }
  }
  return min;
}

function ringArea(ring: LabelRing) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return Math.abs(area) / 2;
}

function footprint(x: number, y: number, hw: number, hh: number): LabelPoint[] {
  const spots: LabelPoint[] = [];
  for (const gx of [-1, -0.5, 0, 0.5, 1]) {
    for (const gy of [-1, -0.5, 0, 0.5, 1]) spots.push({ x: x + gx * hw, y: y + gy * hh });
  }
  return spots;
}

function onCanvas(points: LabelPoint[], width: number, height: number) {
  return points.every((point) => point.x >= 12 && point.y >= 18 && point.x <= width - 12 && point.y <= height - 18);
}

type Options = {
  own: LabelPoly[];
  foreign: LabelPoly[];
  towns: LabelPoint[];
  width: number;
  height: number;
  hw: number;
  hh: number;
};

function coastSpot(own: LabelPoly[], foreign: LabelPoly[], width: number, height: number, hw: number, hh: number) {
  const outers = own.map((poly) => poly[0]).filter((ring): ring is LabelRing => !!ring && ring.length >= 3);
  if (!outers.length) return null;
  const largest = Math.max(...outers.map(ringArea));
  const coasts = outers.filter((ring) => ringArea(ring) >= largest * 0.18);
  const found: { x: number; y: number; dist: number; clear: number }[] = [];
  for (const ring of coasts) {
    const step = Math.max(1, Math.floor(ring.length / 32));
    for (let index = 0; index < ring.length; index += step) {
      const point = ring[index];
      const next = ring[(index + step) % ring.length];
      const ex = next.x - point.x;
      const ey = next.y - point.y;
      const el = Math.hypot(ex, ey) || 1;
      const n1 = { x: -ey / el, y: ex / el };
      const n2 = { x: ey / el, y: -ex / el };
      const out1 = !insideCounties(point.x + n1.x * 6, point.y + n1.y * 6, own);
      const out2 = !insideCounties(point.x + n2.x * 6, point.y + n2.y * 6, own);
      const dirs = out1 && out2 ? [n1, n2] : out1 ? [n1] : out2 ? [n2] : [];
      for (const away of dirs) {
        const reach = Math.max(hw, hh);
        for (const dist of [reach + 6, reach + 20, reach + 36]) {
          const x = point.x + away.x * dist;
          const y = point.y + away.y * dist;
          const box = footprint(x, y, hw + 4, hh + 4);
          if (!onCanvas(box, width, height)) continue;
          if (box.some((spot) => insideCounties(spot.x, spot.y, own) || insideCounties(spot.x, spot.y, foreign))) continue;
          const clear = foreign.length ? edgeClearance(x, y, foreign) : 400;
          if (clear < 20) continue;
          found.push({ x, y, dist, clear });
        }
      }
    }
  }
  found.sort((a, b) => b.clear - a.clear || a.dist - b.dist);
  return found[0] ?? null;
}

function inlandSpot(own: LabelPoly[], foreign: LabelPoly[], towns: LabelPoint[], width: number, height: number, hw: number, hh: number) {
  const outers = own.map((poly) => poly[0]).filter((ring): ring is LabelRing => !!ring && ring.length >= 3);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of outers) {
    for (const point of ring) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    }
  }
  let inland: { x: number; y: number; score: number } | null = null;
  for (let y = minY + 6; y <= maxY - 6; y += 10) {
    for (let x = minX + 6; x <= maxX - 6; x += 10) {
      if (x < 4 || y < 8 || x > width - 4 || y > height - 8) continue;
      if (!insideCounties(x, y, own) || insideCounties(x, y, foreign)) continue;
      if (footprint(x, y, hw, hh).some((spot) => insideCounties(spot.x, spot.y, foreign))) continue;
      const score = towns.length ? Math.min(...towns.map((town) => Math.hypot(town.x - x, town.y - y))) : 40;
      if (!inland || score > inland.score) inland = { x, y, score };
    }
  }
  return inland;
}

/** 名字中心與縮放。有自己的海就貼在海岸外；否則在自己境內、離行政區字最遠的空位。方框不進其他縣市。 */
export function pickCountyLabel(options: Options): LabelPoint & { scale: number } {
  const { own, foreign, towns, width, height, hw, hh } = options;
  const outers = own.map((poly) => poly[0]).filter((ring) => ring && ring.length >= 3);
  if (!outers.length) return { x: width / 2, y: height / 2, scale: 1 };
  for (const scale of [1, 0.82, 0.66, 0.52]) {
    const sea = coastSpot(own, foreign, width, height, hw * scale, hh * scale);
    if (sea) return { x: sea.x, y: sea.y, scale };
  }
  for (const scale of [1, 0.82, 0.66, 0.52]) {
    const inland = inlandSpot(own, foreign, towns, width, height, hw * scale, hh * scale);
    if (inland) return { x: inland.x, y: inland.y, scale };
  }
  const fallback = inlandSpot(own, foreign, towns, width, height, 8, 6);
  return fallback ? { ...fallback, scale: 0.52 } : { x: width / 2, y: height / 2, scale: 1 };
}

const CLOSER: Record<string, { x: number; y: number }> = {
  新竹縣: { x: -1, y: 1 },
  台中市: { x: 1, y: -1 },
};

/** 往指定方向（含左右約 40px）找到更靠近自己縣市、方框仍不進任何縣市的位置。 */
export function pullCountyLabel(
  at: LabelPoint & { scale: number },
  toward: { x: number; y: number },
  options: Options,
): LabelPoint & { scale: number } {
  const len = Math.hypot(toward.x, toward.y) || 1;
  const ux = toward.x / len;
  const uy = toward.y / len;
  const hw = options.hw * at.scale;
  const hh = options.hh * at.scale;
  let best = at;
  let bestClear = edgeClearance(at.x, at.y, options.own);
  for (let dx = -150; dx <= 150; dx += 4) {
    for (let dy = -150; dy <= 150; dy += 4) {
      if (Math.sign(dx) !== Math.sign(toward.x) || Math.sign(dy) !== Math.sign(toward.y)) continue;
      const along = dx * ux + dy * uy;
      const side = Math.abs(dx * uy - dy * ux);
      if (along < 16 || along > 160 || side > 40) continue;
      const x = at.x + dx;
      const y = at.y + dy;
      const box = footprint(x, y, hw + 4, hh + 4);
      if (!onCanvas(box, options.width, options.height)) continue;
      if (box.some((spot) => insideCounties(spot.x, spot.y, options.own) || insideCounties(spot.x, spot.y, options.foreign))) continue;
      const clear = edgeClearance(x, y, options.own);
      if (clear < bestClear - 0.5) {
        best = { x, y, scale: at.scale };
        bestClear = clear;
      }
    }
  }
  return best;
}

export type NamedTown = { name: string; x: number; y: number };

/** 自動落點之後的手動修正。屏東釘在泰武右邊（南區地圖再往右沒有畫出台東）。 */
export function finalizeCountyLabel(
  name: string,
  auto: LabelPoint & { scale: number },
  options: Options,
  towns: NamedTown[],
): LabelPoint & { scale: number } {
  if (name === "屏東縣") {
    const taiwu = towns.find((town) => town.name === "泰武鄉");
    if (taiwu) return { x: taiwu.x + 68, y: taiwu.y, scale: 1 };
  }
  const toward = CLOSER[name];
  if (toward) return pullCountyLabel(auto, toward, options);
  return auto;
}
