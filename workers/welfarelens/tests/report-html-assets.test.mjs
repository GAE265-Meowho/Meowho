import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uploadReportHtml } from '../src/server/video/report-html-assets.ts';

test('HTML is uploaded after its assets, and absent when an asset upload fails', async () => {
 const directory=await mkdtemp(join(tmpdir(),'wl-html-'));
 try {
  const name='a'.repeat(64)+'.jpg';
  await mkdir(join(directory,'html-assets'));
  await writeFile(join(directory,'html-assets',name),'image');
  const uploaded=[];
  const upload=async path=>{uploaded.push(path);};
  await uploadReportHtml(directory,'attempt/',upload);
  assert.deepEqual(uploaded,[]);
  await writeFile(join(directory,'report.html'),'html');
  await assert.rejects(uploadReportHtml(directory,'attempt/',async path=>{
   await upload(path);
   throw Error('upload failed');
  }),/upload failed/);
  assert.deepEqual(uploaded,['attempt/html-assets/'+name]);
  uploaded.length=0;
  await uploadReportHtml(directory,'attempt/',upload);
  assert.deepEqual(uploaded,['attempt/html-assets/'+name,'attempt/report.html']);
 } finally {
  await rm(directory,{recursive:true,force:true});
 }
});
