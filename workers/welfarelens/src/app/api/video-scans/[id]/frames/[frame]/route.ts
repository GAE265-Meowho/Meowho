import {videoApi} from '../../../../../../server/video/api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:Request,c:{params:Promise<{id:string;frame:string}>}){const p=await c.params;return videoApi.frame(r,p.id,p.frame);}
