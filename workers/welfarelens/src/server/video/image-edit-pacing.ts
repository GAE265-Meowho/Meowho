import {setTimeout as delay} from 'node:timers/promises';

const minimumGapMs=12_000;

/** Pace transport starts, allowing already-started requests to overlap. */
export function createImageEditPacer(
 now=()=>performance.now(),
 wait=(ms:number,signal:AbortSignal)=>delay(ms,undefined,{signal}),
){
 let nextStart=0;
 return async function pace<T>(signal:AbortSignal,send:()=>Promise<T>):Promise<T>{
  for(;;){
   signal.throwIfAborted();
   const at=now();
   if(at>=nextStart){
    // Check, reserve and invoke fetch in the same turn of the event loop.
    nextStart=at+minimumGapMs;
    return send();
   }
   await wait(Math.ceil(nextStart-at),signal);
  }
 };
}

export const paceWorkerImageEdit=createImageEditPacer();
