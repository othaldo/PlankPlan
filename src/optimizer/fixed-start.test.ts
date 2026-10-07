import { describe, expect, it } from 'vitest';
import { layoutRoom } from '../flooring/layout';
import { PRESETS } from '../model/types';
import type { Room } from '../model/types';
import { mod } from '../geometry/polygon';
import { optimizeProject, planProject, planningSignature } from './project';
import { parseProject } from '../import/project';
import { serializeProject } from '../export/project';

const f = { ...PRESETS[0], minEndPieceLength:100, minJointOffset:400, reservePercent:0 };
function room(): Room {
  return { id:'r', name:'Fester Start', polygon:[{x:0,y:0},{x:4010,y:0},{x:4010,y:2348},{x:0,y:2348}],
    layout:{direction:0,offsetX:0,offsetY:0,firstRowWidth:'full',pattern:'custom',fixedStagger:400,startWithFullPlank:true} };
}
function assertFixed(r: Room) {
  const plan = layoutRoom(r,f);
  expect(plan.feasible,plan.warnings.join(' ')).toBe(true);
  expect(plan.rows[0].firstLength).toBeCloseTo(f.length,4);
  expect(plan.rows[0].lastLength).toBeCloseTo(135,4);
  for(let i=1;i<plan.rows.length;i++) {
    expect(mod(plan.rows[i].originX-plan.rows[i-1].originX,f.length)).toBeCloseTo(400,4);
    for(const a of plan.rows[i].joints) for(const b of plan.rows[i-1].joints) expect(Math.abs(a-b)).toBeGreaterThanOrEqual(399.99);
  }
  expect(plan.coveredArea).toBeCloseTo(3990*2328,2);
  expect(plan.boards.every(b=>b.pieceLengths.every(length=>length>=99.99))).toBe(true);
  return plan;
}
describe('fixed stagger and full starter constraints',()=>{
  it('starts with full length and keeps exact 400 mm after wrapping',()=>{ assertFixed(room()); });
  it('works after rotation and translation',()=>{
    const r=room(); r.polygon=r.polygon.map(p=>({x:-p.y+9000,y:p.x+7000})); r.layout.direction=90;
    assertFixed(r);
  });
  it('keeps the full length independent of the manually narrowed first row',()=>{
    const r=room(); r.layout.firstRowWidth=120;
    // A shorter room avoids an extra narrow terminal row.
    r.polygon[2].y=r.polygon[3].y=120+194*11+20;
    const plan=layoutRoom(r,f);
    expect(plan.feasible,plan.warnings.join(' ')).toBe(true);
    expect(plan.firstRowWidth).toBeCloseTo(120); expect(plan.rows[0].firstLength).toBeCloseTo(1285);
  });
  it('does not shorten the starter to fix a 135 mm terminal piece',()=>{
    const r=room(); const plan=layoutRoom(r,{...f,minEndPieceLength:300});
    expect(plan.feasible).toBe(false); expect(plan.boards).toEqual([]);
    expect(plan.warnings.join(' ')).toContain('mit ganzer Startdiele');
    r.layout.startWithFullPlank=false; r.polygon[2].y=r.polygon[3].y=408;
    expect(layoutRoom(r,{...f,minEndPieceLength:300}).feasible).toBe(true);
  });
  it('rejects an exact stagger below the required joint distance',()=>{
    const r=room(); r.layout.fixedStagger=133;
    const plan=layoutRoom(r,f); expect(plan.feasible).toBe(false); expect(plan.boards).toEqual([]);
    expect(plan.warnings[0]).toContain('133 mm');
  });
  it.each([-1,1285,NaN])('rejects invalid fixed stagger %s',step=>{
    const r=room(); r.layout.fixedStagger=step;
    expect(layoutRoom(r,f).feasible).toBe(false);
  });
  it.each(['optimized','half','third'] as const)('respects full start in %s planning too',pattern=>{
    const r=room(); r.layout.pattern=pattern;
    const plan=layoutRoom(r,f); expect(plan.feasible,plan.warnings.join(' ')).toBe(true);
    expect(plan.rows[0].firstLength).toBeCloseTo(f.length);
  });
  it('changes cache keys and project signatures when constraints change',()=>{
    const r=room(); const p={version:1 as const,name:'Fix',flooring:f,floors:[{id:'floor',name:'Etage',background:null,calibration:null,rooms:[r]}]};
    const signature=planningSignature(p); assertFixed(r);
    r.layout.fixedStagger=133; expect(planningSignature(p)).not.toBe(signature); expect(layoutRoom(r,f).feasible).toBe(false);
    r.layout.fixedStagger=400; r.layout.startWithFullPlank=false; expect(planningSignature(p)).not.toBe(signature);
  });
  it('preserves both constraints through shared stock optimization and JSON',()=>{
    const a=room(), b={...room(),id:'second',name:'Zweiter Raum'};
    const p={version:1 as const,name:'Fix',flooring:f,floors:[{id:'floor',name:'Etage',background:null,calibration:null,rooms:[a,b]}]};
    const best=optimizeProject(p); expect(best.valid).toBe(true);
    const loaded=parseProject(serializeProject({...p,materialPlan:{roomOrder:best.order,adaptive:best.adaptive,signature:planningSignature(p)}}));
    const plan=planProject(loaded);
    for(const r of loaded.floors[0].rooms) {
      expect(r.layout.fixedStagger).toBe(400); expect(r.layout.startWithFullPlank).toBe(true);
    }
    for(const layout of plan.layouts.values()) {
      expect(layout.rows[0].firstLength).toBeCloseTo(1285);
      for(let i=1;i<layout.rows.length;i++) expect(mod(layout.rows[i].originX-layout.rows[i-1].originX,f.length)).toBeCloseTo(400,4);
    }
  });
});
