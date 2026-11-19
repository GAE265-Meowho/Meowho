import {VideoStore} from '../src/server/video/store.ts';
const store=new VideoStore();
await store.cleanup();
if(process.argv.includes('--watch'))setInterval(()=>{void store.cleanup().catch(()=>console.error('video_cleanup_failed'));},30000);
