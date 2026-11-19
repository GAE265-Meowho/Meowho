import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';
import {createVideoApi} from '../src/server/video/api.ts';
import {VideoStore} from '../src/server/video/store.ts';
test('separate versioned issues API guards owners, pending, legacy and deletion without changing job schema',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-issue-api-'));try{const api=createVideoApi(root,async()=>{}),origin='http://127.0.0.1:3100';const response=await api.create(new Request(origin+'/api/video-scans',{method:'POST',headers:{origin}})),cookie=response.headers.get('set-cookie').split(';')[0],{video_id:id}=await response.json();const req=(headers={cookie})=>new Request(origin+`/api/video-scans/${id}/issues`,{headers});
 assert.equal((await api.issues(req({}),id)).status,404);assert.equal((await api.issues(req(),id)).status,202);
 const store=new VideoStore(root);await store.finish(id,{status:'partial',analysis_status:'incomplete'});
 const r=await api.issues(req(),id);assert.equal(r.status,200);assert.equal((await r.json()).source,'legacy_limited');
 const old=await(await api.status(req(),id)).json();assert.ok(!('issues'in old));assert.ok(!('owner_hash'in old));
 assert.equal((await api.issues(new Request('https://public.test/api',{headers:{cookie}}),id)).status,404);
 await api.remove(new Request(origin+'/api',{method:'DELETE',headers:{cookie,origin}}),id);assert.equal((await api.issues(req(),id)).status,404);
 }finally{await rm(root,{recursive:true,force:true});}
});
