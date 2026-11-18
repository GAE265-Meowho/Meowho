import { createImageEditHandler } from '../../../server/image-edit.ts';
export const runtime = 'nodejs';
export const maxDuration = 180;
export const POST = createImageEditHandler(process.env);
