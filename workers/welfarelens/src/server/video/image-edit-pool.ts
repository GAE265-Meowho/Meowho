/** Assign indices before awaiting. All in-flight work settles before errors return. */
export async function runImageEditPool(count:number, concurrency:1|2, signal:AbortSignal, processCase:(index:number)=>Promise<void>){
  let cursor=0;
  const workers=Array.from({length:Math.min(concurrency,count)},async()=>{
    while(!signal.aborted&&cursor<count)await processCase(cursor++);
  });
  const settled=await Promise.allSettled(workers);
  for(const result of settled)if(result.status==='rejected')throw result.reason;
}
