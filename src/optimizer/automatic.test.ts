import { describe, expect, it } from 'vitest';
import { layoutRoom } from '../flooring/layout';
import { area, bounds, polygonPoints, rotate } from '../geometry/polygon';
import { PRESETS, demoProject } from '../model/types';
import type { Room } from '../model/types';
import { jointsCompatible } from './automatic';
const flooring = PRESETS[0];
function room(length: number, width = 1600): Room {
  return { id: 'r', name: 'Raum', polygon: [{ x: 0, y: 0 }, { x: length, y: 0 }, { x: length, y: width }, { x: 0, y: width }], layout: { direction: 0, offsetX: 0, offsetY: 0 } };
}
function assertPlan(r: Room) {
  const plan = layoutRoom(r, flooring);
  expect(plan.warnings, 'Automatic planner must find a valid solution for this room').not.toEqual(expect.arrayContaining([expect.stringContaining('Keine Verlegung')]));
  expect(plan.feasible, plan.warnings.join(' ')).toBe(true);
  expect(plan.boards.length).toBeGreaterThan(0);
  expect(plan.boards.flatMap(b => b.pieceLengths).every(length => length >= 299.99)).toBe(true);
  expect(plan.coveredArea).toBeCloseTo(area(plan.inner), 2);
  for (let i = 1; i < plan.rows.length; i++) {
    const previous = plan.rows[i - 1], current = plan.rows[i];
    const spans = (row: number) => plan.boards.filter(b => b.row === row).flatMap(b => b.polygon.map(poly => {
      const points = polygonPoints([poly]).map(p => rotate(p, -r.layout.direction)); return bounds(points);
    }));
    expect(jointsCompatible({ joints: previous.joints, spans: spans(previous.index) }, { joints: current.joints, spans: spans(current.index) }, 300)).toBe(true);
  }
  return plan;
}
describe('automatic physical laying plan', () => {
  it('can start at full width instead of cutting two almost full edge rows', () => {
    const r = room(5200, 194 * 10 + 178 + 20);
    const balanced = assertPlan(r);
    expect(balanced.firstRowWidth).toBeCloseTo(186, 1); expect(balanced.lastRowWidth).toBeCloseTo(186, 1);
    const full = assertPlan({ ...r, layout: { ...r.layout, firstRowWidth: 'full' } });
    expect(full.resolvedOffsetY).toBe(0); expect(full.firstRowWidth).toBe(194); expect(full.lastRowWidth).toBeCloseTo(178, 2);
    expect(full.boards.filter(b => b.row === 0).every(b => b.usedWidth === 194 && b.source.y === 10)).toBe(true);
    expect(full.reusedPieces).toBeGreaterThan(0);
    expect(assertPlan(r).firstRowWidth).toBeCloseTo(186, 1);
  });
  it('honors a custom first width without turning off length and joint planning', () => {
    const r = room(5200, 194 * 10 + 178 + 20); r.layout.firstRowWidth = 180;
    const plan = assertPlan(r);
    expect(plan.firstRowWidth).toBeCloseTo(180, 2); expect(plan.lastRowWidth).toBeCloseTo(192, 2);
    expect(plan.resolvedOffsetY).toBe(14);
  });
  it('preserves a full first row and warns when that makes the last row too narrow', () => {
    const r = room(5200, 194 * 10 + 27 + 20); r.layout.firstRowWidth = 'full';
    const plan = assertPlan(r);
    expect(plan.firstRowWidth).toBe(194); expect(plan.lastRowWidth).toBeCloseTo(27, 2);
    expect(plan.warnings).toContainEqual(expect.stringContaining('Erste Reihe ändern'));
  });
  it('uses the active plank width for a full first row after changing materials or direction', () => {
    const r = room(5200, 2138); r.layout.firstRowWidth = 'full';
    expect(layoutRoom(r, PRESETS[1]).firstRowWidth).toBeCloseTo(246, 2);
    r.layout.direction = 90; expect(assertPlan(r).firstRowWidth).toBeCloseTo(194, 2);
    r.layout.firstRowWidth = 246; expect(assertPlan(r).firstRowWidth).toBeCloseTo(194, 2);
    r.layout.firstRowWidth = 0; expect(() => layoutRoom(r, flooring)).toThrow(/ersten Reihe/);
  });
  it('corrects a 100 mm final piece by shortening the start, without manual offsets', () => {
    const r = room(1285 * 4 + 100 + 20);
    const manual = layoutRoom({ ...r, layout: { ...r.layout, mode: 'manual' } }, { ...flooring, jointOffset: 0 });
    expect(manual.boards.some(b => b.pieceLengths.some(l => l < 300))).toBe(true);
    const plan = assertPlan(r);
    expect(plan.rows[0].firstLength).toBeLessThan(1285);
    expect(plan.rows[0].lastLength).toBeGreaterThanOrEqual(299.99);
    expect(new Set(plan.rows.map(row => row.originX)).size).toBeGreaterThan(1);
  });
  it('plans the original L-shaped example without any short pieces', () => { assertPlan(demoProject().floors[0].rooms[0]); });
  it('reduces new boards through click-compatible offcuts and retains area conservation', () => {
    const plan = assertPlan(room(5200, 2400));
    expect(plan.reusedPieces).toBeGreaterThan(0); expect(plan.newBoards).toBeLessThan(plan.boards.length);
    expect(plan.materialArea).toBe(plan.newBoards * flooring.length * flooring.width);
    expect(plan.materialArea).toBeGreaterThanOrEqual(plan.coveredArea);
    expect(plan.remainingOffcutArea).toBeLessThanOrEqual(plan.wasteArea + .1);
    expect(new Set(plan.boards.map(b => b.material?.sourceBoardId)).size).toBe(plan.newBoards);
    const reused = plan.boards.filter(b => b.material?.reusedFrom);
    expect(new Set(reused.map(b => b.material!.reusedFrom)).size).toBe(reused.length);
  });
  it('actually starts later rows with offcuts from earlier row ends when joint spacing permits', () => {
    const plan = assertPlan(room(1285 * 3 + 900 + 20));
    const starter = plan.boards.find(b => b.column === 0 && b.material?.reusedFromPlacementId && Number(b.material.reusedFromPlacementId.split(':')[1]) > 0);
    expect(starter).toBeDefined();
    expect(starter!.usedLength).toBeGreaterThanOrEqual(299.99);
    expect(Number(starter!.material!.reusedFromPlacementId!.split(':')[0])).toBeLessThan(starter!.row);
  });
  it.each([0,100])('starts the next row with the 1147 mm end offcut at %s mm minimum joint spacing',minimum=>{
    const r=room(7760,4010); r.layout={...r.layout,direction:90,firstRowWidth:'full',startWithFullPlank:true};
    const f={...flooring,minEndPieceLength:100,minJointOffset:minimum,jointOffset:0};
    const plan=layoutRoom(r,f); expect(plan.feasible).toBe(true);
    expect(plan.rows[0].firstLength).toBeCloseTo(1285); expect(plan.rows[0].lastLength).toBeCloseTo(135);
    expect(plan.rows[1].firstLength).toBeCloseTo(1147); expect(plan.rows[1].lastLength).toBeCloseTo(273);
    const starter=plan.boards.find(b=>b.row===1 && b.column===0)!;
    expect(starter.material).toMatchObject({reusedFromPlacementId:'0:3',stockLength:1147,cutLoss:0});
    // The previous search used 126 new boards for this room.
    expect(plan.newBoards).toBeLessThanOrEqual(126);
    expect(plan.boards.flatMap(b=>b.pieceLengths).every(n=>n>=99.99)).toBe(true);
  });
  it('keeps a 300 mm joint rule even when the previous remainder would provide only 138 mm',()=>{
    const r=room(7760,4010); r.layout={...r.layout,direction:90,firstRowWidth:'full',startWithFullPlank:true};
    const plan=layoutRoom(r,{...flooring,minEndPieceLength:100,minJointOffset:300,jointOffset:0});
    expect(plan.feasible).toBe(true); expect(plan.rows[1].firstLength).not.toBeCloseTo(1147);
    for(let i=1;i<plan.rows.length;i++) {
      const spans=(index:number)=>plan.boards.filter(b=>b.row===index).flatMap(b=>b.polygon.map(p=>bounds(polygonPoints([p]).map(q=>rotate(q,-90)))));
      expect(jointsCompatible({joints:plan.rows[i-1].joints,spans:spans(i-1)},{joints:plan.rows[i].joints,spans:spans(i)},300)).toBe(true);
    }
  });
  it.each([1500, 2500, 3800, 5200, 6500])('satisfies end lengths and real neighbouring joints for a %s mm room', length => { assertPlan(room(length)); });
  it('emits no invalid boards or material quantities for an impossible 200 mm room', () => {
    const plan = layoutRoom(room(200), flooring);
    expect(plan.feasible).toBe(false); expect(plan.boards).toEqual([]); expect(plan.materialArea).toBe(0);
    expect(plan.warnings[0]).toContain('300 mm');
  });
  it('can solve that room by choosing a different direction', () => {
    const r = room(200); r.layout.direction = 90; assertPlan(r);
  });
  it('does not hide short fragments inside a shared bounding box', () => {
    const r = room(2000);
    r.polygon = [{x:0,y:0},{x:2000,y:0},{x:2000,y:1600},{x:1800,y:1600},{x:1800,y:500},{x:200,y:500},{x:200,y:1600},{x:0,y:1600}];
    const plan = layoutRoom(r, flooring);
    expect(plan.feasible).toBe(false); expect(plan.boards).toHaveLength(0);
  });
  it('excludes rooms with laminate switched off but retains their room area', () => {
    const r = room(5200); r.flooringEnabled = false;
    const plan = layoutRoom(r, flooring);
    expect(plan.boards).toHaveLength(0); expect(plan.rows).toHaveLength(0); expect(plan.roomArea).toBe(5200 * 1600);
    expect(plan.materialArea).toBe(0); expect(plan.feasible).toBe(true);
  });
  it('only compares joints where adjacent rows physically overlap', () => {
    const a = { joints: [1000], spans: [{ minX: 0, maxX: 2000 }] };
    expect(jointsCompatible(a, { joints: [1100], spans: [{ minX: 0, maxX: 2000 }] }, 300)).toBe(false);
    expect(jointsCompatible(a, { joints: [1300], spans: [{ minX: 0, maxX: 2000 }] }, 300)).toBe(true);
    expect(jointsCompatible(a, { joints: [1100], spans: [{ minX: 3000, maxX: 4000 }] }, 300)).toBe(true);
  });
});
