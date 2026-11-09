// 把 taiwan-atlas 的縣市／鄉鎮市區界（TopoJSON，內政部圖資簡化版）收成地圖用的環。
// 來源：https://github.com/dkaoster/taiwan-atlas （counties-10t / towns-10t）
// 只留縣市＋行政區名稱與邊界，沒有路名、門牌。
import { readFileSync, writeFileSync } from "node:fs";

const countiesTopo = JSON.parse(readFileSync("/tmp/twgeo/counties.json", "utf8"));
const townsTopo = JSON.parse(readFileSync("/tmp/twgeo/towns.json", "utf8"));

function decodeArcs(topology) {
  const { scale, translate } = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
}

function stitch(arcs, indexes) {
  const points = [];
  for (const raw of indexes) {
    const reversed = raw < 0;
    const arc = reversed ? arcs[~raw].slice().reverse() : arcs[raw];
    const slice = points.length ? arc.slice(1) : arc;
    for (const point of slice) points.push(point);
  }
  if (points.length && (points[0][0] !== points.at(-1)[0] || points[0][1] !== points.at(-1)[1])) points.push(points[0]);
  return points;
}

function polygonsOf(geometry, arcs) {
  if (!geometry) return [];
  const polys = geometry.type === "Polygon" ? [geometry.arcs] : geometry.type === "MultiPolygon" ? geometry.arcs : [];
  return polys.map((poly) => poly.map((ring) => stitch(arcs, ring)));
}

function distToSeg(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function simplify(points, eps) {
  if (points.length < 5) return points;
  const closed = points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
  const open = closed ? points.slice(0, -1) : points.slice();
  const kept = douglas(open, eps);
  if (closed) kept.push(kept[0]);
  return kept.length >= 4 ? kept : points;
}

function douglas(points, eps) {
  if (points.length < 3) return points;
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = distToSeg(points[i], points[0], points.at(-1));
    if (d > max) {
      max = d;
      index = i;
    }
  }
  if (max > eps) {
    const left = douglas(points.slice(0, index + 1), eps);
    const right = douglas(points.slice(index), eps);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points.at(-1)];
}

function quantize(points) {
  return points.map(([lng, lat]) => [Math.round(lng * 10000) / 10000, Math.round(lat * 10000) / 10000]);
}

function area(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum / 2);
}

function inside(lng, lat, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const cross = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (cross) hit = !hit;
  }
  return hit;
}

function labelOf(rings) {
  const outer = rings[0];
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < outer.length - 1; i++) {
    const [x1, y1] = outer[i];
    const [x2, y2] = outer[i + 1];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  let lng = a ? cx / (3 * a) : outer[0][0];
  let lat = a ? cy / (3 * a) : outer[0][1];
  if (inside(lng, lat, outer)) return [lng, lat];
  let best = outer[0];
  let bestD = Infinity;
  const lngs = outer.map((p) => p[0]);
  const lats = outer.map((p) => p[1]);
  const minX = Math.min(...lngs);
  const maxX = Math.max(...lngs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);
  for (let gy = 1; gy < 8; gy++) {
    for (let gx = 1; gx < 8; gx++) {
      const x = minX + ((maxX - minX) * gx) / 8;
      const y = minY + ((maxY - minY) * gy) / 8;
      if (!inside(x, y, outer)) continue;
      const d = (x - lng) ** 2 + (y - lat) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [x, y];
      }
    }
  }
  return best;
}

function pack(geometry, arcs, eps) {
  return polygonsOf(geometry, arcs)
    .map((poly) => poly.map((ring) => quantize(simplify(ring, eps))).filter((ring) => ring.length >= 4))
    .filter((poly) => poly.length && area(poly[0]) > 1e-6)
    .sort((a, b) => area(b[0]) - area(a[0]));
}

const countyArcs = decodeArcs(countiesTopo);
const townArcs = decodeArcs(townsTopo);
const countyGeoms = countiesTopo.objects.counties.geometries;
const townGeoms = townsTopo.objects.towns.geometries;

const counties = countyGeoms.map((geom) => {
  const polys = pack(geom, countyArcs, 0.008);
  const [lng, lat] = labelOf(polys[0]);
  return { n: geom.properties.COUNTYNAME.replaceAll("臺", "台"), l: [Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000], p: polys };
});

const districts = townGeoms.map((geom) => {
  const polys = pack(geom, townArcs, 0.0032);
  const [lng, lat] = labelOf(polys[0]);
  return {
    c: geom.properties.COUNTYNAME.replaceAll("臺", "台"),
    n: geom.properties.TOWNNAME.replaceAll("臺", "台"),
    l: [Math.round(lng * 1000) / 1000, Math.round(lat * 1000) / 1000],
    p: polys,
  };
});

const out = { source: "taiwan-atlas counties-10t / towns-10t（內政部縣市、鄉鎮市區界簡化）", counties, districts };
const file = "src/lib/geo/region-bounds.json";
writeFileSync(file, JSON.stringify(out));
const bytes = Buffer.byteLength(JSON.stringify(out));
console.log(`counties ${counties.length} districts ${districts.length} bytes ${bytes}`);
for (const city of ["台中市", "苗栗縣", "澎湖縣", "連江縣"]) {
  const shapes = districts.filter((d) => d.c === city);
  console.log(city, shapes.length, shapes.slice(0, 3).map((d) => d.n).join("、"));
}
