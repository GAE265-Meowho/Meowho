import { z } from 'zod';
export const ImageResultSchema = z.object({
    imageDataUrl: z.string().max(15000030).regex(/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/),
    mode: z.literal('SIMULATED'), provider: z.literal('azure'), latencyMs: z.number().nonnegative(),
    width: z.number().int().positive().max(4096), height: z.number().int().positive().max(4096),
    requestedSize: z.string().max(30), quality: z.literal('low'),
    changes: z.array(z.object({ rule_id: z.string().max(10), title: z.string().max(120), action: z.string().max(2000) })).max(20),
    disclaimer: z.string().max(500)
});
export type ImageResult = z.infer<typeof ImageResultSchema>;
