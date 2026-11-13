"use client";

import { memo, useMemo } from "react";
import { projectTaiwan, TAIWAN_MAP } from "@/lib/adopt-map";
import { taiwanCountyLabels } from "@/lib/geo/county-labels";
import { COUNTY_TONE, COUNTIES, DISTRICTS, type Polygon, type Ring } from "@/lib/geo/region-bounds";
import { hideTownLabel, nationalNameLabels } from "@/lib/geo/town-label";
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

function countyArrow(
  county: { x: number; y: number; text: string; scale: number; arrow: { x1: number; y1: number; x2: number; y2: number } | null },
  mark: { size: number } | undefined,
) {
  if (!county.arrow) return null;
  if (!mark || Math.abs(mark.size - 22 * county.scale) < 0.4) return county.arrow;
  const dx = county.arrow.x2 - county.x;
  const dy = county.arrow.y2 - county.y;
  const len = Math.hypot(dx, dy) || 1;
  if (len < 4) return null;
  const ux = dx / len;
  const uy = dy / len;
  const chars = Math.max([...county.text].length, 1);
  const halfW = (chars * mark.size + Math.max(0, chars - 1) * mark.size * 0.08) / 2;
  const halfH = mark.size * 1.12 / 2;
  const boxExit = Math.min(
    Math.abs(ux) > 1e-4 ? halfW / Math.abs(ux) : Infinity,
    Math.abs(uy) > 1e-4 ? halfH / Math.abs(uy) : Infinity,
  );
  const leave = Math.min(boxExit, Math.max(0, len - 12));
  return { x1: county.x + ux * leave, y1: county.y + uy * leave, x2: county.arrow.x2, y2: county.arrow.y2 };
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
  const counties = useMemo(() => taiwanCountyLabels(), []);
  const placed = useMemo(() => (showTowns ? nationalNameLabels() : null), [showTowns]);
  const towns = placed?.towns ?? [];
  const countyMarks = new Map((placed?.counties ?? counties.map((county) => ({
    key: county.name,
    text: county.text,
    x: county.x,
    y: county.y,
    size: 22 * county.scale,
    vertical: false,
  }))).map((label) => [label.key, label]));

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
        {counties.map((county) => {
          const mark = countyMarks.get(county.name);
          const arrow = countyArrow(county, mark);
          return arrow && <CountyArrow key={county.name} arrow={arrow} />;
        })}
      </g>
      <g className={styles.watermarks}>
        {showTowns && towns.map((town) => (
          <text key={town.key} textAnchor="middle" className={styles.townMark} style={{ fontSize: `${town.size}px` }}>
            {town.vertical ? town.text.split("").map((char, index) => (
              <tspan key={char + index} x={town.x} y={town.y + (index - (town.text.length - 1) / 2) * town.size} dominantBaseline="central">{char}</tspan>
            )) : (
              <tspan x={town.x} y={town.y} dominantBaseline="central">{town.text}</tspan>
            )}
          </text>
        ))}
        {counties.map((county) => {
          const mark = countyMarks.get(county.name);
          const size = mark?.size ?? 22 * county.scale;
          return (
            <text key={county.name} x={mark?.x ?? county.x} y={mark?.y ?? county.y} textAnchor="middle" dominantBaseline="central" className={styles.cityMark} style={{ fontSize: `${size}px` }}>{county.text}</text>
          );
        })}
      </g>
    </svg>
  );
}

export default memo(TaiwanCanvas);
