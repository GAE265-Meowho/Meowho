"use client";

import { memo, useMemo } from "react";
import { projectTaiwan, TAIWAN_MAP } from "@/lib/adopt-map";
import { taiwanCountyLabels } from "@/lib/geo/county-labels";
import { COUNTY_TONE, COUNTIES, DISTRICTS, type Polygon, type Ring } from "@/lib/geo/region-bounds";
import { hideTownLabel, projectedArea, townFontSizes } from "@/lib/geo/town-label";
import styles from "./adoptMap.module.css";

function ringPath(ring: Ring) {
  return `${ring.map(([lng, lat], index) => {
    const point = projectTaiwan(lat, lng);
    return `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
  }).join("")}Z`;
}

function shapePath(polys: Polygon[]) {
  return polys.map((poly) => poly.map((ring) => ringPath(ring)).join("")).join("");
}

function projectPolys(polys: Polygon[]) {
  return polys
    .map((poly) => poly.map((ring) => ring.map(([lng, lat]) => projectTaiwan(lat, lng))).filter((ring) => ring.length >= 3))
    .filter((poly) => (poly[0]?.length ?? 0) >= 3);
}

function shortTown(name: string) {
  return name.replace(/(區|鄉|鎮|市)$/, "");
}

function CountyArrow({ arrow }: { arrow: { x1: number; y1: number; x2: number; y2: number } }) {
  return <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} />;
}

function TaiwanCanvas({ showTowns }: { showTowns: boolean }) {
  const districts = useMemo(() => DISTRICTS.filter((district) => !hideTownLabel(district.c, district.n)), []);
  const paths = useMemo(() => districts.map((district) => ({
    key: `${district.c}-${district.n}`,
    city: district.c,
    d: shapePath(district.p),
  })), [districts]);
  const edges = useMemo(() => COUNTIES.map((county) => ({
    key: county.n,
    d: shapePath(county.p),
  })), []);
  const towns = useMemo(() => {
    if (!showTowns) return [];
    const items = districts.map((district) => {
      const at = projectTaiwan(district.l[1], district.l[0]);
      return {
        key: `${district.c}-${district.n}`,
        city: district.c,
        text: shortTown(district.n),
        x: at.x,
        y: at.y,
        area: projectedArea(projectPolys(district.p)),
      };
    });
    const sizeByKey = new Map<string, number>();
    const byCity = new Map<string, typeof items>();
    for (const item of items) {
      const group = byCity.get(item.city) ?? [];
      group.push(item);
      byCity.set(item.city, group);
    }
    for (const group of byCity.values()) {
      const fonts = townFontSizes(group);
      group.forEach((item, index) => sizeByKey.set(item.key, fonts[index]));
    }
    return items.map((item) => ({ ...item, size: sizeByKey.get(item.key) ?? 12 }));
  }, [districts, showTowns]);
  const counties = useMemo(() => taiwanCountyLabels(), []);

  return (
    <svg viewBox={`0 0 ${TAIWAN_MAP.width} ${TAIWAN_MAP.height}`} className={styles.map} aria-hidden>
      <rect width={TAIWAN_MAP.width} height={TAIWAN_MAP.height} fill="var(--map-sea)" />
      <g>
        {paths.map((district, index) => (
          <path
            key={district.key}
            className={`${styles.piece} ${styles[`tone${COUNTY_TONE[district.city] ?? 0}`]} ${index % 2 ? styles.alt : ""}`}
            d={district.d}
            fillRule="evenodd"
          />
        ))}
      </g>
      {paths.map((district) => (
        <path key={`line-${district.key}`} className={styles.districtEdge} d={district.d} fillRule="evenodd" />
      ))}
      {edges.map((county) => (
        <path key={`edge-${county.key}`} className={styles.countyEdge} d={county.d} fillRule="evenodd" />
      ))}
      <g className={styles.countyArrow}>
        {counties.map((county) => county.arrow && (
          <CountyArrow key={county.name} arrow={county.arrow} />
        ))}
      </g>
      <g className={styles.watermarks}>
        {showTowns && towns.map((town) => (
          <text key={town.key} x={town.x} y={town.y} textAnchor="middle" className={styles.townMark} style={town.size === 12 ? undefined : { fontSize: `${town.size}px` }}>{town.text}</text>
        ))}
        {counties.map((county) => (
          <text key={county.name} x={county.x} y={county.y} textAnchor="middle" dominantBaseline="central" className={styles.cityMark} style={county.scale === 1 ? undefined : { fontSize: `${Math.round(22 * county.scale)}px` }}>{county.text}</text>
        ))}
      </g>
    </svg>
  );
}

export default memo(TaiwanCanvas);
