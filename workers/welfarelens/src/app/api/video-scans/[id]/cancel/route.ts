import {videoApi} from '../../../../../server/video/api';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){return videoApi.cancel(request,(await params).id);}
