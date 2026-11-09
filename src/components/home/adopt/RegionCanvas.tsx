import { landmarkDots, MAP_SIZE, project, regionSpec, type LandmarkKind, type RegionId } from "@/lib/adopt-map";
import { COUNTY_TONE, countiesIn, districtsIn, type Polygon, type Ring } from "@/lib/geo/region-bounds";
import styles from "./adoptMap.module.css";

function Mark({ kind }: { kind: LandmarkKind }) {
  switch (kind) {
    case "taipei101":
      return (
        <g>
          <rect x="-5" y="-28" width="10" height="30" rx="1" fill="var(--ink)" />
          <rect x="-3" y="-36" width="6" height="8" fill="var(--ink)" />
          <rect x="-4" y="-22" width="8" height="2" fill="var(--yellow)" />
          <rect x="-4" y="-16" width="8" height="2" fill="var(--yellow)" />
          <rect x="-4" y="-10" width="8" height="2" fill="var(--yellow)" />
        </g>
      );
    case "fort":
      return (
        <g>
          <rect x="-12" y="-8" width="24" height="16" fill="var(--orange-soft)" stroke="var(--caramel)" />
          <polygon points="-14,-8 0,-20 14,-8" fill="var(--caramel)" />
          <rect x="-3" y="-2" width="6" height="10" fill="var(--caramel-deep)" />
        </g>
      );
    case "harbor":
      return (
        <g>
          <rect x="-3" y="-22" width="6" height="22" fill="var(--ink-soft)" />
          <polygon points="-6,-22 0,-30 6,-22" fill="var(--yellow)" />
          <path d="M-16 4c4-4 8-4 12 0s8 4 16 0" fill="none" stroke="var(--map-sea-deep)" strokeWidth="2" />
        </g>
      );
    case "temple":
      return (
        <g>
          <path d="M-16 0c4-8 8-8 16 0 8-8 12-8 16 0v8h-32z" fill="var(--caramel)" />
          <rect x="-12" y="6" width="24" height="10" fill="var(--orange-soft)" />
        </g>
      );
    case "turtle":
      return (
        <g>
          <ellipse cx="0" cy="2" rx="16" ry="9" fill="var(--map-hill)" stroke="var(--mint-soft)" />
          <circle cx="14" cy="0" r="5" fill="var(--map-hill)" />
        </g>
      );
    case "reed":
      return (
        <g>
          <ellipse cx="0" cy="6" rx="16" ry="5" fill="var(--map-sea-deep)" />
          <path d="M-8 6 V-10 M-2 6 V-16 M4 6 V-12 M10 6 V-8" stroke="var(--map-hill)" strokeWidth="2" />
        </g>
      );
    case "lake":
      return (
        <g>
          <ellipse cx="0" cy="2" rx="16" ry="9" fill="var(--map-sea-deep)" />
          <circle cx="8" cy="-2" r="4" fill="var(--yellow)" />
        </g>
      );
    case "buddha":
      return (
        <g>
          <circle cx="0" cy="-8" r="6" fill="var(--orange-soft)" />
          <path d="M-10 8c0-8 4-10 10-10s10 2 10 10z" fill="var(--caramel)" />
        </g>
      );
    case "castle":
      return (
        <g>
          <path d="M-14 8 V-6 h6 V-12 h6 V-6 h8 V8z" fill="var(--coat-cream)" stroke="var(--caramel)" />
        </g>
      );
    case "tower":
      return (
        <g>
          <rect x="-5" y="-26" width="10" height="32" fill="var(--ink)" />
          <rect x="-7" y="-8" width="14" height="4" fill="var(--yellow)" />
        </g>
      );
    case "beach":
      return (
        <g>
          <path d="M-16 8c5-5 10-5 16 0s10 5 16 0" fill="none" stroke="var(--map-sea-deep)" strokeWidth="2" />
          <path d="M-2 6 V-12" stroke="var(--caramel)" strokeWidth="2" />
          <path d="M-2-12c8 2 10 8 8 12" fill="var(--yellow)" />
        </g>
      );
    case "mountain":
      return (
        <g>
          <polygon points="-16,8 0,-16 8,8" fill="var(--map-hill)" />
          <polygon points="-2,8 10,-8 18,8" fill="var(--mint-soft)" />
          <rect x="-8" y="2" width="8" height="4" rx="1" fill="var(--caramel)" />
        </g>
      );
    case "gorge":
      return (
        <g>
          <polygon points="-16,8 -8,-16 -2,8" fill="var(--coat-gray)" />
          <polygon points="2,8 8,-18 16,8" fill="var(--coat-gray-deep)" />
          <path d="M-2 8 V-4" stroke="var(--map-sea-deep)" strokeWidth="3" />
        </g>
      );
    case "bay":
      return (
        <g>
          <path d="M-16 4a16 10 0 0 1 32 0" fill="var(--map-sea-deep)" />
          <path d="M-14 6h28" stroke="var(--map-land)" strokeWidth="3" />
        </g>
      );
    case "arch":
      return (
        <g>
          <path d="M-14 8 V0 a14 12 0 0 1 28 0 V8 h-6 V2 a8 8 0 0 0-16 0 V8z" fill="var(--coat-gray)" />
        </g>
      );
    case "balloon":
      return (
        <g>
          <ellipse cx="0" cy="-8" rx="8" ry="10" fill="var(--yellow)" stroke="var(--yellow-deep)" />
          <path d="M-3 2h6l-1 6h-4z" fill="var(--caramel)" />
          <path d="M-3 2 L0-2 L3 2" fill="none" stroke="var(--ink)" />
        </g>
      );
    case "bridge":
      return (
        <g>
          <path d="M-18 4c6-10 12-10 18 0s12 10 18 0" fill="none" stroke="var(--caramel)" strokeWidth="3" />
          <path d="M-12 6 V-2 M12 6 V-2" stroke="var(--ink-soft)" strokeWidth="2" />
        </g>
      );
    case "lion":
      return (
        <g>
          <circle cx="0" cy="0" r="8" fill="var(--orange-soft)" />
          <circle cx="0" cy="0" r="12" fill="none" stroke="var(--caramel)" strokeWidth="3" />
          <circle cx="-3" cy="-1" r="1" fill="var(--ink)" />
          <circle cx="3" cy="-1" r="1" fill="var(--ink)" />
        </g>
      );
    case "glow":
      return (
        <g>
          <path d="M-16 6c4-3 8-3 12 0s8 3 16 0v6h-28z" fill="var(--map-land)" />
          <circle cx="-6" cy="2" r="1.4" fill="var(--map-sea-deep)" />
          <circle cx="2" cy="4" r="1.4" fill="var(--map-sea-deep)" />
          <circle cx="8" cy="2" r="1.4" fill="var(--map-sea-deep)" />
        </g>
      );
    default:
      return null;
  }
}

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
            const at = projectPoint(region, county.l[0], county.l[1], county.n);
            return <text key={county.n} x={at.x} y={at.y} textAnchor="middle" className={styles.cityMark}>{shortCity(county.n)}</text>;
          })}
        </g>
      )}
      {full && (
        <g transform={`translate(${size.width - 36} ${size.height - 36})`}>
          <polygon points="0,-16 6,10 -6,10" fill="var(--caramel)" />
        </g>
      )}
      {full && landmarkDots(region).map((mark) => (
        <g key={mark.id} transform={`translate(${mark.x} ${mark.y})`} opacity="0.95">
          <Mark kind={mark.kind} />
        </g>
      ))}
    </svg>
  );
}
