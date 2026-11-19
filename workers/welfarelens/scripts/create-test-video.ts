import {mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {command} from '../src/server/video/media.ts';

const directory='welfarelens-video-spike/samples';
const file=directory+'/synthetic-room.mp4';
if(!existsSync(file)){
 await mkdir(directory,{recursive:true});
 await command(process.env.FFMPEG_PATH||'ffmpeg',
  ['-v','error','-n','-f','lavfi','-i','testsrc2=size=640x360:rate=12:duration=22',
   '-an','-c:v','libx264','-pix_fmt','yuv420p','-threads','1',file]);
}
