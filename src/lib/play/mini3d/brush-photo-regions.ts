import type { BrushResult } from "./brush-rules";

export type PhotoPoint = { x: number; y: number };
type Zone = PhotoPoint & { rx: number; ry: number };

export const lipZone = { x: .667, y: .592, rx: .075, ry: .048 };


// Approximate outer tooth and gum-edge patches on the AI image. The canine has two nearby targets.
const zones: Zone[] = [
  { x: .548, y: .589, rx: .010, ry: .009 },
  { x: .568, y: .563, rx: .011, ry: .012 },
  { x: .575, y: .581, rx: .009, ry: .010 },
  { x: .596, y: .567, rx: .011, ry: .011 },
  { x: .624, y: .560, rx: .012, ry: .011 },
  { x: .652, y: .551, rx: .011, ry: .011 },
];

export function toothZones(count: number) {
  return count === 4 ? zones.slice(1, 5) : count === 6 ? zones : [];
}

export function photoPoint(x: number, y: number, rect: Pick<DOMRect, "left" | "top" | "width" | "height">): PhotoPoint {
  return { x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
}

export function inPhotoZone(point: PhotoPoint, zone: Zone) {
  return Math.hypot((point.x - zone.x) / zone.rx, (point.y - zone.y) / zone.ry) <= 1;
}

export function photoTarget(point: PhotoPoint, count: number) {
  const index = toothZones(count).findIndex(zone => inPhotoZone(point, zone));
  return index < 0 ? null : index;
}

export function photoMouth(distance: number, blocked: boolean) {
  if (blocked) return "closed";
  return distance >= .04 ? "teeth" : distance >= .012 ? "lift" : "closed";
}

export function photoStroke(previous: PhotoPoint, point: PhotoPoint, count: number) {
  const target = photoTarget(point, count);
  return target !== null && target === photoTarget(previous, count)
    ? Math.hypot((point.x - previous.x) * 1.8, (point.y - previous.y) * 2.4)
    : 0;
}


export const pasteZone = { x: .493, y: .599, rx: .05, ry: .025 };
export const mouthCloseup = { x: .375, y: .483, width: .36, height: .153 };
export const photoSize = { width: 1086, height: 1448 };

export function closeupPoint(x: number, y: number, rect: Parameters<typeof photoPoint>[2]) {
  if (!rect.width || !rect.height) return null;
  const point = photoPoint(x, y, rect);
  if (point.x < 0 || point.y < 0 || point.x > 1 || point.y > 1) return null;
  return { x: mouthCloseup.x + point.x * mouthCloseup.width, y: mouthCloseup.y + point.y * mouthCloseup.height };
}

export function brushPhotoFeedback(remaining: number, struggling: boolean, result: BrushResult | null) {
  if (result?.bitten) return "bitten";
  if (result?.ran) return "ran";
  if (result) return "success";
  if (struggling) return "resisting";
  return remaining <= .3 ? "warning" : "calm";
}
