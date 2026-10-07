import { describe, expect, it } from 'vitest';
import { layoutRoom } from '../flooring/layout';
import { PRESETS } from '../model/types';
import type { Room } from '../model/types';
import { mod } from '../geometry/polygon';
import { planProject, optimizeProject, planningSignature } from './project';
import { parseProject } from '../import/project';
import { serializeProject } from '../export/project';

const f = { ...PRESETS[0], minEndPieceLength:100, minJointOffset:400, reservePercent:0 };
function room(pattern: 'half' | 'third', direction = 0): Room {
  return { id:'r', name:'Regelmäßig', polygon:[{x:0,y:0},{x:4010,y:0},{x:4010,y:2348},{x:0,y:2348}],
    layout:{ direction, offsetX:0, offsetY:0, firstRowWidth:'full', pattern } };
}
describe('regular laying patterns', () => {
  it.each(['half','third'] as const)('keeps exact %s phases, lengths and full first width', pattern => {
    const r = room(pattern), plan = layoutRoom(r,f), period = pattern === 'half' ? 2 : 3;
    expect(plan.feasible,plan.warnings.join(' ')).toBe(true); expect(plan.rows.length).toBe(12);
    expect(plan.firstRowWidth).toBe(194);
    expect(plan.boards.every(b => b.pieceLengths.every(length => length >= 99.99))).toBe(true);
    expect(plan.coveredArea).toBeCloseTo(3990 * 2328,2);
    for (let i=1;i<plan.rows.length;i++) {
      expect(mod(plan.rows[i].originX-plan.rows[i-1].originX,f.length)).toBeCloseTo(f.length/period,4);
      for (const a of plan.rows[i].joints) for (const b of plan.rows[i-1].joints) expect(Math.abs(a-b)).toBeGreaterThanOrEqual(399.99);
      if(i>=period) expect(mod(plan.rows[i].originX-plan.rows[i-period].originX,f.length)).toBeCloseTo(0,4);
    }
    expect(plan.materialArea).toBe(plan.newBoards*f.length*f.width);
    const reused = plan.boards.filter(b => b.material?.reusedFrom);
    expect(new Set(reused.map(b => b.material!.reusedFrom)).size).toBe(reused.length);
  });
  it('maintains regular phases with 90-degree placement', () => {
    const plan = layoutRoom(room('half',90),f); expect(plan.feasible).toBe(true);
    for(let i=1;i<plan.rows.length;i++) expect(mod(plan.rows[i].originX-plan.rows[i-1].originX,f.length)).toBeCloseTo(f.length/2,4);
  });
  it('rejects impossible joint spacing without reverting to an irregular layout', () => {
    const plan = layoutRoom(room('third'),{...f,minJointOffset:500});
    expect(plan.feasible).toBe(false); expect(plan.boards).toEqual([]); expect(plan.warnings[0]).toContain('Drittelversatz');
  });
  it('rejects impossible end lengths without relaxing them', () => {
    const plan = layoutRoom(room('half'),{...f,minEndPieceLength:650});
    expect(plan.feasible).toBe(false); expect(plan.boards).toEqual([]);
  });
  it('preserves the selected pattern through shared package optimization and JSON', () => {
    const p = {version:1 as const,name:'Muster',flooring:f,floors:[{id:'floor',name:'Etage',background:null,calibration:null,rooms:[room('half')]}]};
    const best = optimizeProject(p); expect(best.valid).toBe(true);
    const saved = {...p,materialPlan:{roomOrder:best.order,adaptive:best.adaptive,signature:planningSignature(p)}};
    const loaded = parseProject(serializeProject(saved)); expect(loaded.floors[0].rooms[0].layout.pattern).toBe('half');
    expect([...planProject(loaded).layouts]).toEqual([...best.layouts]);
    expect(() => parseProject(serializeProject({...p,floors:[{...p.floors[0],rooms:[{...room('half'),layout:{...room('half').layout,pattern:'invalid'}}]}]} as never))).toThrow();
  });
});
