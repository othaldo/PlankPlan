import { describe,expect,it } from 'vitest';
import { spacerPositions } from './spacers';
import { rotate } from './polygon';
const rectangle=[{x:0,y:0},{x:4000,y:0},{x:4000,y:3000},{x:0,y:3000}];
describe('schematic expansion spacers',()=>{
  it('places supports on every wall in the gap with at most 500 mm between them',()=>{
    const positions=spacerPositions(rectangle,10);
    for(let wall=0;wall<4;wall++) {
      const points=positions.filter(p=>p.wall===wall); expect(points.length).toBeGreaterThan(1);
      for(const p of points) expect(Math.hypot(p.point.x-p.wallPoint.x,p.point.y-p.wallPoint.y)).toBeCloseTo(5);
      for(let i=1;i<points.length;i++) expect(Math.hypot(points[i].point.x-points[i-1].point.x,points[i].point.y-points[i-1].point.y)).toBeLessThanOrEqual(500.001);
    }
  });
  it('handles reversed winding and rotated walls without changing positions',()=>{
    const positions=spacerPositions(rectangle,10);
    const reversed=spacerPositions([...rectangle].reverse(),10);
    for(const p of positions) expect(reversed.some(q=>Math.hypot(p.point.x-q.point.x,p.point.y-q.point.y)<.01)).toBe(true);
    const rotated=spacerPositions(rectangle.map(p=>rotate(p,33)),10);
    expect(rotated.length).toBe(positions.length);
    rotated.forEach((p,i)=>{const q=rotate(positions[i].point,33);expect(p.point.x).toBeCloseTo(q.x);expect(p.point.y).toBeCloseTo(q.y);});
  });
  it('includes recessed walls and short segments while rejecting unusable gaps',()=>{
    const l=[{x:0,y:0},{x:4000,y:0},{x:4000,y:1000},{x:2000,y:1000},{x:2000,y:3000},{x:0,y:3000}];
    expect(new Set(spacerPositions(l,10).map(p=>p.wall)).size).toBe(6);
    expect(spacerPositions([{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}],10).length).toBe(8);
    expect(spacerPositions(rectangle,0)).toEqual([]);
    expect(spacerPositions(rectangle,2000)).toEqual([]);
    expect(()=>spacerPositions(rectangle,NaN)).toThrow(); expect(()=>spacerPositions(rectangle,10,0)).toThrow();
  });
});
