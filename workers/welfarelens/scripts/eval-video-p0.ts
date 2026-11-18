import {readFile,writeFile} from 'node:fs/promises';
import {roomFixture,provenance} from '../tests/fixtures/video-p0.mjs';
import {aggregateVideoIssues} from '../src/domain/video-issues.ts';
import {RawObservationSchema,MatchEvidenceSchema} from '../src/domain/video-issues.ts';
import {performance} from 'node:perf_hooks';
import {z} from 'zod';
const manifest=z.object({metadata:z.object({duration:z.number(),width:z.number(),height:z.number(),codec:z.string(),rotation:z.number()}),frames:z.array(z.object({timestamp:z.number().nonnegative(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}))}).parse(JSON.parse(await readFile('private-eval/video-p0/manifest.json','utf8')));
const fixture=roomFixture(),observations=fixture.observations.map(o=>RawObservationSchema.parse({...o,frame_hash:manifest.frames.find(f=>f.timestamp===o.timestamp)?.sha256??o.frame_hash})),matches=fixture.matches.map(m=>MatchEvidenceSchema.parse(m));
const id=(key:string[])=>'issue-'+key.join('-');const t=performance.now();const automatic=aggregateVideoIssues(observations,[],id);const aggregationMs=performance.now()-t;
const labeled=aggregateVideoIssues(observations,matches,id,{allowTestEvidence:true});
function physicalPairs(r:ReturnType<typeof aggregateVideoIssues>){return r.issues.filter(i=>i.identity_status==='supported').flatMap(i=>i.observation_ids.flatMap((a,n)=>i.observation_ids.slice(n+1).map(b=>[a,b].sort().join('|'))));}
const positives=matches.filter(m=>m.supports_same_object).map(m=>[...m.observation_ids].sort().join('|')),negatives=matches.filter(m=>!m.supports_same_object).map(m=>[...m.observation_ids].sort().join('|'));
const check=(r:ReturnType<typeof aggregateVideoIssues>)=>{const pairs=physicalPairs(r),falseMerges=pairs.filter(p=>!positives.includes(p)).length;return {issues:r.issues.length,careThemes:r.issues.filter(i=>i.category==='ENRICHMENT_ADVICE').length,priority:r.issues.filter(i=>i.category==='PRIORITY_ACTION').length,needs:r.issues.filter(i=>i.category==='NEEDS_CONFIRMATION').length,retainedObservations:new Set(r.issues.flatMap(i=>i.observation_ids)).size,mergedPhysicalPairs:pairs.length,falseMergedPairs:falseMerges,falseMergeRate:pairs.length?falseMerges/pairs.length:null,missedPositivePairs:positives.filter(p=>!pairs.includes(p)).length,negativePairsIncorrectlyMerged:negatives.filter(p=>pairs.includes(p)).length};};
const result={version:1,provenance,source:manifest.metadata,realFrames:manifest.frames.length,rawReconstructedObservations:observations.length,automatic:check(automatic),withTestOnlyIdentityLabels:check(labeled),aggregationMs,paidCalls:0,limitations:'Not original Azure JSON. Human-reviewed/synthetic test identity labels never feed runtime. P0 automatic matcher cannot identify changing views without verified correspondence; no general accuracy claim.'};
await writeFile('private-eval/video-p0/comparison.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
