import {videoApi} from '../../../../server/video/api';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
export async function GET(r:Request,c:Context){return videoApi.status(r,(await c.params).id);}
export async function PUT(r:Request,c:Context){return videoApi.upload(r,(await c.params).id);}
export async function DELETE(r:Request,c:Context){return videoApi.remove(r,(await c.params).id);}
