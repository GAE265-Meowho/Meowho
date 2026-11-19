import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {probeVideo,extractAt} from '../src/server/video/media.ts';
// Local only; no upload, model call, or modification of source media.
const source=process.argv[2];if(!source)throw Error('Pass an authorized local MP4 path');
const directory=resolve('private-eval/video-p0');await mkdir(directory,{recursive:true});
const metadata=await probeVideo(source),sha256=createHash('sha256').update(await readFile(source)).digest('hex');
const frames=[];for(const timestamp of [0,4,8,12,13]){const file=`at-${timestamp}.jpg`;await extractAt(source,timestamp,join(directory,file));frames.push({timestamp,file,sha256:createHash('sha256').update(await readFile(join(directory,file))).digest('hex')});}
await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1,source_sha256:sha256,metadata,frames,provenance:'Local decoded frames, not Azure output. Requested seek times; not recovered old sampling PTS.'},null,2));
console.log(JSON.stringify({metadata,frames:frames.length,output:'private-eval/video-p0',paidCalls:0}));
