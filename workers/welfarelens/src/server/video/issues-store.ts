import {z} from 'zod';
import {lstat,readFile,writeFile,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {VideoStore} from './store.ts';
import {FrameSnapshotSchema,captureObservations,fromLegacyEvents} from '../../domain/video-observations.ts';
import type {ValidatedFrameSnapshot} from '../../domain/video-observations.ts';
import {IssueReportSchema,aggregateVideoIssues} from '../../domain/video-issues.ts';
import type {IssueReport} from '../../domain/video-issues.ts';
import type {VideoEvent,VideoJob} from '../../domain/video.ts';
import {issueIdFactory,observationIdFactory} from './issue-id.ts';
const MAX=4*1024*1024;
const PrivateSnapshot=z.object({version:z.literal(1),salt:z.string().regex(/^[a-f0-9]{64}$/),frames:z.array(FrameSnapshotSchema).max(8),report:IssueReportSchema}).strict();
function checkLinks(report:IssueReport,job:VideoJob){
 if(report.video_id!==job.video_id||report.observations.some(o=>!job.frames.some(f=>f.frame_id===o.frame_id&&f.timestamp===o.timestamp)||o.event_ids.some(id=>!job.events.some(e=>e.event_id===id&&e.evidence_frames.some(f=>f.frame_id===o.frame_id&&f.timestamp===o.timestamp)))))throw Error('Invalid job observation link');
}
/** Single worker writes one immutable terminal snapshot. Never mkdir a removed job. */
export async function writeIssueSnapshot(store:VideoStore,id:string,frames:ValidatedFrameSnapshot[],events:VideoEvent[],signal:AbortSignal,model?:string){
 signal.throwIfAborted();const job=await store.read(id);if(await store.isCancelled(id))throw Error('Cancelled');
 const salt=randomBytes(32).toString('hex'),observations=captureObservations(frames,observationIdFactory(salt),events,model??job.model);
 const report=IssueReportSchema.parse({version:1,video_id:id,source:'snapshot',...aggregateVideoIssues(observations,[],issueIdFactory(salt))});
 checkLinks(report,{...job,events});
 const snapshot=PrivateSnapshot.parse({version:1,salt,frames,report}),bytes=JSON.stringify(snapshot);if(Buffer.byteLength(bytes)>MAX)throw Error('Snapshot too large');
 const dir=await store.directory(id),temp=join(dir,`issues-${randomUUID()}.tmp`);
 try{await writeFile(temp,bytes,{flag:'wx'});signal.throwIfAborted();await store.read(id);if(await store.isCancelled(id))throw Error('Cancelled');await rename(temp,join(dir,'issues.json'));}finally{await rm(temp,{force:true});}
}
export async function readIssueReport(store:VideoStore,id:string,owner:string):Promise<IssueReport>{
 const job=await store.get(id,owner);if(!['completed','partial'].includes(job.status))throw Error('Pending');
 const path=join(await store.directory(id),'issues.json');let info;
 try{info=await lstat(path);}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')return IssueReportSchema.parse({version:1,video_id:id,source:'legacy_limited',...aggregateVideoIssues(fromLegacyEvents(job),[],issueIdFactory(job.owner_hash))});throw e;}
 if(!info.isFile()||info.isSymbolicLink()||info.size>MAX)throw Error('Invalid snapshot');
 const snapshot=PrivateSnapshot.parse(JSON.parse(await readFile(path,'utf8')));checkLinks(snapshot.report,job);
 await store.get(id,owner); // Recheck expiry/cancellation after read.
 return snapshot.report;
}
