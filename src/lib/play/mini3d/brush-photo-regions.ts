export type PhotoPoint = { x: number; y: number };
type Zone = PhotoPoint & { rx: number; ry: number };

export const lipZone = { x: .667, y: .592, rx: .075, ry: .048 };
export const noseZone = { x: .441, y: .547, rx: .067, ry: .043 };

// Six scoring patches on the visible teeth. The long canine spans two patches.
const zones: Zone[] = [
  { x: .548, y: .596, rx: .010, ry: .009 },
  { x: .568, y: .570, rx: .011, ry: .012 },
  { x: .572, y: .598, rx: .008, ry: .014 },
  { x: .596, y: .573, rx: .011, ry: .011 },
  { x: .624, y: .565, rx: .012, ry: .011 },
  { x: .652, y: .555, rx: .011, ry: .011 },
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
