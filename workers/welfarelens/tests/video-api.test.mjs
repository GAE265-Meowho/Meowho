import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const api=await import('../src/server/video/api.ts').catch(()=>({}));

test('create replay is idempotent even before cookie, new key starts independent job, cancel is owned and same-origin',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-api-repeat-'));try{const h=api.createVideoApi(root,async()=>{}),origin='http://127.0.0.1:3100';
 const req=(key,cookie)=>new Request(`${origin}/api/video-scans`,{method:'POST',headers:{origin,'idempotency-key':key,...(cookie?{cookie}:{})}});
 const a=await h.create(req('a'.repeat(64))),cookie=a.headers.get('set-cookie').split(';')[0],first=await a.json();
 const repeated=await(await h.create(req('a'.repeat(64)))).json();assert.equal(repeated.video_id,first.video_id);
 const cancel=(headers)=>new Request(`${origin}/api/video-scans/${first.video_id}/cancel`,{method:'POST',headers});
 assert.equal((await h.cancel(cancel({origin:'https://evil.test',cookie}),first.video_id)).status,403);
 assert.equal((await h.cancel(cancel({origin}),first.video_id)).status,404);
 assert.equal((await h.cancel(cancel({origin,cookie}),first.video_id)).status,200);
 assert.equal((await(await h.status(new Request(`${origin}/api/video-scans/${first.video_id}`,{headers:{cookie}}),first.video_id)).json()).status,'cancelled');
 const second=await(await h.create(req('b'.repeat(64),cookie))).json();assert.notEqual(first.video_id,second.video_id);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('API requires same origin for mutation, cookie ownership for reads, and refuses public deployment',async()=>{
 assert.equal(typeof api.createVideoApi,'function');const root=await mkdtemp(join(tmpdir(),'wl-api-'));try{
 const h=api.createVideoApi(root,async()=>{});
 const req=(method='POST',headers={})=>new Request('http://127.0.0.1:3100/api/video-scans',{method,headers:{origin:'http://127.0.0.1:3100',...headers}});
 assert.equal((await h.create(req('POST',{origin:'http://evil.test'}))).status,403);
 assert.equal((await h.create(new Request('https://public.test/api/video-scans',{method:'POST',headers:{origin:'https://public.test'}}))).status,403);
 const created=await h.create(req());assert.equal(created.status,201);const cookie=created.headers.get('set-cookie').split(';')[0],job=await created.json();
 assert.equal((await h.status(req('GET'),job.video_id)).status,404);assert.equal((await h.status(req('GET',{cookie}),job.video_id)).status,200);
 assert.equal((await h.remove(req('DELETE'),job.video_id)).status,404);assert.equal((await h.remove(req('DELETE',{cookie}),job.video_id)).status,200);assert.equal((await h.status(req('GET',{cookie}),job.video_id)).status,404);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('duplicate upload never deletes or fails the already queued original',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-duplicate-'));try{
 const h=api.createVideoApi(root,async()=>{}),origin='http://127.0.0.1:3100';const created=await h.create(new Request(`${origin}/api/video-scans`,{method:'POST',headers:{origin}}));const cookie=created.headers.get('set-cookie').split(';')[0],{video_id:id}=await created.json();
 const request=()=>new Request(`${origin}/api/video-scans/${id}`,{method:'PUT',headers:{origin,cookie,'content-type':'video/mp4','x-video-consent':'true'},body:'fake-video'});
 assert.equal((await h.upload(request(),id)).status,202);assert.equal((await h.upload(request(),id)).status,409);
 const status=await(await h.status(new Request(`${origin}/api/video-scans/${id}`,{headers:{cookie}}),id)).json();assert.equal(status.status,'queued');assert.equal(status.original_deleted,false);
 }finally{await rm(root,{recursive:true,force:true});}
});
