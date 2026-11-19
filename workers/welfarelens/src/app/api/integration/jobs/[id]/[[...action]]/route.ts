import {integrationApi} from '../../../../../../server/integration';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function handle(r:Request,c:{params:Promise<{id:string;action?:string[]}>}){const p=await c.params,a=p.action??[];if(a.length>2)return Response.json({error:'Not found'},{status:404});return integrationApi(r,r.method,p.id,a[0],a[1]);}
export {handle as GET,handle as POST,handle as PUT,handle as DELETE};