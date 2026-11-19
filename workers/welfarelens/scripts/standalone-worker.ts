import {readFile,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {executeFixtureJob,executeLiveJob,reprintStandaloneReport,standaloneSucceeded} from '../src/server/video/standalone.ts';
import {command} from '../src/server/video/media.ts';
import {VideoStore} from '../src/server/video/store.ts';

const args=process.argv.slice(2);
try{
 if(args.length===1&&args[0]==='--self-test'){
  const ffmpeg=await command(process.env.FFMPEG_PATH||'ffmpeg',['-version']);
  const ffprobe=await command(process.env.FFPROBE_PATH||'ffprobe',['-version']);
  console.log(JSON.stringify({event:'worker_health',ok:true,node:process.version,ffmpeg:ffmpeg.stdout.split('\n')[0],ffprobe:ffprobe.stdout.split('\n')[0],mode:'fixture-default',gpu_required:false}));
 }else{
  const params=new Map<string,string>();for(let i=0;i<args.length;i++){const k=args[i];if(params.has(k))throw Error('arguments');if(['--live','--allow-image-editing','--review-draft'].includes(k)){params.set(k,'true');continue;}if(!['--input','--root','--fixture','--cleanup','--reprint'].includes(k)||!args[i+1]||args[i+1].startsWith('--'))throw Error('arguments');params.set(k,args[++i]);}
  if(params.has('--cleanup')){if(params.size!==1)throw Error('arguments');await new VideoStore(resolve(params.get('--cleanup')!)).cleanup();console.log(JSON.stringify({event:'ttl_cleanup',ok:true}));}
  else if(params.has('--reprint')){
   const browser=process.env.WELFARELENS_PDF_BROWSER;
   if(params.size!==(params.has('--review-draft')?3:2)||!params.has('--root')||!browser)throw Error('arguments');
   console.log(JSON.stringify({event:'report_reprinted',...await reprintStandaloneReport(params.get('--root')!,params.get('--reprint')!,browser,params.has('--review-draft'))}));
  }else{
   const live=params.has('--live'),fixturePath=params.get('--fixture'),allowImageEditing=params.has('--allow-image-editing');
   if(params.has('--review-draft')||!params.has('--input')||!params.has('--root')||live===!!fixturePath||(!live&&allowImageEditing))throw Error('arguments');
   const abort=new AbortController();process.once('SIGINT',()=>abort.abort());process.once('SIGTERM',()=>abort.abort());
   const options={input:params.get('--input')!,root:params.get('--root')!,signal:abort.signal,pdfBrowser:process.env.WELFARELENS_PDF_BROWSER};
   let result;
   if(live)result=await executeLiveJob({...options,live:true,allowImageEditing,env:process.env});
   else{
    const info=await lstat(fixturePath!);if(!info.isFile()||info.isSymbolicLink()||info.size>256*1024)throw Error('fixture_size');
    const bytes=await readFile(fixturePath!);if(bytes.length>256*1024)throw Error('fixture_size');
    result=await executeFixtureJob({...options,fixture:JSON.parse(bytes.toString('utf8'))});
   }
   console.log(JSON.stringify({event:'standalone_result',...result}));if(!standaloneSucceeded(result,!!options.pdfBrowser))process.exitCode=1;
  }
 }
}catch{
 // Do not print provider bodies, filesystem paths, credentials or supplied fixture content.
 console.error(JSON.stringify({event:'standalone_error',error:'Invalid input, interrupted job, or artifact validation failure. Check private job status.',usage:'--input VIDEO (--fixture JSON | --live [--allow-image-editing]) --root PRIVATE_DIRECTORY | --self-test | --cleanup PRIVATE_DIRECTORY | --reprint JOB_ID --root PRIVATE_DIRECTORY [--review-draft]'}));process.exitCode=1;
}
