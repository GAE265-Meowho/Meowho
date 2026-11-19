import {videoEvidenceApi} from '../../../../../server/video/evidence-api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){const p=await c.params;return videoEvidenceApi(r,p.id,'crops');}
export const POST=GET;
