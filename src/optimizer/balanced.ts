import type { Flooring,Room } from '../model/types';
import { roomFlooring } from '../model/types';
import { layoutRoom,prepareRoom } from '../flooring/layout';
import type { Layout } from '../flooring/layout';
import { packageQuantity } from '../flooring/packages';
import { bounds,mod,polygonPoints,rotate } from '../geometry/polygon';
import { jointsCompatible } from './automatic';

export function patternQuality(layout:Layout,room:Room,length:number) {
  const spans=new Map(layout.rows.map(row=>[row.index,layout.boards.filter(b=>b.row===row.index).flatMap(b=>
    b.polygon.map(poly=>bounds(polygonPoints([poly]).map(p=>rotate(p,-room.layout.direction)))))]));
  let aligned=0; const shifts:number[]=[];
  for(let i=1;i<layout.rows.length;i++) {
    const a=layout.rows[i-1],b=layout.rows[i]; if(b.index!==a.index+1) continue;
    if(!jointsCompatible({joints:a.joints,spans:spans.get(a.index)!},{joints:b.joints,spans:spans.get(b.index)!},.02)) aligned++;
    shifts.push(mod(b.originX-a.originX,length));
  }
  const distance=(a:number,b:number)=>{const d=mod(a-b,length);return Math.min(d,length-d);};
  const irregularity=shifts.length<2?0:shifts.slice(1).reduce((sum,n,i)=>sum+(distance(n,shifts[i])/length)**2,0)/(shifts.length-1);
  return {aligned,irregularity};
}
/** Compare economical free laying with exact repeating steps tailored to this room. */
export function findBalancedLayout(room:Room,input:Flooring) {
  const f=roomFlooring(room,input),automatic={...room,layout:{...room.layout,mode:'automatic' as const}};
  const extent=prepareRoom(automatic,f).extent,remainder=mod(extent.maxX-extent.minX,f.length),kerf=f.sawKerf??3;
  const minimum=f.minJointOffset??300;
  const steps=[...new Set([room.layout.fixedStagger??f.jointOffset,f.jointOffset,minimum,minimum+kerf,
    f.length/2,f.length/3,f.length/4,f.length/5,
    ...Array.from({length:12},(_,i)=>(i+1)*f.length/16),
    ...Array.from({length:6},(_,i)=>mod((remainder+kerf)*(i+1),f.length))]
    .map(n=>Math.round(n*10)/10))].filter(n=>n>.01&&n<f.length && Math.min(n,f.length-n)>=minimum-.01);
  const candidates:Room[]=[automatic,{...automatic,layout:{...automatic.layout,pattern:'optimized'}} ,
    ...steps.map(fixedStagger=>({...automatic,layout:{...automatic.layout,pattern:'custom' as const,fixedStagger}}))];
  let best:{room:Room;layout:Layout;quality:ReturnType<typeof patternQuality>;packages:ReturnType<typeof packageQuantity>}|undefined,tested=0;
  const deadline=Date.now()+20000;
  for(const candidate of candidates) {
    if(tested>1 && Date.now()>deadline) break;
    const layout=layoutRoom(candidate,f); tested++;
    if(!layout.feasible) continue;
    const quality=patternQuality(layout,candidate,f.length); if(quality.aligned) continue;
    const packages=packageQuantity(layout.newBoards,f);
    const option={room:candidate,layout,quality,packages};
    const rank=(a:typeof option,b:typeof option)=>(a.packages?.packages??a.layout.newBoards)-(b.packages?.packages??b.layout.newBoards) ||
      (Math.abs(a.quality.irregularity-b.quality.irregularity)>1e-10?a.quality.irregularity-b.quality.irregularity:0) ||
      a.layout.newBoards-b.layout.newBoards || a.layout.cutBoards-b.layout.cutBoards;
    if(!best||rank(option,best)<0) best=option;
  }
  if(!best) throw new Error('Kein zulässiges Muster ohne deckungsgleiche Fugen gefunden. Startdiele, Raumkontur oder Mindestlängen prüfen. Deine Regeln bleiben erhalten.');
  const settings={...best.room.layout};
  if(settings.pattern==='custom') settings.fixedStagger ??= f.jointOffset;
  const jointOffset=settings.pattern==='custom'?settings.fixedStagger:settings.pattern==='half'?f.length/2:settings.pattern==='third'?f.length/3:undefined;
  return {settings,jointOffset,layout:best.layout,packages:best.packages,candidates:tested,quality:best.quality};
}
