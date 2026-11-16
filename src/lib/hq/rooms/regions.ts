// 房間地板網格：找出最大的一塊相連地板。貓只在這塊出生、閒晃，不會出生在被家具圍住的小角落、從此走不出來。

/** walkable：每格 1 能走、0 不能走（j * nx + i）；回傳最大那塊相連（上下左右）的格子編號，由小到大 */
export function mainRegion(walkable: ArrayLike<number>, nx: number): number[] {
  const seen = new Uint8Array(walkable.length);
  let best: number[] = [];
  for (let s = 0; s < walkable.length; s++) {
    if (!walkable[s] || seen[s]) continue;
    const region = [s];
    seen[s] = 1;
    for (let h = 0; h < region.length; h++) {
      const k = region[h], i = k % nx;
      for (const n of [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, k - nx, k + nx]) {
        if (n >= 0 && n < walkable.length && walkable[n] && !seen[n]) { seen[n] = 1; region.push(n); }
      }
    }
    if (region.length > best.length) best = region;
  }
  return best.sort((a, b) => a - b);
}
