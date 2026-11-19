/** Local Node demo only: independent TTL sweep also runs without incoming requests. */
export async function register(){
 if(process.env.NEXT_RUNTIME==='nodejs'){
  const {VideoStore}=await import('./server/video/store');const store=new VideoStore();
  await store.cleanup().catch(()=>console.error('video_cleanup_start_failed'));
  setInterval(()=>{void store.cleanup().catch(()=>console.error('video_cleanup_failed'));},30000).unref();
 }
}
