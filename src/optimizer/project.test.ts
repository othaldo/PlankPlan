import { describe, expect, it } from 'vitest';
import { planProject, optimizeProject, planningSignature, roomKey } from './project';
import { PRESETS } from '../model/types';
import type { Floor, Project, Room } from '../model/types';
import { parseProject } from '../import/project';
import { serializeProject } from '../export/project';
const room = (length: number, name: string): Room => ({ id: 'same-room-id', name,
  polygon: [{x:0,y:0},{x:length,y:0},{x:length,y:194},{x:0,y:194}],
  layout: { direction: 0, offsetX: 0, offsetY: 0, firstRowWidth: 'full' } });
function project(): Project {
  const floor = (id: string, r: Room): Floor => ({ id, name: id, background: null, calibration: null, rooms: [r] });
  return { version: 1, name: 'Gemeinsames Material', flooring: { ...PRESETS[0], expansionGap: 0, boardsPerPack: 2, reservePercent: 0 },
    floors: [floor('OG', room(1767, 'Langer Raum')), floor('EG', room(800, 'Kurzer Raum'))] };
}
describe('project material and package optimization', () => {
  it('disables transfers across rooms and floors, persists the preference and replays isolated optimization', () => {
    const p=project(), shared=optimizeProject(p);
    p.materialPlan={roomOrder:shared.order,adaptive:shared.adaptive,signature:planningSignature(p)};
    const previousSignature=planningSignature(p); p.shareOffcuts=false;
    expect(planningSignature(p)).not.toBe(previousSignature);
    for(const plan of [planProject(p),optimizeProject(p)]) {
      expect(plan.valid).toBe(true); expect(plan.sharing).toBe(false); expect(plan.crossRoomReusedPieces).toBe(0);
      expect(plan.newBoards).toBe(3); expect(plan.packages?.packages).toBe(2);
      expect([...plan.layouts.values()].reduce((sum,l)=>sum+l.materialArea,0)).toBeCloseTo(plan.materialArea,5);
      for(const [key,l] of plan.layouts) for(const b of l.boards) {
        if(b.material?.reusedFromRoomKey) expect(b.material.reusedFromRoomKey).toBe(key);
      }
    }
    const best=optimizeProject(p);
    p.materialPlan={roomOrder:best.order,adaptive:best.adaptive,signature:planningSignature(p)};
    const loaded=parseProject(serializeProject(p)); expect(loaded.shareOffcuts).toBe(false);
    expect([...planProject(loaded).layouts]).toEqual([...best.layouts]);
    loaded.shareOffcuts=true; expect(optimizeProject(loaded).crossRoomReusedPieces).toBe(1);
  });
  it('keeps click-compatible reuse within each room when transfers are disabled',()=>{
    const p=project(); p.shareOffcuts=false;
    p.floors[0].rooms[0].polygon=[{x:0,y:0},{x:1800,y:0},{x:1800,y:388},{x:0,y:388}];
    p.floors[0].rooms[0].rules={minJointOffset:0,minEndPieceLength:100};
    const best=optimizeProject(p); expect(best.valid).toBe(true); expect(best.reusedPieces).toBeGreaterThan(0);
    expect(best.crossRoomReusedPieces).toBe(0);
  });
  it('finds the useful first room and changes the next starter to save a whole package across floors', () => {
    const p = project(), before = planProject(p), best = optimizeProject(p);
    expect(before.newBoards).toBe(3); expect(before.packages?.packages).toBe(2);
    expect(best.valid).toBe(true); expect(best.newBoards).toBe(2); expect(best.packages?.packages).toBe(1);
    expect(best.crossRoomReusedPieces).toBe(1); expect(best.adaptive).toBe(true);
    expect(best.order[0]).toBe(roomKey('EG', 'same-room-id'));
    const reused = [...best.layouts.values()].flatMap(l => l.boards).filter(b => b.material?.reusedFromRoomKey);
    expect(reused).toHaveLength(1);
    expect(reused[0].usedLength).toBeCloseTo(482);
    expect(reused[0].material).toMatchObject({ sourceBoardId: 'D1', reusedFromRoomKey: roomKey('EG', 'same-room-id'), reusedFromCutRole: 'end', reusedFromRoomName: 'Kurzer Raum' });
    // Total area requires at least 2 boards; the optimized fixture attains this bound.
    expect(Math.ceil(best.coveredArea / (p.flooring.length * p.flooring.width))).toBe(2);
  });
  it('conserves material across transfers and allocates each source and offcut at most once', () => {
    const p = project(), best = optimizeProject(p), layouts = [...best.layouts.values()], boards = layouts.flatMap(l => l.boards);
    expect(best.materialArea).toBe(best.newBoards * p.flooring.length * p.flooring.width);
    expect(layouts.reduce((sum, l) => sum + l.materialArea, 0)).toBeCloseTo(best.materialArea, 5);
    expect(layouts.reduce((sum, l) => sum + l.wasteArea, 0)).toBeCloseTo(best.wasteArea, 5);
    expect(best.wasteArea).toBeCloseTo(3 * 194, 5); expect(best.inventory.offcuts).toHaveLength(0);
    expect(new Set(boards.map(b => b.material?.sourceBoardId)).size).toBe(best.newBoards);
    const reused = boards.filter(b => b.material?.reusedFrom);
    expect(new Set(reused.map(b => b.material!.reusedFrom)).size).toBe(reused.length);
    for (const [key, layout] of best.layouts) for (const board of layout.boards) {
      expect(board.pieceLengths.every(length => length >= 299.99)).toBe(true);
      if (board.material?.reusedFromRoomKey) expect(best.order.indexOf(board.material.reusedFromRoomKey)).toBeLessThan(best.order.indexOf(key));
    }
  });
  it('round-trips and reproduces the optimized order, counts and source associations', () => {
    const p = project(), best = optimizeProject(p);
    p.materialPlan = { roomOrder: best.order, adaptive: best.adaptive, signature: planningSignature(p) };
    const loaded = parseProject(serializeProject(p)), replayed = planProject(loaded);
    expect(replayed.order).toEqual(best.order); expect(replayed.newBoards).toBe(best.newBoards);
    expect(replayed.crossRoomReusedPieces).toBe(best.crossRoomReusedPieces);
    expect([...replayed.layouts]).toEqual([...best.layouts]);
    expect(optimizeProject(loaded).newBoards).toBeLessThanOrEqual(best.newBoards);
  });
  it('adds reserve once to the combined stock and does not claim packs for an invalid room', () => {
    const p = project(); p.flooring.reservePercent = 50;
    const best = optimizeProject(p); expect(best.packages).toMatchObject({ neededBoards: 2, reserveBoards: 1, packages: 2 });
    p.floors[1].rooms[0] = room(200, 'Unmöglich');
    const invalid = optimizeProject(p); expect(invalid.valid).toBe(false); expect(invalid.packages).toBeNull();
    expect(invalid.layouts.get(roomKey('EG', 'same-room-id'))!.boards).toHaveLength(0);
  });
  it('excludes disabled rooms and detects a changed preference before using a saved adaptive plan', () => {
    const p = project(), best = optimizeProject(p);
    p.materialPlan = { roomOrder: best.order, adaptive: best.adaptive, signature: planningSignature(p) };
    p.floors[1].rooms[0].flooringEnabled = false;
    const changed = planProject(p);
    expect(changed.adaptive).toBe(false); expect(changed.order).toEqual([roomKey('OG', 'same-room-id')]);
    expect(changed.crossRoomReusedPieces).toBe(0);
  });
  it('keeps a canonical signature independent of JSON property order and omitted defaults', () => {
    const p = project(), q = project();
    q.flooring = Object.fromEntries(Object.entries(q.flooring).reverse()) as Project['flooring'];
    q.floors[0].rooms[0].layout.mode = 'automatic'; q.floors[0].rooms[0].flooringEnabled = true;
    q.floors[0].rooms[0].polygon = q.floors[0].rooms[0].polygon.map(point => ({ y: point.y, x: point.x }));
    expect(planningSignature(q)).toBe(planningSignature(p));
  });
  it('keeps valid joints and first row preferences in multi-row rooms, without double consumption', () => {
    const p = project();
    p.floors.forEach((floor, i) => { floor.rooms[0] = { ...floor.rooms[0], polygon: [{x:0,y:0},{x:3900+i*1300,y:0},{x:3900+i*1300,y:1164},{x:0,y:1164}] }; });
    const before = planProject(p), best = optimizeProject(p);
    expect(best.valid).toBe(true); expect(best.newBoards).toBeLessThanOrEqual(before.newBoards);
    const ids: string[] = [];
    for (const layout of best.layouts.values()) {
      expect(layout.firstRowWidth).toBe(194);
      for (const board of layout.boards) { expect(board.pieceLengths.every(l => l >= 299.99)).toBe(true); if (board.material?.reusedFrom) ids.push(board.material.reusedFrom); }
      for (let i = 1; i < layout.rows.length; i++) for (const a of layout.rows[i-1].joints) for (const b of layout.rows[i].joints) expect(Math.abs(a-b)).toBeGreaterThanOrEqual(299.99);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect([...best.layouts.values()].reduce((sum, l) => sum + l.materialArea, 0)).toBeCloseTo(best.materialArea, 4);
  }, 20000);
});
