import {VideoStore} from '../src/server/video/store.ts';
import {runClaimedVideoScan} from '../src/server/video/runner.ts';
const store=new VideoStore(),id=process.argv[2];
if(!/^[a-f0-9-]{36}$/.test(id??''))throw Error('Invalid job');
const abort=new AbortController();
process.once('SIGTERM',()=>abort.abort());process.once('SIGINT',()=>abort.abort());
const result=await runClaimedVideoScan(store,id,{env:process.env,signal:abort.signal});
console.info(JSON.stringify({job_id:id,processing_stage:'runner',outcome:result.outcome}));
