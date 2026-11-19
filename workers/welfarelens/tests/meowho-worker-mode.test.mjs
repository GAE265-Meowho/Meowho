import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertContinuousQueueScope,parseMeowhoMode, runMeowhoQueue} from '../src/server/video/meowho-worker-mode.ts';

test('queue requires explicit media-dev mode and valid limits',()=>{
 assert.deepEqual(parseMeowhoMode(['--once'],'media-dev',{}),{once:true});
 assert.deepEqual(parseMeowhoMode(['--poll'],'media-dev',{}),{once:false,pollMs:10000});
 for(const [args,container,env] of [
  [[], 'media-dev',{}], [['--poll'],'media',{}], [['--poll','--once'],'media-dev',{}],
  [['--poll'],'media-dev',{MEOWHO_WORKER_MAX_JOBS:'0'}],
  [['--poll'],'media-dev',{MEOWHO_WORKER_POLL_MS:'1'}],
 ]) assert.throws(()=>parseMeowhoMode(args,container,env));
});

test('service fails closed for a shared, mismatched or bounded queue',()=>{
 const shared={MEOWHO_SUPABASE_URL:'https://onebpkbkrnnwamwsoelo.supabase.co',MEOWHO_DEDICATED_QUEUE_PROJECT_REF:'onebpkbkrnnwamwsoelo',MEOWHO_QUEUE_ENABLED:'true',MEOWHO_BLOB_CONTAINER:'media-dev',MEOWHO_WORKER_SERVICE:'true'};
 const isolated={...shared,MEOWHO_SUPABASE_URL:'https://abcdefghijklmnopqrst.supabase.co',MEOWHO_DEDICATED_QUEUE_PROJECT_REF:'abcdefghijklmnopqrst'};
 const mode={once:false,pollMs:10000};
 for(const env of [shared,{...isolated,MEOWHO_QUEUE_ENABLED:'false'},{...isolated,MEOWHO_SUPABASE_URL:shared.MEOWHO_SUPABASE_URL}]){
  assert.throws(()=>assertContinuousQueueScope(mode,env));
 }
 assert.doesNotThrow(()=>assertContinuousQueueScope(mode,isolated));
 assert.throws(()=>assertContinuousQueueScope({...mode,maxJobs:3},isolated));
});

test('three attempts run serially, continue after failure and stop before a fourth claim',async()=>{
 const signal=new AbortController().signal;
 const outcomes=['ready','failed','ready'];
 let active=0;
 let calls=0;
 const observed=[];
 await runMeowhoQueue({
  signal,pollMs:10000,maxJobs:3,
  async processNext(){
   assert.equal(++active,1);
   await Promise.resolve();
   active--;
   return outcomes[calls++];
  },
  onOutcome:outcome=>observed.push(outcome),
  wait:()=>assert.fail('Backlogged jobs should not wait'),
 });
 assert.equal(calls,3);
 assert.deepEqual(observed,outcomes);
});

test('idle and retry delays are bounded and reset after successful RPC',async()=>{
 const stop=new AbortController();
 const waits=[];
 let calls=0;
 const network=new Error('offline');
 await runMeowhoQueue({
  signal:stop.signal,pollMs:10000,
  async processNext(){
   const call=++calls;
   if(call===1||call===7)return 'idle';
   throw network;
  },
  retryCode:error=>error===network?'network':undefined,
  async wait(ms){waits.push(ms);if(waits.length===8)stop.abort();},
 });
 assert.deepEqual(waits,[10000,10000,20000,40000,60000,60000,10000,10000]);
 assert.equal(calls,8);
});

test('bounded verification stops on an ambiguous RPC failure instead of claiming again',async()=>{
 const network=new Error('lost response');
 let calls=0;
 await assert.rejects(runMeowhoQueue({
  signal:new AbortController().signal,pollMs:10000,maxJobs:3,
  async processNext(){calls++;throw network;},
  retryCode:()=> 'network',
 }),network);
 assert.equal(calls,1);
});

test('shutdown during work prevents another claim',async()=>{
 const stop=new AbortController();
 let calls=0;
 await runMeowhoQueue({
  signal:stop.signal,pollMs:10000,
  async processNext(){calls++;stop.abort();return 'lease_lost';},
  wait:()=>assert.fail('Shutdown should not wait'),
 });
 assert.equal(calls,1);
});
