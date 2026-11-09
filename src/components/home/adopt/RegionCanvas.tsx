import { MAP_SIZE, project, regionSpec, type RegionId } from "@/lib/adopt-map";
import { COUNTY_TONE, countiesIn, districtsIn, type Polygon, type Ring } from "@/lib/geo/region-bounds";
import styles from "./adoptMap.module.css";

function projectPoint(region: RegionId, lng: number, lat: number, city: string) {
  if (city === "金門縣" && lng > 119) {
    return { x: 530 + ((lng - 119.44) / 0.03) * 28, y: 78 - ((lat - 24.99) / 0.02) * 18 };
  }
  return project(region, lat, lng, { city });
}

function ringPath(region: RegionId, ring: Ring, city: string) {
  return `${ring.map(([lng, lat], index) => {
    const p = projectPoint(region, lng, lat, city);
    return `${index === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join("")}Z`;
}

function shapePath(region: RegionId, polys: Polygon[], city: string) {
  return polys.map((poly) => poly.map((ring) => ringPath(region, ring, city)).join("")).join("");
}

function shortTown(name: string) {
  return name.replace(/(區|鄉|鎮|市)$/, "");
}

function seaTitle(region: RegionId, countyName: string, polys: Polygon[]) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const poly of polys) {
    for (const [lng, lat] of poly[0] ?? []) {
      if (countyName === "金門縣" && lng > 119) continue;
      const point = projectPoint(region, lng, lat, countyName);
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
    }
  }
  if (!Number.isFinite(minY)) return null;
  return { x: (minX + maxX) / 2, y: Math.max(22, minY - 36) };
}

function shortCity(name: string) {
  if (name === "連江縣") return "馬祖・連江";
  if (name === "新竹市" || name === "新竹縣" || name === "嘉義市" || name === "嘉義縣") return name;
  return name.replace(/[市縣]$/, "");
}

type Props = { region: RegionId; variant?: "full" | "mini" };

export default function RegionCanvas({ region, variant = "full" }: Props) {
  const size = MAP_SIZE[region];
  const full = variant === "full";
  const cities = regionSpec(region).cities;
  const counties = countiesIn(cities);
  const districts = full ? districtsIn(cities) : [];
  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      className={full ? styles.map : styles.mini}
      preserveAspectRatio={full ? "xMidYMid meet" : "xMidYMid slice"}
      aria-hidden
    >
      <defs>
        <filter id={`map-sticker-${region}`} x="-8%" y="-8%" width="116%" height="116%">
          <feDropShadow dx="0" dy="3" stdDeviation="1.6" floodColor="#c4a07a" floodOpacity="0.28" />
        </filter>
      </defs>
      <rect width={size.width} height={size.height} rx={full ? 0 : 28} fill="var(--map-sea)" />
      <path className={styles.wave} d={`M0 ${size.height * 0.78} C ${size.width * 0.25} ${size.height * 0.72}, ${size.width * 0.55} ${size.height * 0.86}, ${size.width} ${size.height * 0.74}`} />
      <g filter={`url(#map-sticker-${region})`}>
        {districts.map((district, index) => (
          <path
            key={`${district.c}-${district.n}`}
            className={`${styles.piece} ${styles[`tone${COUNTY_TONE[district.c] ?? 0}`]} ${index % 2 ? styles.alt : ""}`}
            d={shapePath(region, district.p, district.c)}
            fillRule="evenodd"
          />
        ))}
        {!full && counties.map((county) => (
          <path key={county.n} className={`${styles.piece} ${styles[`tone${COUNTY_TONE[county.n] ?? 0}`]}`} d={shapePath(region, county.p, county.n)} fillRule="evenodd" />
        ))}
      </g>
      {districts.map((district) => (
        <path key={`halo-${district.c}-${district.n}`} className={styles.districtHalo} d={shapePath(region, district.p, district.c)} fillRule="evenodd" />
      ))}
      {districts.map((district) => (
        <path key={`line-${district.c}-${district.n}`} className={styles.districtEdge} d={shapePath(region, district.p, district.c)} fillRule="evenodd" />
      ))}
      {counties.map((county) => (
        <path key={`edge-${county.n}`} className={styles.countyEdge} d={shapePath(region, county.p, county.n)} fillRule="evenodd" />
      ))}
      {full && (
        <g className={styles.watermarks}>
          {districts.map((district) => {
            const at = projectPoint(region, district.l[0], district.l[1], district.c);
            return <text key={`${district.c}-${district.n}`} x={at.x} y={at.y} textAnchor="middle" className={styles.townMark}>{shortTown(district.n)}</text>;
          })}
          {counties.map((county) => {
            const at = region === "islands"
              ? seaTitle(region, county.n, county.p)
              : projectPoint(region, county.l[0], county.l[1], county.n);
            if (!at) return null;
            return <text key={county.n} x={at.x} y={at.y} textAnchor="middle" className={styles.cityMark}>{shortCity(county.n)}</text>;
          })}
        </g>
      )}
      {full && (
        <g transform={`translate(${size.width - 36} ${size.height - 36})`}>
          <polygon points="0,-16 6,10 -6,10" fill="var(--caramel)" />
        </g>
      )}
    </svg>
  );
}
