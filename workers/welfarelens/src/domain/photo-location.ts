import { z } from 'zod';

export const PhotoPointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export type PhotoPoint = z.infer<typeof PhotoPointSchema>;

// Coordinates refer to the upright analysis JPEG, from its top-left corner.
export function photoPoint(x: number, y: number, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
    const point = PhotoPointSchema.safeParse([(x - bounds.left) / bounds.width, (y - bounds.top) / bounds.height]);
    return point.success ? point.data : null;
}
