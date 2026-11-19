import {readdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const i=process.argv.indexOf('--root'),root=i<0?'.next':process.argv[i+1];
const privatePath=/(?:^|[/\\])(?:\.video-scans|private-eval|test-results)(?:[/\\]|$)|(?:^|[/\\])\.env(?:[./\\]|$)/;
let traces=0,privateEntries=0,removedEntries=0;
async function walk(dir){for(const file of await readdir(dir,{withFileTypes:true})){if(file.isDirectory())await walk(join(dir,file.name));else if(file.isFile()&&file.name.endsWith('.nft.json')){traces++;const path=join(dir,file.name),data=JSON.parse(await readFile(path,'utf8'));if(!Array.isArray(data.files))throw Error('invalid_trace');const unsafe=data.files.filter(f=>typeof f==='string'&&privatePath.test(f));if(unsafe.length&&process.argv.includes('--prune')){data.files=data.files.filter(f=>typeof f!=='string'||!privatePath.test(f));await writeFile(path,JSON.stringify(data));removedEntries+=unsafe.length;}else privateEntries+=unsafe.length;}}}
try{await walk(root);if(!traces)throw Error('no_trace_files');if(privateEntries)throw Error('private_media_in_trace');console.log(JSON.stringify({traces,privateEntries,removedEntries}));}catch(e){console.error(e instanceof Error?e.message:'trace_check_failed');process.exitCode=1;}
