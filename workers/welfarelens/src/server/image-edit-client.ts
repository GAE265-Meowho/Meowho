import {z} from 'zod';
import {boundedJson} from './bounded-json.ts';

export type ImageEditEnv=Record<string,string|undefined>;
export function imageEditConfig(env:ImageEditEnv){
 const endpoint=new URL(env.AZURE_IMAGE_ENDPOINT??'');
 if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.openai.azure.com')||endpoint.port||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['/','/openai/v1','/openai/v1/'].includes(endpoint.pathname)||!env.AZURE_IMAGE_API_KEY||!env.AZURE_IMAGE_DEPLOYMENT)throw Error('configuration');
 return {url:new URL('/openai/v1/images/edits',endpoint).toString(),key:env.AZURE_IMAGE_API_KEY,deployment:env.AZURE_IMAGE_DEPLOYMENT};
}
export async function editAzureImage(config:ReturnType<typeof imageEditConfig>,image:Buffer,prompt:string,size:string,signal:AbortSignal,request:typeof fetch=fetch,quality:'low'|'high'='low',mask?:Buffer){
 const form=new FormData();
 form.set('model',config.deployment);
 form.set('image',new Blob([new Uint8Array(image)],{type:'image/jpeg'}),'room.jpg');
 if(mask)form.set('mask',new Blob([new Uint8Array(mask)],{type:'image/png'}),'mask.png');
 for(const [k,v] of Object.entries({prompt,n:'1',size,quality,output_format:'png'}))form.set(k,v);
 const response=await request(config.url,{method:'POST',headers:{'api-key':config.key},body:form,redirect:'error',signal});
 if(!response.ok){void response.body?.cancel().catch(()=>{});return {ok:false as const,status:response.status};}
 const output=z.object({data:z.array(z.object({b64_json:z.string().min(1).max(15000000)})).length(1),usage:z.object({input_tokens:z.number().nonnegative().optional(),output_tokens:z.number().nonnegative().optional(),total_tokens:z.number().nonnegative().optional()}).optional()}).parse(await boundedJson(response,16000000,signal));
 const encoded=output.data[0].b64_json;
 if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw Error('invalid output');
 const png=Buffer.from(encoded,'base64');
 if(png.length<33||png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||png.toString('ascii',12,16)!=='IHDR')throw Error('invalid output');
 const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
 if(width<1||height<1||width>4096||height>4096||width*height>9000000)throw Error('invalid dimensions');
 return {ok:true as const,png,encoded,width,height,usage:output.usage??null};
}
