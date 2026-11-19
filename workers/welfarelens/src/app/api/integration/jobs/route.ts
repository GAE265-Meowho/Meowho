import {integrationApi} from '../../../../server/integration';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(r:Request){return integrationApi(r,'POST');}
