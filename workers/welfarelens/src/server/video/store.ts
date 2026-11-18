import {mkdir,lstat,readFile,writeFile,rename,rm,readdir,open} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {VideoJobSchema,VIDEO_TTL_MS,VIDEO_MAX_BYTES} from '../../domain/video.ts';
import type {VideoJob} from '../../domain/video.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const validId=(id:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id);
const createQueues=new Map<string,Promise<void>>();
async function exists(path:string){try{await lstat(path);return true;}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')return false;throw e;}}
function workerAlive(pid:number){try{process.kill(pid,0);return true;}catch(e){return !!e&&typeof e==='object'&&'code'in e&&e.code==='EPERM';}}
/** Bounded local I/O retries only; never retries model calls or ignores invalid data. */
async function fileRetry<T>(operation:()=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){try{return await operation();}catch(e){const code=e&&typeof e==='object'&&'code'in e?String(e.code):'';if(attempt>=2||!['EPERM','EBUSY','EACCES'].includes(code))throw e;await new Promise(r=>setTimeout(r,50*(attempt+1)));}}
}
export class VideoStore{
 root:string;
 private writes:Promise<void>=Promise.resolve();
 private maxActive:number;
 constructor(root=resolve(process.cwd(),'.video-scans'),maxActive=Number(process.env.WELFARELENS_VIDEO_MAX_JOBS??2)){this.root=resolve(root);this.maxActive=Number.isInteger(maxActive)&&maxActive>=1&&maxActive<=8?maxActive:2;}
 async directory(id?:string){
  await mkdir(this.root,{recursive:true});
  if((await lstat(this.root)).isSymbolicLink())throw Error('Invalid private root');
  if(!id)return this.root;
  if(!validId(id))throw Error('Not found');
  const dir=join(this.root,id),stat=await lstat(dir);if(!stat.isDirectory()||stat.isSymbolicLink())throw Error('Not found');return dir;
 }
 async read(id:string):Promise<VideoJob>{return fileRetry(async()=>{const dir=await this.directory(id);const file=join(dir,'job.json');if((await lstat(file)).isSymbolicLink())throw Error('Not found');const job=VideoJobSchema.parse(JSON.parse(await readFile(file,'utf8')));if(job.video_id!==id||job.expires_at<=Date.now())throw Error('Expired');
 // Durable terminal marker wins over late writes from another process, without deleting evidence.
 if(await exists(join(dir,'cancelled.flag')))return {...job,status:'cancelled',stage:'分析已取消',analysis_status:'incomplete',original_deleted:!await exists(join(dir,'original.bin')),error:null};return job;});}
 async get(id:string,owner:string){const j=await this.read(id);if(j.owner_hash!==hash(owner)||await exists(join(this.root,`${id}.cancel`)))throw Error('Not found');return j;}
 async isCancelled(id:string){
  let root;try{root=await this.directory();await this.directory(id);}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')return true;throw e;}
  return await exists(join(root,`${id}.cancel`))||await exists(join(root,id,'cancelled.flag'));
 }
 async create(owner:string,submissionId?:string){
  const next=(createQueues.get(this.root)??Promise.resolve()).then(async()=>{
  await this.cleanup();const root=await this.directory(),entries=await readdir(root);let active=0;
  const submission_key=submissionId?hash(submissionId):undefined;
  for(const id of entries){if(!validId(id))continue;try{const j=await this.read(id);if(submission_key&&j.owner_hash===hash(owner)&&j.submission_key===submission_key)return j;if(['uploading','queued','processing'].includes(j.status))active++;}catch{}}
  if(active>=this.maxActive)throw Error('Busy');
  const id=randomUUID(),dir=join(root,id);await mkdir(dir);
  const job:VideoJob={video_id:id,owner_hash:hash(owner),created_at:Date.now(),expires_at:Date.now()+VIDEO_TTL_MS,status:'uploading',stage:'等待上傳',original_deleted:false,frames:[],events:[],warning:[],error:null,model:'',analysis_provider:'azure',analysis_status:'pending',review_status:'not_human_reviewed'};
  if(submission_key)job.submission_key=submission_key;
  await writeFile(join(dir,'job.json'),JSON.stringify(job),{flag:'wx'});return job;
  });const tail=next.then(()=>{},()=>{});createQueues.set(this.root,tail);void tail.then(()=>{if(createQueues.get(this.root)===tail)createQueues.delete(this.root);});return next;
 }
 async update(id:string,patch:Partial<VideoJob>){
  const next=this.writes.then(async()=>{const dir=await this.directory(id),old=await this.read(id);if(['completed','partial','failed','cancelled'].includes(old.status))return old;const job=VideoJobSchema.parse({...old,...patch,video_id:old.video_id,owner_hash:old.owner_hash});const temp=join(dir,`job-${randomUUID()}.tmp`);try{await writeFile(temp,JSON.stringify(job),{flag:'wx'});await fileRetry(()=>rename(temp,join(dir,'job.json')));}finally{await rm(temp,{force:true});}return await exists(join(dir,'cancelled.flag'))?this.read(id):job;});
  this.writes=next.then(()=>{},()=>{});return next;
 }
 async upload(id:string,owner:string,body:ReadableStream<Uint8Array>,limit=VIDEO_MAX_BYTES){
  const j=await this.get(id,owner);if(j.status!=='uploading')throw Error('State');
  const dir=await this.directory(id);let claim;try{claim=await open(join(dir,'upload.lock'),'wx');}catch{throw Error('Duplicate');}await claim.close();
  const path=join(dir,'original.bin'),file=await open(path,'wx'),reader=body.getReader();let bytes=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>limit)throw Error('Size');await file.write(value);}if(!bytes)throw Error('Empty');await file.close();await this.update(id,{status:'queued',stage:'等待影片處理'});}
  catch(e){await reader.cancel().catch(()=>{});await file.close().catch(()=>{});await rm(path,{force:true});await this.update(id,{status:'failed',stage:'上傳失敗',error:'影片上傳未完成或超過大小限制',original_deleted:true,analysis_status:'failed'}).catch(()=>{});throw e;}
  finally{reader.releaseLock();}
 }
 async finish(id:string,patch:Partial<VideoJob>){const dir=await this.directory(id);await rm(join(dir,'original.bin'),{force:true});return this.update(id,{...patch,original_deleted:true});}
 async cancel(id:string,owner:string){const j=await this.get(id,owner);if(['completed','partial','failed','cancelled'].includes(j.status))return j;const dir=await this.directory(id);await writeFile(join(dir,'cancelled.flag'),'cancelled',{flag:'a'});await rm(join(dir,'original.bin'),{force:true}).catch(()=>{});return this.read(id);}
 async delete(id:string,owner:string){const j=await this.read(id);if(j.owner_hash!==hash(owner))throw Error('Not found');const dir=await this.directory(id),marker=join(this.root,`${id}.cancel`);try{await writeFile(marker,'',{flag:'wx'});}catch(e){if(!e||typeof e!=='object'||!('code'in e)||e.code!=='EEXIST')throw e;}await rm(dir,{recursive:true,force:true,maxRetries:20,retryDelay:100});await rm(marker,{force:true});}
 async cleanup(now=Date.now()){
  const root=await this.directory();for(const id of await readdir(root)){if(!validId(id))continue;try{const dir=await this.directory(id),age=now-(await lstat(dir)).birthtimeMs;
   if(await exists(join(root,`${id}.cancel`))){await rm(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});await rm(join(root,`${id}.cancel`),{force:true});continue;}
   // Even a corrupt journal must not retain original media forever. Only validated UUID directories, never links.
   if(age>VIDEO_TTL_MS){await rm(dir,{recursive:true,force:true});continue;}
   const job=await this.read(id);if(job.expires_at<=now)await rm(dir,{recursive:true,force:true});else if(['queued','processing','uploading'].includes(job.status)){
    const elapsed=now-job.created_at,dead=job.worker_pid&&!workerAlive(job.worker_pid);
    if(dead||elapsed>20*60*1000||(job.status==='queued'&&!job.worker_pid&&elapsed>60000)||(job.status==='uploading'&&elapsed>3*60*1000))await this.finish(id,{status:'failed',stage:'工作已中斷',error:'分析或上傳已中斷，可以重新選取影片再試一次。',analysis_status:'failed'});
   }else if(job.status==='cancelled')await rm(join(dir,'original.bin'),{force:true}).catch(()=>{});
  }catch{/* symlinks/unreadable paths are never followed */}}
 }
 async media(id:string,owner:string,frameId:string){const job=await this.get(id,owner);if(!job.frames.some(f=>f.frame_id===frameId))throw Error('Not found');const path=join(await this.directory(id),`${frameId}.jpg`);if(!(await lstat(path)).isFile()||(await lstat(path)).isSymbolicLink())throw Error('Not found');return readFile(path);}
}
