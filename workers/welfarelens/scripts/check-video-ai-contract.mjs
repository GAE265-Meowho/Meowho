// Offline preflight only. Synthetic responses are never botanical/vision ground truth.
// No .env loading, credentials, video reads, Azure requests, or persistent Job creation.
import assert from 'node:assert/strict';
import {createAnalyzeHandler} from '../src/server/azure.ts';
import {captureObservations} from '../src/domain/video-observations.ts';
import {aggregateVideoIssues,IssueReportSchema} from '../src/domain/video-issues.ts';
import {eventsFromFrames} from '../src/domain/video.ts';
import {buildScanResult} from '../src/domain/scan-result.ts';
import {buildVideoResultView} from '../src/domain/video-issue-view.ts';
import {issueIdFactory,observationIdFactory} from '../src/server/video/issue-id.ts';

globalThis.fetch=async()=>{throw Error('External network prohibited in offline preflight');};
const env={ENABLE_CLOUD_ANALYSIS:'true',AZURE_OPENAI_ENDPOINT:'https://offline.invalid.openai.azure.com',AZURE_OPENAI_API_KEY:'synthetic-not-a-key',AZURE_OPENAI_DEPLOYMENT:'synthetic-deployment'};
const req=()=>new Request('http://localhost:3100/api/analyze',{method:'POST',headers:{origin:'http://localhost:3100','content-type':'application/json'},body:JSON.stringify({consent:true,imageDataUrl:'data:image/jpeg;base64,/9j/2Q=='})});
const facts=place=>[{key:'exposed_cord',value:true,status:'OBSERVATION',evidence:`${place}可見線材`,confidence:'medium'},{key:'reachable',value:true,status:'INFERENCE',evidence:`${place}靠近可攀爬家具，可能接觸`,confidence:'medium'}];
const wire=(i,place)=>({rule_id:'H04',object_indices:[i],facts:facts(place),proposal:{kind:'RISK',action:`固定${place}的線材`,rationale:'減少可能接觸及啃咬的機會',impact:'可能啃咬或纏繞',placement:null}});
const candidate={objects:[
 {kind:'cord',label:'壁架線材',bbox:null,notes:'壁架下方垂線'},
 {kind:'cord',label:'落地燈線材',bbox:null,notes:'落地燈旁線材'},
 {kind:'plant',label:'合成黃金葛',bbox:null,notes:'合成心形斑葉'},
 {kind:'plant',label:'合成袖珍椰子',bbox:null,notes:'合成羽狀葉'}
],plants:[
 {object_index:2,candidates:[{common_name:'黃金葛',scientific_name:'Epipremnum aureum',confidence:'high'}],features:'合成心形斑葉',identification_quality:'adequate'},
 {object_index:3,candidates:[{common_name:'袖珍椰子',scientific_name:'Chamaedorea elegans',confidence:'high'}],features:'合成羽狀葉',identification_quality:'adequate'}
],image_quality:'adequate',questions:[],limitations:['無法從影像確認實際啃咬'],assessments:[wire(0,'壁架下'),wire(1,'落地燈旁')]};
let sent,calls=0;
const response=await createAnalyzeHandler(env,async(_url,init)=>{
 calls++;sent=JSON.parse(init.body);
 return Response.json({id:'synthetic-response-id',model:'synthetic-model-version',choices:[{finish_reason:'stop',message:{content:JSON.stringify(candidate)}}],usage:{prompt_tokens:1000,completion_tokens:500,prompt_tokens_details:{cached_tokens:100,cache_write_tokens:200},completion_tokens_details:{reasoning_tokens:50}}});
},120000,true)(req());
assert.equal(response.status,200);assert.equal(calls,1);
const normalized=await response.json();assert.deepEqual(normalized.candidate,candidate);
assert.equal(sent.max_completion_tokens,8000);assert.equal(sent.messages[1].content[1].image_url.detail,'high');
const id='11111111-1111-4111-8111-111111111111';
const frames=[{frame_id:'f000',timestamp:0,hash:'same-jpeg'},{frame_id:'f004',timestamp:4,hash:'same-jpeg'},{frame_id:'f008',timestamp:8,hash:'different-jpeg'}].map(frame=>({frame:{...frame,novelty:0,sharpness:1},candidate:normalized.candidate}));
const events=eventsFromFrames(id,frames.map(f=>({...f.frame,actions:buildScanResult(f.candidate).actions})),'synthetic-deployment');
const raw=captureObservations(frames,observationIdFactory('offline-test'),events,'synthetic-deployment');
const report=IssueReportSchema.parse({version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(raw,[],issueIdFactory('offline-test'))});
assert.equal(raw.length,9);assert.equal(report.issues.length,6);
assert.ok(raw.every(o=>o.event_ids.length===1&&o.rule_id&&o.object_ref!==null&&o.sources.length&&o.unknown.length));
assert.deepEqual(raw.find(o=>o.object_ref===0).facts,candidate.assessments[0].facts);
assert.deepEqual(raw.find(o=>o.object_ref===2).plant,candidate.plants[0]);
assert.ok(report.issues.every(i=>new Set(i.observation_ids.map(id=>raw.find(o=>o.observation_id===id).object_ref)).size===1));
assert.equal(report.issues.filter(i=>i.observation_ids.length===2).length,3); // Exact same cached JPEG only.
assert.equal(report.issues.filter(i=>i.observation_ids.length===1).length,3); // New view stays separate.
assert.deepEqual([...buildVideoResultView(report,'complete').priority,...buildVideoResultView(report,'complete').needs].map(i=>i.issue_id).sort(),report.issues.map(i=>i.issue_id).sort());
assert.equal(buildScanResult(candidate).plants.find(p=>p.object_index===3).status,'NON_TOXIC');
let invalidCalls=0;
const invalid=await createAnalyzeHandler(env,async()=>{invalidCalls++;return Response.json({model:'synthetic-version',usage:{prompt_tokens:123,completion_tokens:456},choices:[{finish_reason:'stop',message:{content:'{invalid'}}]});},120000,true)(req());
assert.equal(invalid.status,502);assert.equal(invalidCalls,1);const invalidBody=await invalid.json();
let quotaCalls=0;const quota=await createAnalyzeHandler(env,async()=>{quotaCalls++;return new Response('',{status:429});},120000,true)(req());assert.equal(quota.status,429);assert.equal(quotaCalls,1);
console.log(JSON.stringify({mode:'OFFLINE_SYNTHETIC_NOT_AZURE',externalRequests:0,assertions:'passed',syntheticObservations:raw.length,syntheticIssues:report.issues.length,exactJpegMergedGroups:3,differentViewUnmergedGroups:3,distinctCordsKeptSeparate:true,
 request:{systemPromptUtf8Bytes:Buffer.byteLength(sent.messages[0].content),jsonSchemaUtf8Bytes:Buffer.byteLength(JSON.stringify(sent.response_format)),maxCompletionTokens:sent.max_completion_tokens,imageDetail:'high',note:'Byte sizes are not token counts; excludes provider rendering, wrappers and image tokens'},
 gaps:{providerModelVersionRetained:Object.hasOwn(normalized,'model'),fullUsageRetained:Object.hasOwn(normalized.usage??{},'prompt_tokens_details'),failedOutputUsageRetained:Object.hasOwn(invalidBody,'usage'),nonToxicPlantInRaw:raw.some(o=>o.object_ref===3),crossViewAutomaticIdentity:false},
 note:'Findings describe current retention gaps, not successful AI identification or an implementation of missing safeguards.'},null,2));
