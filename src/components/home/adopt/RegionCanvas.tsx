import { useMemo } from "react";
import { MAP_SIZE, mapPoint, regionSpec, type RegionId } from "@/lib/adopt-map";
import { countyLabelSize, countyLabelText, pickCountyLabel, type LabelPoly } from "@/lib/geo/county-label";
import { COUNTIES, COUNTY_TONE, countiesIn, districtsIn, type Polygon, type Ring } from "@/lib/geo/region-bounds";
import styles from "./adoptMap.module.css";

function projectPoint(region: RegionId, lng: number, lat: number, city: string) {
  return mapPoint(region, lat, lng, city);
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

function ringPoints(region: RegionId, ring: Ring, city: string) {
  return ring.map(([lng, lat]) => projectPoint(region, lng, lat, city));
}

function projectPolys(region: RegionId, city: string, polys: Polygon[]): LabelPoly[] {
  return polys
    .map((poly) => poly.map((ring) => ringPoints(region, ring, city)).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

type Props = { region: RegionId; variant?: "full" | "mini" };

export default function RegionCanvas({ region, variant = "full" }: Props) {
  const size = MAP_SIZE[region];
  const full = variant === "full";
  const cities = regionSpec(region).cities;
  const counties = countiesIn(cities);
  const districts = full ? districtsIn(cities) : [];
  const countyLabels = useMemo(() => {
    if (!full) return [];
    const names = regionSpec(region).cities;
    const here = countiesIn(names);
    const towns = districtsIn(names);
    return here.map((county) => {
      const own = projectPolys(region, county.n, county.p);
      const foreignNames = region === "islands"
        ? here.filter((item) => item.n !== county.n)
        : COUNTIES.filter((item) => item.n !== county.n && !["澎湖縣", "金門縣", "連江縣"].includes(item.n));
      const foreign = foreignNames.flatMap((item) => projectPolys(region, item.n, item.p));
      const spots = towns.filter((town) => town.c === county.n).map((town) => projectPoint(region, town.l[0], town.l[1], town.c));
      const { hw, hh } = countyLabelSize(county.n);
      return { name: county.n, text: countyLabelText(county.n), ...pickCountyLabel({ own, foreign, towns: spots, width: size.width, height: size.height, hw, hh }) };
    });
  }, [full, region, size.height, size.width]);
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
          {countyLabels.map((county) => (
            <text key={county.name} x={county.x} y={county.y} textAnchor="middle" dominantBaseline="central" className={styles.cityMark} style={{ fontSize: `${Math.round(22 * county.scale)}px` }}>{county.text}</text>
          ))}
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
