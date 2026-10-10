import { describe, expect, it } from 'vitest';
import { changeWallLength, isRectangle, makeRectangle } from './dimensions';
import { bounds, signedArea, validatePolygon } from './polygon';
const rect=[{x:5320,y:3990},{x:10010,y:3990},{x:10010,y:10680},{x:5320,y:10680}];
describe('wall dimensions and rectangular alignment',()=>{
  it('straightens a four-corner sketch to exact 4690 by 6690 mm without moving its origin',()=>{
    const sketch=[rect[0],rect[1],{x:10003,y:10680},{x:5320,y:10670}];
    expect(isRectangle(sketch)).toBe(false);
    const result=makeRectangle(sketch,4690,6690);
    expect(result).toEqual(rect); expect(isRectangle(result)).toBe(true);
    expect(sketch[2].x).toBe(10003);
  });
  it.each([0,1,2,3])('sets wall %s while preserving opposite lengths and right angles',index=>{
    const result=changeWallLength(rect,index,5000), p=result[index],q=result[(index+1)%4];
    expect(Math.hypot(q.x-p.x,q.y-p.y)).toBeCloseTo(5000,8);
    const a=result[(index+2)%4],b=result[(index+3)%4];
    expect(Math.hypot(b.x-a.x,b.y-a.y)).toBeCloseTo(5000,8);
    expect(isRectangle(result)).toBe(true); expect(bounds(result).minX).toBe(5320); expect(bounds(result).minY).toBe(3990);
  });
  it('keeps clockwise and counterclockwise vertex order',()=>{
    for(const polygon of [rect,[...rect].reverse(),[...rect.slice(2),...rect.slice(0,2)]]){
      const result=makeRectangle(polygon,4000,6000);
      expect(Math.sign(signedArea(result))).toBe(Math.sign(signedArea(polygon))); expect(validatePolygon(result)).toBeNull();
      expect(result[0].x===bounds(result).minX).toBe(polygon[0].x===5320);
    }
  });
  it('retains direction and start of a diagonal edge, including the closing edge',()=>{
    const polygon=[{x:0,y:0},{x:3000,y:1000},{x:2500,y:4000},{x:0,y:4000}];
    const result=changeWallLength(polygon,0,4000);
    expect(result[0]).toEqual(polygon[0]); expect(result[1].x/result[1].y).toBeCloseTo(3);
    expect(Math.hypot(result[1].x,result[1].y)).toBeCloseTo(4000);
    expect(changeWallLength(polygon,3,3500)[0]).toEqual({x:0,y:500});
  });
  it('rejects invalid lengths, missing edges, intersecting contours and niche removal',()=>{
    for(const n of [0,-1,NaN,Infinity,1000001]) expect(()=>changeWallLength(rect,0,n)).toThrow();
    expect(()=>changeWallLength(rect,4,1000)).toThrow();
    const concave=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:2000,y:1000},{x:0,y:3000}];
    expect(()=>makeRectangle(concave,4000,3000)).toThrow();
    expect(()=>changeWallLength(concave,2,6000)).toThrow();
  });
});
