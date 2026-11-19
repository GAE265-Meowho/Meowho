import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { parseArgs, parseEnv } from 'node:util';
import { assertPrivatePath } from './run-pipeline-benchmark.mjs';

function main(){
  let stage='arguments';
  try{
    const {values}=parseArgs({options:{
      image:{type:'string'},commit:{type:'string'},frozen:{type:'string'},batch:{type:'string'},
      run:{type:'string'},approval:{type:'string'},'azure-env':{type:'string'},'dry-run':{type:'boolean'},'six-round':{type:'boolean'},
    }});
    const dry=values['dry-run']===true;
    const sixRound=values['six-round']===true;
    if(!/^sha256:[a-f0-9]{64}$/.test(values.image??'')||!/^[a-f0-9]{40}$/.test(values.commit??'')||
      !(sixRound?/^[1-6]$/:/^[12]$/).test(values.run??'')||!values.frozen||!values.batch||
      (dry ? values.approval||values['azure-env'] : !values.approval||!values['azure-env']))throw Error('arguments');
    const checked=(name,directory)=>{
      const path=realpathSync(values[name]);
      assertPrivatePath(path);
      if(/[,"\r\n]/.test(path)||(directory?!statSync(path).isDirectory():!statSync(path).isFile()))
        throw Error('invalid bind mount');
      return path;
    };
    const frozen=checked('frozen',true),batch=checked('batch',true);
    if(frozen===batch)throw Error('use a separate batch directory');
    stage='local Docker and image identity';
    const env={...process.env};
    delete env.DOCKER_HOST;
    delete env.DOCKER_CONTEXT;
    const inspect=args=>execFileSync('docker',args,{encoding:'utf8',env,stdio:['ignore','pipe','pipe']}).trim();
    const context=inspect(['context','show']);
    const [contextInfo]=JSON.parse(inspect(['context','inspect',context]));
    if(!/^(?:npipe:\/\/\/\/\.\/pipe\/docker(?:DesktopLinux)?Engine|unix:\/\/\/[^\r\n]+)$/i.test(contextInfo?.Endpoints?.docker?.Host??''))
      throw Error('local Docker required');
    const docker=['--context',context];
    const [image]=JSON.parse(inspect([...docker,'image','inspect',values.image]));
    const commit=image?.Config?.Labels?.['org.opencontainers.image.revision'];
    if(image.Id!==values.image||commit!==values.commit||image.Os!=='linux'||image.Architecture!=='amd64')
      throw Error('image mismatch');
    const args=['run','--rm','--pull=never','--platform','linux/amd64',
      '--mount',`type=bind,src=${frozen},dst=/frozen,readonly`,
      '--mount',`type=bind,src=${batch},dst=/batch`];
    if(process.getuid&&process.getgid)args.push('--user',`${process.getuid()}:${process.getgid()}`);
    const flags=[];
    if(sixRound)flags.push('--six-round');
    if(dry){
      args.push('--network','none');
      flags.push('--dry-run');
    }else{
      stage='private approval and image credentials';
      const approval=checked('approval',false);
      if(sixRound){
        if(statSync(approval).size>4096)throw Error('invalid approval');
        const approved=JSON.parse(readFileSync(approval,'utf8'));
        const batchPathSha256=createHash('sha256').update(batch).digest('hex');
        if(approved.study!=='concurrency-234'||approved.approvedUsdMicros!==27000000||
          approved.batchPathSha256!==batchPathSha256||approved.commit!==commit||approved.imageId!==image.Id)
          throw Error('approval must match the batch path and image');
      }
      args.push('--mount',`type=bind,src=${approval},dst=/approval.json,readonly`);
      flags.push('--approval','/approval.json');
      const source=parseEnv(readFileSync(values['azure-env'],'utf8'));
      for(const name of ['AZURE_IMAGE_ENDPOINT','AZURE_IMAGE_DEPLOYMENT','AZURE_IMAGE_API_KEY']){
        const value=source[name];
        if(!value?.trim()||/[\r\n\0]/.test(value))throw Error('invalid image credentials');
        env[name]=value;
        args.push('-e',name);
      }
    }
    stage=dry?'offline replay':'controlled live run';
    execFileSync('docker',[...docker,...args,'--entrypoint','node',image.Id,'--experimental-strip-types',
      'scripts/controlled-image-benchmark.ts','--frozen','/frozen','--batch','/batch','--run',values.run,
      '--identity',JSON.stringify({commit,imageId:image.Id}),'--host-platform',process.platform,'--host-arch',process.arch,...flags],
      {stdio:'inherit',env});
  }catch{
    console.error(`Controlled image benchmark stopped at: ${stage}`);
    process.exitCode=1;
  }
}
main();
