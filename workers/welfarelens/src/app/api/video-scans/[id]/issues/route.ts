import {videoApi} from '../../../../../server/video/api';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:Request,c:{params:Promise<{id:string}>}){return videoApi.issues(r,(await c.params).id);}
