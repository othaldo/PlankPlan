import type { MultiPolygon } from 'polygon-clipping';
import type { Point } from '../model/types';
import { inset, signedArea } from './polygon';

export interface SpacerPosition { wall: number; wallPoint: Point; point: Point; angle: number }
function inside(point: Point, ring: Point[]) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }
  return result;
}
function insideFloor(point:Point, polygons:MultiPolygon) {
  return polygons.some(poly=>inside(point,poly[0].map(([x,y])=>({x,y}))) && !poly.slice(1).some(r=>inside(point,r.map(([x,y])=>({x,y})))));
}
/** Schematic support points; spacing is a planning default, not a product specification. */
export function spacerPositions(polygon: Point[], gap: number, maxSpacing=500): SpacerPosition[] {
  if(!Number.isFinite(gap)||gap<0||!Number.isFinite(maxSpacing)||maxSpacing<=0) throw new Error('Ungültiger Keilabstand oder Wandabstand.');
  if(gap===0) return [];
  const inner=inset(polygon,gap); if(!inner.length) return [];
  const sign=signedArea(polygon)>0?1:-1,result:SpacerPosition[]=[];
  polygon.forEach((a,wall)=>{
    const b=polygon[(wall+1)%polygon.length],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
    const nx=-dy/length*sign,ny=dx/length*sign;
    const margin=Math.min(Math.max(100,gap*2),length/4);
    const steps=Math.max(1,Math.ceil((length-2*margin)/maxSpacing));
    for(let i=0;i<=steps;i++) {
      const distance=margin+(length-2*margin)*i/steps;
      const wallPoint={x:a.x+dx/length*distance,y:a.y+dy/length*distance};
      const point={x:wallPoint.x+nx*gap/2,y:wallPoint.y+ny*gap/2};
      const contact={x:wallPoint.x+nx*(gap+.02),y:wallPoint.y+ny*(gap+.02)};
      // Omit locations where a narrow or acute contour leaves no flooring to support.
      if(inside(point,polygon)&&!insideFloor(point,inner)&&insideFloor(contact,inner))
        result.push({wall,wallPoint,point,angle:Math.atan2(dy,dx)*180/Math.PI});
    }
  });
  return result;
}
