// 行政區浮水印。嘉義市只留縣市名，不寫東區、西區。
// 台北、基隆、台南、高雄區很多、面積差很大，名稱會疊在一起時，依面積把字縮小。

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
