export type Point={x:number;y:number};
export function dragBox(a:Point,b:Point):[number,number,number,number]|null{const clamp=(v:number)=>Math.max(0,Math.min(1,v/100));const x=clamp(Math.min(a.x,b.x)),y=clamp(Math.min(a.y,b.y)),r=clamp(Math.max(a.x,b.x)),d=clamp(Math.max(a.y,b.y));return r-x>=.002&&d-y>=.002?[x,y,r,d]:null;}
