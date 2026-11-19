import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
test('deployment artifact gate rejects private media traces and accepts code-only traces',async()=>{
 const root=await mkdtemp(join(tmpdir(),'wl-trace-'));try{
 await writeFile(join(root,'route.js.nft.json'),JSON.stringify({files:['../../../.video-scans/fixture/room.jpg','../../../node_modules/next/server.js']}));
 let result=spawnSync(process.execPath,['scripts/check-private-trace.mjs','--root',root],{encoding:'utf8'});assert.equal(result.status,1);assert.match(result.stderr,/private_media_in_trace/);
 result=spawnSync(process.execPath,['scripts/check-private-trace.mjs','--root',root,'--prune'],{encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/privateEntries.*0/);
 assert.deepEqual(JSON.parse(await readFile(join(root,'route.js.nft.json'),'utf8')).files,['../../../node_modules/next/server.js']);
 await writeFile(join(root,'route.js.nft.json'),JSON.stringify({files:['../../../node_modules/next/server.js']}));
 result=spawnSync(process.execPath,['scripts/check-private-trace.mjs','--root',root],{encoding:'utf8'});assert.equal(result.status,0);assert.match(result.stdout,/privateEntries.*0/);
 }finally{await rm(root,{recursive:true,force:true});}
});
