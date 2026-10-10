import { describe,expect,it } from 'vitest';
import { findBalancedLayout,patternQuality } from './balanced';
import { layoutRoom } from '../flooring/layout';
import { packageQuantity } from '../flooring/packages';
import { PRESETS } from '../model/types';
import type { Room } from '../model/types';
import { parseProject } from '../import/project';
import { serializeProject } from '../export/project';
const room=():Room=>({id:'r',name:'Screenshot',polygon:[{x:0,y:0},{x:7760,y:0},{x:7760,y:4010},{x:0,y:4010}],
  layout:{direction:90,offsetX:0,offsetY:0,firstRowWidth:'full'},rules:{minEndPieceLength:200,minJointOffset:200,jointOffset:100}});
describe('room-specific attractive and economical settings',()=>{
  it('finds a consistent pattern within the same pack count as free laying and preserves room constraints',()=>{
    const r=room(),before=structuredClone(r),f=PRESETS[0],baseline=layoutRoom(r,f),best=findBalancedLayout(r,f);
    expect(best.layout.feasible).toBe(true); expect(best.packages!.packages).toBeLessThanOrEqual(packageQuantity(baseline.newBoards,f)!.packages);
    expect(best.quality.aligned).toBe(0); expect(best.quality.irregularity).toBeLessThanOrEqual(patternQuality(baseline,r,f.length).irregularity+1e-10);
    expect(best.settings.pattern).toBe('custom'); expect(best.quality.irregularity).toBeLessThan(1e-10);
    expect(best.settings.direction).toBe(90); expect(best.settings.firstRowWidth).toBe('full'); expect(r).toEqual(before);
    expect(best.layout.boards.flatMap(b=>b.pieceLengths).every(n=>n>=199.99)).toBe(true);
    const p={version:1 as const,name:'Test',flooring:f,floors:[{id:'f',name:'Etage',background:null,calibration:null,rooms:[{...r,layout:best.settings}]}]};
    const loaded=parseProject(serializeProject(p));
    expect(layoutRoom(loaded.floors[0].rooms[0],loaded.flooring)).toEqual(best.layout);
  },30000);
  it('avoids aligned joints even if the minimum joint rule is set to zero',()=>{
    const r=room();r.rules={minEndPieceLength:100,minJointOffset:0,jointOffset:0};
    const best=findBalancedLayout(r,PRESETS[0]); expect(best.quality.aligned).toBe(0);
    expect(best.layout.feasible).toBe(true);
  },30000);
  it('preserves a whole starter and reports its impossible conflict instead of relaxing it',()=>{
    const r=room();r.layout.startWithFullPlank=true;
    expect(()=>findBalancedLayout(r,PRESETS[0])).toThrow(/Kein zulässiges Muster/);
    expect(r.layout.startWithFullPlank).toBe(true);
    r.rules!.minEndPieceLength=100;
    expect(findBalancedLayout(r,PRESETS[0]).layout.rows[0].firstLength).toBeCloseTo(1285);
  },30000);
});
