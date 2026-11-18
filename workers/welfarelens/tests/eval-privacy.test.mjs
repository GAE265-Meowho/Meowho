import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,symlinkSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,basename,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../scripts/eval-run.ts',import.meta.url));
test('eval refuses linked photos outside private-eval before any external call',()=>{
 const root=mkdtempSync(join(tmpdir(),'welfarelens-eval-'));
 try {
  mkdirSync(join(root,'private-eval'));mkdirSync(join(root,'outside'));
  writeFileSync(join(root,'outside','photo.jpg'),Buffer.from([255,216,255,217]));
  symlinkSync(join(root,'outside'),join(root,'private-eval','linked'),process.platform==='win32'?'junction':'dir');
  writeFileSync(join(root,'private-eval','cases.json'),JSON.stringify([{id:'privacy',image:'linked/photo.jpg',authorized:true,truth:[],unknownsToPreserve:[]}]));
  const result=spawnSync(process.execPath,['--experimental-strip-types',script,'--consent'],{cwd:root,encoding:'utf8',env:{...process.env,ENABLE_CLOUD_ANALYSIS:'true',AZURE_OPENAI_API_KEY:'',AZURE_OPENAI_ENDPOINT:'',AZURE_OPENAI_DEPLOYMENT:''}});
  assert.notEqual(result.status,0);assert.match(result.stderr,/Invalid image path/);
 }finally{
  // Verify the absolute cleanup target remains a task-owned temporary directory.
  if(dirname(resolve(root))===resolve(realpathSync(tmpdir()))&&basename(root).startsWith('welfarelens-eval-'))rmSync(root,{recursive:true,force:true});
 }
});
