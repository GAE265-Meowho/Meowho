// 虛擬體驗家具固態夾制：不穿牆、落地件互不重疊（AABB；session 用）

export type SolidBody = {
  /** 中心 x／z（房間座標） */
  x: number;
  z: number;
  /** 半寬／半深（軸對齊包圍） */
  hx: number;
  hz: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;

/** 旋轉後的軸對齊半尺寸（w、d 為家具底面積） */
export function rotatedHalfExtents(w: number, d: number, rotDeg: number): { hx: number; hz: number } {
  const rad = (rotDeg * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const s = Math.abs(Math.sin(rad));
  return { hx: r3((w * c + d * s) / 2), hz: r3((w * s + d * c) / 2) };
}

/** SceneBox（牆／家具）→ 地面投影 AABB */
export function boxToSolid(b: { x: number; z: number; sx: number; sz: number; rotY: number }): SolidBody {
  const rotDeg = (-b.rotY * 180) / Math.PI;
  const half = rotatedHalfExtents(b.sx, b.sz, rotDeg);
  return { x: b.x, z: b.z, hx: half.hx, hz: half.hz };
}

function overlap(a: SolidBody, b: SolidBody): boolean {
  return Math.abs(a.x - b.x) < a.hx + b.hx && Math.abs(a.z - b.z) < a.hz + b.hz;
}

/** 沿最小穿透軸推開（一次） */
function separate(a: SolidBody, b: SolidBody): { x: number; z: number } {
  const ox = a.hx + b.hx - Math.abs(a.x - b.x);
  const oz = a.hz + b.hz - Math.abs(a.z - b.z);
  if (ox <= 0 || oz <= 0) return { x: a.x, z: a.z };
  if (ox < oz) {
    const dir = a.x >= b.x ? 1 : -1;
    return { x: r3(a.x + dir * ox), z: a.z };
  }
  const dir = a.z >= b.z ? 1 : -1;
  return { x: a.x, z: r3(a.z + dir * oz) };
}

/**
 * 把候選中心夾進房間，並推離其他落地障礙。
 * roomSize＝[寬 x, 深 z]；inset＝離牆內縮；onSupport 時只夾房間邊界、不與落地障礙互斥。
 */
export function clampFurniturePose(
  candidate: { x: number; z: number },
  half: { hx: number; hz: number },
  roomSize: [number, number],
  obstacles: SolidBody[],
  opts?: { inset?: number; onSupport?: boolean },
): { x: number; z: number } {
  const inset = opts?.inset ?? 0.05;
  const minX = half.hx + inset;
  const maxX = Math.max(minX, roomSize[0] - half.hx - inset);
  const minZ = half.hz + inset;
  const maxZ = Math.max(minZ, roomSize[1] - half.hz - inset);

  let x = r3(Math.min(maxX, Math.max(minX, candidate.x)));
  let z = r3(Math.min(maxZ, Math.max(minZ, candidate.z)));

  if (opts?.onSupport) return { x, z };

  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    const self: SolidBody = { x, z, hx: half.hx, hz: half.hz };
    for (const ob of obstacles) {
      if (!overlap(self, ob)) continue;
      const next = separate(self, ob);
      x = r3(Math.min(maxX, Math.max(minX, next.x)));
      z = r3(Math.min(maxZ, Math.max(minZ, next.z)));
      moved = true;
    }
    if (!moved) break;
  }
  return { x, z };
}
