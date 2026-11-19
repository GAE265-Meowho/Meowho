export type Point = [number, number];
export type Box = [number, number, number, number];
export type Corner = "nw" | "ne" | "sw" | "se";
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
const MIN = 0.025;
export function pointOnPhoto(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): Point {
  return [
    clamp((x - rect.left) / rect.width),
    clamp((y - rect.top) / rect.height),
  ];
}
export function drawBox(start: Point, end: Point): Box | null {
  const box: Box = [
    clamp(Math.min(start[0], end[0])),
    clamp(Math.min(start[1], end[1])),
    clamp(Math.max(start[0], end[0])),
    clamp(Math.max(start[1], end[1])),
  ];
  return box[2] - box[0] >= MIN && box[3] - box[1] >= MIN ? box : null;
}
export function moveBox(box: Box, delta: Point): Box {
  const x = clamp(delta[0], -box[0], 1 - box[2]),
    y = clamp(delta[1], -box[1], 1 - box[3]);
  return [box[0] + x, box[1] + y, box[2] + x, box[3] + y];
}
export function resizeBox(box: Box, corner: Corner, point: Point): Box {
  const next: Box = [...box];
  if (corner.includes("w"))
    next[0] = clamp(point[0], 0, box[2] - Math.min(MIN, box[2] - box[0]));
  else next[2] = clamp(point[0], box[0] + Math.min(MIN, box[2] - box[0]), 1);
  if (corner.includes("n"))
    next[1] = clamp(point[1], 0, box[3] - Math.min(MIN, box[3] - box[1]));
  else next[3] = clamp(point[1], box[1] + Math.min(MIN, box[3] - box[1]), 1);
  return next;
}
