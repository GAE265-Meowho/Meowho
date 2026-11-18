import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectMeowhoBlobAuth} from '../src/server/video/meowho-blob-auth.ts';

const sas=(container,extra='')=>`https://meowhomedia.blob.core.windows.net/${container}?sv=2024-11-04&sr=c&si=welfarelens-p1&sig=FAKE_TEST_SIGNATURE${extra}`;

test('Managed Identity is the default if no matching SAS is configured',()=>{
 assert.deepEqual(selectMeowhoBlobAuth('media-dev',{}),{kind:'managed-identity'});
 assert.deepEqual(selectMeowhoBlobAuth('media-dev',{WELFARELENS_MEDIA_SAS_URL:sas('media')}),{kind:'managed-identity'});
});

test('SAS selects only the exact configured container, without leaking credentials',()=>{
 const dev=sas('media-dev');
 assert.deepEqual(selectMeowhoBlobAuth('media-dev',{WELFARELENS_MEDIA_DEV_SAS_URL:dev}),{kind:'container-sas',url:dev});
 assert.deepEqual(selectMeowhoBlobAuth('media',{WELFARELENS_MEDIA_SAS_URL:sas('media')}),{kind:'container-sas',url:sas('media')});
 for(const url of [sas('media'),sas('media-dev/subfolder'),sas('media-dev').replace('https:','http:'),
  sas('media-dev').replace('meowhomedia.','evil.'),sas('media-dev').replace('sr=c','sr=b'),
  sas('media-dev').replace('sig=','not_sig='),sas('media-dev').replace('sv=','not_sv='),
  'NOT_A_URL']){
  assert.throws(()=>selectMeowhoBlobAuth('media-dev',{WELFARELENS_MEDIA_DEV_SAS_URL:url}),
   e=>e.message==='invalid_blob_sas_config'&&!e.message.includes('sig='));
 }
});
