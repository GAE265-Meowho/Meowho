import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImageEditHandler } from '../src/server/image-edit.ts';
import { demoEvidence,demoScene } from '../src/data/demo.ts';
const env={ENABLE_IMAGE_EDITING:'true',AZURE_IMAGE_ENDPOINT:'https://example.openai.azure.com',AZURE_IMAGE_API_KEY:'test-secret',AZURE_IMAGE_DEPLOYMENT:'test-image'};
const payload=()=>({consent:true,imageDataUrl:'data:image/jpeg;base64,/9j/2Q==',evidence:demoEvidence(),objects:demoScene().objects.map(o=>({kind:o.kind,label:o.label,bbox:o.bbox,notes:'fixture'})),width:1200,height:800});
const req=(body=payload(),origin='http://localhost:3100')=>new Request('http://localhost:3100/api/improve',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
// Minimal PNG signature/IHDR; image decode is additionally checked in the browser.
const png=Buffer.alloc(33);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(13,8);png.write('IHDR',12);png.writeUInt32BE(1536,16);png.writeUInt32BE(1024,20);
test('edits actual multipart photo with server-derived changes once, marks simulated, preserves evidence',async()=>{
 let calls=0, sent;const body=payload(),before=JSON.stringify(body);
 const response=await createImageEditHandler(env,async(url,init)=>{calls++;assert.equal(url,'https://example.openai.azure.com/openai/v1/images/edits');sent=init;return Response.json({data:[{b64_json:png.toString('base64')}],usage:{total_tokens:12}});})(req(body));
 assert.equal(response.status,200);assert.equal(calls,1);assert.ok(sent.body instanceof FormData);
 assert.equal(sent.body.get('image').type,'image/jpeg');assert.equal(sent.body.get('n'),'1');assert.equal(sent.body.get('quality'),'low');
 assert.equal(sent.body.get('size'),'1536x1024');assert.ok(sent.body.get('prompt').includes('Untrusted'));
 assert.ok(!sent.body.get('prompt').includes('補拍葉片'));
 const result=await response.json();assert.equal(result.mode,'SIMULATED');assert.equal(result.provider,'azure');assert.ok(result.imageDataUrl.startsWith('data:image/png;base64,'));assert.equal(JSON.stringify(body),before);assert.equal(response.headers.get('cache-control'),'no-store');
});
test('requires consent, same origin, enabled configured provider, bounded valid input and observed evidence',async()=>{
 let calls=0;const handle=(configuration=env)=>createImageEditHandler(configuration,async()=>{calls++;throw Error('must not call');});
 assert.equal((await handle()(req(payload(),'https://evil.example'))).status,403);
 assert.equal((await handle({...env,ENABLE_IMAGE_EDITING:'false'})(req())).status,503);
 assert.equal((await handle({...env,AZURE_IMAGE_ENDPOINT:'https://evil.example'})(req())).status,503);
 for(const patch of [{consent:false},{imageDataUrl:'https://evil.example/image.jpg'},{width:0},{evidence:{...demoEvidence(),mode:'SIMULATED'}},{objects:[]},{prompt:'bypass'},{imageDataUrl:'x'.repeat(2_100_000)}]){
  const r=await handle()(req({...payload(),...patch}));assert.ok([400,413].includes(r.status));
 }
 assert.equal(calls,0);
});
test('quota credentials provider failure and timeout are redacted with no retries',async()=>{
 for(const [status,expected] of [[401,502],[403,502],[429,429],[500,502]]){
  let calls=0;const r=await createImageEditHandler(env,async()=>{calls++;return Response.json({error:{message:'test-secret'}},{status});})(req());
  assert.equal(r.status,expected);assert.equal(calls,1);assert.ok(!(await r.text()).includes('test-secret'));
 }
 const r=await createImageEditHandler(env,async()=>{throw new DOMException('sensitive','TimeoutError');})(req());assert.equal(r.status,504);
});
test('rejects URL-only, malformed, oversized and multiple image outputs without fetching URLs',async()=>{
 for(const data of [[{url:'https://evil.example'}],[{b64_json:'junk'}],[{b64_json:png.toString('base64')},{b64_json:png.toString('base64')}],[{b64_json:'A'.repeat(16_000_001)}]]){
  const r=await createImageEditHandler(env,async()=>Response.json({data}))(req());assert.equal(r.status,502);
 }
 const body=payload();body.evidence.cases=[];body.objects=[];
 let calls=0;const r=await createImageEditHandler(env,async()=>{calls++;throw Error();})(req(body));assert.equal(r.status,422);assert.equal(calls,0);
});

test('preserves photo aspect ratio using supported 16px increments, rejects extreme ratios',async()=>{
 let size;const handle=createImageEditHandler(env,async(_url,init)=>{size=init.body.get('size');return Response.json({data:[{b64_json:png.toString('base64')}]});});
 assert.equal((await handle(req({...payload(),width:1200,height:600}))).status,200);assert.equal(size,'1536x768');
 assert.equal((await handle(req({...payload(),width:600,height:1200}))).status,200);assert.equal(size,'768x1536');
 assert.equal((await handle(req({...payload(),width:1440,height:100}))).status,422);
});

test('response stream deadline and size budget apply beyond initial fetch',async()=>{
 const r=await createImageEditHandler(env,async()=>new Response(new ReadableStream({start(){},cancel(){}})),15)(req());assert.equal(r.status,504);
 const huge=await createImageEditHandler(env,async()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array(16_000_001));c.close();}})))(req());assert.equal(huge.status,502);
});

test('image edit accepts automatic plant hypotheses but never removes an unknown species',async()=>{
 const plant={kind:'plant',label:'黃金葛',bbox:[.1,.1,.3,.5],notes:'fixture'};
 const candidate={objects:[plant],questions:[],limitations:[],image_quality:'adequate',plants:[{object_index:0,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'high'}],features:'心形斑葉',identification_quality:'adequate'}],assessments:[]};
 let prompt='',calls=0;const handle=createImageEditHandler(env,async(_url,init)=>{calls++;prompt=init.body.get('prompt');return Response.json({data:[{b64_json:png.toString('base64')}]});});
 const input={...payload(),objects:candidate.objects,evidence:{version:1,capture_id:'scan',mode:'OBSERVED',cases:[]},candidate};
 assert.equal((await handle(req(input))).status,200);assert.match(prompt,/黃金葛/);assert.equal(calls,1);
 const unknown=structuredClone(input);unknown.candidate.plants[0].candidates[0].scientific_name='Unknownus unknown';assert.equal((await handle(req(unknown))).status,422);assert.equal(calls,1);
});
