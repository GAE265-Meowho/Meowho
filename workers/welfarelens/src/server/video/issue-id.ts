import {createHmac} from 'node:crypto';
export const issueIdFactory=(salt:string)=>(parts:string[])=>'issue-'+createHmac('sha256',salt).update(JSON.stringify(parts)).digest('hex').slice(0,32);
export const observationIdFactory=(salt:string)=>(key:string)=>'obs-'+createHmac('sha256',salt).update(key).digest('hex').slice(0,32);
